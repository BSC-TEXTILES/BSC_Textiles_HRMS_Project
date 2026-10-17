-- ===========================================================================
-- 035: CREDENTIAL AND SECURITY-OPERATIONS MODULES
--
-- Requirement 1 inverts the usual privilege order: creating and resetting
-- credentials belongs to the Admin, and the Super Admin — who owns roles —
-- must NOT be able to do it. That cannot be expressed as "the Super Admin has
-- every grant", so credential management becomes an explicitly named module
-- that is granted to ADMIN and deliberately withheld from every other role.
--
-- Additive only.
-- ===========================================================================

INSERT INTO `module` (`key`, `label`, `description`, `area`, `sortOrder`) VALUES
  ('USER_CREDENTIALS',   'User Credentials',      'Create login IDs, reset passwords, unlock accounts', 'ADMIN', 520),
  ('SECURITY_MONITORING','Security Operations',   'Login protection, sessions, IP rules, alerts',       'ADMIN', 530),
  ('PRIVACY_REQUESTS',   'Privacy & Data Requests','Consent, data export and erasure requests',         'ADMIN', 540)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `description` = VALUES(`description`),
                        `area` = VALUES(`area`), `sortOrder` = VALUES(`sortOrder`);

-- Admin runs credentials and security operations.
INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`) VALUES
  ('rp35_admin_credentials', 'role_admin', 'USER_CREDENTIALS',    'edit', 1, 1, 1, 1, 1, 1, 1, 1),
  ('rp35_admin_security',    'role_admin', 'SECURITY_MONITORING', 'edit', 1, 1, 0, 1, 1, 0, 1, 1),
  ('rp35_admin_privacy',     'role_admin', 'PRIVACY_REQUESTS',    'edit', 1, 1, 1, 1, 1, 0, 1, 1)
ON DUPLICATE KEY UPDATE `accessLevel` = VALUES(`accessLevel`), `enabled` = VALUES(`enabled`),
  `can_view` = VALUES(`can_view`), `can_create` = VALUES(`can_create`), `can_edit` = VALUES(`can_edit`),
  `can_update` = VALUES(`can_update`), `can_delete` = VALUES(`can_delete`), `can_export` = VALUES(`can_export`),
  `can_approve` = VALUES(`can_approve`);

-- HR may see account status for the people it is onboarding, and nothing else:
-- no create, no reset, no bulk export. `accessLevel` has to stay in step with
-- the action booleans, because the engine derives the ladder from them
-- (rbacAdmin.deriveAccessLevel) and the consistency test fails the moment a
-- seed row says 'view' while granting an action that implies 'edit'.
INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`) VALUES
  ('rp35_hr_credentials', 'role_hr', 'USER_CREDENTIALS', 'view', 1, 1, 0, 0, 0, 0, 0, 0)
ON DUPLICATE KEY UPDATE `accessLevel` = VALUES(`accessLevel`), `enabled` = VALUES(`enabled`),
  `can_view` = VALUES(`can_view`), `can_create` = VALUES(`can_create`),
  `can_edit` = VALUES(`can_edit`), `can_update` = VALUES(`can_update`),
  `can_delete` = VALUES(`can_delete`), `can_export` = VALUES(`can_export`),
  `can_approve` = VALUES(`can_approve`);

-- The dashboard cards for the new surfaces.
INSERT INTO `dashboard_widget` (`id`, `key`, `label`, `description`, `moduleKey`, `area`, `sortOrder`) VALUES
  ('dw_security_posture',  'SECURITY_POSTURE',   'Security Posture',        'Lockouts, failed logins and blocked IPs', 'SECURITY_MONITORING','ADMIN', 180),
  ('dw_credential_admin',  'CREDENTIAL_ADMIN',   'Credential Management',   'Accounts awaiting credentials or reset',  'USER_CREDENTIALS',   'ADMIN', 190),
  ('dw_privacy_requests',  'PRIVACY_REQUESTS',   'Privacy Requests',        'Open data export and erasure requests',   'PRIVACY_REQUESTS',   'ADMIN', 200)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `description` = VALUES(`description`),
                        `moduleKey` = VALUES(`moduleKey`), `area` = VALUES(`area`), `sortOrder` = VALUES(`sortOrder`);

INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`) VALUES
  ('rw35_admin_posture',    'role_admin', 'dw_security_posture', 1),
  ('rw35_admin_creds',      'role_admin', 'dw_credential_admin', 1),
  ('rw35_admin_privacy',    'role_admin', 'dw_privacy_requests', 1),
  ('rw35_hr_creds',         'role_hr',    'dw_credential_admin', 1)
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);
