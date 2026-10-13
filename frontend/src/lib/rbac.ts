/**
 * Frontend RBAC helpers — module registry + "my access" resolution.
 *
 * The backend returns the logged-in user's effective module access map
 * (module → none | view | edit). Pages use `useMyAccess()` to hide or lock
 * sections the user cannot access. Users governed by the legacy permission
 * model (source !== 'rbac') keep full visibility — the server still enforces
 * permissions on every API call.
 */
import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

export type AccessLevel = 'none' | 'view' | 'edit';

export interface RbacModule {
  key: string;
  label: string;
  description: string;
}

/** Canonical module registry — new backend modules appear here automatically. */
export const RBAC_MODULES: RbacModule[] = [
  { key: 'DASHBOARD', label: 'Executive Dashboard & Telemetry', description: 'Executive dashboard, retail telemetry and business metrics overview' },
  { key: 'STORES', label: 'Showroom & Store Locations', description: 'Store locations, regional showrooms, addresses and contact configuration' },
  { key: 'USERS', label: 'Workforce & Staff Directory', description: 'User accounts, verified employee profiles 360, and onboarding administration' },
  { key: 'SELLING_POINTS', label: 'Selling Points & Counters', description: 'Showroom floors, selling sections, counter sales targets and salesman rosters' },
  { key: 'BILLING_TERMINALS', label: 'Billing & POS Terminal Hub', description: 'Express checkout terminals, cashier shifts, float tracking and tax invoices' },
  { key: 'STATUTORY_MUSTER', label: 'Statutory Form T Muster Roll', description: 'Karnataka Factories Act Form T muster ledger, weekly-offs, and compliance lock' },
  { key: 'ATTENDANCE_CORRECTIONS', label: 'Punch Corrections & Regularization', description: 'Biometric optical anomaly triage, missed out-punches and manual corrections' },
  { key: 'LATE_FINES', label: 'Late Attendance & SLA Enforcement', description: 'Grace period breaches, ₹1/sec penalty calculation, fine waivers and approvals' },
  { key: 'DOCUMENT_MANAGEMENT', label: 'Employee Documents & KYC', description: 'Aadhaar, PAN, Bank verification, academic records, and DigiLocker dossiers' },
  { key: 'SALARY_CADRES', label: 'Salary Cadres & Compensation', description: 'Statutory salary grades, HRA, fixed allowances, PF deductions and take-home' },
  { key: 'BIOMETRIC_POLICY', label: 'Biometric Face Verification Threshold', description: 'Face verification minimum match confidence threshold (85%) and fraud detection' },
  { key: 'QR_SECURITY_POLICY', label: 'Daily QR Token Security & Anti-Fraud', description: 'Daily dynamic QR token generation, one-time scan expiration and replay protection' },
  { key: 'BREAK_POLICIES', label: 'Break Duration Policies', description: 'Male & Female lunch allowances, morning/evening tea break policy rules' },
  { key: 'ROLES_PERMISSIONS', label: 'Roles & Access Permissions (RBAC)', description: 'Enterprise role definitions, module-level access control matrix and user assignment' },
  { key: 'AUDIT_LOGS', label: 'Security & Audit Logs', description: 'Cryptographic system audit trail, configuration change logs and security alerts' },
];

const ACCESS_RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

export function accessRank(level?: AccessLevel | string): number {
  return ACCESS_RANK[(level as AccessLevel) || 'none'] ?? 0;
}

export interface MyAccess {
  modules: RbacModule[];
  access: Record<string, AccessLevel>;
  source: 'system' | 'rbac' | 'unrestricted';
  roles: string[];
  canManageRoles: boolean;
  loading: boolean;
}

const UNRESTRICTED: MyAccess = {
  modules: RBAC_MODULES,
  access: Object.fromEntries(RBAC_MODULES.map((m) => [m.key, 'edit'])) as Record<string, AccessLevel>,
  source: 'unrestricted',
  roles: [],
  canManageRoles: false,
  loading: false,
};

let cache: MyAccess | null = null;
let inflight: Promise<MyAccess> | null = null;

export async function getMyAccess(force = false): Promise<MyAccess> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = api
      .get('/roles/rbac/modules')
      .then((res) => {
        const d = res.data || {};
        const data: MyAccess = {
          modules: Array.isArray(d.modules) && d.modules.length > 0 ? d.modules : RBAC_MODULES,
          access: d.access || {},
          source: d.source || 'unrestricted',
          roles: d.roles || [],
          canManageRoles: Boolean(d.canManageRoles),
          loading: false,
        };
        cache = data;
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function canViewModule(access: MyAccess, moduleKey: string): boolean {
  if (access.source !== 'rbac') return true;
  return accessRank(access.access[moduleKey]) >= ACCESS_RANK.view;
}

export function canEditModule(access: MyAccess, moduleKey: string): boolean {
  if (access.source !== 'rbac') return true;
  return accessRank(access.access[moduleKey]) >= ACCESS_RANK.edit;
}

/** React hook: resolves the current user's effective module access once. */
export function useMyAccess(): MyAccess {
  const [state, setState] = useState<MyAccess>({ ...UNRESTRICTED, loading: true });

  const load = useCallback((force: boolean) => {
    getMyAccess(force)
      .then((data) => setState({ ...data, loading: false }))
      .catch(() => setState({ ...UNRESTRICTED, loading: false }));
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return state;
}
