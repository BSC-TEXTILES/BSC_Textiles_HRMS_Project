-- ===========================================================================
-- 030: ACTION-LEVEL RBAC — MODULES, PERMISSIONS, DASHBOARD WIDGETS
--
-- The existing model (rolepermission.accessLevel = none|view|edit) cannot
-- express "HR may delete Employee Records but only view Payroll", so this
-- migration adds one boolean per action, plus a module registry and a
-- widget-visibility model.
--
-- Deliberately additive:
--   * `accessLevel` stays and is backfilled/derived, because
--     frontend/src/lib/rbac.ts, navigation.ts and the settings page all read
--     view/edit levels. Nothing that works today changes meaning.
--   * No table is dropped and no row is deleted.
--   * The legacy 15 module keys are kept alongside the new HR-domain modules
--     so existing navigation moduleKey references keep resolving.
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. Module registry (was a TypeScript constant duplicated in two places)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `module` (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `label` VARCHAR(120) NOT NULL,
  `description` VARCHAR(255) NULL,
  `area` ENUM('OVERVIEW','HR','FLOOR','EMPLOYEE','ADMIN','SYSTEM') NOT NULL DEFAULT 'SYSTEM',
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `idx_module_area_sort` (`area`, `sortOrder`),
  KEY `idx_module_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing keys referenced by navigation.ts / settings.ts — kept so those
-- moduleKey lookups never regress to 'none'.
INSERT INTO `module` (`key`, `label`, `description`, `area`, `sortOrder`) VALUES
  ('DASHBOARD',              'Dashboard',                  'Overview landing screens',                     'OVERVIEW', 10),
  ('STORES',                 'Stores & Locations',         'Showroom and hub administration',              'ADMIN',    20),
  ('USERS',                  'User Management',            'Create and manage user accounts',              'ADMIN',    30),
  ('SELLING_POINTS',         'Selling Points',             'Selling point registry',                       'ADMIN',    40),
  ('BILLING_TERMINALS',      'Billing Terminals',          'Counter and terminal management',              'ADMIN',    50),
  ('STATUTORY_MUSTER',       'Statutory Muster',           'Compliance muster reports',                    'HR',       60),
  ('ATTENDANCE_CORRECTIONS', 'Attendance Corrections',     'Punch correction approvals',                   'HR',       70),
  ('LATE_FINES',             'Late Fines',                 'Late-arrival fine management',                 'HR',       80),
  ('DOCUMENT_MANAGEMENT',    'Document Management',        'Employee documents and dossiers',              'HR',       90),
  ('SALARY_CADRES',          'Salary Cadres',              'Pay structures and grades',                    'HR',      100),
  ('BIOMETRIC_POLICY',       'Biometric Policy',           'Device and attendance policy',                 'SYSTEM',  110),
  ('QR_SECURITY_POLICY',     'QR Security Policy',         'QR and badge security',                        'SYSTEM',  120),
  ('BREAK_POLICIES',         'Break Policies',             'Lunch and tea break rules',                    'HR',      130),
  ('ROLES_PERMISSIONS',      'Role Management',            'Create, edit and delete roles',                'ADMIN',   140),
  ('AUDIT_LOGS',             'Audit Logs',                 'System audit trail',                           'ADMIN',   150),
  ('GENERAL_SETTINGS',       'General Settings',           'Application configuration',                    'ADMIN',   160)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `description` = VALUES(`description`),
                        `area` = VALUES(`area`), `sortOrder` = VALUES(`sortOrder`);

-- Spec modules: HR, Floor Manager, Employee and Admin surfaces.
INSERT INTO `module` (`key`, `label`, `description`, `area`, `sortOrder`) VALUES
  ('EMPLOYEE_RECORDS',   'Employee Records',        'Employee master data',                       'HR',       200),
  ('RECRUITMENT',        'Recruitment',             'Requisitions, candidates, hiring',           'HR',       210),
  ('ATTENDANCE',         'Attendance',              'Attendance across the workforce',            'HR',       220),
  ('LEAVE_MANAGEMENT',   'Leave Management',        'Leave types, balances, records',             'HR',       230),
  ('PAYROLL',            'Payroll',                 'Payroll runs and payslips',                  'HR',       240),
  ('PERFORMANCE_REVIEWS','Performance Reviews',     'Appraisals and reviews',                     'HR',       250),
  ('DOCUMENTS',          'Documents',               'HR document repository',                     'HR',       260),
  ('HR_REPORTS',         'HR Reports',              'Workforce and HR reporting',                 'HR',       270),
  ('TEAM_ATTENDANCE',    'Team Attendance',         'Own-team attendance',                        'FLOOR',    300),
  ('SHIFT_SCHEDULING',   'Shift Scheduling',        'Rosters and shift assignment',               'FLOOR',    310),
  ('TASK_ASSIGNMENT',    'Task Assignment',         'Floor task allocation',                      'FLOOR',    320),
  ('FLOOR_REPORTS',      'Production/Floor Reports','Floor and production reporting',             'FLOOR',    330),
  ('LEAVE_APPROVAL',     'Leave Approval (own team)','Leave approvals for own team',              'FLOOR',    340),
  ('INVENTORY_VIEW',     'Inventory View',          'Read-only inventory',                        'FLOOR',    350),
  ('MY_PROFILE',         'My Profile',              'Own profile',                                'EMPLOYEE', 400),
  ('MY_ATTENDANCE',      'My Attendance',           'Own attendance',                             'EMPLOYEE', 410),
  ('APPLY_LEAVE',        'Apply Leave',             'Own leave requests',                         'EMPLOYEE', 420),
  ('MY_PAYSLIPS',        'My Payslips',             'Own payslips',                               'EMPLOYEE', 430),
  ('MY_TASKS',           'My Tasks',                'Assigned tasks',                             'EMPLOYEE', 440),
  ('ANNOUNCEMENTS',      'Announcements',           'Company announcements',                      'EMPLOYEE', 450),
  ('MODULE_ACCESS',      'Module Access',           'Grant modules and actions to roles',         'ADMIN',    500),
  ('SETTINGS',           'Settings',                'Application settings',                       'ADMIN',    510)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `description` = VALUES(`description`),
                        `area` = VALUES(`area`), `sortOrder` = VALUES(`sortOrder`);

-- ---------------------------------------------------------------------------
-- 2. role: lifecycle status, so "active/inactive roles" is a real concept
-- ---------------------------------------------------------------------------
ALTER TABLE `role` ADD COLUMN `isActive` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `role` ADD COLUMN `createdById` VARCHAR(191) NULL;
ALTER TABLE `role` ADD COLUMN `updatedById` VARCHAR(191) NULL;
ALTER TABLE `role` ADD KEY `idx_role_active` (`isActive`);

-- ---------------------------------------------------------------------------
-- 3. rolepermission: one boolean per action + a master enable flag
-- ---------------------------------------------------------------------------
ALTER TABLE `rolepermission` ADD COLUMN `enabled` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `rolepermission` ADD COLUMN `can_view` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `rolepermission` ADD COLUMN `can_create` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `rolepermission` ADD COLUMN `can_edit` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `rolepermission` ADD COLUMN `can_update` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `rolepermission` ADD COLUMN `can_delete` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `rolepermission` ADD COLUMN `can_export` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `rolepermission` ADD COLUMN `can_approve` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `rolepermission` ADD KEY `idx_rolepermission_module` (`module`);

-- Backfill the booleans from the existing accessLevel so no current grant is
-- lost: view => can_view; edit => the write set that "edit" always implied.
UPDATE `rolepermission` SET
  `can_view`    = IF(`accessLevel` IN ('view','edit'), 1, 0),
  `can_create`  = IF(`accessLevel` = 'edit', 1, 0),
  `can_edit`    = IF(`accessLevel` = 'edit', 1, 0),
  `can_update`  = IF(`accessLevel` = 'edit', 1, 0),
  `can_delete`  = IF(`accessLevel` = 'edit', 1, 0),
  `can_export`  = IF(`accessLevel` = 'edit', 1, 0),
  `can_approve` = IF(`accessLevel` = 'edit', 1, 0),
  `enabled`     = IF(`accessLevel` = 'none', 0, 1);

-- ---------------------------------------------------------------------------
-- 4. Dashboard widgets and per-role visibility
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dashboard_widget` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `key` VARCHAR(96) NOT NULL,
  `label` VARCHAR(140) NOT NULL,
  `description` VARCHAR(255) NULL,
  `moduleKey` VARCHAR(64) NULL,
  `area` ENUM('OVERVIEW','HR','FLOOR','EMPLOYEE','ADMIN') NOT NULL DEFAULT 'OVERVIEW',
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_dashboard_widget_key` (`key`),
  KEY `idx_dashboard_widget_area` (`area`, `sortOrder`),
  CONSTRAINT `fk_widget_module` FOREIGN KEY (`moduleKey`) REFERENCES `module` (`key`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_widget` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `roleId` VARCHAR(191) NOT NULL,
  `widgetId` VARCHAR(191) NOT NULL,
  `visible` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_role_widget` (`roleId`, `widgetId`),
  KEY `idx_role_widget_role` (`roleId`),
  CONSTRAINT `fk_role_widget_role` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_role_widget_widget` FOREIGN KEY (`widgetId`) REFERENCES `dashboard_widget` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `dashboard_widget` (`id`, `key`, `label`, `description`, `moduleKey`, `area`, `sortOrder`) VALUES
  ('dw_total_employees',   'TOTAL_EMPLOYEES',    'Total Employees',      'Headline workforce count',        'EMPLOYEE_RECORDS',   'OVERVIEW', 10),
  ('dw_present_today',     'PRESENT_TODAY',      'Present Today',        'Attendance for the current day',  'ATTENDANCE',         'OVERVIEW', 20),
  ('dw_on_leave',          'ON_LEAVE',           'On Leave',             'Active leave today',              'LEAVE_MANAGEMENT',   'OVERVIEW', 30),
  ('dw_pending_approvals', 'PENDING_APPROVALS',  'Pending Approvals',    'Approvals awaiting action',       'LEAVE_APPROVAL',     'FLOOR',    40),
  ('dw_late_fines',        'LATE_FINES',         'Late Fines',           'Fines raised this period',        'LATE_FINES',         'HR',       50),
  ('dw_payroll_run',       'PAYROLL_RUN',        'Payroll Status',       'Current payroll run state',       'PAYROLL',            'HR',       60),
  ('dw_open_roles',        'OPEN_ROLES',         'Open Recruitment',     'Requisitions in flight',          'RECRUITMENT',        'HR',       70),
  ('dw_my_attendance',     'MY_ATTENDANCE',      'My Attendance',        'Own attendance summary',          'MY_ATTENDANCE',      'EMPLOYEE', 80),
  ('dw_my_leave',          'MY_LEAVE',           'My Leave Balance',     'Own leave balances',              'APPLY_LEAVE',        'EMPLOYEE', 90),
  ('dw_my_tasks',          'MY_TASKS',           'My Tasks',             'Tasks assigned to me',            'MY_TASKS',           'EMPLOYEE', 100),
  ('dw_my_payslips',       'MY_PAYSLIPS',        'My Latest Payslip',    'Most recent payslip',             'MY_PAYSLIPS',        'EMPLOYEE', 110),
  ('dw_announcements',     'ANNOUNCEMENTS',      'Announcements',        'Latest company announcements',    'ANNOUNCEMENTS',      'EMPLOYEE', 120),
  ('dw_floor_output',      'FLOOR_OUTPUT',       'Floor Output',         'Production output for the floor', 'FLOOR_REPORTS',      'FLOOR',    130),
  ('dw_team_roster',       'TEAM_ROSTER',        'Team Roster',          'Own team on shift',               'SHIFT_SCHEDULING',   'FLOOR',    140),
  ('dw_role_admin',        'ROLE_ADMIN',         'Role Administration',  'Role lifecycle metrics',          'ROLES_PERMISSIONS',  'ADMIN',    150),
  ('dw_module_admin',      'MODULE_ADMIN',       'Module Access Matrix', 'Permission assignment surface',   'MODULE_ACCESS',      'ADMIN',    160),
  ('dw_audit_stream',      'AUDIT_STREAM',       'Recent Audit Activity','Latest audit entries',            'AUDIT_LOGS',         'ADMIN',    170)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `description` = VALUES(`description`),
                        `moduleKey` = VALUES(`moduleKey`), `area` = VALUES(`area`), `sortOrder` = VALUES(`sortOrder`);

-- ---------------------------------------------------------------------------
-- 5. Default roles. Existing rows (STORE_MANAGER, HR_OFFICER, ...) are left
--    untouched; the four spec roles plus SUPER_ADMIN are ensured.
-- ---------------------------------------------------------------------------
INSERT INTO `role` (`id`, `name`, `description`, `isSystem`, `isActive`) VALUES
  ('role_super_admin',   'SUPER_ADMIN',   'Creates, edits, deactivates and deletes roles only',                    1, 1),
  ('role_admin',         'ADMIN',         'Assigns module access to roles only',                                   1, 1),
  ('role_hr',            'HR',            'Full workforce administration',                                         1, 1),
  ('role_floor_manager', 'FLOOR_MANAGER', 'Own-team floor supervision, scheduling and approvals',                  1, 1),
  ('role_employee',      'EMPLOYEE',      'Self-service: profile, attendance, leave, payslips, tasks',             1, 1)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`), `isSystem` = VALUES(`isSystem`);

-- SUPER_ADMIN: full access to everything (kept all-edit by design).
INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`)
SELECT CONCAT('rp_super_admin_', m.`key`), 'role_super_admin', m.`key`, 'edit', 1, 1, 1, 1, 1, 1, 1, 1
  FROM `module` m
