/**
 * Role administration + module-access assignment (the write side of RBAC).
 *
 * Split by design:
 *   * role lifecycle  — create / rename / deactivate / delete  → Super Admin
 *   * module access   — which actions a role may take          → Admin
 *
 * Everything here is raw SQL against the migration-030 tables, because the
 * Prisma shim in `nativeDb.ts` has no delegates for `module`, `dashboard_widget`
 * or `role_widget`.
 */
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { AuditService } from './auditService.js';
import { PasswordService } from './passwordService.js';
import {
  RBAC_ACTIONS,
  RbacAction,
  listModules,
  listWidgets,
  invalidateAccessCaches,
} from './accessControl.js';

export interface Actor {
  id: string;
  role?: string;
  locationId?: string;
  ip?: string;
  userAgent?: string;
  canManageRoles: boolean;
  canAssignModuleAccess: boolean;
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  moduleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleAccessEntry {
  module: string;
  enabled: boolean;
  actions: Record<RbacAction, boolean>;
}

export class RbacConflictError extends Error {}
export class RbacValidationError extends Error {}
export class RbacForbiddenError extends Error {}
export class RbacNotFoundError extends Error {}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
}

function flag(row: any, column: string): boolean {
  return row?.[column] === 1 || row?.[column] === true;
}

function emptyActions(value = false): Record<RbacAction, boolean> {
  return Object.fromEntries(RBAC_ACTIONS.map((a) => [a, value])) as Record<RbacAction, boolean>;
}

/** The legacy view/edit ladder, kept in step with the action booleans. */
export function deriveAccessLevel(entry: RoleAccessEntry): 'none' | 'view' | 'edit' {
  if (!entry.enabled || !entry.actions.view) return 'none';
  return RBAC_ACTIONS.filter((a) => a !== 'view').some((a) => entry.actions[a]) ? 'edit' : 'view';
}

/**
 * Translates the legacy `none|view|edit` ladder into the action booleans, so a
 * write from the older `/roles/rbac` endpoints cannot leave a role with an
 * accessLevel that the action-level engine does not honour.
 */
export function entriesFromLegacyLevels(levels: Record<string, string>): RoleAccessEntry[] {
  return Object.entries(levels || {}).map(([module, level]) => {
    const actions = emptyActions(false);
    actions.view = level === 'view' || level === 'edit';
    if (level === 'edit') {
      for (const action of RBAC_ACTIONS) actions[action] = true;
    }
    return { module: module.toUpperCase(), enabled: actions.view, actions };
  });
}

/**
 * A role's action grants translated into the legacy `user.permissions` tokens.
 * New accounts need these or every one of the ~300 routes still guarded by
 * `authorize('VIEW')` would reject them.
 */
