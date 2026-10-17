/**
 * Access-control administration API.
 *
 *   Super Admin → role lifecycle (create / rename / deactivate / delete)
 *   Admin       → module access assignment (which actions each role may take)
 *   Everyone    → GET /me/permissions (what the UI must render)
 *
 * Each surface is its own guarded router so it can be mounted both under the
 * namespaced /api/access prefix and at the documented bare paths
 * (/api/module-access/:roleId, /api/me/permissions) without duplicating code.
 */
import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { attachAccess, requireModuleAssignment, requireRoleLifecycle } from '../middleware/rbac.js';
import {
  RBAC_ACTIONS,
  canAccess,
  describeAccess,
  grantForModule,
  invalidateAccessCaches,
  listModules,
  listWidgets,
  resolveUserAccess,
} from '../services/accessControl.js';
import { AuditService } from '../services/auditService.js';
import { pool } from '../nativeDb.js';
import {
  Actor,
  RbacConflictError,
  RbacForbiddenError,
  RbacNotFoundError,
  RbacValidationError,
  createRole,
  deleteRole,
  getRbacOverview,
  getRoleMatrix,
  legacyTokensForAccess,
  listRbacAuditLogs,
  listRolesForAdmin,
  replaceRoleAccess,
  updateRole,
} from '../services/rbacAdmin.js';

function fail(res: Response, error: any): void {
  if (error instanceof RbacValidationError) return void res.status(400).json({ error: error.message });
  if (error instanceof RbacConflictError) return void res.status(409).json({ error: error.message });
  if (error instanceof RbacForbiddenError) return void res.status(403).json({ error: error.message });
  if (error instanceof RbacNotFoundError) return void res.status(404).json({ error: error.message });
  console.error('[access] unexpected error:', error);
  res.status(500).json({ error: 'Access administration request failed', detail: error?.message || String(error) });
}

function actorOf(req: AuthRequest): Actor {
  return {
    id: req.user!.id,
    role: req.user!.role,
    locationId: req.user!.locationId,
    ip: req.ip || req.socket.remoteAddress || '127.0.0.1',
    userAgent: (req.headers['user-agent'] as string) || 'Client',
    canManageRoles: Boolean(req.access?.canManageRoles),
    canAssignModuleAccess: Boolean(req.access?.canAssignModuleAccess),
  };
}

/** Either administration surface may read; writes are narrower still. */
function requireAdminSurface(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.access) return res.status(401).json({ error: 'Authentication required' });
  if (req.access.canManageRoles || req.access.canAssignModuleAccess) return next();
  return res.status(403).json({
    error: 'Forbidden',
    message: 'Role and module administration is limited to Super Admin and Admin accounts.',
  });
}

function guarded(...handlers: any[]) {
  const router = Router();
  router.use(authenticate, attachAccess, ...handlers);
  return router;
}

/**
 * Landing route per role: staff get the self-service desk, the administration
 * roles get the governance dashboard.
 */
function deriveHomePath(roles: string[]): string {
  if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')) return '/admin/access';
  if (roles.includes('HR') || roles.includes('FLOOR_MANAGER')) return '/dashboard';
  return '/my-desk';
}

// ---------------------------------------------------------------------------
// /me — what may I see and do?
// ---------------------------------------------------------------------------

export const meRouter = guarded();

meRouter.get('/permissions', async (req: AuthRequest, res) => {
  try {
    const access = req.access || (await resolveUserAccess(req.user!.id, req.user!.role, req.user!.permissions));
    const payload = await describeAccess(access);
    res.json({
      ...payload,
      actions: RBAC_ACTIONS,
      primaryRole: payload.roles[0] || 'EMPLOYEE',
      homePath: deriveHomePath(payload.roles),
    });
  } catch (error: any) {
    console.error('[access] me/permissions failed:', error);
    res.status(500).json({ error: 'Failed to load your permissions' });
  }
});

