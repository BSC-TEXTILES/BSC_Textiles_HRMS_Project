-- ===========================================================================
-- 032: SELF-SERVICE GRANTS FOR THE STAFF ROLES
--
-- The sidebar can only hide a module it can name. Once nav items start
-- carrying real module keys, a manager with no MY_PROFILE / MY_ATTENDANCE row
-- would lose their own profile and attendance — so every workforce role gets
-- the self-service set. A person's rank does not stop them being an employee.
--
-- Also gives HR the approval surfaces it already operates (leave approvals,
-- its own team's attendance, shift scheduling), which the spec's eight-module
-- list did not name.
--
-- Additive only: inserts or updates grants, deletes nothing.
-- ===========================================================================

INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`) VALUES
  ('rp32_hr_my_profile',      'role_hr',            'MY_PROFILE',     'edit', 1, 1, 0, 1, 1, 0, 0, 0),
  ('rp32_hr_my_attendance',   'role_hr',            'MY_ATTENDANCE',  'edit', 1, 1, 0, 1, 1, 0, 1, 0),
  ('rp32_hr_apply_leave',     'role_hr',            'APPLY_LEAVE',    'edit', 1, 1, 1, 0, 0, 0, 0, 0),
  ('rp32_hr_my_payslips',     'role_hr',            'MY_PAYSLIPS',    'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp32_hr_my_tasks',        'role_hr',            'MY_TASKS',       'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp32_hr_announcements',   'role_hr',            'ANNOUNCEMENTS',  'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp32_hr_leave_approval',  'role_hr',            'LEAVE_APPROVAL', 'edit', 1, 1, 0, 1, 1, 0, 1, 1),
  ('rp32_hr_team_attendance', 'role_hr',            'TEAM_ATTENDANCE','edit', 1, 1, 1, 1, 1, 0, 1, 1),
  ('rp32_hr_shift',           'role_hr',            'SHIFT_SCHEDULING','edit', 1, 1, 1, 1, 1, 1, 1, 1),
  ('rp32_fm_my_profile',      'role_floor_manager',  'MY_PROFILE',     'edit', 1, 1, 0, 1, 1, 0, 0, 0),
  ('rp32_fm_my_attendance',   'role_floor_manager',  'MY_ATTENDANCE',  'edit', 1, 1, 0, 1, 1, 0, 1, 0),
  ('rp32_fm_apply_leave',     'role_floor_manager',  'APPLY_LEAVE',    'edit', 1, 1, 1, 0, 0, 0, 0, 0),
  ('rp32_fm_my_payslips',     'role_floor_manager',  'MY_PAYSLIPS',    'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp32_fm_my_tasks',        'role_floor_manager',  'MY_TASKS',       'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp32_fm_announcements',   'role_floor_manager',  'ANNOUNCEMENTS',  'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp32_fm_leave_mgmt',      'role_floor_manager',  'LEAVE_MANAGEMENT','view', 1, 1, 0, 0, 0, 0, 1, 0),
  ('rp32_ad_my_profile',      'role_admin',          'MY_PROFILE',     'edit', 1, 1, 0, 1, 1, 0, 0, 0),
  ('rp32_ad_my_attendance',   'role_admin',          'MY_ATTENDANCE',  'edit', 1, 1, 0, 1, 1, 0, 1, 0),
  ('rp32_ad_apply_leave',     'role_admin',          'APPLY_LEAVE',    'edit', 1, 1, 1, 0, 0, 0, 0, 0),
  ('rp32_ad_my_payslips',     'role_admin',          'MY_PAYSLIPS',    'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp32_ad_my_tasks',        'role_admin',          'MY_TASKS',       'view', 1, 1, 0, 0, 0, 0, 0, 0),
  ('rp32_ad_announcements',   'role_admin',          'ANNOUNCEMENTS',  'view', 1, 1, 0, 0, 0, 0, 0, 0)
ON DUPLICATE KEY UPDATE `accessLevel` = VALUES(`accessLevel`), `enabled` = VALUES(`enabled`),
  `can_view` = VALUES(`can_view`), `can_create` = VALUES(`can_create`), `can_edit` = VALUES(`can_edit`),
  `can_update` = VALUES(`can_update`), `can_delete` = VALUES(`can_delete`), `can_export` = VALUES(`can_export`),
  `can_approve` = VALUES(`can_approve`);

-- Keep the legacy ladder in step with the booleans, as 030 did.
UPDATE `rolepermission` SET `accessLevel` = CASE
    WHEN `enabled` = 0 OR `can_view` = 0 THEN 'none'
    WHEN `can_create` = 1 OR `can_edit` = 1 OR `can_update` = 1 OR `can_delete` = 1
         OR `can_export` = 1 OR `can_approve` = 1 THEN 'edit'
    ELSE 'view'
  END;

-- The self-service cards belong on the manager dashboards too.
INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`) VALUES
  ('rw32_hr_my_attendance', 'role_hr',            'dw_my_attendance', 1),
  ('rw32_hr_my_leave',      'role_hr',            'dw_my_leave',      1),
  ('rw32_hr_announcements', 'role_hr',            'dw_announcements', 1),
  ('rw32_fm_my_attendance', 'role_floor_manager',  'dw_my_attendance', 1),
  ('rw32_fm_my_leave',      'role_floor_manager',  'dw_my_leave',      1),
  ('rw32_fm_announcements', 'role_floor_manager',  'dw_announcements', 1),
  ('rw32_ad_my_attendance', 'role_admin',          'dw_my_attendance', 1),
  ('rw32_ad_my_leave',      'role_admin',          'dw_my_leave',      1),
  ('rw32_ad_announcements', 'role_admin',          'dw_announcements', 1)
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);
