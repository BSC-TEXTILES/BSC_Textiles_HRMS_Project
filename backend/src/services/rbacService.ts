/**
 * RBAC Service — module-level Role-Based Access Control.
 *
 * Adds three tables on top of the legacy `user.role`/`user.permissions` model:
 *   - role         (custom + system roles)
 *   - rolepermission (role × module × none|view|edit)
 *   - userrole     (many-to-many user ↔ role)
 *
 * Backwards compatibility: users WITHOUT any RBAC role assignment are governed
 * by the legacy permission model only (authorize()/requireRole()). Module
 * enforcement kicks in as soon as an admin assigns RBAC roles to a user.
 */
import { prisma } from '../db.js';
import { cacheService } from './cacheService.js';

export type AccessLevel = 'none' | 'view' | 'edit';

export interface RbacModule {
  key: string;
  label: string;
  description: string;
}

export const RBAC_MODULES: RbacModule[] = [
  { key: 'DASHBOARD', label: 'Dashboard', description: 'Executive dashboard and analytics overview' },
  { key: 'STORES', label: 'Store Management', description: 'Store / location records and configuration' },
  {
    key: 'BIOMETRIC_POLICY',
    label: 'Biometric Verification Threshold',
    description: 'Face verification minimum match confidence settings',
  },
  {
    key: 'QR_SECURITY_POLICY',
    label: 'QR Token Security Settings',
    description: 'Daily dynamic QR token and one-time scan anti-fraud rules',
  },
  {
    key: 'BREAK_POLICIES',
    label: 'Break Duration Policies',
    description: 'Male / Female lunch and tea allowance minutes',
  },
  { key: 'USERS', label: 'Users & Directory', description: 'User accounts and employee directory administration' },
  { key: 'ROLES_PERMISSIONS', label: 'Roles & Permissions', description: 'Role definitions and module-level access control' },
  { key: 'AUDIT_LOGS', label: 'Audit Logs', description: 'Security and configuration audit trail' },
];

export const ACCESS_LEVELS: AccessLevel[] = ['none', 'view', 'edit'];

const ACCESS_RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

export function accessRank(level?: AccessLevel | string): number {
  return ACCESS_RANK[(level as AccessLevel) || 'none'] ?? 0;
}

export function maxAccess(a?: AccessLevel | string, b?: AccessLevel | string): AccessLevel {
  return accessRank(a) >= accessRank(b) ? ((a as AccessLevel) || 'none') : ((b as AccessLevel) || 'none');
}

function allModules(level: AccessLevel): Record<string, AccessLevel> {
  return Object.fromEntries(RBAC_MODULES.map((m) => [m.key, level]));
}

export interface DefaultRole {
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Record<string, AccessLevel>;
}

/** Pre-created roles — matches the Admin Control Center spec. */
export const DEFAULT_RBAC_ROLES: DefaultRole[] = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full access to ALL modules (View + Edit), global scope',
    isSystem: true,
    permissions: allModules('edit'),
  },
  {
    name: 'STORE_MANAGER',
    description: 'View + Edit on Break Policies; View-only on Biometric & QR',
    isSystem: false,
    permissions: {
      DASHBOARD: 'view',
      STORES: 'view',
      BIOMETRIC_POLICY: 'view',
      QR_SECURITY_POLICY: 'view',
      BREAK_POLICIES: 'edit',
      USERS: 'none',
      ROLES_PERMISSIONS: 'none',
      AUDIT_LOGS: 'none',
    },
  },
  {
    name: 'HR_OFFICER',
    description: 'View + Edit on Break Policies and Users; No access to Biometric / QR',
    isSystem: false,
    permissions: {
      DASHBOARD: 'view',
      STORES: 'view',
      BIOMETRIC_POLICY: 'none',
      QR_SECURITY_POLICY: 'none',
      BREAK_POLICIES: 'edit',
      USERS: 'view',
      ROLES_PERMISSIONS: 'none',
      AUDIT_LOGS: 'none',
    },
  },
  {
    name: 'SECURITY_OFFICER',
    description: 'View + Edit on Biometric & QR policies; No access to Break Policies',
    isSystem: false,
    permissions: {
      DASHBOARD: 'view',
      STORES: 'view',
      BIOMETRIC_POLICY: 'edit',
      QR_SECURITY_POLICY: 'edit',
      BREAK_POLICIES: 'none',
      USERS: 'none',
      ROLES_PERMISSIONS: 'none',
      AUDIT_LOGS: 'view',
    },
  },
  {
    name: 'VIEWER',
    description: 'View-only on ALL modules, no edit rights anywhere',
    isSystem: false,
    permissions: allModules('view'),
  },
];

