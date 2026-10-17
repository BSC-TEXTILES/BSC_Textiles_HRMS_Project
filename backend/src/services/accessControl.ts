/**
 * Action-level access control — the resolution engine behind the RBAC UI.
 *
 * Sits on top of migration 030 (`module`, `rolepermission.can_*`,
 * `dashboard_widget`, `role_widget`) and answers one question: for this user,
 * which actions are allowed on which module, and which dashboard widgets are
 * visible?
 *
 * Backwards compatibility rules, in the order they are applied:
 *   1. A user with at least one *active* `userrole` row is governed by RBAC.
 *      The legacy `user.permissions` array is then ignored, because stale
 *      broad grants on it (every demo account carries ["ALL"]) would silently
 *      override whatever the Admin just configured.
 *   2. A user with no role assignments keeps the legacy model
 *      (`authorize()`/`requireRole()`), so nothing that works today changes.
 *   3. The literal string 'ALL' in legacy permissions means unrestricted.
 *      It used to be treated as an ordinary permission token, so every
 *      non-SUPER_ADMIN demo account was 403'd by all 141 `authorize('VIEW')`
 *      routes.
 */
import { pool } from '../nativeDb.js';
import { cacheService } from './cacheService.js';

export type RbacAction = 'view' | 'create' | 'edit' | 'update' | 'delete' | 'export' | 'approve';

export const RBAC_ACTIONS: RbacAction[] = ['view', 'create', 'edit', 'update', 'delete', 'export', 'approve'];

const ACTION_COLUMN: Record<RbacAction, string> = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  update: 'can_update',
  delete: 'can_delete',
  export: 'can_export',
  approve: 'can_approve',
};

/** Legacy `authorize()` tokens that each action maps to when RBAC is absent. */
const LEGACY_TOKENS: Record<RbacAction, string[]> = {
  view: ['VIEW'],
  create: ['ADD', 'CREATE'],
  edit: ['EDIT'],
  update: ['EDIT'],
  delete: ['DELETE'],
  export: ['EXPORT', 'EDIT'],
  approve: ['APPROVE'],
};

export interface ModuleGrant {
  module: string;
  enabled: boolean;
  actions: Record<RbacAction, boolean>;
}

export interface ModuleDefinition {
  key: string;
  label: string;
  description: string | null;
  area: string;
  sortOrder: number;
}

export interface WidgetDefinition {
  id: string;
  key: string;
  label: string;
  description: string | null;
  moduleKey: string | null;
  area: string;
  sortOrder: number;
}

export interface EffectiveAccess {
  userId: string;
  roleIds: string[];
  roles: string[];
  /** 'rbac' = role-derived; 'legacy' = falls back to user.permissions. */
  source: 'rbac' | 'legacy';
  /** Unrestricted: SUPER_ADMIN, or legacy 'ALL' with no RBAC roles assigned. */
  unrestricted: boolean;
  /** Super Admin only: create/edit/deactivate/delete roles. */
  canManageRoles: boolean;
  /** Admin (and Super Admin) only: assign module access. */
  canAssignModuleAccess: boolean;
  /**
   * Admin only — and explicitly *not* the Super Admin. Credential issuance and
   * reset is the one capability where holding the highest role must not imply
   * the right, so it cannot be derived from the module grants (a Super Admin is
   * unrestricted on every module).
   */
  canManageCredentials: boolean;
  grants: Record<string, ModuleGrant>;
  widgets: string[];
  /** The legacy `user.permissions` tokens, kept for the fallback model. */
  legacyPermissions: string[];
}

const ACCESS_TTL_MS = 15_000;
const REGISTRY_TTL_MS = 300_000;

function emptyActions(value = false): Record<RbacAction, boolean> {
  return Object.fromEntries(RBAC_ACTIONS.map((a) => [a, value])) as Record<RbacAction, boolean>;
}

function isTruthy(raw: unknown): boolean {
  return raw === 1 || raw === true || raw === '1';
}

