/**
 * Access-control administration client.
 *
 * Thin wrappers over /api/access/* — the server enforces the Super Admin vs
 * Admin split, so nothing here trusts the client to know it.
 */
import api from '@/lib/api';
import type { ModuleGrant, RbacAction, RbacModule } from '@/lib/rbac';

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  moduleCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MatrixModule extends RbacModule {
  grant: ModuleGrant;
}

export interface MatrixWidget {
  id: string;
  key: string;
  label: string;
  description: string | null;
  moduleKey: string | null;
  area: string;
  sortOrder: number;
  visible: boolean;
}

export interface RoleMatrix {
  role: { id: string; name: string; description: string | null; isSystem: boolean; isActive: boolean };
  modules: MatrixModule[];
  widgets: MatrixWidget[];
}

export interface MatrixPayload {
  modules: Array<Pick<MatrixModule, 'key' | 'label' | 'description' | 'area'> & { grant: ModuleGrant }>;
  widgets: MatrixWidget[];
  actions: RbacAction[];
}

export interface AccessOverview {
  totals: {
    roles: number;
    activeRoles: number;
    inactiveRoles: number;
    users: number;
    activeUsers: number;
    inactiveUsers: number;
    usersWithoutRoles: number;
    modules: number;
    widgets: number;
  };
  roles: Array<{ id: string; name: string; isSystem: boolean; isActive: boolean; userCount: number }>;
  moduleCoverage: Array<{ module: string; label: string; rolesWithAccess: number }>;
  widgetCount: number;
}

export interface AccessAuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  roleName: string | null;
  riskScore: number | null;
  createdAt: string;
  before: any;
  after: any;
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  legacyRole: string;
  isActive: boolean;
  status: string;
  lastLoginAt: string | null;
  employeeId: string | null;
  roles: Array<{ roleId: string; name: string }>;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  isActive?: boolean;
  modules?: unknown;
  widgets?: string[];
  firstUser?: { fullName: string; email: string; password: string };
}

/** Every error the administration API returns is `{ error: string }`. */
export function apiError(err: any, fallback = 'Request failed'): string {
  const detail = err?.response?.data?.error || err?.response?.data?.message;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (err?.message) return err.message;
  return fallback;
}

export async function fetchOverview(): Promise<AccessOverview> {
  const { data } = await api.get('/access/overview');
  return data;
}

export async function fetchRoles(): Promise<{ roles: AdminRole[]; modules: RbacModule[]; actions: RbacAction[] }> {
  const { data } = await api.get('/access/roles');
  return { roles: data.roles || [], modules: data.modules || [], actions: data.actions || [] };
}

export async function fetchMatrix(roleId: string): Promise<RoleMatrix> {
  const { data } = await api.get(`/access/module-access/${encodeURIComponent(roleId)}`);
  return {
    role: data.role,
    modules: (data.modules || []).map((m: any) => ({ ...m, description: m.description ?? null, grant: m.grant })),
    widgets: data.widgets || [],
  };
}

export async function saveMatrix(
  roleId: string,
  modules: Array<{ module: string; enabled: boolean; actions: Record<RbacAction, boolean> }>,
  widgets: string[]
): Promise<{ message: string; matrix: RoleMatrix }> {
  const { data } = await api.put(`/access/module-access/${encodeURIComponent(roleId)}`, { modules, widgets });
  return { message: data.message, matrix: data.matrix };
}

export async function createRole(input: CreateRoleInput): Promise<any> {
  const { data } = await api.post('/access/roles', input);
  return data;
}

export async function updateRole(roleId: string, patch: { name?: string; description?: string; isActive?: boolean }): Promise<any> {
  const { data } = await api.patch(`/access/roles/${encodeURIComponent(roleId)}`, patch);
  return data;
}

export async function setRoleStatus(roleId: string, isActive: boolean): Promise<any> {
  const { data } = await api.post(`/access/roles/${encodeURIComponent(roleId)}/status`, { isActive });
  return data;
}

export async function deleteRole(roleId: string): Promise<any> {
  const { data } = await api.delete(`/access/roles/${encodeURIComponent(roleId)}`);
  return data;
}

export async function fetchAdminUsers(params?: { q?: string; roleId?: string }): Promise<{ users: AdminUserRow[]; total: number }> {
  const { data } = await api.get('/access/users', { params: params || {} });
  return { users: data.users || [], total: data.total || 0 };
}

export async function assignUserRoles(userId: string, roleIds: string[]): Promise<any> {
  const { data } = await api.put(`/access/users/${encodeURIComponent(userId)}/roles`, { roleIds });
  return data;
}

export async function fetchAccessAuditLogs(limit = 50): Promise<AccessAuditEntry[]> {
  const { data } = await api.get('/access/audit-logs', { params: { limit } });
  return data.logs || [];
}