export function legacyTokensForAccess(entries: RoleAccessEntry[]): string[] {
  const tokens = new Set<string>();
  for (const entry of entries) {
    if (!entry.enabled) continue;
    if (entry.actions.view) tokens.add('VIEW');
    if (entry.actions.create) tokens.add('ADD');
    if (entry.actions.edit || entry.actions.update) tokens.add('EDIT');
    if (entry.actions.delete) tokens.add('DELETE');
    if (entry.actions.export) tokens.add('EXPORT');
    if (entry.actions.approve) tokens.add('APPROVE');
  }
  return [...tokens].sort();
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listRolesForAdmin(): Promise<RoleSummary[]> {
  const [rows]: any = await pool.query(
    `SELECT r.\`id\`, r.\`name\`, r.\`description\`, r.\`isSystem\`, r.\`isActive\`,
            r.\`createdAt\`, r.\`updatedAt\`,
            (SELECT COUNT(*) FROM \`userrole\` ur WHERE ur.\`roleId\` = r.\`id\`) AS userCount,
            (SELECT COUNT(*) FROM \`rolepermission\` rp
              WHERE rp.\`roleId\` = r.\`id\` AND rp.\`enabled\` = 1 AND rp.\`can_view\` = 1) AS moduleCount
       FROM \`role\` r
      ORDER BY r.\`isSystem\` DESC, r.\`name\` ASC`
  );
  return (rows || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    isSystem: flag(r, 'isSystem'),
    isActive: flag(r, 'isActive'),
    userCount: Number(r.userCount || 0),
    moduleCount: Number(r.moduleCount || 0),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getRoleRow(roleId: string): Promise<any | null> {
  const [rows]: any = await pool.query('SELECT * FROM `role` WHERE `id` = ? OR `name` = ? LIMIT 1', [roleId, roleId]);
  return rows?.[0] || null;
}

export async function getRoleAccess(roleId: string): Promise<{ entries: RoleAccessEntry[]; widgets: string[] }> {
  const [permRows]: any = await pool.query('SELECT * FROM `rolepermission` WHERE `roleId` = ?', [roleId]);
  const entries: RoleAccessEntry[] = (permRows || []).map((row: any) => {
    const actions = emptyActions(false);
    for (const action of RBAC_ACTIONS) actions[action] = flag(row, `can_${action}`);
    return { module: row.module, enabled: flag(row, 'enabled'), actions };
  });

  const [widgetRows]: any = await pool.query(
    `SELECT w.\`key\` FROM \`role_widget\` rw
       JOIN \`dashboard_widget\` w ON w.\`id\` = rw.\`widgetId\`
      WHERE rw.\`roleId\` = ? AND rw.\`visible\` = 1`,
    [roleId]
  );
  return { entries, widgets: (widgetRows || []).map((r: any) => r.key) };
}

/**
 * The matrix for one role, normalised so every registered module is present.
 * The UI renders this directly — no client-side gap filling.
 */
export async function getRoleMatrix(roleId: string) {
  const role = await getRoleRow(roleId);
  if (!role) throw new RbacNotFoundError(`Role ${roleId} not found`);
  const [modules, widgets, { entries, widgets: visible }] = await Promise.all([
    listModules(),
    listWidgets(),
    getRoleAccess(role.id),
  ]);
  const byModule = new Map(entries.map((e) => [e.module, e]));
  return {
    role: {
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      isSystem: flag(role, 'isSystem'),
      isActive: flag(role, 'isActive'),
    },
    modules: modules.map((m) => ({
      ...m,
      grant: byModule.get(m.key) || { module: m.key, enabled: false, actions: emptyActions(false) },
    })),
    widgets: widgets.map((w) => ({ ...w, visible: visible.includes(w.key) })),
  };
}

// ---------------------------------------------------------------------------
// Validation of a submitted matrix
// ---------------------------------------------------------------------------

function normaliseEntries(raw: any): RoleAccessEntry[] {
  const list = Array.isArray(raw) ? raw : raw?.modules;
  return (Array.isArray(list) ? list : []).map((item: any) => {
    const actions = emptyActions(false);
    const source = item?.actions || {};
    for (const action of RBAC_ACTIONS) {
      const value = source[action] ?? source[`can_${action}`] ?? item?.[action];
      actions[action] = value === true || value === 1 || value === '1';
    }
    const enabled = item?.enabled === undefined ? Object.values(actions).some(Boolean) : Boolean(item.enabled);
    return { module: String(item?.module ?? item?.key ?? '').trim().toUpperCase(), enabled, actions };
  });
}

/**
 * A full-matrix save must describe every module: a partial payload would
 * otherwise silently revoke the modules it forgot to mention.
 */
function assertCompleteMatrix(entries: RoleAccessEntry[], registryKeys: string[]): void {
  const seen = new Set(entries.map((e) => e.module));
  const missing = registryKeys.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    throw new RbacValidationError(
      `Matrix must cover every module. Missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? `, … (${missing.length} total)` : ''}`
    );
  }
  const unknown = entries.filter((e) => !registryKeys.includes(e.module)).map((e) => e.module);
  if (unknown.length > 0) {
    throw new RbacValidationError(`Unknown module keys: ${unknown.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function writeRolePermissions(
  conn: any,
  roleId: string,
  entries: RoleAccessEntry[]
): Promise<void> {
  await conn.query('DELETE FROM `rolepermission` WHERE `roleId` = ?', [roleId]);
  for (const entry of entries) {
    const accessLevel = deriveAccessLevel(entry);
    await conn.query(
      `INSERT INTO \`rolepermission\`
         (\`id\`, \`roleId\`, \`module\`, \`accessLevel\`, \`enabled\`,
          \`can_view\`, \`can_create\`, \`can_edit\`, \`can_update\`, \`can_delete\`, \`can_export\`, \`can_approve\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId('rp_'),
        roleId,
        entry.module,
        accessLevel,
        entry.enabled && entry.actions.view ? 1 : 0,
        ...RBAC_ACTIONS.map((a) => (entry.enabled && entry.actions[a] ? 1 : 0)),
      ]
    );
  }
}

async function writeRoleWidgets(conn: any, roleId: string, widgetKeys: string[]): Promise<void> {
  const registry = await listWidgets();
  const valid = new Set(registry.map((w) => w.id));
  await conn.query('DELETE FROM `role_widget` WHERE `roleId` = ?', [roleId]);
  for (const key of new Set(widgetKeys)) {
    const widget = registry.find((w) => w.key === key);
    if (!widget || !valid.has(widget.id)) continue;
    await conn.query('INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`) VALUES (?, ?, ?, 1)', [
      newId('rw_'),
      roleId,
      widget.id,
    ]);
  }
}

