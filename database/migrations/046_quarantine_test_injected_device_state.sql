-- ===========================================================================
-- 046: quarantine test-injected device state and restore truthful connectivity
-- ===========================================================================
-- Discovery (2026-10-18, while verifying device status reporting):
--
--   SELECT id, serialNumber, status, lastConnectionAt, lastSyncAt, lastError
--     FROM biometric_devices;
--
--   bio-dev-dav-001 | JNP2252300795 | DISCONNECTED | 2026-10-18 07:18:44.996
--                  | 2026-10-18 07:18:44.000 | "CONNECT_TIMEOUT: Test simulated
--                  |  connection drop"
--   bio-dev-dav-003 | JNP2252300797 | CONNECTED    | 2026-10-18 07:18:41.000
--                  | 2026-10-18 07:18:41.000 | (null)
--
-- Both terminals are physically unreachable from this workstation (their IPs
-- are private Davanagere shop-floor addresses, and the worker's own attempts on
-- bio-dev-dav-002 correctly read `CONNECT_TIMEOUT: Timed out after 3500ms …`).
-- Yet both rows carried a `lastSyncAt` seconds old, and dav-001 additionally
-- carried an error string that no device could have written.
--
-- Cause, in code rather than in the database:
--
--   * `backend/src/tests/biometricIntegration.test.ts` posted raw punches to
--     `/api/devices/ingest-raw` under the serials `JNP2252300795` and
--     `JNP2252300797` — real, registered, shop-floor terminals. Ingest is
--     production code: it sets `status='CONNECTED'` and stamps
--     `lastConnectionAt`, `lastHeartbeatAt`, `lastSeenAt`, `lastSyncAt` and
--     clears `lastError` for whichever serial it is handed. Every test run
--     therefore recorded, in the production registry, that two factory
--     terminals had just synchronized. They had not.
--   * `backend/src/tests/dualModeBiometricSync.test.ts` used `JNP2252300795`
--     as its `testSerial` and called `recordDeviceDisconnect()` with the
--     message "Test simulated connection drop", which is now the last error
--     operators see for that terminal.
--
-- Both suites now create their own loopback fixture terminal (`isFixture = 1`,
-- serial `SIMINT-*` / `SIMDUAL-*`) and delete it at the end, so a test can no
-- longer reach a production row. This migration repairs what the old versions
-- left behind.
--
-- What it does, in order, all reversible:
--
--   1. `biometric_devices_state_backup_046` — a verbatim copy of every device
--      row modified below (`SELECT * FROM biometric_devices`, plus the reason
--      and timestamp). Nothing is overwritten before it is copied.
--   2. `biometric_raw_punches_quarantine_046` — a verbatim copy of the ledger
--      rows the tests injected under production serials, then removed from the
--      live ledger so the ops queues stop triaging punches that were never
--      captured. Rows are only quarantined when they are unmistakably test
--      artefacts: an enrollment identifier the test code uses (`9901`, `9902`,
--      `TEST_EMP_DUAL_001`, `ghost-*`), no employee mapping, and no attendance
--      projection. A genuine `UNKNOWN_USER` punch from a real terminal is a
--      real event and stays in the ledger — the identifier list is what makes
--      that distinction, not a heuristic about unmapped rows.
--   3. The two device rows have their connectivity evidence cleared rather than
--      set to a guessed value: no `lastSyncAt`, no `lastConnectionAt`, no
--      heartbeat, no `lastError`, no clock-drift reading. "Never observed" is
--      the truthful state; the dashboard will show them as unverified instead of
--      "synchronized 3 seconds ago".
--
-- Rollback (manual, after taking a fresh backup of the current state):
--
--   UPDATE biometric_devices d
--     JOIN biometric_devices_state_backup_046 b ON b.id = d.id
--     SET d.status = b.status, d.lastConnectionAt = b.lastConnectionAt,
--         d.lastHeartbeatAt = b.lastHeartbeatAt, d.lastSeenAt = b.lastSeenAt,
--         d.lastSyncAt = b.lastSyncAt, d.lastSyncMode = b.lastSyncMode,
--         d.lastError = b.lastError, d.consecutiveFailures = b.consecutiveFailures,
--         d.nextRetryAt = b.nextRetryAt, d.clockDriftSeconds = b.clockDriftSeconds,
--         d.deviceClockAt = b.deviceClockAt;
--
--   INSERT INTO biometric_raw_punches SELECT q.* EXCEPT (quarantinedAt, quarantineReason)
--     FROM biometric_raw_punches_quarantine_046 q;
--   -- (or re-run per row by id; the quarantine table keeps the original primary keys)
-- ===========================================================================

