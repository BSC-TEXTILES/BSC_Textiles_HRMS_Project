/**
 * Frontend access control — action-level module grants + widget visibility.
 *
 * One source of truth: `GET /access/me/permissions`, which the backend derives
 * from the caller's assigned roles. Pages use `useMyAccess()` to hide what is
 * not granted and `<Can>` / `canAction()` to gate individual controls.
 *
 * Hiding is only cosmetic — every endpoint these pages call enforces the same
 * grants server-side. The `access` (none|view|edit) ladder is kept because the
 * sidebar and the settings page read it.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import api from '@/lib/api';

export type AccessLevel = 'none' | 'view' | 'edit';
export type RbacAction = 'view' | 'create' | 'edit' | 'update' | 'delete' | 'export' | 'approve';

export const RBAC_ACTIONS: RbacAction[] = ['view', 'create', 'edit', 'update', 'delete', 'export', 'approve'];

export const ACTION_LABELS: Record<RbacAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  update: 'Update',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
};

export interface RbacModule {
  key: string;
  label: string;
  description: string | null;
  area?: string;
  sortOrder?: number;
}

export interface ModuleGrant {
  module: string;
  enabled: boolean;
  actions: Record<RbacAction, boolean>;
}

const ACCESS_RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

export function accessRank(level?: AccessLevel | string): number {
  return ACCESS_RANK[(level as AccessLevel) || 'none'] ?? 0;
}

/**
 * The legacy 15 module keys, so the registry renders even if the API call was
 * made against a backend that predates the module table.
 */
export const RBAC_MODULES: RbacModule[] = [
  { key: 'DASHBOARD', label: 'Executive Dashboard & Telemetry', description: 'Executive dashboard, retail telemetry and business metrics overview' },
  { key: 'STORES', label: 'Showroom & Store Locations', description: 'Store locations, regional showrooms, addresses and contact configuration' },
  { key: 'USERS', label: 'Workforce & Staff Directory', description: 'User accounts, verified employee profiles 360, and onboarding administration' },
  { key: 'SELLING_POINTS', label: 'Selling Points & Counters', description: 'Showroom floors, selling sections, counter sales targets and salesman rosters' },
  { key: 'BILLING_TERMINALS', label: 'Billing & POS Terminal Hub', description: 'Express checkout terminals, cashier shifts, float tracking and tax invoices' },
  { key: 'STATUTORY_MUSTER', label: 'Statutory Form T Muster Roll', description: 'Compliance muster ledger, weekly-offs, and compliance lock' },
  { key: 'ATTENDANCE_CORRECTIONS', label: 'Punch Corrections & Regularization', description: 'Biometric optical anomaly triage, missed out-punches and manual corrections' },
  { key: 'LATE_FINES', label: 'Late Attendance & SLA Enforcement', description: 'Grace period breaches, penalty calculation, fine waivers and approvals' },
  { key: 'DOCUMENT_MANAGEMENT', label: 'Employee Documents & KYC', description: 'Aadhaar, PAN, Bank verification, academic records, and DigiLocker dossiers' },
  { key: 'SALARY_CADRES', label: 'Salary Cadres & Compensation', description: 'Statutory salary grades, HRA, fixed allowances, PF deductions and take-home' },
  { key: 'BIOMETRIC_POLICY', label: 'Biometric Face Verification Threshold', description: 'Face verification minimum match confidence threshold and fraud detection' },
  { key: 'QR_SECURITY_POLICY', label: 'Daily QR Token Security & Anti-Fraud', description: 'Daily dynamic QR token generation, one-time scan expiration and replay protection' },
  { key: 'BREAK_POLICIES', label: 'Break Duration Policies', description: 'Male & Female lunch allowances, morning/evening tea break policy rules' },
  { key: 'ROLES_PERMISSIONS', label: 'Roles & Access Permissions (RBAC)', description: 'Enterprise role definitions, module-level access control matrix and user assignment' },
  { key: 'AUDIT_LOGS', label: 'Security & Audit Logs', description: 'Cryptographic system audit trail, configuration change logs and security alerts' },
];

export interface MyAccess {
  /** Module registry (what exists), independent of what is granted. */
  modules: RbacModule[];
  /** module → none|view|edit, derived from the action grants. */
  access: Record<string, AccessLevel>;
  /** module → the full action grant. */
  grants: Record<string, ModuleGrant>;
  widgets: string[];
  roles: string[];
  roleIds: string[];
  /** 'system' = Super Admin, 'rbac' = role-gated, 'unrestricted' = legacy model. */
  source: 'system' | 'rbac' | 'unrestricted';
  unrestricted: boolean;
  canManageRoles: boolean;
  canAssignModuleAccess: boolean;
  /** Admin only — and not the Super Admin: issuing and resetting credentials. */
  canManageCredentials: boolean;
  homePath: string;
  loading: boolean;
}

const EMPTY_ACTIONS: Record<RbacAction, boolean> = Object.fromEntries(
  RBAC_ACTIONS.map((a) => [a, false])
) as Record<RbacAction, boolean>;

function emptyAccess(): Record<string, AccessLevel> {
  return Object.fromEntries(RBAC_MODULES.map((m) => [m.key, 'none'])) as Record<string, AccessLevel>;
}