ON DUPLICATE KEY UPDATE `accessLevel` = 'edit', `enabled` = 1, `can_view` = 1, `can_create` = 1,
                        `can_edit` = 1, `can_update` = 1, `can_delete` = 1, `can_export` = 1, `can_approve` = 1;

-- ADMIN: user management, module access, reports, settings, audit logs.
INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`) VALUES
  ('rp_admin_dashboard',    'role_admin', 'DASHBOARD',         'edit', 1, 1, 1, 1, 1, 0, 1, 1),
  ('rp_admin_users',        'role_admin', 'USERS',             'edit', 1, 1, 1, 1, 1, 1, 1, 1),
  ('rp_admin_module_access','role_admin', 'MODULE_ACCESS',     'edit', 1, 1, 0, 1, 1, 0, 1, 1),
  ('rp_admin_reports',      'role_admin', 'HR_REPORTS',        'edit', 1, 1, 0, 1, 1, 0, 1, 1),
  ('rp_admin_settings',     'role_admin', 'SETTINGS',          'edit', 1, 1, 1, 1, 1, 0, 1, 1),
  ('rp_admin_general',      'role_admin', 'GENERAL_SETTINGS',  'edit', 1, 1, 1, 1, 1, 0, 1, 1),
  ('rp_admin_audit',        'role_admin', 'AUDIT_LOGS',        'view', 1, 1, 0, 0, 0, 0, 1, 0),
  ('rp_admin_role_view',    'role_admin', 'ROLES_PERMISSIONS', 'view', 1, 1, 0, 0, 0, 0, 1, 0)
ON DUPLICATE KEY UPDATE `accessLevel` = VALUES(`accessLevel`), `enabled` = VALUES(`enabled`),
  `can_view` = VALUES(`can_view`), `can_create` = VALUES(`can_create`), `can_edit` = VALUES(`can_edit`),
  `can_update` = VALUES(`can_update`), `can_delete` = VALUES(`can_delete`), `can_export` = VALUES(`can_export`),
  `can_approve` = VALUES(`can_approve`);

-- HR: full View/Create/Edit/Delete on its eight modules (spec section 5).
INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`)
SELECT CONCAT('rp_hr_', x.`key`), 'role_hr', x.`key`, 'edit', 1, 1, 1, 1, 1, 1, 1, 1 FROM (
  SELECT 'DASHBOARD' AS `key` UNION ALL SELECT 'EMPLOYEE_RECORDS' UNION ALL SELECT 'RECRUITMENT'
  UNION ALL SELECT 'ATTENDANCE' UNION ALL SELECT 'LEAVE_MANAGEMENT' UNION ALL SELECT 'PAYROLL'
  UNION ALL SELECT 'PERFORMANCE_REVIEWS' UNION ALL SELECT 'DOCUMENTS' UNION ALL SELECT 'DOCUMENT_MANAGEMENT'
  UNION ALL SELECT 'HR_REPORTS' UNION ALL SELECT 'STATUTORY_MUSTER' UNION ALL SELECT 'SALARY_CADRES'
  UNION ALL SELECT 'ATTENDANCE_CORRECTIONS' UNION ALL SELECT 'LATE_FINES' UNION ALL SELECT 'BREAK_POLICIES'
) x
ON DUPLICATE KEY UPDATE `accessLevel` = VALUES(`accessLevel`), `enabled` = VALUES(`enabled`),
  `can_view` = VALUES(`can_view`), `can_create` = VALUES(`can_create`), `can_edit` = VALUES(`can_edit`),
  `can_update` = VALUES(`can_update`), `can_delete` = VALUES(`can_delete`), `can_export` = VALUES(`can_export`),
  `can_approve` = VALUES(`can_approve`);

