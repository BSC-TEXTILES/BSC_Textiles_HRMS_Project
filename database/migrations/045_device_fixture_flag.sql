-- ===========================================================================
-- 045: mark development fixture terminals so production cannot poll them
-- ===========================================================================
-- `eSSL MB160 Belagavi Demo Terminal` (serial `SIMMB160DEMO01`, 127.0.0.1:4370)
-- is the loopback fixture behind `npm run device:simulator`. It is genuinely
-- useful — it is how the ingest, dedupe and mismatch paths are tested without
-- hardware — but it lives in the same registry table as real shop-floor
-- terminals, and the worker polls every `isActive = 1` row. So on a production
-- start the daemon would poll a device that is, by definition, this host, and
-- the ops screens would count its punches next to Davanagere's.
--
-- Rather than hard-coding a serial in the worker (which breaks the day someone
-- renames the row), the registry gets an explicit flag:
--
--   * `isFixture = 1` marks development-only equipment,
--   * `listDeviceConfigs()` drops fixture rows when boot fixtures are disabled,
--   * the device API and UI can label them instead of presenting them as evidence.
--
-- Fixture rows are also excluded from the estate totals that `ops-summary` and
-- the reports derive, so a simulator can never inflate a headcount. Nothing is
-- deleted: the row, its punch history and its device-user rows stay exactly as
-- they are for development.
-- ===========================================================================

DROP PROCEDURE IF EXISTS `_add_045_fixture_flag`;
CREATE PROCEDURE `_add_045_fixture_flag`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'biometric_devices'
                    AND COLUMN_NAME = 'isFixture') THEN
    ALTER TABLE `biometric_devices`
      ADD COLUMN `isFixture` TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '1 = development simulator/fixture, never shop-floor evidence';
  END IF;
END;
CALL `_add_045_fixture_flag`();
DROP PROCEDURE `_add_045_fixture_flag`;

-- The loopback simulator is the only fixture in this fleet today. Matched on both
-- the serial and a 127.x address so a renamed row is still caught, and a real
-- terminal on a private store IP is never mistaken for one.
UPDATE `biometric_devices`
   SET `isFixture` = 1
 WHERE `serialNumber` = 'SIMMB160DEMO01'
    OR (`ipAddress` REGEXP '^127\\.' AND `serialNumber` LIKE 'SIM%');

-- Any attendance event already imported from the fixture stays untouched; this
-- view just makes the split visible to an operator.
CREATE OR REPLACE VIEW `device_registry_with_provenance` AS
SELECT `id`, `serialNumber`, `name`, `model`, `ipAddress`, `port`, `locationCode`,
       `isActive`, `status`, `lastConnectionAt`, `lastSyncAt`, `isFixture`,
       CASE
         WHEN `isFixture` = 1 THEN 'DEVELOPMENT_FIXTURE'
         WHEN `ipAddress` REGEXP '^127\\.' THEN 'LOOPBACK'
         WHEN `ipAddress` REGEXP '^(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.)' THEN 'PRIVATE_STORE_LAN'
         WHEN `ipAddress` IS NULL OR `ipAddress` = '' THEN 'ADDRESS_NOT_CONFIGURED'
         ELSE 'PUBLICLY_ROUTABLE'
       END AS `reachabilityClass`
  FROM `biometric_devices`;

-- Verification: fixtures must be exactly the simulator row.
SELECT `serialNumber`, `name`, `ipAddress`, `locationCode`, `isActive`, `isFixture`
  FROM `biometric_devices`
 ORDER BY `isFixture` DESC, `locationCode`, `name`;

-- ===========================================================================
-- ROLLBACK
--   DROP VIEW IF EXISTS `device_registry_with_provenance`;
--   ALTER TABLE `biometric_devices` DROP COLUMN `isFixture`;
-- ===========================================================================