/** Derives the legacy view/edit ladder from an action set so old UI keeps working. */
export function actionsToAccessLevel(grant: ModuleGrant | undefined): 'none' | 'view' | 'edit' {
  if (!grant || !grant.enabled) return 'none';
  if (!grant.actions.view) return 'none';
  const writes = RBAC_ACTIONS.filter((a) => a !== 'view');
  return writes.some((a) => grant.actions[a]) ? 'edit' : 'view';
}

/**
 * The grant for one module under any source: explicit RBAC rows when present,
 * otherwise the legacy permission tokens, otherwise nothing.
 */
export function grantForModule(access: EffectiveAccess, moduleKey: string): ModuleGrant {
  if (access.unrestricted) {
    return { module: moduleKey, enabled: true, actions: emptyActions(true) };
  }
  const explicit = access.grants[moduleKey];
  if (explicit) return explicit;
  if (access.source === 'legacy') {
    return {
      module: moduleKey,
      enabled: true,
      actions: Object.fromEntries(
        RBAC_ACTIONS.map((a) => [a, LEGACY_TOKENS[a].some((token) => access.legacyPermissions.includes(token))])
      ) as Record<RbacAction, boolean>,
    };
  }
  return { module: moduleKey, enabled: false, actions: emptyActions(false) };
}

export function canAccess(access: EffectiveAccess, moduleKey: string, action: RbacAction = 'view'): boolean {
  if (access.unrestricted) return true;
  const grant = grantForModule(access, moduleKey);
  return grant.enabled && grant.actions[action];
}

export function canView(access: EffectiveAccess, moduleKey: string): boolean {
  return canAccess(access, moduleKey, 'view');
}

export function isWidgetVisible(access: EffectiveAccess, widgetKey: string): boolean {
  if (access.unrestricted) return true;
  return access.widgets.includes(widgetKey);
}

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

export async function listModules(): Promise<ModuleDefinition[]> {
  const cached = cacheService.get<ModuleDefinition[]>('rbac:v2:modules');
  if (cached) return cached.data;
  const [rows]: any = await pool.query(
    `SELECT \`key\`, \`label\`, \`description\`, \`area\`, \`sortOrder\`
       FROM \`module\` WHERE \`isActive\` = 1 ORDER BY \`sortOrder\` ASC, \`label\` ASC`
  );
  const modules: ModuleDefinition[] = (rows || []).map((r: any) => ({
    key: r.key,
    label: r.label,
    description: r.description ?? null,
    area: r.area,
    sortOrder: Number(r.sortOrder || 0),
  }));
  cacheService.set('rbac:v2:modules', modules, REGISTRY_TTL_MS);
  return modules;
}

export async function listWidgets(): Promise<WidgetDefinition[]> {
  const cached = cacheService.get<WidgetDefinition[]>('rbac:v2:widgets');
  if (cached) return cached.data;
  const [rows]: any = await pool.query(
    `SELECT \`id\`, \`key\`, \`label\`, \`description\`, \`moduleKey\`, \`area\`, \`sortOrder\`
       FROM \`dashboard_widget\` WHERE \`isActive\` = 1
      ORDER BY \`sortOrder\` ASC, \`label\` ASC`
  );
  const widgets: WidgetDefinition[] = (rows || []).map((r: any) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    description: r.description ?? null,
    moduleKey: r.moduleKey ?? null,
    area: r.area,
    sortOrder: Number(r.sortOrder || 0),
  }));
  cacheService.set('rbac:v2:widgets', widgets, REGISTRY_TTL_MS);
  return widgets;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<string, string> = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  HR_MANAGER: 'HR',
  HR_EXECUTIVE: 'HR',
  HR_OFFICER: 'HR',
  PAYROLL_MANAGER: 'HR',
  FLOOR_MANAGER: 'FLOOR_MANAGER',
  STORE_MANAGER: 'FLOOR_MANAGER',
  TEAM_LEAD: 'FLOOR_MANAGER',
  DEPARTMENT_MANAGER: 'FLOOR_MANAGER',
  LOCATION_MANAGER: 'FLOOR_MANAGER',
};

/**
 * Maps a legacy `user.role` onto the spec role it should behave as. Used only
 * for reporting (`primaryRole`), never to widen a grant — widening would let a
 * stale enum value outrank an explicit Admin configuration.
 */
