import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import {
  RBAC_MODULES,
  ACCESS_LEVELS,
  AccessLevel,
  ensureRbacReady,
  listRoles,
  getUserModuleAccess,
  invalidateUserAccessCache,
  invalidateAllAccessCache,
  canManageRoles,
  accessRank,
} from '../services/rbacService.js';

const router = Router();
router.use(authenticate);

const ALL_ROLES = [
  { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full system control across all locations' },
  { code: 'ADMIN', name: 'Admin', description: 'Administrative access to all locations' },
  { code: 'HR_MANAGER', name: 'HR Manager', description: 'Workforce, shifts, attendance and payroll management' },
  { code: 'HR_EXECUTIVE', name: 'HR Executive', description: 'Day-to-day HR operations and employee management' },
  { code: 'PAYROLL_MANAGER', name: 'Payroll Manager', description: 'Payroll runs, deductions, and payslip generation' },
  { code: 'LOCATION_MANAGER', name: 'Location Manager', description: 'Oversees single branch operations' },
  { code: 'FLOOR_MANAGER', name: 'Floor Manager', description: 'Floor floor supervision and attendance tracking' },
  { code: 'DEPARTMENT_MANAGER', name: 'Department Manager', description: 'Department performance and schedules' },
  { code: 'TEAM_LEAD', name: 'Team Lead', description: 'Team level supervision and shift tracking' },
  { code: 'SALES_EMPLOYEE', name: 'Sales Employee', description: 'Floor sales operations and self-service desk' },
  { code: 'TEA_BREAK_MANAGER', name: 'Tea Break Manager', description: 'QR scanning and break timing verification' },
  { code: 'T_SHOP_OWNER', name: 'T-Shop Owner', description: 'Authorized canteen / tea break QR scanner' },
  { code: 'HR_AUDITOR', name: 'HR Auditor', description: 'Read-only audit and compliance inspection' },
  { code: 'EMPLOYEE', name: 'Employee', description: 'Self-service desk and attendance tracking' },
];

const ALL_PERMISSIONS = [
  { code: 'VIEW', name: 'View', category: 'Read' },
  { code: 'ADD', name: 'Add / Create', category: 'Write' },
  { code: 'EDIT', name: 'Edit / Update', category: 'Write' },
  { code: 'DELETE', name: 'Delete', category: 'Write' },
  { code: 'APPROVE', name: 'Approve', category: 'Workflow' },
  { code: 'REJECT', name: 'Reject', category: 'Workflow' },
  { code: 'ASSIGN', name: 'Assign Staff', category: 'Operations' },
  { code: 'EXPORT', name: 'Export Data', category: 'Reporting' },
  { code: 'IMPORT', name: 'Import Data', category: 'Operations' },
  { code: 'CONFIGURE', name: 'System Configuration', category: 'Administration' },
  { code: 'MANAGE', name: 'Manage Resources', category: 'Administration' },
  { code: 'RECORD', name: 'Record Punches & Logs', category: 'Operations' },
  { code: 'UPLOAD', name: 'Upload Media', category: 'Operations' },
  { code: 'PUBLISH', name: 'Publish Broadcasts', category: 'Operations' },
  { code: 'SCAN', name: 'Scan QR & Badges', category: 'Operations' },
  { code: 'VIEW_SENSITIVE_DATA', name: 'View Sensitive PII / Salaries', category: 'Security' },
];

// ---------------------------------------------------------------------------
// Legacy catalog endpoints (kept for backwards compatibility)
// ---------------------------------------------------------------------------

// Get roles and permissions metadata
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    res.json({
      roles: ALL_ROLES,
      permissions: ALL_PERMISSIONS,
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to retrieve roles' });
  }
});

// Update user permissions
router.put('/user/:userId', authorize('CONFIGURE'), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { role, permissions } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        role: role || undefined,
        permissions: permissions || undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'UPDATE',
        entityType: 'UserRolePermission',
        entityId: userId,
        newValue: { role, permissions },
      },
    });

    invalidateUserAccessCache(userId).catch(() => {});
    res.json({ message: 'User role & permissions updated successfully', user });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// ---------------------------------------------------------------------------
// RBAC: module registry, role CRUD, user ↔ role assignment
// ---------------------------------------------------------------------------

const MODULE_KEYS = RBAC_MODULES.map((m) => m.key);

const permissionMapSchema = z
  .record(z.enum(MODULE_KEYS as [string, ...string[]]), z.enum(ACCESS_LEVELS as [string, ...string[]]))
  .optional();

const roleBodySchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{2,49}$/, 'Role name must be UPPERCASE_SNAKE_CASE, 3–50 characters'),
  description: z.string().trim().max(500).optional().default(''),
  permissions: permissionMapSchema,
});

function generateId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Only Super Admins (legacy) or MANAGE holders may administer roles. */
function requireRoleAdmin(req: AuthRequest, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!canManageRoles(req.user.role, req.user.permissions)) {
    return res.status(403).json({
      error: 'Forbidden: only Super Admin can manage roles',
      message: 'Only Super Admin can create, edit or delete roles.',
    });
  }
  next();
}

