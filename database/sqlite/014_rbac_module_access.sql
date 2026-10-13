-- ===========================================================================
-- 014: RBAC MODULE-LEVEL ACCESS CONTROL (SQLite variant)
-- Mirrors database/migrations/014_rbac_module_access.sql for the local
-- SQLite fallback database. Idempotent — safe to run more than once.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "role" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NULL,
  "isSystem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "role"("name");

CREATE TABLE IF NOT EXISTS "rolepermission" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "roleId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "accessLevel" TEXT NOT NULL DEFAULT 'none',
  CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_module_key" ON "rolepermission"("roleId", "module");

CREATE TABLE IF NOT EXISTS "userrole" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserRole_userId_roleId_key" ON "userrole"("userId", "roleId");
CREATE INDEX IF NOT EXISTS "UserRole_roleId_idx" ON "userrole"("roleId");

-- Seed default roles
INSERT OR IGNORE INTO "role" ("id", "name", "description", "isSystem") VALUES
  ('role_super_admin',   'SUPER_ADMIN',      'Full access to ALL modules (View + Edit), global scope', 1),
  ('role_store_manager', 'STORE_MANAGER',    'View + Edit on Break Policies; View-only on Biometric & QR', 0),
  ('role_hr_officer',    'HR_OFFICER',       'View + Edit on Break Policies and Users; No access to Biometric / QR', 0),
  ('role_security',      'SECURITY_OFFICER', 'View + Edit on Biometric & QR policies; No access to Break Policies', 0),
  ('role_viewer',        'VIEWER',           'View-only on ALL modules, no edit rights anywhere', 0);

INSERT OR IGNORE INTO "rolepermission" ("id", "roleId", "module", "accessLevel") VALUES
  ('rp_sa_dash', 'role_super_admin', 'DASHBOARD', 'edit'),
  ('rp_sa_store','role_super_admin', 'STORES', 'edit'),
  ('rp_sa_bio',  'role_super_admin', 'BIOMETRIC_POLICY', 'edit'),
  ('rp_sa_qr',   'role_super_admin', 'QR_SECURITY_POLICY', 'edit'),
  ('rp_sa_brk',  'role_super_admin', 'BREAK_POLICIES', 'edit'),
  ('rp_sa_usr',  'role_super_admin', 'USERS', 'edit'),
  ('rp_sa_role', 'role_super_admin', 'ROLES_PERMISSIONS', 'edit'),
  ('rp_sa_aud',  'role_super_admin', 'AUDIT_LOGS', 'edit'),
  ('rp_sm_dash', 'role_store_manager', 'DASHBOARD', 'view'),
  ('rp_sm_store','role_store_manager', 'STORES', 'view'),
  ('rp_sm_bio',  'role_store_manager', 'BIOMETRIC_POLICY', 'view'),
  ('rp_sm_qr',   'role_store_manager', 'QR_SECURITY_POLICY', 'view'),
  ('rp_sm_brk',  'role_store_manager', 'BREAK_POLICIES', 'edit'),
  ('rp_sm_aud',  'role_store_manager', 'AUDIT_LOGS', 'none'),
  ('rp_hr_dash', 'role_hr_officer', 'DASHBOARD', 'view'),
  ('rp_hr_store','role_hr_officer', 'STORES', 'view'),
  ('rp_hr_brk',  'role_hr_officer', 'BREAK_POLICIES', 'edit'),
  ('rp_hr_usr',  'role_hr_officer', 'USERS', 'view'),
  ('rp_sec_dash', 'role_security', 'DASHBOARD', 'view'),
  ('rp_sec_store','role_security', 'STORES', 'view'),
  ('rp_sec_bio',  'role_security', 'BIOMETRIC_POLICY', 'edit'),
  ('rp_sec_qr',   'role_security', 'QR_SECURITY_POLICY', 'edit'),
  ('rp_sec_aud',  'role_security', 'AUDIT_LOGS', 'view'),
  ('rp_vw_dash', 'role_viewer', 'DASHBOARD', 'view'),
  ('rp_vw_store','role_viewer', 'STORES', 'view'),
  ('rp_vw_bio',  'role_viewer', 'BIOMETRIC_POLICY', 'view'),
  ('rp_vw_qr',   'role_viewer', 'QR_SECURITY_POLICY', 'view'),
  ('rp_vw_brk',  'role_viewer', 'BREAK_POLICIES', 'view'),
  ('rp_vw_usr',  'role_viewer', 'USERS', 'view'),
  ('rp_vw_role', 'role_viewer', 'ROLES_PERMISSIONS', 'view'),
  ('rp_vw_aud',  'role_viewer', 'AUDIT_LOGS', 'view');

-- Backfill: every existing SUPER_ADMIN account receives the SUPER_ADMIN role
INSERT OR IGNORE INTO "userrole" ("id", "userId", "roleId")
  SELECT 'ur_' || lower(hex(randomblob(12))), u."id", 'role_super_admin'
  FROM "user" u WHERE u."role" = 'SUPER_ADMIN';
