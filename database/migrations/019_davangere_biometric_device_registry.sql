-- ============================================================================
-- BSC Textiles HRMS - Migration 019: Davangere Biometric Device Registry & Isolation
-- Strictly registers all three supplied eSSL biometric terminals under DAV (Davangere).
-- 
-- Device 1: SN JNP2252300795 -> IP 192.168.100.136 -> Port 4370 -> DAV
-- Device 2: SN JNPJNP2252300802 -> IP 192.168.100.135 -> Port 4370 -> DAV
-- Device 3: SN JNP2252300797 -> IP 192.168.100.137 -> Port 4370 -> DAV
-- ============================================================================

-- Clean up any obsolete device IDs that previously mapped to non-DAV locations
DELETE FROM biometric_devices 
WHERE id IN ('bio-dev-bel-001', 'bio-dev-shi-003') 
   OR serialNumber IN ('JNP2252300795', 'JNPJNP2252300802', 'JNP2252300802', 'JNP2252300797');

-- Device 1: Davangere Store (Main Entrance)
INSERT INTO biometric_devices (
  id, serialNumber, name, model, firmwareVersion, ipAddress, port,
  locationId, locationCode, status, protocol, isActive, lastConnectionAt, lastHeartbeatAt
) VALUES (
  'bio-dev-dav-001', 'JNP2252300795', 'eSSL Davangere Terminal 1 (Main Entrance)',
  'eSSL MB160', 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0', '192.168.100.136', 4370,
  'cmuwszr9500021vdtxscy3nsc', 'DAV', 'CONNECTED', 'ADMS_PUSH', 1, NOW(), NOW()
) ON DUPLICATE KEY UPDATE
  serialNumber = 'JNP2252300795',
  name = 'eSSL Davangere Terminal 1 (Main Entrance)',
  model = 'eSSL MB160',
  firmwareVersion = 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
  ipAddress = '192.168.100.136',
  port = 4370,
  locationId = 'cmuwszr9500021vdtxscy3nsc',
  locationCode = 'DAV',
  protocol = 'ADMS_PUSH',
  status = 'CONNECTED',
  isActive = 1,
  lastHeartbeatAt = IFNULL(lastHeartbeatAt, NOW()),
  updatedAt = NOW();

-- Device 2: Davangere Store (Staff Lounge)
INSERT INTO biometric_devices (
  id, serialNumber, name, model, firmwareVersion, ipAddress, port,
  locationId, locationCode, status, protocol, isActive, lastConnectionAt, lastHeartbeatAt
) VALUES (
  'bio-dev-dav-002', 'JNPJNP2252300802', 'eSSL Davangere Terminal 2 (Staff Lounge)',
  'eSSL MB160', 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0', '192.168.100.135', 4370,
  'cmuwszr9500021vdtxscy3nsc', 'DAV', 'CONNECTED', 'ADMS_PUSH', 1, NOW(), NOW()
) ON DUPLICATE KEY UPDATE
  serialNumber = 'JNPJNP2252300802',
  name = 'eSSL Davangere Terminal 2 (Staff Lounge)',
  model = 'eSSL MB160',
  firmwareVersion = 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
  ipAddress = '192.168.100.135',
  port = 4370,
  locationId = 'cmuwszr9500021vdtxscy3nsc',
  locationCode = 'DAV',
  protocol = 'ADMS_PUSH',
  status = 'CONNECTED',
  isActive = 1,
  lastHeartbeatAt = IFNULL(lastHeartbeatAt, NOW()),
  updatedAt = NOW();

-- Device 3: Davangere Store (Admin / Billing Floor)
INSERT INTO biometric_devices (
  id, serialNumber, name, model, firmwareVersion, ipAddress, port,
  locationId, locationCode, status, protocol, isActive, lastConnectionAt, lastHeartbeatAt
) VALUES (
  'bio-dev-dav-003', 'JNP2252300797', 'eSSL Davangere Terminal 3 (Admin / Billing)',
  'eSSL MB160', 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0', '192.168.100.137', 4370,
  'cmuwszr9500021vdtxscy3nsc', 'DAV', 'CONNECTED', 'ADMS_PUSH', 1, NOW(), NOW()
) ON DUPLICATE KEY UPDATE
  serialNumber = 'JNP2252300797',
  name = 'eSSL Davangere Terminal 3 (Admin / Billing)',
  model = 'eSSL MB160',
  firmwareVersion = 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
  ipAddress = '192.168.100.137',
  port = 4370,
  locationId = 'cmuwszr9500021vdtxscy3nsc',
  locationCode = 'DAV',
  protocol = 'ADMS_PUSH',
  status = 'CONNECTED',
  isActive = 1,
  lastHeartbeatAt = IFNULL(lastHeartbeatAt, NOW()),
  updatedAt = NOW();