export function impliedRoleName(legacyRole?: string | null): string {
  if (!legacyRole) return 'EMPLOYEE';
  return ROLE_RANK[legacyRole.toUpperCase()] || 'EMPLOYEE';
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
}

async function loadAssignedRoles(userId: string): Promise<RoleRow[]> {
  const [rows]: any = await pool.query(
    `SELECT r.\`id\`, r.\`name\`, r.\`description\`, r.\`isSystem\`, r.\`isActive\`
       FROM \`userrole\` ur
       JOIN \`role\` r ON r.\`id\` = ur.\`roleId\`
      WHERE ur.\`userId\` = ?
      ORDER BY r.\`name\` ASC`,
    [userId]
  );
  return (rows || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    isSystem: isTruthy(r.isSystem),
    isActive: isTruthy(r.isActive),
  }));
}

async function loadGrants(roleIds: string[]): Promise<Record<string, ModuleGrant>> {
  if (roleIds.length === 0) return {};
  const [rows]: any = await pool.query(
    `SELECT \`module\`, \`enabled\`, \`can_view\`, \`can_create\`, \`can_edit\`,
            \`can_update\`, \`can_delete\`, \`can_export\`, \`can_approve\`
       FROM \`rolepermission\`
      WHERE \`roleId\` IN (?)`,
    [roleIds]
  );
  const grants: Record<string, ModuleGrant> = {};
  for (const row of rows || []) {
    const grant = grants[row.module] || { module: row.module, enabled: false, actions: emptyActions(false) };
    // Union across roles: a second role can only add rights, never remove them.
    grant.enabled = grant.enabled || isTruthy(row.enabled);
    for (const action of RBAC_ACTIONS) {
      grant.actions[action] = grant.actions[action] || isTruthy(row[ACTION_COLUMN[action]]);
    }
    grants[row.module] = grant;
  }
  // A grant with no actions is meaningless — treat it as disabled.
  for (const grant of Object.values(grants)) {
    if (!RBAC_ACTIONS.some((a) => grant.actions[a])) grant.enabled = false;
  }
  return grants;
}

async function loadWidgetKeys(roleIds: string[]): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const [rows]: any = await pool.query(
    `SELECT DISTINCT w.\`key\`
       FROM \`role_widget\` rw
       JOIN \`dashboard_widget\` w ON w.\`id\` = rw.\`widgetId\`
      WHERE rw.\`roleId\` IN (?) AND rw.\`visible\` = 1 AND w.\`isActive\` = 1`,
    [roleIds]
  );
  return (rows || []).map((r: any) => r.key);
}

/**
 * Effective access for one user. `legacyRole`/`legacyPermissions` come from the
 * already-loaded request user so the common path costs one extra query set.
 */
