-- ===========================================================================
-- 038: BIOMETRIC IoT DEVICE OPS — REGISTRY MAPPING, DEVICE USERS & MISMATCHES
--
-- Turns the existing biometric punch pipeline into an auditable device-section
-- operations surface without duplicating any table:
--   * reuses biometric_devices / biometric_employee_mappings /
--     biometric_raw_punches as the single source of truth;
--   * adds floor + section to the device registry so a terminal can be mapped
--     to the area it physically guards;
--   * adds biometric_device_users — the user list a terminal reports
--     (ADMS USERINFO / ZK user pull) — which is what makes name / id / not
--     synced mismatches detectable at all;
--   * adds biometric_mismatch_records — the durable work queue HR resolves,
--     with explicit expected/received snapshots, an occurrence counter
--     (repeats collapse into one row, they do not flood the list) and the
--     indexes the task asks for: employee, biometric id, device, floor,
--     section, date;
--   * seeds deliberate demo mismatches so the section is useful on day one:
--     one wrong device name, one duplicate biometric id pair, one employee
--     missing from the device user list, one unknown visitor PIN per device,
--     and an employee/shift area that no longer matches their terminal.
--
-- Additive only: no column is dropped and no row is deleted. Every ALTER is a
-- single statement so a partially applied database still converges. Seeds are
-- idempotent (INSERT ... ON DUPLICATE KEY UPDATE / UPDATE by primary key).
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. biometric_devices — which floor / section the terminal guards
-- ---------------------------------------------------------------------------
ALTER TABLE `biometric_devices` ADD COLUMN `floorId` VARCHAR(36) NULL COMMENT 'Floor this terminal is installed on';
ALTER TABLE `biometric_devices` ADD COLUMN `sectionId` VARCHAR(36) NULL COMMENT 'Section/department area this terminal covers';
ALTER TABLE `biometric_devices` ADD KEY `idx_biometric_device_floor` (`floorId`);
ALTER TABLE `biometric_devices` ADD KEY `idx_biometric_device_section` (`sectionId`);

