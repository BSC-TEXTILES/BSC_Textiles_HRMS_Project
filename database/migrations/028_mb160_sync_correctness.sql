-- ===========================================================================
-- 028: eSSL MB160 BIOMETRIC SYNC — CORRECTNESS COLUMNS, SETTINGS & MAPPINGS
--
-- Adds what the live punch pipeline needs but was missing:
--   * device transport settings (comm key, timezone, poll interval, heartbeat
--     timeout) so nothing about a terminal is hardcoded in TypeScript;
--   * authoritative UTC punch timestamp plus the raw device values, so a punch
--     can be audited and re-derived instead of guessed;
--   * the raw verify/punch codes and the label resolved at ingest;
--   * device-pushed photo path;
--   * an editable raw-code -> verification-method table (seeded with the usual
--     ZK values) so "Unknown" is possible instead of defaulting to Card/Face;
--   * per-device sync watermark so downtime is back-filled, never skipped;
--   * calibration sessions/events to confirm the mapping against real firmware;
--   * employee id on the raw ledger plus the (employee, timestamp) indexes.
--
-- Additive only: no column is dropped and no row is deleted. Each ALTER is a
-- single statement so a partially applied database still converges.
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. biometric_devices — transport + clock telemetry
-- ---------------------------------------------------------------------------
ALTER TABLE `biometric_devices` ADD COLUMN `commKey` INT NOT NULL DEFAULT 0 COMMENT 'ZK protocol communication key (0-255)';
ALTER TABLE `biometric_devices` ADD COLUMN `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata' COMMENT 'IANA zone the device wall clock is in';
ALTER TABLE `biometric_devices` ADD COLUMN `pollIntervalMs` INT NOT NULL DEFAULT 2500 COMMENT 'Worker polling cadence when the terminal cannot stream';
ALTER TABLE `biometric_devices` ADD COLUMN `heartbeatTimeoutSeconds` INT NOT NULL DEFAULT 15 COMMENT 'No heartbeat for this long means Disconnected';
ALTER TABLE `biometric_devices` ADD COLUMN `realtimeEnabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Use ADMS realtime push / event subscription when supported';
ALTER TABLE `biometric_devices` ADD COLUMN `photoPushEnabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Firmware pushes ATTPHOTO snapshots';
ALTER TABLE `biometric_devices` ADD COLUMN `deviceClockAt` DATETIME(3) NULL COMMENT 'Device clock as last read, as a UTC instant';
ALTER TABLE `biometric_devices` ADD COLUMN `clockDriftSeconds` INT NULL COMMENT 'Signed device-minus-server clock offset';
ALTER TABLE `biometric_devices` ADD COLUMN `clockDriftCheckedAt` DATETIME(3) NULL;
ALTER TABLE `biometric_devices` ADD COLUMN `timeSyncedAt` DATETIME(3) NULL COMMENT 'Last successful SET TIME to the device';
ALTER TABLE `biometric_devices` ADD COLUMN `lastWatermarkAt` DATETIME(3) NULL COMMENT 'Newest device punch time already ingested (UTC instant)';
ALTER TABLE `biometric_devices` ADD COLUMN `lastWatermarkAtLocal` VARCHAR(32) NULL COMMENT 'Same watermark expressed in device wall time';
ALTER TABLE `biometric_devices` ADD COLUMN `lastSeenAt` DATETIME(3) NULL COMMENT 'Last moment the terminal was proven reachable';
ALTER TABLE `biometric_devices` ADD COLUMN `consecutiveFailures` INT NOT NULL DEFAULT 0;
ALTER TABLE `biometric_devices` ADD COLUMN `nextRetryAt` DATETIME(3) NULL COMMENT 'Exponential backoff gate for the worker';

-- `protocol` must be able to say UDP_ZK; the enum already has it. Widen the
-- ADMs pull/push distinction instead of reusing TCP_SDK for everything.
ALTER TABLE `biometric_devices` MODIFY COLUMN `protocol` ENUM('TCP_SDK','UDP_ZK','ADMS_PUSH','HTTP_CONNECTOR','NONE') NOT NULL DEFAULT 'NONE';

-- ---------------------------------------------------------------------------
-- 2. biometric_raw_punches — UTC authority, raw debug values, photo, mapping
-- ---------------------------------------------------------------------------
ALTER TABLE `biometric_raw_punches` ADD COLUMN `employeeId` VARCHAR(191) NULL AFTER `deviceId`;
ALTER TABLE `biometric_raw_punches` ADD COLUMN `punchTimeUtc` DATETIME(3) NULL COMMENT 'Authoritative UTC wall time of the punch';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `rawDeviceTimeString` VARCHAR(32) NULL COMMENT 'Exactly the timestamp text/number the device sent';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `rawTimezone` VARCHAR(64) NULL COMMENT 'Timezone that rawDeviceTimeString was interpreted in';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `rawVerifyType` INT NULL COMMENT 'Unmodified verify code from the terminal';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `rawPunchState` INT NULL COMMENT 'Unmodified punch status/state byte from the terminal';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `verifyModeLabel` VARCHAR(40) NULL COMMENT 'Method resolved from verify_mode_mapping at ingest';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `workCode` VARCHAR(32) NULL;
ALTER TABLE `biometric_raw_punches` ADD COLUMN `matchValue` DECIMAL(6,2) NULL COMMENT 'Device-reported match score, if the firmware sends one';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `photoPath` VARCHAR(500) NULL COMMENT 'Relative path under uploads/attendance/';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `mappingStatus` ENUM('MAPPED','AMBIGUOUS','UNMAPPED','INVALID_TIME') NOT NULL DEFAULT 'MAPPED';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `mappingCandidates` JSON NULL COMMENT 'Employee ids that matched, when ambiguous';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `normalizedId` VARCHAR(64) NULL COMMENT 'Id after trim / leading-zero strip';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `source` ENUM('ADMS_PUSH','ZK_PULL','CONNECTOR','MANUAL','CALIBRATION') NOT NULL DEFAULT 'ADMS_PUSH';
ALTER TABLE `biometric_raw_punches` ADD COLUMN `assignedById` VARCHAR(191) NULL;
ALTER TABLE `biometric_raw_punches` ADD COLUMN `assignedAt` DATETIME(3) NULL;

-- A punch must be physically impossible to store twice: device serial + user id
-- + punch instant. dedupHash already hashes the same triple; this makes the
-- guarantee visible and enforceable without relying on hash discipline.
ALTER TABLE `biometric_raw_punches` ADD UNIQUE KEY `uq_raw_punch_device_user_time` (`serialNumber`, `enrollmentNumber`, `punchTime`);
ALTER TABLE `biometric_raw_punches` ADD KEY `idx_raw_punch_employee_time` (`employeeId`, `punchTime`);
ALTER TABLE `biometric_raw_punches` ADD KEY `idx_raw_punch_utc_time` (`punchTimeUtc`);
ALTER TABLE `biometric_raw_punches` ADD KEY `idx_raw_punch_mapping_status` (`mappingStatus`, `receivedAt`);
ALTER TABLE `biometric_raw_punches` ADD KEY `idx_raw_punch_normalized_id` (`normalizedId`);

-- verifyMode may legitimately be absent from a payload; keep the column but stop
-- defaulting it to 1 (fingerprint) so "the device did not tell us" stays visible.
ALTER TABLE `biometric_raw_punches` MODIFY COLUMN `verifyMode` INT NULL COMMENT 'Resolved verify code; NULL means the device did not report one';

-- ---------------------------------------------------------------------------
-- 3. attendance — index for the (employee, timestamp) access pattern
-- ---------------------------------------------------------------------------
ALTER TABLE `attendance` ADD KEY `idx_attendance_employee_actualLogin` (`employeeId`, `actualLogin`);

-- ---------------------------------------------------------------------------
-- 4. verify_mode_mapping — editable raw code -> verification method
--    Seeded with the usual ZK values. Nothing maps to Card implicitly and
--    there is deliberately no row that catches "everything else": an unknown
--    code resolves to Unknown so a firmware quirk is visible rather than hidden.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `verify_mode_mapping` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `rawCode` INT NOT NULL,
  `label` VARCHAR(40) NOT NULL,
  `methodFamily` ENUM('FACE','FINGERPRINT','CARD','PASSWORD','COMBINED','UNKNOWN') NOT NULL,
  `isStandard` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = part of the usual ZK set, 0 = added for this firmware',
  `confirmedByCalibration` TINYINT(1) NOT NULL DEFAULT 0,
  `notes` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_verify_mode_raw_code` (`rawCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `verify_mode_mapping` (`id`, `rawCode`, `label`, `methodFamily`, `isStandard`, `notes`) VALUES
  ('vmm_0',  0,  'Password',             'PASSWORD',    1, 'ZK standard: verified with a numeric password'),
  ('vmm_1',  1,  'Fingerprint',          'FINGERPRINT', 1, 'ZK standard: fingerprint template match'),
  ('vmm_2',  2,  'Card',                 'CARD',        1, 'ZK standard: RFID/iclock card number'),
  ('vmm_3',  3,  'Fingerprint + Password','COMBINED',   1, 'Dual verify'),
  ('vmm_4',  4,  'Fingerprint + Card',   'COMBINED',    1, 'Dual verify'),
  ('vmm_5',  5,  'Password + Card',      'COMBINED',    1, 'Dual verify'),
  ('vmm_8',  8,  'Card + Face',          'COMBINED',    1, 'Dual verify'),
  ('vmm_9',  9,  'Face + Fingerprint',   'COMBINED',    1, 'Dual verify'),
  ('vmm_10', 10, 'Face + Password',      'COMBINED',    1, 'Dual verify'),
  ('vmm_14', 14, 'Other',                'UNKNOWN',     0, 'Reserved; shown as-is, never guessed'),
  ('vmm_15', 15, 'Face',                 'FACE',        1, 'ZK standard on MB160 / multi-biometric firmware')
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `methodFamily` = VALUES(`methodFamily`), `notes` = VALUES(`notes`);

-- ---------------------------------------------------------------------------
-- 5. biometric_settings — global, editable, JSON-valued
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_settings` (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` JSON NOT NULL,
  `description` VARCHAR(255) NULL,
  `isEditable` TINYINT(1) NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `biometric_settings` (`key`, `value`, `description`) VALUES
  ('defaultTimezone',         '"Asia/Kolkata"', 'Timezone used for display and for terminals with no per-device timezone'),
  ('heartbeatTimeoutSeconds', '15',             'No heartbeat for this long => Device disconnected'),
  ('pollIntervalMs',          '2500',           'Fallback polling cadence for terminals that cannot stream events'),
  ('clockDriftWarnSeconds',   '60',             'Warn when device clock differs from server by more than this'),
  ('minValidPunchYear',       '2020',           'Punches dated earlier than this are rejected as impossible'),
  ('futureSkewSeconds',       '300',            'Punches further in the future than this are rejected (5 min tolerance for clock drift)'),
  ('uploadRoot',              '"uploads/attendance"', 'Root folder for device-pushed photos, partitioned by /YYYY/MM/'),
  ('maxPhotoBytes',           '2097152',        'Reject pushed photos larger than 2 MB'),
  ('reportTimeFormat',        '"DD/MM/YYYY HH:mm"', 'Display format used by the attendance report and CSV/Excel export')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- ---------------------------------------------------------------------------
-- 6. biometric_device_sync_state — watermark + back-fill bookkeeping
--    Kept separate from biometric_devices so the registry row stays a
--    configuration record and this one is the hot, per-poll mutable state.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_device_sync_state` (
  `deviceId` VARCHAR(36) NOT NULL PRIMARY KEY,
  `serialNumber` VARCHAR(64) NOT NULL,
  `lastPollAt` DATETIME(3) NULL,
  `lastSuccessAt` DATETIME(3) NULL,
  `lastWatermarkUtc` DATETIME(3) NULL COMMENT 'Newest ingested punch, UTC instant',
  `lastBackfillFromUtc` DATETIME(3) NULL COMMENT 'Start of the window a reconnect re-read',
  `backfillPending` TINYINT(1) NOT NULL DEFAULT 0,
  `lastErrorCode` VARCHAR(64) NULL,
  `lastErrorMessage` TEXT NULL,
  `consecutiveFailures` INT NOT NULL DEFAULT 0,
  `nextRetryAt` DATETIME(3) NULL,
  `recordsPulledTotal` BIGINT NOT NULL DEFAULT 0,
  `recordsIngestedTotal` BIGINT NOT NULL DEFAULT 0,
  `recordsRejectedTotal` BIGINT NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `idx_sync_state_serial` (`serialNumber`),
  KEY `idx_sync_state_next_retry` (`nextRetryAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. Calibration — confirm the mapping against this exact firmware
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_calibration_sessions` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `deviceId` VARCHAR(36) NULL,
  `serialNumber` VARCHAR(64) NULL,
  `startedById` VARCHAR(191) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endsAt` DATETIME(3) NOT NULL,
  `status` ENUM('OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `instructions` VARCHAR(255) NULL,
  `closedAt` DATETIME(3) NULL,
  KEY `idx_calibration_status` (`status`, `endsAt`),
  KEY `idx_calibration_device` (`deviceId`, `startedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What the admin wants out of a calibration session is "which raw codes did this
-- firmware emit between startedAt and endsAt". The raw ledger already holds the
-- per-punch raw codes and timestamps, so that window is the observation set —
-- a parallel event table would only be able to disagree with it.

-- ---------------------------------------------------------------------------
-- 8. Rejected / impossible punches are never dropped silently — they land here
--    with the reason so HR can see the terminal sent something wrong.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_rejected_punches` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `serialNumber` VARCHAR(64) NULL,
  `enrollmentNumber` VARCHAR(64) NULL,
  `rawDeviceTimeString` VARCHAR(64) NULL,
  `reason` ENUM('IMPOSSIBLE_DATE','FUTURE_DATED','UNPARSEABLE','MISSING_USER_ID','DUPLICATE_WINDOW','PHOTO_REJECTED') NOT NULL,
  `detail` TEXT NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `source` VARCHAR(32) NULL,
  KEY `idx_rejected_received` (`receivedAt`),
  KEY `idx_rejected_reason` (`reason`, `receivedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. biometric_employee_mappings — normalized id + ambiguity bookkeeping
-- ---------------------------------------------------------------------------
ALTER TABLE `biometric_employee_mappings` ADD COLUMN `normalizedEnrollment` VARCHAR(64) NULL COMMENT 'enrollmentNumber after trim + leading-zero strip';
ALTER TABLE `biometric_employee_mappings` ADD COLUMN `lastSixDigits` VARCHAR(6) NULL COMMENT 'Suffix key used for the last-6-digits fallback';
ALTER TABLE `biometric_employee_mappings` ADD COLUMN `mappingSource` ENUM('MANUAL','ADMS_USERINFO','ZK_USER','DEVICE_ENROLLMENT','IMPORT') NOT NULL DEFAULT 'MANUAL';
ALTER TABLE `biometric_employee_mappings` ADD COLUMN `conflictCount` INT NOT NULL DEFAULT 0 COMMENT 'How many employees claim this suffix';
ALTER TABLE `biometric_employee_mappings` MODIFY COLUMN `status` ENUM('ACTIVE','SUSPENDED','TRANSFERRED','REVOKED','AMBIGUOUS') NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE `biometric_employee_mappings` ADD KEY `idx_mapping_normalized` (`normalizedEnrollment`);
ALTER TABLE `biometric_employee_mappings` ADD KEY `idx_mapping_last_six` (`lastSixDigits`);

-- Backfill the derived columns for rows that already exist.
UPDATE `biometric_employee_mappings`
   SET `normalizedEnrollment` = TRIM(LEADING '0' FROM TRIM(`enrollmentNumber`)),
       `lastSixDigits` = RIGHT(CONCAT('000000', TRIM(LEADING '0' FROM TRIM(`enrollmentNumber`))), 6)
 WHERE `normalizedEnrollment` IS NULL;

-- Any suffix claimed by more than one active employee is AMBIGUOUS, not a coin toss.
UPDATE `biometric_employee_mappings` m
  JOIN (
    SELECT `lastSixDigits` AS suffix
      FROM `biometric_employee_mappings`
     WHERE `status` = 'ACTIVE' AND `lastSixDigits` IS NOT NULL
     GROUP BY `lastSixDigits`
    HAVING COUNT(DISTINCT `employeeId`) > 1
  ) dup ON dup.suffix = m.`lastSixDigits`
   SET m.`status` = 'AMBIGUOUS';

UPDATE `biometric_employee_mappings` m
  JOIN (
    SELECT `lastSixDigits` AS suffix, COUNT(DISTINCT `employeeId`) AS claim_count
      FROM `biometric_employee_mappings`
     WHERE `lastSixDigits` IS NOT NULL
     GROUP BY `lastSixDigits`
  ) cnt ON cnt.suffix = m.`lastSixDigits`
   SET m.`conflictCount` = cnt.claim_count;

-- Give the existing terminal registry rows usable transport defaults.
UPDATE `biometric_devices` SET `timezone` = 'Asia/Kolkata' WHERE `timezone` IS NULL OR `timezone` = '';
UPDATE `biometric_devices` SET `status` = 'DISCONNECTED' WHERE `status` = 'CONNECTED';

SET FOREIGN_KEY_CHECKS = 1;