function snapshot(entries: RoleAccessEntry[], widgets: string[]) {
  return {
    widgets: [...widgets].sort(),
    modules: entries
      .filter((e) => e.enabled)
      .map((e) => ({
        module: e.module,
        actions: RBAC_ACTIONS.filter((a) => e.actions[a]).sort(),
      }))
      .sort((a, b) => a.module.localeCompare(b.module)),
  };
}

function diffSnapshots(before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>) {
  const beforeMap = new Map(before.modules.map((m) => [m.module, m.actions.join(',')]));
  const afterMap = new Map(after.modules.map((m) => [m.module, m.actions.join(',')]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [module, actions] of afterMap) {
    const prior = beforeMap.get(module);
    if (prior === undefined) added.push(module);
    else if (prior !== actions) changed.push(module);
  }
  for (const module of beforeMap.keys()) {
    if (!afterMap.has(module)) removed.push(module);
  }
  return {
    widgets: { before: before.widgets, after: after.widgets },
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
  };
}

async function audit(actor: Actor, action: string, entityType: string, entityId: string, before: any, after: any) {
  await AuditService.log({
    userId: actor.id,
    locationId: actor.locationId,
    action,
    entityType,
    entityId,
    ipAddress: actor.ip || '127.0.0.1',
    userAgent: actor.userAgent || 'Client',
    riskScore: action === 'DELETE' ? 80 : 40,
    tags: ['rbac', 'role-administration'],
    before,
    after,
  }).catch((err) => console.error('[rbacAdmin] audit failed:', err?.message || err));
}

/**
 * Replace a role's module + widget grants. Admin (or Super Admin) only —
 * enforced by the route guard, re-checked here so the service cannot be used
 * to bypass it.
 */
export async function replaceRoleAccess(
  roleId: string,
  payload: { modules: any; widgets?: string[] },
  actor: Actor
): Promise<{ message: string; matrix: Awaited<ReturnType<typeof getRoleMatrix>> }> {
  if (!actor.canAssignModuleAccess) {
    throw new RbacForbiddenError('Only an Admin can assign module access to roles.');
  }
  const role = await getRoleRow(roleId);
  if (!role) throw new RbacNotFoundError(`Role ${roleId} not found`);

  // Self-escalation guard: rewriting the privileged roles is Super Admin work.
  if (['SUPER_ADMIN', 'ADMIN'].includes(role.name) && !actor.canManageRoles) {
    throw new RbacForbiddenError(
      `Only a Super Admin can change access for the ${role.name} role. Ask a Super Admin, or pick a different role.`
    );
  }

  const modules = await listModules();
  const entries = normaliseEntries(payload.modules);
  if (entries.length === 0) throw new RbacValidationError('No module grants supplied.');
  assertCompleteMatrix(entries, modules.map((m) => m.key));

  const widgets = Array.isArray(payload.widgets) ? payload.widgets.map(String) : [];
  const beforeAccess = await getRoleAccess(role.id);
  const before = snapshot(beforeAccess.entries, beforeAccess.widgets);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await writeRolePermissions(conn, role.id, entries);
    await writeRoleWidgets(conn, role.id, widgets);
    await conn.query('UPDATE `role` SET `updatedById` = ?, `updatedAt` = NOW(3) WHERE `id` = ?', [actor.id, role.id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const after = snapshot(entries, widgets);
  await audit(actor, 'UPDATE', 'RBAC_MODULE_ACCESS', role.id, before, {
    ...after,
    diff: diffSnapshots(before, after),
  });

  invalidateAccessCaches();
  return { message: `Module access saved for ${role.name}`, matrix: await getRoleMatrix(role.id) };
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  isActive?: boolean;
  modules?: any;
  widgets?: string[];
  firstUser?: { fullName: string; email: string; password: string };
}

/** Create a role, optionally seeding its matrix and its first user. */
export async function createRole(input: CreateRoleInput, actor: Actor) {
  if (!actor.canManageRoles) {
    throw new RbacForbiddenError('Only a Super Admin can create roles.');
  }
  const name = String(input.name || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,49}$/.test(name)) {
    throw new RbacValidationError('Role name must be UPPERCASE_SNAKE_CASE, 3–50 characters.');
  }
  if (await getRoleRow(name)) throw new RbacConflictError(`Role "${name}" already exists.`);

  const modules = await listModules();
  const entries = input.modules ? normaliseEntries(input.modules) : [];
  if (entries.length > 0) assertCompleteMatrix(entries, modules.map((m) => m.key));

  const roleId = newId('role_');
  const createdUserId = input.firstUser ? newId('usr_') : null;

  let userPasswordHash: string | null = null;
  let firstUserEmail: string | null = null;
  if (input.firstUser) {
    firstUserEmail = String(input.firstUser.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(firstUserEmail)) {
      throw new RbacValidationError('A valid email is required to create the first user.');
    }
    const [dupe]: any = await pool.query('SELECT `id` FROM `user` WHERE `email` = ? LIMIT 1', [firstUserEmail]);
    if (dupe?.length) throw new RbacConflictError(`A user with email ${firstUserEmail} already exists.`);
    const strength = PasswordService.validateStrength(input.firstUser.password || '');
    if (!strength.isValid) {
      throw new RbacValidationError(`Password does not meet policy: ${strength.errors.join(', ')}`);
    }
    userPasswordHash = await PasswordService.hashPassword(input.firstUser.password || '');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO \`role\` (\`id\`, \`name\`, \`description\`, \`isSystem\`, \`isActive\`, \`createdById\`, \`updatedById\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, 0, ?, ?, ?, NOW(3), NOW(3))`,
      [roleId, name, String(input.description || '').slice(0, 500), input.isActive === false ? 0 : 1, actor.id, actor.id]
    );

    if (entries.length > 0) {
      await writeRolePermissions(conn, roleId, entries);
      await writeRoleWidgets(conn, roleId, input.widgets || []);
    } else {
      // Every module explicitly off, so the matrix page has rows to edit.
      await writeRolePermissions(
        conn,
        roleId,
        modules.map((m) => ({ module: m.key, enabled: false, actions: emptyActions(false) }))
      );
    }

    if (createdUserId && firstUserEmail && userPasswordHash) {
      await conn.query(
        `INSERT INTO \`user\`
           (\`id\`, \`email\`, \`passwordHash\`, \`fullName\`, \`role\`, \`permissions\`,
            \`isActive\`, \`status\`, \`accessStatus\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'ACTIVE', 'ACTIVE', NOW(3), NOW(3))`,
        [
          createdUserId,
          firstUserEmail,
          userPasswordHash,
          String(input.firstUser!.fullName || '').trim().slice(0, 191) || firstUserEmail,
          legacyRoleFor(name),
          JSON.stringify(legacyTokensForAccess(entries)),
        ]
      );
      await conn.query('INSERT INTO `userrole` (`id`, `userId`, `roleId`, `createdAt`) VALUES (?, ?, ?, NOW(3))', [
        newId('ur_'),
        createdUserId,
        roleId,
      ]);
    }

    await conn.commit();
  } catch (error: any) {
    await conn.rollback();
    if (error?.code === 'ER_DUP_ENTRY' && /email/.test(String(error?.message))) {
      throw new RbacConflictError(`A user with email ${firstUserEmail} already exists.`);
    }
    throw error;
  } finally {
    conn.release();
  }

  await audit(actor, 'CREATE', 'RBAC_ROLE', roleId, null, {
    name,
    description: input.description || '',
    isActive: input.isActive !== false,
    users: createdUserId ? 1 : 0,
    grantedModules: entries.filter((e) => e.enabled).map((e) => e.module),
  });
  invalidateAccessCaches();

  return {
    role: {
      id: roleId,
      name,
      description: String(input.description || ''),
      isSystem: false,
      isActive: input.isActive !== false,
    },
    firstUser: createdUserId ? { id: createdUserId, email: firstUserEmail } : null,
  };
}

/**
 * `user.role` is a fixed legacy enum, so a newly invented RBAC role cannot be
 * written into it. Map onto the closest enum value; everything else lands on
 * EMPLOYEE and is governed by the RBAC role row.
 */
function legacyRoleFor(roleName: string): string {
  const enumValues = [
    'SUPER_ADMIN',
    'ADMIN',
    'HR_MANAGER',
    'HR_EXECUTIVE',
    'PAYROLL_MANAGER',
    'LOCATION_MANAGER',
    'FLOOR_MANAGER',
    'DEPARTMENT_MANAGER',
    'TEAM_LEAD',
    'SALES_EMPLOYEE',
    'TEA_BREAK_MANAGER',
    'T_SHOP_OWNER',
    'HR_AUDITOR',
    'EMPLOYEE',
  ];
  const direct = roleName.toUpperCase();
  if (enumValues.includes(direct)) return direct;
  if (roleName.includes('SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (roleName.includes('ADMIN')) return 'ADMIN';
  if (roleName.includes('HR')) return 'HR_MANAGER';
  if (roleName.includes('FLOOR') || roleName.includes('MANAGER')) return 'FLOOR_MANAGER';
  return 'EMPLOYEE';
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export async function updateRole(roleId: string, input: UpdateRoleInput, actor: Actor) {
  if (!actor.canManageRoles) {
    throw new RbacForbiddenError('Only a Super Admin can edit roles.');
  }
  const before = await getRoleRow(roleId);
  if (!before) throw new RbacNotFoundError(`Role ${roleId} not found`);

  const sets: string[] = [];
  const params: any[] = [];
  let nextName = before.name;

  if (input.name !== undefined) {
    const name = String(input.name).trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{2,49}$/.test(name)) {
      throw new RbacValidationError('Role name must be UPPERCASE_SNAKE_CASE, 3–50 characters.');
    }
    if (name !== before.name) {
      if (flag(before, 'isSystem')) throw new RbacValidationError('System roles cannot be renamed.');
      const clash = await getRoleRow(name);
      if (clash) throw new RbacConflictError(`Role "${name}" already exists.`);
      nextName = name;
      sets.push('`name` = ?');
      params.push(name);
    }
  }
  if (input.description !== undefined) {
    sets.push('`description` = ?');
    params.push(String(input.description).slice(0, 500));
  }
  if (input.isActive !== undefined) {
    if (!input.isActive && before.name === 'SUPER_ADMIN') {
      throw new RbacValidationError('The SUPER_ADMIN role cannot be deactivated.');
    }
    sets.push('`isActive` = ?');
    params.push(input.isActive ? 1 : 0);
  }
  if (sets.length === 0) throw new RbacValidationError('Nothing to update.');

  sets.push('`updatedById` = ?');
  params.push(actor.id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`UPDATE \`role\` SET ${sets.join(', ')}, \`updatedAt\` = NOW(3) WHERE \`id\` = ?`, [
      ...params,
      before.id,
    ]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  await audit(actor, 'UPDATE', 'RBAC_ROLE', before.id, {
    name: before.name,
    description: before.description,
    isActive: flag(before, 'isActive'),
  }, {
    name: nextName,
    description: input.description !== undefined ? input.description : before.description,
    isActive: input.isActive !== undefined ? input.isActive : flag(before, 'isActive'),
  });

  invalidateAccessCaches();
  return { id: before.id, name: nextName };
}

/**
 * Delete a role. Refused while users still hold it — the spec's safety rule,
 * and the only behaviour that cannot silently strip someone's access.
 */
export async function deleteRole(roleId: string, actor: Actor) {
  if (!actor.canManageRoles) {
    throw new RbacForbiddenError('Only a Super Admin can delete roles.');
  }
  const role = await getRoleRow(roleId);
  if (!role) throw new RbacNotFoundError(`Role ${roleId} not found`);
  if (flag(role, 'isSystem')) {
    throw new RbacValidationError(`"${role.name}" is a system role and cannot be deleted. Deactivate it instead.`);
  }

  const [holders]: any = await pool.query(
    `SELECT u.\`id\`, u.\`email\` FROM \`userrole\` ur
       JOIN \`user\` u ON u.\`id\` = ur.\`userId\`
      WHERE ur.\`roleId\` = ?`,
    [role.id]
  );
  if ((holders || []).length > 0) {
    throw new RbacConflictError(
      `Cannot delete "${role.name}": ${holders.length} user${holders.length === 1 ? '' : 's'} still assigned (${holders
        .slice(0, 3)
        .map((h: any) => h.email)
        .join(', ')}${holders.length > 3 ? ', …' : ''}). Reassign them first.`
    );
  }

  const access = await getRoleAccess(role.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // rolepermission/role_widget cascade on the FK, but the shim's connection
    // runs in strict mode so the explicit deletes keep intent visible.
    await conn.query('DELETE FROM `role_widget` WHERE `roleId` = ?', [role.id]);
    await conn.query('DELETE FROM `rolepermission` WHERE `roleId` = ?', [role.id]);
    await conn.query('DELETE FROM `role` WHERE `id` = ?', [role.id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  await audit(actor, 'DELETE', 'RBAC_ROLE', role.id, {
    name: role.name,
    description: role.description,
    grantedModules: access.entries.filter((e) => e.enabled).map((e) => e.module),
  }, null);

  invalidateAccessCaches();
  return { id: role.id, name: role.name };
}

// ---------------------------------------------------------------------------
// Overview + audit read
// ---------------------------------------------------------------------------

export async function getRbacOverview() {
  const [roleRows]: any = await pool.query(
    'SELECT `id`, `name`, `isSystem`, `isActive` FROM `role` ORDER BY `name` ASC'
  );
  const [userRows]: any = await pool.query(
    'SELECT `id`, `isActive`, `status` FROM `user`'
  );
  const [assignmentRows]: any = await pool.query(
    `SELECT ur.\`roleId\`, COUNT(*) AS n FROM \`userrole\` ur GROUP BY ur.\`roleId\``
  );
  const countByRole = new Map<string, number>(
    (assignmentRows || []).map((r: any) => [r.roleId, Number(r.n || 0)])
  );

  const roles = (roleRows || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    isSystem: flag(r, 'isSystem'),
    isActive: flag(r, 'isActive'),
    userCount: countByRole.get(r.id) || 0,
  }));

  const users = userRows || [];
  const activeUsers = users.filter((u: any) => flag(u, 'isActive') && u.status === 'ACTIVE').length;

  const [moduleRows]: any = await pool.query(
    `SELECT rp.\`module\`, COUNT(*) AS rolesWithAccess
       FROM \`rolepermission\` rp
      WHERE rp.\`enabled\` = 1 AND rp.\`can_view\` = 1
      GROUP BY rp.\`module\``
  );
  const [unassigned]: any = await pool.query(
    'SELECT COUNT(*) AS n FROM `user` u WHERE NOT EXISTS (SELECT 1 FROM `userrole` ur WHERE ur.`userId` = u.`id`)'
  );

  const [modules, widgets] = await Promise.all([listModules(), listWidgets()]);
  const moduleLabels = new Map(modules.map((m) => [m.key, m.label]));

  return {
    totals: {
      roles: roles.length,
      activeRoles: roles.filter((r) => r.isActive).length,
      inactiveRoles: roles.filter((r) => !r.isActive).length,
      users: users.length,
      activeUsers,
      inactiveUsers: users.length - activeUsers,
      usersWithoutRoles: Number(unassigned?.[0]?.n || 0),
      modules: modules.length,
      widgets: widgets.length,
    },
    roles,
    moduleCoverage: (moduleRows || [])
      .map((r: any) => ({
        module: r.module,
        label: moduleLabels.get(r.module) || r.module,
        rolesWithAccess: Number(r.rolesWithAccess || 0),
      }))
      .sort((a: any, b: any) => b.rolesWithAccess - a.rolesWithAccess),
    widgetCount: widgets.length,
  };
}

export async function listRbacAuditLogs(limit = 50) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
  // Raw read: the shim's `where: { in: [...] }` support is not guaranteed, and
  // we want the actor identity joined in for the audit UI.
  const [rows]: any = await pool.query(
    `SELECT a.\`id\`, a.\`action\`, a.\`entityType\`, a.\`entityId\`, a.\`userId\`, a.\`riskScore\`,
            a.\`createdAt\`, a.\`oldValue\`, a.\`newValue\`,
            u.\`email\` AS actorEmail, u.\`fullName\` AS actorName, r.\`name\` AS roleName
       FROM \`auditlog\` a
       LEFT JOIN \`user\` u ON u.\`id\` = a.\`userId\`
       LEFT JOIN \`role\` r ON r.\`id\` = a.\`entityId\`
      WHERE a.\`entityType\` IN ('RBAC_ROLE', 'RBAC_MODULE_ACCESS', 'RBAC_USER_ROLE')
      ORDER BY a.\`createdAt\` DESC
      LIMIT ${take}`
  );
  return (rows || []).map((row: any) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorUserId: row.userId,
    actorEmail: row.actorEmail ?? null,
    actorName: row.actorName ?? null,
    roleName: row.roleName ?? null,
    riskScore: row.riskScore ?? null,
    createdAt: row.createdAt,
    before: readJsonValue(row.oldValue),
    after: readJsonValue(row.newValue),
  }));
}

function readJsonValue(raw: any): any {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