/**
 * Privilege-escalation guard: an actor with restricted RBAC access cannot grant
 * access to modules they cannot edit themselves. SUPER_ADMIN actors bypass.
 */
async function validateGrantablePermissions(req: AuthRequest, permissions: Record<string, AccessLevel>): Promise<string | null> {
  const actorAccess = await getUserModuleAccess(req.user!.id, req.user!.role);
  if (actorAccess.source !== 'rbac') return null;
  for (const [module, level] of Object.entries(permissions)) {
    if (accessRank(level) > accessRank(actorAccess.access[module] || 'none')) {
      return `You cannot grant ${String(level).toUpperCase()} access to ${module.replace(/_/g, ' ').toLowerCase()} because your own role does not have it.`;
    }
  }
  return null;
}

// Module registry + the calling user's own effective access (used by the UI
// to hide/lock restricted sections).
router.get('/rbac/modules', async (req: AuthRequest, res) => {
  try {
    const myAccess = await getUserModuleAccess(req.user!.id, req.user!.role);
    res.json({
      modules: RBAC_MODULES,
      accessLevels: ACCESS_LEVELS,
      access: myAccess.access,
      source: myAccess.source,
      roles: myAccess.roles,
      canManageRoles: canManageRoles(req.user!.role, req.user!.permissions),
    });
  } catch (error) {
    console.error('Get RBAC modules error:', error);
    res.status(500).json({ error: 'Failed to retrieve RBAC modules' });
  }
});

// Effective access for the logged-in user (explicit endpoint per spec).
router.get('/rbac/my-access', async (req: AuthRequest, res) => {
  try {
    const myAccess = await getUserModuleAccess(req.user!.id, req.user!.role);
    res.json(myAccess);
  } catch (error) {
    console.error('Get my access error:', error);
    res.status(500).json({ error: 'Failed to retrieve your access map' });
  }
});

// List RBAC roles with permission matrices and assigned-user counts.
router.get('/rbac/roles', async (req: AuthRequest, res) => {
  try {
    const roles = await listRoles();
    res.json({ roles, modules: RBAC_MODULES });
  } catch (error) {
    console.error('List RBAC roles error:', error);
    res.status(500).json({ error: 'Failed to retrieve roles' });
  }
});

// Create a role (Super Admin only).
router.post('/rbac/roles', requireRoleAdmin, async (req: AuthRequest, res) => {
  try {
    const parsed = roleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { name, description, permissions } = parsed.data;

    await ensureRbacReady();

    const existing = await prisma.role.findFirst({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: `Role "${name}" already exists` });
    }

    const normalized: Record<string, AccessLevel> = {};
    for (const m of MODULE_KEYS) normalized[m] = (permissions?.[m] as AccessLevel) || 'none';

    const grantError = await validateGrantablePermissions(req, normalized);
    if (grantError) return res.status(403).json({ error: grantError });

    const role = await prisma.role.create({
      data: {
        id: generateId('role_'),
        name,
        description: description || '',
        isSystem: false,
        updatedAt: new Date(),
      },
    });

    await prisma.rolePermission.createMany({
      data: MODULE_KEYS.map((m) => ({
        id: generateId('rp_'),
        roleId: role.id,
        module: m,
        accessLevel: normalized[m],
      })),
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'CREATE',
        entityType: 'RbacRole',
        entityId: role.id,
        newValue: { name, description, permissions: normalized },
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
      },
    });

    res.status(201).json({ message: 'Role created successfully', role: { ...role, permissions: normalized } });
  } catch (error) {
    console.error('Create RBAC role error:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// Update a role (Super Admin only).
router.patch('/rbac/roles/:id', requireRoleAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const parsed = roleBodySchema.partial({ name: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { name, description, permissions } = parsed.data;

    await ensureRbacReady();

    const before = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!before) return res.status(404).json({ error: 'Role not found' });

    if (name && name !== before.name) {
      const clash = await prisma.role.findFirst({ where: { name } });
      if (clash) return res.status(409).json({ error: `Role "${name}" already exists` });
    }
    if (before.isSystem && name && name !== before.name) {
      return res.status(400).json({ error: 'System roles cannot be renamed' });
    }

    let normalized: Record<string, AccessLevel> | null = null;
    if (permissions) {
      normalized = {};
      for (const m of MODULE_KEYS) normalized[m] = (permissions?.[m] as AccessLevel) || 'none';
      if (before.name === 'SUPER_ADMIN') {
        const downgraded = MODULE_KEYS.some((m) => normalized![m] !== 'edit');
        if (downgraded) {
          return res.status(400).json({ error: 'The SUPER_ADMIN role must keep Edit access on every module' });
        }
      }
      const grantError = await validateGrantablePermissions(req, normalized);
      if (grantError) return res.status(403).json({ error: grantError });
    }

    await prisma.role.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        updatedAt: new Date(),
      },
    });

    if (normalized) {
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await prisma.rolePermission.createMany({
        data: MODULE_KEYS.map((m) => ({
          id: generateId('rp_'),
          roleId: id,
          module: m,
          accessLevel: normalized![m],
        })),
      });
      // Every permission change must be visible to affected users quickly.
      const holders = await prisma.userRole.findMany({ where: { roleId: id }, select: { userId: true } });
      for (const holder of holders || []) {
        await invalidateUserAccessCache(holder.userId);
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'UPDATE',
        entityType: 'RbacRole',
        entityId: id,
        oldValue: {
          name: before.name,
          description: before.description,
          permissions: Object.fromEntries(((before as any).permissions || []).map((p: any) => [p.module, p.accessLevel])),
        },
        newValue: { name: name ?? before.name, description, permissions: normalized ?? undefined },
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
      },
    });

    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    console.error('Update RBAC role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete a role (Super Admin only, protected roles refused).
router.delete('/rbac/roles/:id', requireRoleAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await ensureRbacReady();

    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.isSystem) {
      return res.status(400).json({ error: 'System roles cannot be deleted' });
    }

    const holders = await prisma.userRole.findMany({ where: { roleId: id }, select: { userId: true } });

    await prisma.userRole.deleteMany({ where: { roleId: id } });
    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.role.delete({ where: { id } });

    for (const holder of holders || []) {
      await invalidateUserAccessCache(holder.userId);
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'DELETE',
        entityType: 'RbacRole',
        entityId: id,
        oldValue: { name: role.name, description: role.description, removedFromUsers: (holders || []).length },
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
      },
    });

    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Delete RBAC role error:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// Search users with their RBAC role assignments (for the assignment modal).