-- Floor Manager: View/Create/Edit everywhere; Delete only on tasks and shifts.
INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`) VALUES
  ('rp_fm_dashboard',    'role_floor_manager', 'DASHBOARD',        'edit', 1, 1, 0, 1, 1, 0, 1, 1),
  ('rp_fm_team_att',     'role_floor_manager', 'TEAM_ATTENDANCE',  'edit', 1, 1, 1, 1, 1, 0, 1, 1),
  ('rp_fm_attendance',   'role_floor_manager', 'ATTENDANCE',       'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp_fm_shift',        'role_floor_manager', 'SHIFT_SCHEDULING', 'edit', 1, 1, 1, 1, 1, 1, 1, 1),
  ('rp_fm_tasks',        'role_floor_manager', 'TASK_ASSIGNMENT',  'edit', 1, 1, 1, 1, 1, 1, 1, 1),
  ('rp_fm_reports',      'role_floor_manager', 'FLOOR_REPORTS',    'edit', 1, 1, 1, 1, 1, 0, 1, 0),
  ('rp_fm_leave_app',    'role_floor_manager', 'LEAVE_APPROVAL',   'edit', 1, 1, 0, 1, 1, 0, 1, 1),
  ('rp_fm_inventory',    'role_floor_manager', 'INVENTORY_VIEW',   'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp_fm_employees',    'role_floor_manager', 'EMPLOYEE_RECORDS', 'view', 1, 1, 0, 0, 0, 0, 1, 0)
ON DUPLICATE KEY UPDATE `accessLevel` = VALUES(`accessLevel`), `enabled` = VALUES(`enabled`),
  `can_view` = VALUES(`can_view`), `can_create` = VALUES(`can_create`), `can_edit` = VALUES(`can_edit`),
  `can_update` = VALUES(`can_update`), `can_delete` = VALUES(`can_delete`), `can_export` = VALUES(`can_export`),
  `can_approve` = VALUES(`can_approve`);

-- Employee: view-only, plus Create on Apply Leave and Edit on My Profile.
INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`) VALUES
  ('rp_emp_dashboard',   'role_employee', 'DASHBOARD',     'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp_emp_profile',     'role_employee', 'MY_PROFILE',    'edit', 1, 1, 0, 1, 1, 0, 0, 0),
  ('rp_emp_attendance',  'role_employee', 'MY_ATTENDANCE', 'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp_emp_apply_leave', 'role_employee', 'APPLY_LEAVE',   'edit', 1, 1, 1, 0, 0, 0, 0, 0),
  ('rp_emp_leave_mgmt',  'role_employee', 'LEAVE_MANAGEMENT', 'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp_emp_payslips',    'role_employee', 'MY_PAYSLIPS',   'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp_emp_tasks',       'role_employee', 'MY_TASKS',      'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp_emp_announce',    'role_employee', 'ANNOUNCEMENTS', 'view', 1, 1, 0, 0, 0, 0, 0, 0)
