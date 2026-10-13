-- ===========================================================================
-- 014: RBAC MODULE-LEVEL ACCESS CONTROL
-- Adds role, rolepermission and userrole tables for module-level RBAC and
-- seeds the five default roles (SUPER_ADMIN, STORE_MANAGER, HR_OFFICER,
-- SECURITY_OFFICER, VIEWER). Idempotent — safe to run more than once.
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `role` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isSystem` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Role_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rolepermission` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `roleId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accessLevel` enum('none','view','edit') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  PRIMARY KEY (`id`),
  UNIQUE KEY `RolePermission_roleId_module_key` (`roleId`,`module`),
  CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `userrole` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `roleId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UserRole_userId_roleId_key` (`userId`,`roleId`),
  KEY `UserRole_roleId_idx` (`roleId`),
  CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Seed default roles (backend also auto-seeds if tables are empty; this keeps
-- the raw SQL path consistent with the application bootstrap).
-- Modules: DASHBOARD, STORES, BIOMETRIC_POLICY, QR_SECURITY_POLICY,
--          BREAK_POLICIES, USERS, ROLES_PERMISSIONS, AUDIT_LOGS
-- ---------------------------------------------------------------------------

INSERT IGNORE INTO `role` (`id`, `name`, `description`, `isSystem`) VALUES
  ('role_super_admin',   'SUPER_ADMIN',      'Full access to ALL modules (View + Edit), global scope', 1),
  ('role_store_manager', 'STORE_MANAGER',    'View + Edit on Break Policies; View-only on Biometric & QR', 0),
  ('role_hr_officer',    'HR_OFFICER',       'View + Edit on Break Policies and Users; No access to Biometric / QR', 0),
  ('role_security',      'SECURITY_OFFICER', 'View + Edit on Biometric & QR policies; No access to Break Policies', 0),
  ('role_viewer',        'VIEWER',           'View-only on ALL modules, no edit rights anywhere', 0);

-- SUPER_ADMIN: edit on everything
INSERT IGNORE INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`) VALUES
  ('rp_sa_dash', 'role_super_admin', 'DASHBOARD', 'edit'),
  ('rp_sa_store','role_super_admin', 'STORES', 'edit'),
  ('rp_sa_bio',  'role_super_admin', 'BIOMETRIC_POLICY', 'edit'),
  ('rp_sa_qr',   'role_super_admin', 'QR_SECURITY_POLICY', 'edit'),
  ('rp_sa_brk',  'role_super_admin', 'BREAK_POLICIES', 'edit'),
  ('rp_sa_usr',  'role_super_admin', 'USERS', 'edit'),
  ('rp_sa_role', 'role_super_admin', 'ROLES_PERMISSIONS', 'edit'),
  ('rp_sa_aud',  'role_super_admin', 'AUDIT_LOGS', 'edit');

-- STORE_MANAGER: break policies editable, biometric/QR view-only
INSERT IGNORE INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`) VALUES
  ('rp_sm_dash', 'role_store_manager', 'DASHBOARD', 'view'),
  ('rp_sm_store','role_store_manager', 'STORES', 'view'),
  ('rp_sm_bio',  'role_store_manager', 'BIOMETRIC_POLICY', 'view'),
  ('rp_sm_qr',   'role_store_manager', 'QR_SECURITY_POLICY', 'view'),
  ('rp_sm_brk',  'role_store_manager', 'BREAK_POLICIES', 'edit'),
  ('rp_sm_aud',  'role_store_manager', 'AUDIT_LOGS', 'none');

-- HR_OFFICER: break policies + users view
INSERT IGNORE INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`) VALUES
  ('rp_hr_dash', 'role_hr_officer', 'DASHBOARD', 'view'),
  ('rp_hr_store','role_hr_officer', 'STORES', 'view'),
  ('rp_hr_brk',  'role_hr_officer', 'BREAK_POLICIES', 'edit'),
  ('rp_hr_usr',  'role_hr_officer', 'USERS', 'view');

-- SECURITY_OFFICER: biometric + QR editable, audit view
INSERT IGNORE INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`) VALUES
  ('rp_sec_dash', 'role_security', 'DASHBOARD', 'view'),
  ('rp_sec_store','role_security', 'STORES', 'view'),
  ('rp_sec_bio',  'role_security', 'BIOMETRIC_POLICY', 'edit'),
  ('rp_sec_qr',   'role_security', 'QR_SECURITY_POLICY', 'edit'),
  ('rp_sec_aud',  'role_security', 'AUDIT_LOGS', 'view');

-- VIEWER: view on everything
INSERT IGNORE INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`) VALUES
  ('rp_vw_dash', 'role_viewer', 'DASHBOARD', 'view'),
  ('rp_vw_store','role_viewer', 'STORES', 'view'),
  ('rp_vw_bio',  'role_viewer', 'BIOMETRIC_POLICY', 'view'),
  ('rp_vw_qr',   'role_viewer', 'QR_SECURITY_POLICY', 'view'),
  ('rp_vw_brk',  'role_viewer', 'BREAK_POLICIES', 'view'),
  ('rp_vw_usr',  'role_viewer', 'USERS', 'view'),
  ('rp_vw_role', 'role_viewer', 'ROLES_PERMISSIONS', 'view'),
  ('rp_vw_aud',  'role_viewer', 'AUDIT_LOGS', 'view');

-- Backfill: every existing SUPER_ADMIN account receives the SUPER_ADMIN role
INSERT IGNORE INTO `userrole` (`id`, `userId`, `roleId`)
  SELECT CONCAT('ur_', LOWER(REPLACE(UUID(), '-', ''))), u.`id`, 'role_super_admin'
  FROM `user` u WHERE u.`role` = 'SUPER_ADMIN';

SET FOREIGN_KEY_CHECKS = 1;