router.get('/rbac/users', async (req: AuthRequest, res) => {
  try {
    await ensureRbacReady();
    const q = String(req.query.q || '').trim();

    const where = q
      ? {
          OR: [
            { email: { contains: q } },
            { fullName: { contains: q } },
            { role: { contains: q.toUpperCase() } },
          ],
        }
      : undefined;

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        status: true,
        locationId: true,
      },
      take: 50,
    });

    const userRoles = await prisma.userRole.findMany();
    const allRoles = await prisma.role.findMany();
    const roleNameById = new Map((allRoles || []).map((r: any) => [r.id, r.name]));

    res.json({
      users: (users || []).map((u: any) => ({
        ...u,
        rbacRoles: (userRoles || [])
          .filter((ur: any) => ur.userId === u.id)
          .map((ur: any) => ({ roleId: ur.roleId, name: roleNameById.get(ur.roleId) || 'UNKNOWN' })),
      })),
      total: (users || []).length,
    });
  } catch (error) {
    console.error('Search RBAC users error:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Replace a user's RBAC roles (Super Admin only for role assignment).
router.put('/rbac/users/:userId/roles', requireRoleAdmin, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const parsed = z.object({ roleIds: z.array(z.string()).max(20) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { roleIds } = parsed.data;

    await ensureRbacReady();

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const roles = await prisma.role.findMany();
    const roleById = new Map((roles || []).map((r: any) => [r.id, r]));
    const invalid = roleIds.filter((id) => !roleById.has(id));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Unknown role ids: ${invalid.join(', ')}` });
    }

    // Security rule: only Super Admin may hand out the SUPER_ADMIN role.
    const grantsSuperAdmin = roleIds.some((id) => roleById.get(id)?.name === 'SUPER_ADMIN');
    if (grantsSuperAdmin && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only Super Admin can assign the SUPER_ADMIN role' });
    }
    // Admins cannot escalate themselves.
    if (grantsSuperAdmin && userId === req.user!.id) {
      return res.status(400).json({ error: 'You cannot grant the SUPER_ADMIN role to yourself' });
    }

    const beforeAssignments = await prisma.userRole.findMany({ where: { userId } });
    const beforeRoleIds = (beforeAssignments || []).map((a: any) => a.roleId);

    await prisma.userRole.deleteMany({ where: { userId } });
    if (roleIds.length > 0) {
      await prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({
          id: generateId('ur_'),
          userId,
          roleId,
        })),
      });
    }

    await invalidateUserAccessCache(userId);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'ASSIGN',
        entityType: 'UserRole',
        entityId: userId,
        oldValue: { roleIds: beforeRoleIds },
        newValue: { roleIds, roles: roleIds.map((id) => roleById.get(id)?.name) },
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: (req.headers['user-agent'] as string) || 'Client',
      },
    });

    res.json({ message: 'User roles updated successfully' });
  } catch (error) {
    console.error('Assign user roles error:', error);
    res.status(500).json({ error: 'Failed to update user roles' });
  }
});

// Warm the RBAC schema/seed once at boot so the first request is fast.
ensureRbacReady().catch((err) => {
  console.warn('RBAC schema bootstrap deferred (database unreachable at boot):', err?.message || err);
});

export default router;