meRouter.get('/permissions/:module/:action', async (req: AuthRequest, res) => {
  try {
    const access = req.access!;
    const moduleKey = String(req.params.module || '').toUpperCase();
    const action = String(req.params.action || 'view') as any;
    if (!RBAC_ACTIONS.includes(action)) return res.status(400).json({ error: `Unknown action "${action}"` });
    res.json({
      module: moduleKey,
      action,
      allowed: canAccess(access, moduleKey, action),
      grant: grantForModule(access, moduleKey),
    });
  } catch (error: any) {
    fail(res, error);
  }
});

// ---------------------------------------------------------------------------
// /module-access — the Admin's surface
// ---------------------------------------------------------------------------

export const moduleAccessRouter = guarded();

moduleAccessRouter.get('/', requireAdminSurface, async (_req: AuthRequest, res) => {
  try {
    const roles = await listRolesForAdmin();
    const modules = await listModules();
    const matrices = await Promise.all(roles.map((role) => getRoleMatrix(role.id)));
    res.json({
      actions: RBAC_ACTIONS,
      modules,
      roles: matrices.map((matrix) => ({
        ...matrix.role,
        userCount: roles.find((r) => r.id === matrix.role.id)?.userCount ?? 0,
        grantedModules: matrix.modules.filter((m) => m.grant.enabled && m.grant.actions.view).map((m) => m.key),
      })),
    });
  } catch (error: any) {
    fail(res, error);
  }
});

moduleAccessRouter.get('/:roleId', requireAdminSurface, async (req: AuthRequest, res) => {
  try {
    res.json(await getRoleMatrix(req.params.roleId));
  } catch (error: any) {
    fail(res, error);
  }
});

moduleAccessRouter.put('/:roleId', requireModuleAssignment, async (req: AuthRequest, res) => {
  try {
    const result = await replaceRoleAccess(req.params.roleId, req.body || {}, actorOf(req));
    res.json({ message: result.message, matrix: result.matrix });
  } catch (error: any) {
    fail(res, error);
  }
});

// ---------------------------------------------------------------------------
// /roles — the Super Admin's surface
// ---------------------------------------------------------------------------

export const rolesRouter = guarded();

rolesRouter.get('/', requireAdminSurface, async (_req: AuthRequest, res) => {
  try {
    res.json({ roles: await listRolesForAdmin(), modules: await listModules(), actions: RBAC_ACTIONS });
  } catch (error: any) {
    fail(res, error);
  }
});

rolesRouter.get('/:id/matrix', requireAdminSurface, async (req: AuthRequest, res) => {
  try {
    res.json(await getRoleMatrix(req.params.id));
  } catch (error: any) {
    fail(res, error);
  }
});

rolesRouter.post('/', requireRoleLifecycle, async (req: AuthRequest, res) => {
  try {
    const created = await createRole(req.body || {}, actorOf(req));
    res.status(201).json({ message: `Role "${created.role.name}" created`, ...created });
  } catch (error: any) {
    fail(res, error);
  }
});

rolesRouter.patch('/:id', requireRoleLifecycle, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    const updated = await updateRole(
      req.params.id,
      {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
      actorOf(req)
    );
    res.json({ message: 'Role updated', role: updated });
  } catch (error: any) {
    fail(res, error);
  }
});

// Explicit activate/deactivate, because the UI presents it as a status change.
rolesRouter.post('/:id/status', requireRoleLifecycle, async (req: AuthRequest, res) => {
  try {
    const isActive = Boolean(req.body?.isActive);
    const updated = await updateRole(req.params.id, { isActive }, actorOf(req));
    res.json({ message: `Role ${isActive ? 'activated' : 'deactivated'}`, role: updated });
  } catch (error: any) {
    fail(res, error);
  }
});

