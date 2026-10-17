-- ===========================================================================
-- 039: reconcile rolepermission.accessLevel with the action booleans
-- ===========================================================================
-- The action-level engine (backend/src/services/accessControl.ts) reads the
-- can_* columns; `accessLevel` is the legacy ladder kept so the old
-- /roles/rbac writes stay interpretable. When the two disagree, the stored
-- ladder is the lie — and any consumer still reading it grants more than the
-- matrix intends.
--
-- Migration 035 seeded HR on USER_CREDENTIALS as accessLevel='view' with
-- can_export=1. Export is an action that implies 'edit' to
-- rbacAdmin.deriveAccessLevel(), so HR was quietly a 'edit' role on the
-- credential screen for the legacy reader while the action reader said
-- view+export.
--
-- Two changes, both additive:
--   1. HR's credential export is withdrawn — bulk-exporting the list of login
--      IDs and account statuses belongs to Admin alone.
--   2. Every remaining row's accessLevel is recomputed from its own booleans,
--      so the ladder can never disagree with the matrix again.
-- This does not grant anything to anyone; it only removes and re-labels.
-- ===========================================================================

UPDATE `rolepermission`
   SET `can_export` = 0
 WHERE `roleId` = 'role_hr'
   AND `module` = 'USER_CREDENTIALS';

UPDATE `rolepermission`
   SET `accessLevel` = CASE
     WHEN `enabled` = 0 OR `can_view` = 0 THEN 'none'
     WHEN (`can_create` + `can_edit` + `can_update` + `can_delete`
           + `can_export` + `can_approve`) > 0 THEN 'edit'
     ELSE 'view'
   END
 WHERE `accessLevel` <> CASE
     WHEN `enabled` = 0 OR `can_view` = 0 THEN 'none'
     WHEN (`can_create` + `can_edit` + `can_update` + `can_delete`
           + `can_export` + `can_approve`) > 0 THEN 'edit'
     ELSE 'view'
   END;
