-- ===========================================================================
-- 041: workforce_event — the Live Activities journal
-- ===========================================================================
-- The dashboard's Live Activities feed needs one queryable, indexable, retained
-- stream across every workforce domain (punches, misses, mismatches, late
-- arrivals and fines, early departures, assignments, overtime, leave, shift
-- changes, manual corrections). Those rows live in nine different tables with
-- nine different shapes; a feed that UNIONs them on every request cannot be
-- paginated, indexed or searched over past days, and cannot carry the HR
-- decision state (`status`, `updatedById`) the detail drawer writes back.
--
-- Deliberate design choices, and why:
--
--  * This is a JOURNAL, not a second source of truth. The counters on the
--    section are computed from the domain tables through the same shared helper
--    that /api/reports/dashboard-summary uses, so the feed can never disagree
--    with the rest of the dashboard. `workforce_event` answers "what happened,
--    in order, on which day" and holds HR decisions; attendance stays
--    authoritative for attendance.
--  * `dedupeKey` is UNIQUE and derived deterministically from the domain row
--    (e.g. `punch:12345`, `late:ATT-987`). Re-ingest is an UPSERT, so a socket
--    reconnect, a retried webhook or a backfill run cannot create duplicate
--    events — which is exactly what the current client-side feed does wrong.
--  * `businessDate` is stored separately from `occurredAt` because a night
--    shift's punches cross midnight; grouping by the IST calendar date must not
--    depend on the server's timezone or on MySQL's session tz.
--  * `payload` is a JSON snapshot of what was known at detection time. It is
--    for display and forensics; every filterable field is a real column.
--  * Additive only: no drops, no truncates, no rewrites of existing tables.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS `workforce_event` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,

  -- Deterministic, unique per underlying occurrence. The upsert key.
  `dedupeKey` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,

  -- punch_in | punch_out | missed_in | missed_out | mismatch | late_arrival
  -- early_departure | assignment | overtime_start | overtime_end | leave
  -- absence | shift_change | correction | geo_rejected | device_unmapped
  `type` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,

  -- Coarse grouping for the feed's badge/colour and the summary tiles.
  `category` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ATTENDANCE',

  -- pending | approved | rejected | waived | applied | resolved | ignored
  `status` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',

  `severity` enum('INFO','LOW','MEDIUM','HIGH','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INFO',

  -- One-line human summary rendered in the feed. Built server-side so every
  -- client (web, export, notification) says the same thing.
  `summary` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,

  -- The person the event is about. Nullable: a device-level event (unknown
  -- user on a terminal) has no employee yet.
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeCode` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeName` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shiftId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  -- When it actually happened (instant) and the IST day it belongs to.
  `occurredAt` datetime(3) NOT NULL,
  `businessDate` date NOT NULL,

  -- The domain row this event mirrors, so the drawer can deep-link and so a
  -- reconciliation job can prove the journal matches the source.
  `sourceTable` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sourceId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  `payload` json DEFAULT NULL,

  -- Where the client should go for the full record.
  `actionUrl` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,

  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updatedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decisionNote` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decidedAt` datetime(3) DEFAULT NULL,

  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_workforce_event_dedupe` (`dedupeKey`),
  -- Feed query: a day's events, newest first.
  KEY `ix_workforce_event_date_occurred` (`businessDate`, `occurredAt`),
  -- Per-employee history ("all details for this person on this day").
  KEY `ix_workforce_event_employee_date` (`employeeId`, `businessDate`),
  -- Department filter and per-department counters.
  KEY `ix_workforce_event_department_date` (`departmentId`, `businessDate`),
  -- Event-type filter.
  KEY `ix_workforce_event_type_date` (`type`, `businessDate`),
  -- Location scoping is enforced on every read; index it rather than filter it.
  KEY `ix_workforce_event_location_date` (`locationId`, `businessDate`),
  -- HR work queue: open items only.
  KEY `ix_workforce_event_status` (`status`, `businessDate`),
  CONSTRAINT `fk_workforce_event_employee` FOREIGN KEY (`employeeId`)
    REFERENCES `employee` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Retention. The feed is a working surface, not a legal record: attendance,
-- fines and auditlog remain the system of record, so 180 days of journal is
-- generous. `runRetentionPurge()` reads this row; it validates the table and
-- date column against information_schema before deleting anything.
-- ---------------------------------------------------------------------------
INSERT INTO `retention_policy` (`id`, `name`, `description`, `targetTable`, `dateColumn`, `retentionDays`, `enabled`, `createdAt`, `updatedAt`)
VALUES (
  'ret_workforce_event',
  'Workforce event journal',
  'Live Activities feed rows. Attendance, late fines and the audit log remain the authoritative records; this journal is display history only.',
  'workforce_event',
  'businessDate',
  180,
  1,
  NOW(3),
  NOW(3)
)
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `targetTable` = VALUES(`targetTable`),
  `dateColumn` = VALUES(`dateColumn`),
  `retentionDays` = VALUES(`retentionDays`),
  `updatedAt` = NOW(3);

-- ---------------------------------------------------------------------------
-- Dashboard card registration. The section is gated through the existing
-- widget/role system rather than a new permission, so it respects the RBAC
-- matrix with no special case. Module is ATTENDANCE: anyone who can see
-- attendance can see the live feed; the HR *actions* inside the drawer are
-- gated separately on update/approve.
-- ---------------------------------------------------------------------------
INSERT INTO `dashboard_widget` (`id`, `key`, `label`, `description`, `moduleKey`, `area`, `sortOrder`)
VALUES (
  'dw_live_activities',
  'LIVE_ACTIVITIES',
  'Live Activities',
  'Real-time feed of today''s punches, exceptions, fines, assignments and overtime',
  'ATTENDANCE',
  'OVERVIEW',
  120
)
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`),
  `description` = VALUES(`description`),
  `moduleKey` = VALUES(`moduleKey`),
  `area` = VALUES(`area`),
  `sortOrder` = VALUES(`sortOrder`);

-- Visibility mirrors the ATTENDANCE module grant exactly, because that is what
-- the API gates on. role_admin is deliberately NOT given this card: under the
-- RBAC matrix Admin is a governance role (module access, credentials, security
-- operations) and holds no ATTENDANCE grant, so a feed it can see but not load
-- would 403 on every poll. If Admin is ever granted ATTENDANCE:view, flip this
-- row in the same migration.
INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`) VALUES
  ('rw41_super_live', 'role_super_admin',   'dw_live_activities', 1),
  ('rw41_admin_live', 'role_admin',         'dw_live_activities', 0),
  ('rw41_hr_live',    'role_hr',            'dw_live_activities', 1),
  ('rw41_floor_live', 'role_floor_manager', 'dw_live_activities', 1),
  ('rw41_emp_live',   'role_employee',      'dw_live_activities', 0)
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);
