-- ===========================================================================
-- 042: DUAL-MODE eSSL MB160 ARCHITECTURE (LOCAL_LAN vs CLOUD_PUSH)
--
-- Adds transport configuration columns to biometric_devices:
--   * communicationMode: ENUM('LOCAL_LAN', 'CLOUD_PUSH', 'HYBRID')
--   * cloudServerUrl: Configured ADMS cloud destination URL
--   * lastSyncMode: Actual mode active during the most recent synchronization
--
-- Purely additive: Safe across MySQL 8.0 environments without dropping tables.
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Add communicationMode, cloudServerUrl, and lastSyncMode to biometric_devices
ALTER TABLE `biometric_devices`
  ADD COLUMN `communicationMode` ENUM('LOCAL_LAN', 'CLOUD_PUSH', 'HYBRID') NOT NULL DEFAULT 'CLOUD_PUSH'
  COMMENT 'Primary physical sync transport for terminal';

ALTER TABLE `biometric_devices`
  ADD COLUMN `cloudServerUrl` VARCHAR(255) NULL
  COMMENT 'Configured ADMS server hostname/IP for this device';

ALTER TABLE `biometric_devices`
  ADD COLUMN `lastSyncMode` VARCHAR(32) NULL
  COMMENT 'Mode active during last successful synchronization';

-- 2. Indexes for fast status lookups and dual-mode dispatch
CREATE INDEX `idx_biometric_devices_comm_mode` ON `biometric_devices` (`communicationMode`);
CREATE INDEX `idx_biometric_devices_active_sn` ON `biometric_devices` (`isActive`, `serialNumber`);

-- 3. Set existing devices based on their protocols
UPDATE `biometric_devices`
   SET `communicationMode` = 'CLOUD_PUSH'
 WHERE `protocol` = 'ADMS_PUSH';

UPDATE `biometric_devices`
   SET `communicationMode` = 'LOCAL_LAN'
 WHERE `protocol` IN ('TCP_SDK', 'UDP_ZK');

SET FOREIGN_KEY_CHECKS = 1;