rolesRouter.delete('/:id', requireRoleLifecycle, async (req: AuthRequest, res) => {
  try {
    const removed = await deleteRole(req.params.id, actorOf(req));
    res.json({ message: `Role "${removed.name}" deleted`, role: removed });
  } catch (error: any) {
    fail(res, error);
  }
});

// ---------------------------------------------------------------------------
// Administration registries, user assignment, audit trail
// ---------------------------------------------------------------------------

export const adminRouter = guarded();

adminRouter.get('/modules', requireAdminSurface, async (_req: AuthRequest, res) => {
  try {
    res.json({ modules: await listModules(), actions: RBAC_ACTIONS });
  } catch (error: any) {
    fail(res, error);
  }
});

adminRouter.get('/widgets', requireAdminSurface, async (_req: AuthRequest, res) => {
  try {
    res.json({ widgets: await listWidgets() });
  } catch (error: any) {
    fail(res, error);
  }
});

adminRouter.get('/overview', requireAdminSurface, async (_req: AuthRequest, res) => {
  try {
    res.json(await getRbacOverview());
  } catch (error: any) {
    fail(res, error);
  }
});

adminRouter.get('/audit-logs', requireAdminSurface, async (req: AuthRequest, res) => {
  try {
    res.json({ logs: await listRbacAuditLogs(Number(req.query.limit || 50)) });
  } catch (error: any) {
    fail(res, error);
  }
});

adminRouter.get('/users', requireAdminSurface, async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const roleId = String(req.query.roleId || '').trim();
    const params: any[] = [];
    let where = '1 = 1';
    if (q) {
      where += ' AND (LOWER(u.email) LIKE ? OR u.fullName LIKE ? OR u.role LIKE ?)';
      params.push(`%${q.toLowerCase()}%`, `%${q}%`, `%${q.toUpperCase()}%`);
    }
    if (roleId) {
      where += ' AND EXISTS (SELECT 1 FROM `userrole` f WHERE f.`userId` = u.`id` AND f.`roleId` = ?)';
      params.push(roleId);
    }

    const [rows]: any = await pool.query(
      `SELECT u.\`id\`, u.\`email\`, u.\`fullName\`, u.\`role\`, u.\`isActive\`, u.\`status\`, u.\`lastLoginAt\`, u.\`employeeId\`
         FROM \`user\` u WHERE ${where} ORDER BY u.\`fullName\` ASC LIMIT 200`,
      params
    );
    const [assignments]: any = await pool.query(
      'SELECT ur.`userId`, ur.`roleId`, r.`name` FROM `userrole` ur JOIN `role` r ON r.`id` = ur.`roleId`'
    );
    const byUser = new Map<string, { roleId: string; name: string }[]>();
    for (const row of assignments || []) {
      const list = byUser.get(row.userId) || [];
      list.push({ roleId: row.roleId, name: row.name });
      byUser.set(row.userId, list);
    }

    res.json({
      users: (rows || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        legacyRole: u.role,
        isActive: u.isActive === 1 || u.isActive === true,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        employeeId: u.employeeId,
        roles: byUser.get(u.id) || [],
      })),
      total: (rows || []).length,
    });
  } catch (error: any) {
    fail(res, error);
  }
});