-- ---------------------------------------------------------------------------
-- 2. biometric_device_users — the user list reported by each terminal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_device_users` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deviceId` VARCHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  `serialNumber` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationCode` VARCHAR(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BEL',
  `pin` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Enrollment / biometric id exactly as stored on the terminal',
  `normalizedPin` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'pin after trim + leading-zero strip',
  `deviceName` VARCHAR(191) COLLATE utf8mb4_unicode_ci NULL COMMENT 'Name as stored on the terminal (may disagree with the employee master)',
  `cardNumber` VARCHAR(64) COLLATE utf8mb4_unicode_ci NULL,
  `privilege` INT NULL COMMENT 'Device privilege byte: 0 user, 2 enroller, 14 admin',
  `employeeId` VARCHAR(36) COLLATE utf8mb4_unicode_ci NULL COMMENT 'Employee the pin resolves to, if any',
  `mappingStatus` ENUM('MAPPED','AMBIGUOUS','UNMAPPED','IGNORED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNMAPPED',
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Last time the terminal listed this user',
  `lastSyncedAt` DATETIME(3) NULL COMMENT 'Last time we pushed this user to the terminal',
  `raw` JSON NULL COMMENT 'Original user record as received, for audit',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_device_user_serial_pin` (`serialNumber`, `normalizedPin`),
  KEY `idx_device_user_device` (`deviceId`),
  KEY `idx_device_user_employee` (`employeeId`),
  KEY `idx_device_user_pin` (`normalizedPin`),
  KEY `idx_device_user_location` (`locationCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. biometric_mismatch_records — the HR work queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_mismatch_records` (
  `id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mismatchType` ENUM('ID_MISMATCH','NAME_MISMATCH','DEVICE_MISMATCH','UNKNOWN_DEVICE','UNKNOWN_USER','NOT_SYNCED','DUPLICATE_ID','INACTIVE_EMPLOYEE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` ENUM('LOW','MEDIUM','HIGH','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `status` ENUM('OPEN','RESOLVED','IGNORED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `detectedBy` ENUM('INGEST','SCAN','USERINFO','MANUAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCAN',
  `dedupeKey` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'One OPEN row per real-world problem; repeats increment occurrenceCount',
  `deviceId` VARCHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  `serialNumber` VARCHAR(64) COLLATE utf8mb4_unicode_ci NULL,
  `deviceName` VARCHAR(191) COLLATE utf8mb4_unicode_ci NULL,
  `floorId` VARCHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  `floorName` VARCHAR(100) COLLATE utf8mb4_unicode_ci NULL,
  `sectionId` VARCHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  `sectionName` VARCHAR(100) COLLATE utf8mb4_unicode_ci NULL,
  `departmentId` VARCHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  `locationCode` VARCHAR(10) COLLATE utf8mb4_unicode_ci NULL,
  `employeeId` VARCHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  `employeeCode` VARCHAR(64) COLLATE utf8mb4_unicode_ci NULL,
  `employeeName` VARCHAR(191) COLLATE utf8mb4_unicode_ci NULL,
  `biometricId` VARCHAR(64) COLLATE utf8mb4_unicode_ci NULL,
  `punchId` VARCHAR(64) COLLATE utf8mb4_unicode_ci NULL COMMENT 'Newest punch that evidenced the problem',
  `punchTime` DATETIME(3) NULL,
  `expected` JSON NULL COMMENT 'What the system master expects, side by side with received',
  `received` JSON NULL COMMENT 'What the device reported',
  `details` VARCHAR(1000) COLLATE utf8mb4_unicode_ci NULL,
  `occurrenceCount` INT NOT NULL DEFAULT 1,
  `firstDetectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastDetectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedById` VARCHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolutionAction` VARCHAR(40) COLLATE utf8mb4_unicode_ci NULL,
  `remark` VARCHAR(500) COLLATE utf8mb4_unicode_ci NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mismatch_dedupe` (`dedupeKey`),
  KEY `idx_mismatch_status_type` (`status`, `mismatchType`),
  KEY `idx_mismatch_employee` (`employeeId`),
  KEY `idx_mismatch_biometric` (`biometricId`),
  KEY `idx_mismatch_device` (`deviceId`),
  KEY `idx_mismatch_floor` (`floorId`),
  KEY `idx_mismatch_section` (`sectionId`),
  KEY `idx_mismatch_location` (`locationCode`),
  KEY `idx_mismatch_punch_time` (`punchTime`),
  KEY `idx_mismatch_last_detected` (`lastDetectedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 4. SEED — device area mapping
-- ===========================================================================
UPDATE `biometric_devices` SET `floorId` = 'cmuzam5ia000e4n4powtzmu78', `sectionId` = 'cmuzam687002m4n4pqoc92gtt' WHERE `id` = 'bio-dev-demo-bel-001';
UPDATE `biometric_devices` SET `floorId` = 'cmuzam5jp000m4n4p99oh4jy1', `sectionId` = 'cmuzam6in00304n4pajzz93bv' WHERE `id` = 'bio-dev-dav-001';
UPDATE `biometric_devices` SET `floorId` = 'cmuzam5k2000o4n4p0kiwjdhq', `sectionId` = 'cmuzam6jv00324n4pokdm03zm' WHERE `id` = 'bio-dev-dav-002';
UPDATE `biometric_devices` SET `floorId` = 'cmuzam5ke000q4n4ps2wkbi8h', `sectionId` = 'cmuzam6l800344n4p5nswp0xr' WHERE `id` = 'bio-dev-dav-003';

-- ===========================================================================
-- 5. SEED — employee floor / section (was never backfilled; device area
--    mismatches and floor/section reports need it)
-- ===========================================================================
UPDATE `employee` SET `floorId` = 'cmuzam5ia000e4n4powtzmu78', `sectionId` = 'cmuzam687002m4n4pqoc92gtt' WHERE `id` = 'emp-demo-100201';
UPDATE `employee` SET `floorId` = 'cmuzam5io000g4n4pibhfehy8', `sectionId` = 'cmuzam69f002o4n4psjwmhnbw' WHERE `id` = 'emp-demo-100202';
UPDATE `employee` SET `floorId` = 'cmuzam5j0000i4n4p1z34skz2', `sectionId` = 'cmuzam6b8002q4n4p966t5lts' WHERE `id` = 'emp-demo-100203';
UPDATE `employee` SET `floorId` = 'cmuzam5jd000k4n4psbjm7oe3', `sectionId` = 'cmuzam6c7002s4n4pqbhztdlo' WHERE `id` = 'emp-demo-100204';
UPDATE `employee` SET `floorId` = 'cmuzam5ia000e4n4powtzmu78', `sectionId` = 'cmuzam6e6002u4n4pwhb0h9gm' WHERE `id` = 'emp-demo-100205';
UPDATE `employee` SET `floorId` = 'cmuzam5io000g4n4pibhfehy8', `sectionId` = 'cmuzam6fr002w4n4pshf6v05m' WHERE `id` = 'emp-demo-100206';
UPDATE `employee` SET `floorId` = 'cmuzam5jp000m4n4p99oh4jy1', `sectionId` = 'cmuzam6in00304n4pajzz93bv' WHERE `id` = 'emp-demo-200207';
UPDATE `employee` SET `floorId` = 'cmuzam5k2000o4n4p0kiwjdhq', `sectionId` = 'cmuzam6jv00324n4pokdm03zm' WHERE `id` = 'emp-demo-200208';
UPDATE `employee` SET `floorId` = 'cmuzam5ke000q4n4ps2wkbi8h', `sectionId` = 'cmuzam6l800344n4p5nswp0xr' WHERE `id` = 'emp-demo-200209';
UPDATE `employee` SET `floorId` = 'cmuzam5l2000u4n4pshxdhfny', `sectionId` = 'cmuzam6ru003e4n4pfagxlzh3' WHERE `id` = 'emp-demo-300210';
UPDATE `employee` SET `floorId` = 'cmuzam5le000w4n4p4byfiqqi', `sectionId` = 'cmuzam6sh003g4n4p5ytlcmk8' WHERE `id` = 'emp-demo-300211';
UPDATE `employee` SET `floorId` = 'cmuzam5lq000y4n4p1zylnc3z', `sectionId` = 'cmuzam6tj003i4n4pveptzs5q' WHERE `id` = 'emp-demo-300212';

-- ===========================================================================
-- 6. SEED — device user lists (the inputs that make mismatches real)
--    * Belagavi demo terminal: every BEL employee except Geeta Kulkarni
--      (emp-demo-100206) -> NOT_SYNCED; one unknown visitor PIN 999001.
--      PIN 777001 is Rajesh's legacy enrollment (stale mapping map-BEL-777001
--      points at an unregistered SIMTEST serial) — present on the terminal so
--      the sweep reports the real problems, not that artefact.
--    * Davangere Terminal 1: pins 00200207 / 200208 / 200209 with
--      "Lakshmi Reddy" wrongly enrolled for pin 200208 (NAME_MISMATCH);
--      unknown visitor PIN 888001.
-- ===========================================================================
INSERT INTO `biometric_device_users`
  (`id`, `deviceId`, `serialNumber`, `locationCode`, `pin`, `normalizedPin`, `deviceName`, `cardNumber`, `privilege`, `employeeId`, `mappingStatus`, `firstSeenAt`, `lastSeenAt`)
VALUES
  ('bdu-bel-100201', 'bio-dev-demo-bel-001', 'SIMMB160DEMO01', 'BEL', '100201', '100201', 'Rajesh Kumar', 'C-100201', 0, 'emp-demo-100201', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-bel-100202', 'bio-dev-demo-bel-001', 'SIMMB160DEMO01', 'BEL', '100202', '100202', 'Priya Sharma', 'C-100202', 0, 'emp-demo-100202', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-bel-100203', 'bio-dev-demo-bel-001', 'SIMMB160DEMO01', 'BEL', '100203', '100203', 'Amit Patel', 'C-100203', 0, 'emp-demo-100203', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-bel-100204', 'bio-dev-demo-bel-001', 'SIMMB160DEMO01', 'BEL', '100204', '100204', 'Kavita Bhat', 'C-100204', 0, 'emp-demo-100204', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-bel-100205', 'bio-dev-demo-bel-001', 'SIMMB160DEMO01', 'BEL', '100205', '100205', 'Ramesh Gowda', 'C-100205', 0, 'emp-demo-100205', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-bel-777001', 'bio-dev-demo-bel-001', 'SIMMB160DEMO01', 'BEL', '777001', '777001', 'Rajesh Kumar', 'C-100201', 0, 'emp-demo-100201', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-bel-999001', 'bio-dev-demo-bel-001', 'SIMMB160DEMO01', 'BEL', '999001', '999001', 'Unknown Visitor', NULL, 0, NULL, 'UNMAPPED', NOW(3), NOW(3)),
  ('bdu-dav-00200207', 'bio-dev-dav-001', 'JNP2252300795', 'DAV', '00200207', '200207', 'Suresh Reddy', 'C-200207', 0, 'emp-demo-200207', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-dav-200208', 'bio-dev-dav-001', 'JNP2252300795', 'DAV', '200208', '200208', 'Lakshmi Reddy', 'C-200208', 0, 'emp-demo-200208', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-dav-200209', 'bio-dev-dav-001', 'JNP2252300795', 'DAV', '200209', '200209', 'Manjunath Hebbar', 'C-200209', 0, 'emp-demo-200209', 'MAPPED', NOW(3), NOW(3)),
  ('bdu-dav-888001', 'bio-dev-dav-001', 'JNP2252300795', 'DAV', '888001', '888001', 'Unknown Person', NULL, 0, NULL, 'UNMAPPED', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `deviceId` = VALUES(`deviceId`), `deviceName` = VALUES(`deviceName`),
  `employeeId` = VALUES(`employeeId`), `mappingStatus` = VALUES(`mappingStatus`),
  `lastSeenAt` = VALUES(`lastSeenAt`);

-- ===========================================================================
-- 7. SEED — mapping edits that plant the deliberate mismatches
--    * Priya/Lakshmi story: 'Lakshmi Reddy' on the terminal vs master
--      'Lakshmi Devi' (found by section 6), plus she is assigned terminal T1
--      while her area became First Floor -> DEVICE_MISMATCH once she punches
--      anywhere else in the showroom.
--    * Rajesh (100201) keeps mapping 500001 and Priya (100202) gets 9500001:
--      both share suffix 500001 -> DUPLICATE_ID pair.
--    * Manjunath (200209) is control case: assigned terminal T3 equals his
--      Second Floor area; unchanged.
-- ===========================================================================
UPDATE `biometric_employee_mappings` SET `serialNumber` = 'JNP2252300795', `conflictCount` = 1 WHERE `id` = 'map-demo-200208';

INSERT INTO `biometric_employee_mappings`
  (`id`, `employeeId`, `enrollmentNumber`, `normalizedEnrollment`, `lastSixDigits`, `serialNumber`, `showroomCode`, `status`, `effectiveDate`, `mappingSource`, `conflictCount`, `createdBy`, `notes`)
VALUES
  ('map-bel-500001', 'emp-demo-100201', '500001', '500001', '500001', 'SIMMB160DEMO01', 'BEL', 'AMBIGUOUS', '2026-10-15', 'MANUAL', 1, 'usr-demo-admin', 'Deliberate demo: duplicate suffix 500001 (with 9500001)'),
  ('map-bel-9500001', 'emp-demo-100202', '9500001', '9500001', '500001', 'SIMMB160DEMO01', 'BEL', 'AMBIGUOUS', '2026-10-15', 'MANUAL', 1, 'usr-demo-admin', 'Deliberate demo: duplicate suffix 500001 (with 500001)')
ON DUPLICATE KEY UPDATE
  `status` = VALUES(`status`), `conflictCount` = VALUES(`conflictCount`), `notes` = VALUES(`notes`);