export async function resolveUserAccess(
  userId: string,
  legacyRole?: string,
  legacyPermissions?: string[]
): Promise<EffectiveAccess> {
  const cacheKey = `rbac:v2:access:${userId}`;
  const cached = cacheService.get<EffectiveAccess>(cacheKey);
  if (cached) return cached.data;

  const permissions = Array.isArray(legacyPermissions) ? legacyPermissions : [];
  const legacyUnrestricted =
    String(legacyRole || '').toUpperCase() === 'SUPER_ADMIN' || permissions.includes('ALL');

  let assigned: RoleRow[] = [];
  try {
    assigned = await loadAssignedRoles(userId);
  } catch (error: any) {
    // A database predating migration 030 has no role tables. Degrade to the
    // legacy model rather than locking every account out.
    console.warn('[accessControl] RBAC tables unavailable, using legacy model:', error?.code || error?.message);
    assigned = [];
  }

  const active = assigned.filter((r) => r.isActive);
  const roleIds = active.map((r) => r.id);
  const roleNames = active.map((r) => r.name);
  const isSuperAdmin =
    roleNames.includes('SUPER_ADMIN') || String(legacyRole || '').toUpperCase() === 'SUPER_ADMIN';

  const access: EffectiveAccess = {
    userId,
    roleIds,
    roles: roleNames.length > 0 ? roleNames : [impliedRoleName(legacyRole)],
    source: roleIds.length > 0 ? 'rbac' : 'legacy',
    unrestricted: isSuperAdmin || (roleIds.length === 0 && legacyUnrestricted),
    canManageRoles: isSuperAdmin,
    canAssignModuleAccess: isSuperAdmin || roleNames.includes('ADMIN') || String(legacyRole || '').toUpperCase() === 'ADMIN',
    canManageCredentials: roleNames.includes('ADMIN') || String(legacyRole || '').toUpperCase() === 'ADMIN',
    grants: {},
    widgets: [],
    legacyPermissions: permissions,
  };

  if (access.unrestricted) {
    // Super Admin sees every module and every widget, without a per-row read.
    const modules = await listModules().catch(() => [] as ModuleDefinition[]);
    const widgets = await listWidgets().catch(() => [] as WidgetDefinition[]);
    for (const m of modules) {
      access.grants[m.key] = { module: m.key, enabled: true, actions: emptyActions(true) };
    }
    access.widgets = widgets.map((w) => w.key);
    cacheService.set(cacheKey, access, ACCESS_TTL_MS);
    return access;
  }

  if (roleIds.length > 0) {
    access.grants = await loadGrants(roleIds);
    access.widgets = await loadWidgetKeys(roleIds);
  } else {
    // No role assignment means no widget rows exist either. Legacy accounts
    // keep seeing everything rather than losing their dashboard.
    access.widgets = (await listWidgets().catch(() => [] as WidgetDefinition[])).map((w) => w.key);
  }

  cacheService.set(cacheKey, access, ACCESS_TTL_MS);
  return access;
}

export function invalidateUserAccess(userId: string): void {
  cacheService.delete(`rbac:v2:access:${userId}`);
}

/** Called after any role/permission/widget edit — grants must apply at once. */
export function invalidateAccessCaches(userId?: string): void {
  cacheService.invalidatePrefix('rbac:v2:');
  cacheService.invalidatePrefix('rbac:access:');
  if (userId) cacheService.delete(`auth:user:${userId}`);
}

// ---------------------------------------------------------------------------
// Serialisation for /me/permissions
// ---------------------------------------------------------------------------

export interface ModulePermissionView {
  key: string;
  label: string;
  description: string | null;
  area: string;
  enabled: boolean;
  accessLevel: 'none' | 'view' | 'edit';
  actions: Record<RbacAction, boolean>;
}

export interface PermissionPayload {
  userId: string;
  roles: string[];
  roleIds: string[];
  source: 'rbac' | 'legacy';
  unrestricted: boolean;
  canManageRoles: boolean;
  canAssignModuleAccess: boolean;
  canManageCredentials: boolean;
  modules: ModulePermissionView[];
  widgets: string[];
}

/**
 * Full permission view for the signed-in user. Registered modules are always
 * listed so the frontend sidebar can distinguish "not granted" from
 * "unknown module"; extra grants present in the role rows are appended.
 */
export async function describeAccess(access: EffectiveAccess): Promise<PermissionPayload> {
  const registry = await listModules().catch(() => [] as ModuleDefinition[]);
  const keys: string[] = [];
  for (const m of registry) keys.push(m.key);
  for (const key of Object.keys(access.grants)) {
    if (!keys.includes(key)) keys.push(key);
  }
  const byKey = new Map(registry.map((m) => [m.key, m]));

  const modules: ModulePermissionView[] = keys.map((key) => {
    const def = byKey.get(key);
    const grant = grantForModule(access, key);
    return {
      key,
      label: def?.label || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: def?.description ?? null,
      area: def?.area || 'SYSTEM',
      enabled: grant.enabled,
      accessLevel: actionsToAccessLevel(grant),
      actions: grant.actions,
    };
  });

  return {
    userId: access.userId,
    roles: access.roles,
    roleIds: access.roleIds,
    source: access.source,
    unrestricted: access.unrestricted,
    canManageRoles: access.canManageRoles,
    canAssignModuleAccess: access.canAssignModuleAccess,
    canManageCredentials: access.canManageCredentials,
    modules,
    widgets: access.widgets,
  };
}