-- 1 ─── back up the device rows before touching them ─────────────────────────
CREATE TABLE IF NOT EXISTS `biometric_devices_state_backup_046` LIKE `biometric_devices`;

ALTER TABLE `biometric_devices_state_backup_046`
  ADD COLUMN `stateBackedUpAt` DATETIME(3) NULL,
  ADD COLUMN `stateBackupReason` VARCHAR(255) NULL;

INSERT INTO `biometric_devices_state_backup_046`
SELECT d.*, NOW(3),
       '046: connectivity evidence was written by the automated test suite, not by a device'
  FROM `biometric_devices` d
 WHERE d.`serialNumber` IN ('JNP2252300795', 'JNP2252300797')
   AND d.`isFixture` = 0
   AND NOT EXISTS (SELECT 1 FROM `biometric_devices_state_backup_046` b WHERE b.`id` = d.`id`);

-- 2 ─── quarantine the ledger rows the tests injected under real serials ─────
CREATE TABLE IF NOT EXISTS `biometric_raw_punches_quarantine_046` LIKE `biometric_raw_punches`;

ALTER TABLE `biometric_raw_punches_quarantine_046`
  ADD COLUMN `quarantinedAt` DATETIME(3) NULL,
  ADD COLUMN `quarantineReason` VARCHAR(255) NULL;

INSERT INTO `biometric_raw_punches_quarantine_046`
SELECT r.*, NOW(3),
       '046: injected by biometricIntegration/dualModeBiometricSync under a production terminal serial'
  FROM `biometric_raw_punches` r
  JOIN `biometric_devices` d ON d.`serialNumber` = r.`serialNumber` AND d.`isFixture` = 0
 WHERE r.`attendanceId` IS NULL
   AND r.`employeeId` IS NULL
   AND r.`mappingStatus` = 'UNMAPPED'
   AND (r.`enrollmentNumber` IN ('9901', '9902', 'TEST_EMP_DUAL_001')
        OR r.`enrollmentNumber` LIKE 'ghost-%'
        OR r.`enrollmentNumber` LIKE 'TEST_EMP_%'
        OR r.`enrollmentNumber` LIKE 'SIMTEST%')
   AND NOT EXISTS (SELECT 1 FROM `biometric_raw_punches_quarantine_046` q WHERE q.`id` = r.`id`);

DELETE r
  FROM `biometric_raw_punches` r
  JOIN `biometric_raw_punches_quarantine_046` q ON q.`id` = r.`id`;

-- 3 ─── clear the fabricated connectivity evidence on the affected terminals ──
UPDATE `biometric_devices`
   SET `status` = 'DISCONNECTED',
       `lastConnectionAt` = NULL,
       `lastHeartbeatAt` = NULL,
       `lastSeenAt` = NULL,
       `lastSyncAt` = NULL,
       `lastSyncMode` = NULL,
       `lastError` = NULL,
       `consecutiveFailures` = 0,
       `nextRetryAt` = NULL,
       `deviceClockAt` = NULL,
       `clockDriftSeconds` = NULL,
       `clockDriftCheckedAt` = NULL,
       `timeSyncedAt` = NULL
 WHERE `serialNumber` IN ('JNP2252300795', 'JNP2252300797')
   AND `isFixture` = 0;

-- 4 ─── integrity report (read-only) ─────────────────────────────────────────
SELECT 'device rows backed up' AS check_name, COUNT(*) AS rows_seen
  FROM `biometric_devices_state_backup_046`
UNION ALL
SELECT 'ledger rows quarantined', COUNT(*)
  FROM `biometric_raw_punches_quarantine_046`
UNION ALL
SELECT 'test rows still in the live ledger', COUNT(*)
  FROM `biometric_raw_punches` r
  JOIN `biometric_devices` d ON d.`serialNumber` = r.`serialNumber` AND d.`isFixture` = 0
 WHERE r.`mappingStatus` = 'UNMAPPED'
   AND r.`attendanceId` IS NULL
   AND (r.`enrollmentNumber` IN ('9901', '9902', 'TEST_EMP_DUAL_001') OR r.`enrollmentNumber` LIKE 'ghost-%')
UNION ALL
SELECT 'production terminals still claiming a sync with no evidence', COUNT(*)
  FROM `biometric_devices`
 WHERE `serialNumber` IN ('JNP2252300795', 'JNP2252300797')
   AND `lastSyncAt` IS NOT NULL;