/** Roles that may never be deleted. */
export const PROTECTED_ROLE_NAMES = new Set(['SUPER_ADMIN']);

const MYSQL_DDL = [
  'CREATE TABLE IF NOT EXISTS `role` (`id` varchar(191) NOT NULL, `name` varchar(100) NOT NULL, `description` varchar(500) DEFAULT NULL, `isSystem` tinyint(1) NOT NULL DEFAULT 0, `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), UNIQUE KEY `Role_name_key` (`name`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'CREATE TABLE IF NOT EXISTS `rolepermission` (`id` varchar(191) NOT NULL, `roleId` varchar(191) NOT NULL, `module` varchar(100) NOT NULL, `accessLevel` enum(\'none\',\'view\',\'edit\') NOT NULL DEFAULT \'none\', PRIMARY KEY (`id`), UNIQUE KEY `RolePermission_roleId_module_key` (`roleId`,`module`), CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'CREATE TABLE IF NOT EXISTS `userrole` (`id` varchar(191) NOT NULL, `userId` varchar(191) NOT NULL, `roleId` varchar(191) NOT NULL, `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), UNIQUE KEY `UserRole_userId_roleId_key` (`userId`,`roleId`), KEY `UserRole_roleId_idx` (`roleId`), CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
];

const SQLITE_DDL = [
  'CREATE TABLE IF NOT EXISTS "role" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT NULL, "isSystem" INTEGER NOT NULL DEFAULT 0, "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "role"("name")',
  'CREATE TABLE IF NOT EXISTS "rolepermission" ("id" TEXT NOT NULL PRIMARY KEY, "roleId" TEXT NOT NULL, "module" TEXT NOT NULL, "accessLevel" TEXT NOT NULL DEFAULT \'none\', CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE CASCADE ON UPDATE CASCADE)',
  'CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_module_key" ON "rolepermission"("roleId", "module")',
  'CREATE TABLE IF NOT EXISTS "userrole" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "roleId" TEXT NOT NULL, "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE)',
  'CREATE UNIQUE INDEX IF NOT EXISTS "UserRole_userId_roleId_key" ON "userrole"("userId", "roleId")',
  'CREATE INDEX IF NOT EXISTS "UserRole_roleId_idx" ON "userrole"("roleId")',
];

function isSqlite(): boolean {
  return String(process.env.DB_TYPE || 'mysql').toLowerCase() === 'sqlite';
}

function generateId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

let readyPromise: Promise<void> | null = null;
let initFailed = false;

/** Idempotent: creates tables, seeds default roles, backfills SUPER_ADMIN users. */
export function ensureRbacReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = initialize().catch((err) => {
      initFailed = true;
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

async function initialize(): Promise<void> {
  const ddl = isSqlite() ? SQLITE_DDL : MYSQL_DDL;
  for (const stmt of ddl) {
    await prisma.$executeRaw(stmt);
  }

  // Seed default roles the first time the RBAC tables come up empty.
  const roleCount = await prisma.role.count();
  if (roleCount === 0) {
    for (const role of DEFAULT_RBAC_ROLES) {
      const created = await prisma.role.create({
        data: {
          id: generateId('role_'),
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          updatedAt: new Date(),
        },
      });
      await prisma.rolePermission.createMany({
        data: RBAC_MODULES.map((m) => ({
          id: generateId('rp_'),
          roleId: created.id,
          module: m.key,
          accessLevel: role.permissions[m.key] || 'none',
        })),
      });
    }
  }

  // Backfill: every existing SUPER_ADMIN account gets the SUPER_ADMIN RBAC role.
  const superAdminRole = await prisma.role.findFirst({ where: { name: 'SUPER_ADMIN' } });
  if (superAdminRole) {
    const superUsers = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    const existing = await prisma.userRole.findMany({
      where: { roleId: superAdminRole.id },
      select: { userId: true },
    });
    const have = new Set(existing.map((r: any) => r.userId));
    const missing = superUsers.filter((u: any) => !have.has(u.id));
    if (missing.length > 0) {
      await prisma.userRole.createMany({
        data: missing.map((u: any) => ({
          id: generateId('ur_'),
          userId: u.id,
          roleId: superAdminRole.id,
        })),
      });
    }
  }
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Record<string, AccessLevel>;
  userCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

function toPermissionMap(rows: any[]): Record<string, AccessLevel> {
  const map: Record<string, AccessLevel> = {};
  for (const m of RBAC_MODULES) map[m.key] = 'none';
  for (const row of rows || []) {
    if (map[row.module] !== undefined) {
      map[row.module] = (row.accessLevel as AccessLevel) || 'none';
    }
  }
  return map;
}

/** All roles with their permission matrices. */
export async function listRoles(): Promise<RoleWithPermissions[]> {
  await ensureRbacReady();
  const roles = await prisma.role.findMany({ orderBy: { createdAt: 'asc' } });
  const perms = await prisma.rolePermission.findMany();
  const userRoles = await prisma.userRole.findMany();
  const countByRole = new Map<string, number>();
  for (const ur of userRoles || []) {
    countByRole.set(ur.roleId, (countByRole.get(ur.roleId) || 0) + 1);
  }
  return (roles || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: Boolean(r.isSystem),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    permissions: toPermissionMap((perms || []).filter((p: any) => p.roleId === r.id)),
    userCount: countByRole.get(r.id) || 0,
  }));
}

export interface UserModuleAccess {
  /** Merged module → access level for the user. */
  access: Record<string, AccessLevel>;
  /** 'system' = SUPER_ADMIN, 'rbac' = role-derived, 'unrestricted' = legacy permission model */
  source: 'system' | 'rbac' | 'unrestricted';
  /** RBAC role names assigned to the user. */
  roles: string[];
}

const ACCESS_CACHE_TTL = 30_000;

/**
 * Effective module access for a user.
 * Users with no RBAC assignments are 'unrestricted' (legacy authorize() rules apply).
 */
export async function getUserModuleAccess(
  userId: string,
  legacyRole?: string
): Promise<UserModuleAccess> {
  if (legacyRole === 'SUPER_ADMIN') {
    return { access: allModules('edit'), source: 'system', roles: ['SUPER_ADMIN'] };
  }

  const cacheKey = `rbac:access:${userId}`;
  const cached = cacheService.get<UserModuleAccess>(cacheKey);
  if (cached) return cached.data;

  await ensureRbacReady();

  const assignments = await prisma.userRole.findMany({ where: { userId } });
  if (!assignments || assignments.length === 0) {
    const result: UserModuleAccess = { access: allModules('edit'), source: 'unrestricted', roles: [] };
    cacheService.set(cacheKey, result, ACCESS_CACHE_TTL);
    return result;
  }

  const roleIds = assignments.map((a: any) => a.roleId);
  const perms = await prisma.rolePermission.findMany();
  const roles = await prisma.role.findMany();

  const access: Record<string, AccessLevel> = {};
  for (const m of RBAC_MODULES) access[m.key] = 'none';
  for (const perm of perms || []) {
    if (!roleIds.includes(perm.roleId)) continue;
    access[perm.module] = maxAccess(access[perm.module], perm.accessLevel);
  }

  const roleNames = (roles || [])
    .filter((r: any) => roleIds.includes(r.id))
    .map((r: any) => r.name);

  const result: UserModuleAccess = { access, source: 'rbac', roles: roleNames };
  cacheService.set(cacheKey, result, ACCESS_CACHE_TTL);
  return result;
}

export async function invalidateUserAccessCache(userId: string): Promise<void> {
  cacheService.delete(`rbac:access:${userId}`);
}

export async function invalidateAllAccessCache(): Promise<void> {
  cacheService.invalidatePrefix('rbac:access:');
}

export function canManageRoles(legacyRole?: string, legacyPermissions?: string[]): boolean {
  if (legacyRole === 'SUPER_ADMIN') return true;
  return Boolean(legacyPermissions?.includes('MANAGE'));
}

export { initFailed };