/** Everything visible/editable — used before the first load resolves. */
function permissive(): MyAccess {
  return {
    modules: RBAC_MODULES,
    access: Object.fromEntries(RBAC_MODULES.map((m) => [m.key, 'edit'])) as Record<string, AccessLevel>,
    grants: {},
    widgets: [],
    roles: [],
    roleIds: [],
    source: 'unrestricted',
    unrestricted: true,
    canManageRoles: false,
    canAssignModuleAccess: false,
    canManageCredentials: false,
    homePath: '/dashboard',
    loading: false,
  };
}

let cache: MyAccess | null = null;
let inflight: Promise<MyAccess> | null = null;

/**
 * Shared store behind `useAccessSnapshot`, so a page with fifty gated buttons
 * makes one request rather than fifty.
 */
const PENDING: MyAccess = { ...permissive(), loading: true };
let storeValue: MyAccess = PENDING;
const storeListeners = new Set<() => void>();

function setStoreValue(next: MyAccess): void {
  storeValue = next;
  storeListeners.forEach((listener) => listener());
}

function subscribeStore(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

function readStore(): MyAccess {
  return storeValue;
}

function mapSource(payload: any): 'system' | 'rbac' | 'unrestricted' {
  if (payload.unrestricted) return 'system';
  return payload.source === 'rbac' ? 'rbac' : 'unrestricted';
}

type ModuleWithGrant = RbacModule & { enabled?: boolean; actions?: Partial<Record<RbacAction, boolean>> };

function toMyAccess(payload: any): MyAccess {
  const modules: ModuleWithGrant[] =
    Array.isArray(payload.modules) && payload.modules.length > 0 ? payload.modules : RBAC_MODULES;
  const grants: Record<string, ModuleGrant> = {};
  const access: Record<string, AccessLevel> = {};
  for (const module of modules) {
    const actions = { ...EMPTY_ACTIONS, ...(module.actions || {}) };
    const enabled = Boolean(module.enabled) && Boolean(actions.view);
    grants[module.key] = { module: module.key, enabled, actions };
    const writes = RBAC_ACTIONS.filter((a) => a !== 'view').some((a) => actions[a]);
    access[module.key] = !enabled ? 'none' : writes ? 'edit' : 'view';
  }
  return {
    modules,
    access,
    grants,
    widgets: payload.widgets || [],
    roles: payload.roles || [],
    roleIds: payload.roleIds || [],
    source: mapSource(payload),
    unrestricted: Boolean(payload.unrestricted),
    canManageRoles: Boolean(payload.canManageRoles),
    canAssignModuleAccess: Boolean(payload.canAssignModuleAccess),
    canManageCredentials: Boolean(payload.canManageCredentials),
    homePath: payload.homePath || '/dashboard',
    loading: false,
  };
}

export async function getMyAccess(force = false): Promise<MyAccess> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = api
      .get('/access/me/permissions')
      .then((res) => {
        cache = toMyAccess(res.data || {});
        setStoreValue(cache);
        return cache;
      })
      .catch((error) => {
        // A failed lookup must not leave the UI stuck on "loading"; the server
        // still enforces every action, so permissive rendering is safe.
        console.warn('[rbac] permission lookup failed', error?.message || error);
        cache = null;
        setStoreValue(permissive());
        throw error;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function invalidateMyAccessCache(): void {
  cache = null;
  inflight = null;
  setStoreValue(PENDING);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('rbac-access-updated'));
  }
}

export function canViewModule(access: MyAccess, moduleKey: string): boolean {
  if (access.source !== 'rbac') return true;
  return accessRank(access.access[moduleKey]) >= ACCESS_RANK.view;
}

export function canEditModule(access: MyAccess, moduleKey: string): boolean {
  if (access.source !== 'rbac') return true;
  return accessRank(access.access[moduleKey]) >= ACCESS_RANK.edit;
}

/** The exact question: may this user take `action` on `moduleKey`? */
export function canAction(access: MyAccess, moduleKey: string, action: RbacAction = 'view'): boolean {
  if (access.source !== 'rbac') return true;
  const grant = access.grants[moduleKey];
  return Boolean(grant?.enabled && grant.actions[action]);
}

export function isWidgetVisible(access: MyAccess, widgetKey: string): boolean {
  if (access.source !== 'rbac') return true;
  return access.widgets.includes(widgetKey);
}

/** React hook: the signed-in user's effective access, refreshed on change. */
export function useMyAccess(): MyAccess {
  const [state, setState] = useState<MyAccess>(storeValue);

  const load = useCallback((force: boolean) => {
    getMyAccess(force)
      .then((data) => setState(data))
      .catch(() => setState(permissive()));
  }, []);

  useEffect(() => {
    if (storeValue !== PENDING) setState(storeValue);
    else load(false);

    const handleUpdate = () => load(true);
    const unsubscribe = subscribeStore(() => setState(readStore()));
    if (typeof window !== 'undefined') {
      window.addEventListener('rbac-access-updated', handleUpdate);
      return () => {
        window.removeEventListener('rbac-access-updated', handleUpdate);
        unsubscribe();
      };
    }
    return unsubscribe;
  }, [load]);

  return state;
}

/** Same data through a shared store: one request no matter how many readers. */
export function useAccessSnapshot(): MyAccess {
  const value = useSyncExternalStore(subscribeStore, readStore, readStore);
  useEffect(() => {
    if (value === PENDING) getMyAccess(false).catch(() => undefined);
  }, [value]);
  return value;
}

export const usePermissions = useMyAccess;
