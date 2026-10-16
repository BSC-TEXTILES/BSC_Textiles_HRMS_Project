-- ============================================================================
-- BSC Textiles HRMS - Migration 018: eSSL MB160 Biometric Device Real-Time Sync Setup
-- Adds hardware metadata telemetry fields to biometric_devices and updates
-- terminal locations and model specifications for Belagavi, Davanagere, and Shivamogga.
-- ============================================================================

-- 1. Add telemetry and hardware specification fields to biometric_devices if not present
SET @col_heartbeat = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biometric_devices' AND COLUMN_NAME = 'lastHeartbeatAt');
SET @sql_heartbeat = IF(@col_heartbeat = 0, 'ALTER TABLE biometric_devices ADD COLUMN lastHeartbeatAt DATETIME(3) NULL AFTER lastConnectionAt', 'SELECT 1');
PREPARE stmt FROM @sql_heartbeat;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_user_count = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biometric_devices' AND COLUMN_NAME = 'userCount');
SET @sql_user_count = IF(@col_user_count = 0, 'ALTER TABLE biometric_devices ADD COLUMN userCount INT NOT NULL DEFAULT 0 AFTER failedRecords', 'SELECT 1');
PREPARE stmt FROM @sql_user_count;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_fp_count = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biometric_devices' AND COLUMN_NAME = 'fpCount');
SET @sql_fp_count = IF(@col_fp_count = 0, 'ALTER TABLE biometric_devices ADD COLUMN fpCount INT NOT NULL DEFAULT 0 AFTER userCount', 'SELECT 1');
PREPARE stmt FROM @sql_fp_count;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_face_count = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biometric_devices' AND COLUMN_NAME = 'faceCount');
SET @sql_face_count = IF(@col_face_count = 0, 'ALTER TABLE biometric_devices ADD COLUMN faceCount INT NOT NULL DEFAULT 0 AFTER fpCount', 'SELECT 1');
PREPARE stmt FROM @sql_face_count;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_att_count = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biometric_devices' AND COLUMN_NAME = 'attLogCount');
SET @sql_att_count = IF(@col_att_count = 0, 'ALTER TABLE biometric_devices ADD COLUMN attLogCount INT NOT NULL DEFAULT 0 AFTER faceCount', 'SELECT 1');
PREPARE stmt FROM @sql_att_count;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_push_ver = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biometric_devices' AND COLUMN_NAME = 'pushVersion');
SET @sql_push_ver = IF(@col_push_ver = 0, 'ALTER TABLE biometric_devices ADD COLUMN pushVersion VARCHAR(50) NULL AFTER attLogCount', 'SELECT 1');
PREPARE stmt FROM @sql_push_ver;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Update device entries for Belagavi, Davanagere, and Shivamogga with verified MB160 metadata
-- Device 1: Belagavi Flagship Main Terminal
INSERT INTO biometric_devices (
  id, serialNumber, name, model, firmwareVersion, ipAddress, port,
  locationId, locationCode, status, protocol, isActive, lastConnectionAt, lastHeartbeatAt
) VALUES (
  'bio-dev-bel-001', 'JNP2252300795', 'eSSL MB160 Belagavi Flagship Main Terminal',
  'eSSL MB160', 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0', '192.168.0.136', 4370,
  'cmuwszr8t00011vdtc7vgvags', 'BEL', 'CONNECTED', 'ADMS_PUSH', 1, NOW(), NOW()
) ON DUPLICATE KEY UPDATE
  name = 'eSSL MB160 Belagavi Flagship Main Terminal',
  model = 'eSSL MB160',
  firmwareVersion = 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
  ipAddress = '192.168.0.136',
  port = 4370,
  locationId = 'cmuwszr8t00011vdtc7vgvags',
  locationCode = 'BEL',
  protocol = 'ADMS_PUSH',
  status = 'CONNECTED',
  isActive = 1,
  lastHeartbeatAt = IFNULL(lastHeartbeatAt, NOW()),
  updatedAt = NOW();

-- Device 2: Davanagere Mega Store Main Terminal
INSERT INTO biometric_devices (
  id, serialNumber, name, model, firmwareVersion, ipAddress, port,
  locationId, locationCode, status, protocol, isActive, lastConnectionAt, lastHeartbeatAt
) VALUES (
  'bio-dev-dav-002', 'JNP2252300802', 'eSSL MB160 Davanagere Mega Store Terminal',
  'eSSL MB160', 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0', '192.168.0.131', 4370,
  'cmuwszr9500021vdtxscy3nsc', 'DAV', 'CONNECTED', 'ADMS_PUSH', 1, NOW(), NOW()
) ON DUPLICATE KEY UPDATE
  serialNumber = 'JNP2252300802',
  name = 'eSSL MB160 Davanagere Mega Store Terminal',
  model = 'eSSL MB160',
  firmwareVersion = 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
  ipAddress = '192.168.0.131',
  port = 4370,
  locationId = 'cmuwszr9500021vdtxscy3nsc',
  locationCode = 'DAV',
  protocol = 'ADMS_PUSH',
  status = 'CONNECTED',
  isActive = 1,
  lastHeartbeatAt = IFNULL(lastHeartbeatAt, NOW()),
  updatedAt = NOW();

-- Also handle any legacy duplicate key or variant SN JNPJNP2252300802
UPDATE biometric_devices 
SET serialNumber = 'JNP2252300802',
    name = 'eSSL MB160 Davanagere Mega Store Terminal',
    model = 'eSSL MB160',
    locationId = 'cmuwszr9500021vdtxscy3nsc',
    locationCode = 'DAV',
    protocol = 'ADMS_PUSH',
    status = 'CONNECTED'
WHERE serialNumber = 'JNPJNP2252300802' OR id = 'bio-dev-dav-002';

-- Device 3: Shivamogga Flagship Main Terminal
INSERT INTO biometric_devices (
  id, serialNumber, name, model, firmwareVersion, ipAddress, port,
  locationId, locationCode, status, protocol, isActive, lastConnectionAt, lastHeartbeatAt
) VALUES (
  'bio-dev-shi-003', 'JNP2252300797', 'eSSL MB160 Shivamogga Flagship Terminal',
  'eSSL MB160', 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0', '192.168.0.138', 4370,
  'cmuwszr9s00031vdtqlwzkrw8', 'SHI', 'CONNECTED', 'ADMS_PUSH', 1, NOW(), NOW()
) ON DUPLICATE KEY UPDATE
  name = 'eSSL MB160 Shivamogga Flagship Terminal',
  model = 'eSSL MB160',
  firmwareVersion = 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
  ipAddress = '192.168.0.138',
  port = 4370,
  locationId = 'cmuwszr9s00031vdtqlwzkrw8',
  locationCode = 'SHI',
  protocol = 'ADMS_PUSH',
  status = 'CONNECTED',
  isActive = 1,
  lastHeartbeatAt = IFNULL(lastHeartbeatAt, NOW()),
  updatedAt = NOW();
