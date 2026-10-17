-- ===========================================================================
-- 040: allow the privileged-network-blocked security event
-- ===========================================================================
-- `security_event.type` is a MySQL ENUM, so a value the code can emit but the
-- column does not list fails the insert at runtime — invisible to TypeScript and
-- to every test that does not actually raise the event.
--
-- The login path now raises PRIVILEGED_LOGIN_BLOCKED when an Admin or Super
-- Admin authenticates correctly from a network outside the privileged allowlist
-- (SECURITY.md §10, "optional IP allowlist for privileged logins").
--
-- Additive: appending a member to an ENUM rewrites the column but keeps every
-- existing value and row intact. Nothing is dropped, renamed or truncated.
-- ===========================================================================

ALTER TABLE `security_event`
  MODIFY COLUMN `type` enum(
    'BRUTE_FORCE',
    'PASSWORD_SPRAY',
    'IMPOSSIBLE_TRAVEL',
    'NEW_DEVICE',
    'NEW_LOCATION',
    'PRIVILEGE_ESCALATION',
    'MASS_EXPORT',
    'MALWARE_DETECTED',
    'AUDIT_LOG_GAP',
    'CONFIG_CHANGE',
    'ACCOUNT_TAKEOVER_ATTEMPT',
    'SESSION_HIJACK_ATTEMPT',
    'PRIVILEGED_LOGIN_BLOCKED'
  ) COLLATE utf8mb4_unicode_ci NOT NULL;