adminRouter.put('/users/:userId/roles', requireRoleLifecycle, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const roleIds: string[] = Array.isArray(req.body?.roleIds) ? req.body.roleIds.map((id: unknown) => String(id)) : [];

    const [target]: any = await pool.query('SELECT `id`, `email`, `role` FROM `user` WHERE `id` = ? LIMIT 1', [userId]);
    if (!target?.length) return res.status(404).json({ error: 'User not found' });

    if (roleIds.length > 0) {
      const [found]: any = await pool.query('SELECT `id`, `name`, `isActive` FROM `role` WHERE `id` IN (?)', [roleIds]);
      const byId = new Map<string, any>((found || []).map((r: any) => [r.id, r]));
      const invalid = roleIds.filter((id) => !byId.has(id));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Unknown role ids: ${invalid.join(', ')}` });
      }
      const inactive = roleIds.filter((id) => !byId.get(id)?.isActive);
      if (inactive.length > 0) {
        return res
          .status(400)
          .json({ error: `Cannot assign inactive role(s): ${inactive.map((id) => byId.get(id).name).join(', ')}` });
      }
      // Only a Super Admin may hand out SUPER_ADMIN, and nobody may hand it to
      // themselves — that is the escalation path this split exists to close.
      const grantsSuperAdmin = roleIds.some((id) => byId.get(id)?.name === 'SUPER_ADMIN');
      if (grantsSuperAdmin && req.user!.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only a Super Admin can assign the SUPER_ADMIN role' });
      }
      if (grantsSuperAdmin && userId === req.user!.id) {
        return res.status(400).json({ error: 'You cannot grant the SUPER_ADMIN role to yourself' });
      }
    }

    const [before]: any = await pool.query('SELECT `roleId` FROM `userrole` WHERE `userId` = ?', [userId]);
    const beforeRoleIds = (before || []).map((r: any) => r.roleId);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM `userrole` WHERE `userId` = ?', [userId]);
      for (const roleId of roleIds) {
        await conn.query('INSERT INTO `userrole` (`id`, `userId`, `roleId`, `createdAt`) VALUES (?, ?, ?, NOW(3))', [
          `ur_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
          userId,
          roleId,
        ]);
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    invalidateAccessCaches(userId);

    const [roleRows]: any = await pool.query(
      roleIds.length > 0
        ? 'SELECT `id`, `name` FROM `role` WHERE `id` IN (?)'
        : 'SELECT `id`, `name` FROM `role` WHERE 0 = 1',
      roleIds.length > 0 ? [roleIds] : []
    );

    if (roleIds.length > 0) {
      // Keep the two permission layers consistent: `user.role` is a fixed legacy
      // enum and `user.permissions` still gates the ~300 authorize() routes, so
      // both are re-derived from what the assigned roles actually grant.
      const fresh = await resolveUserAccess(userId);
      const entries = Object.values(fresh.grants).map((grant) => ({
        module: grant.module,
        enabled: grant.enabled,
        actions: grant.actions,
      }));
      const tokens = legacyTokensForAccess(entries);
      const names = (roleRows || []).map((r: any) => String(r.name).toUpperCase());
      const legacy = names.includes('SUPER_ADMIN')
        ? 'SUPER_ADMIN'
        : names.includes('ADMIN')
          ? 'ADMIN'
          : names.includes('HR')
            ? 'HR_MANAGER'
            : names.includes('FLOOR_MANAGER')
              ? 'FLOOR_MANAGER'
              : 'EMPLOYEE';
      await pool.query('UPDATE `user` SET `role` = ?, `permissions` = ?, `updatedAt` = NOW(3) WHERE `id` = ?', [
        legacy,
        JSON.stringify(tokens),
        userId,
      ]);
      invalidateAccessCaches(userId);
    }

    await AuditService.log({
      userId: req.user!.id,
      locationId: req.user!.locationId,
      action: 'ASSIGN',
      entityType: 'RBAC_USER_ROLE',
      entityId: userId,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: (req.headers['user-agent'] as string) || 'Client',
      riskScore: 50,
      tags: ['rbac', 'role-administration'],
      before: { roleIds: beforeRoleIds },
      after: { roleIds, roles: (roleRows || []).map((r: any) => r.name), actorEmail: target.email },
    }).catch(() => {});

    res.json({ message: 'User roles updated', userId, roleIds });
  } catch (error: any) {
    fail(res, error);
  }
});

// ---------------------------------------------------------------------------

const router = Router();
router.use('/me', meRouter);
router.use('/module-access', moduleAccessRouter);
router.use('/roles', rolesRouter);
router.use('/', adminRouter);

export default router;