ON DUPLICATE KEY UPDATE `accessLevel` = VALUES(`accessLevel`), `enabled` = VALUES(`enabled`),
  `can_view` = VALUES(`can_view`), `can_create` = VALUES(`can_create`), `can_edit` = VALUES(`can_edit`),
  `can_update` = VALUES(`can_update`), `can_delete` = VALUES(`can_delete`), `can_export` = VALUES(`can_export`),
  `can_approve` = VALUES(`can_approve`);

-- Keep accessLevel consistent with the new booleans for every row, so the
-- view/edit ladder the existing UI reads cannot disagree with the actions.
UPDATE `rolepermission` SET `accessLevel` = CASE
    WHEN `enabled` = 0 OR `can_view` = 0 THEN 'none'
    WHEN `can_create` = 1 OR `can_edit` = 1 OR `can_update` = 1 OR `can_delete` = 1
         OR `can_export` = 1 OR `can_approve` = 1 THEN 'edit'
    ELSE 'view'
  END;

-- ---------------------------------------------------------------------------
-- 6. Default widget visibility per role
-- ---------------------------------------------------------------------------
INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`)
SELECT CONCAT('rw_hr_', w.`id`), 'role_hr', w.`id`, 1 FROM `dashboard_widget` w
 WHERE w.`area` IN ('OVERVIEW','HR')
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);

INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`)
SELECT CONCAT('rw_fm_', w.`id`), 'role_floor_manager', w.`id`, 1 FROM `dashboard_widget` w
 WHERE w.`area` IN ('OVERVIEW','FLOOR')
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);

INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`)
SELECT CONCAT('rw_emp_', w.`id`), 'role_employee', w.`id`, 1 FROM `dashboard_widget` w
 WHERE w.`area` IN ('OVERVIEW','EMPLOYEE')
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);

INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`)
SELECT CONCAT('rw_admin_', w.`id`), 'role_admin', w.`id`, 1 FROM `dashboard_widget` w
 WHERE w.`area` IN ('OVERVIEW','ADMIN')
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);

INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`)
SELECT CONCAT('rw_sa_', w.`id`), 'role_super_admin', w.`id`, 1 FROM `dashboard_widget` w
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);

SET FOREIGN_KEY_CHECKS = 1;
