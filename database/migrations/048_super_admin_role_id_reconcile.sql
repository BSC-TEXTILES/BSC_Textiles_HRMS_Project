-- ===========================================================================
-- 048: Reconcile SUPER_ADMIN role ID to 'role_super_admin'
-- ===========================================================================
SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM `rolepermission` WHERE `roleId` = 'role_mv6n82o1nwxz6oj2';
DELETE FROM `userrole` WHERE `roleId` = 'role_mv6n82o1nwxz6oj2';
DELETE FROM `role_widget` WHERE `roleId` = 'role_mv6n82o1nwxz6oj2';
DELETE FROM `role` WHERE `id` = 'role_mv6n82o1nwxz6oj2';

INSERT INTO `role` (`id`, `name`, `description`, `isSystem`, `isActive`)
VALUES ('role_super_admin', 'SUPER_ADMIN', 'Creates, edits, deactivates and deletes roles only', 1, 1)
ON DUPLICATE KEY UPDATE `name` = 'SUPER_ADMIN', `description` = VALUES(`description`), `isSystem` = 1, `isActive` = 1;

SET FOREIGN_KEY_CHECKS = 1;
