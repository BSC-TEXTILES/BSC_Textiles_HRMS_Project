/**
 * BSC Textiles HRMS - Hardware Biometric Registry Synchronizer
 * Updates the authoritative MySQL database with verified eSSL terminal network configurations
 */

import { pool } from '../src/pool.js';

interface DeviceSeedConfig {
  id: string;
  serialNumber: string;
  name: string;
  model: string;
  firmwareVersion: string;
  ipAddress: string;
  port: number;
  locationCode: string;
}

const DEVICES: DeviceSeedConfig[] = [
  {
    id: 'bio-dev-bel-001',
    serialNumber: process.env.BIOMETRIC_DEV1_SERIAL || 'JNP2252300795',
    name: process.env.BIOMETRIC_DEV1_NAME || 'eSSL MB160 Belagavi Flagship Main Terminal',
    model: 'eSSL MB160',
    firmwareVersion: 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
    ipAddress: process.env.BIOMETRIC_DEV1_IP || '192.168.0.136',
    port: 4370,
    locationCode: process.env.BIOMETRIC_DEV1_LOCATION || 'BEL',
  },
  {
    id: 'bio-dev-dav-002',
    serialNumber: process.env.BIOMETRIC_DEV2_SERIAL || 'JNP2252300802',
    name: process.env.BIOMETRIC_DEV2_NAME || 'eSSL MB160 Davanagere Mega Store Terminal',
    model: 'eSSL MB160',
    firmwareVersion: 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
    ipAddress: process.env.BIOMETRIC_DEV2_IP || '192.168.0.131',
    port: 4370,
    locationCode: process.env.BIOMETRIC_DEV2_LOCATION || 'DAV',
  },
  {
    id: 'bio-dev-shi-003',
    serialNumber: process.env.BIOMETRIC_DEV3_SERIAL || 'JNP2252300797',
    name: process.env.BIOMETRIC_DEV3_NAME || 'eSSL MB160 Shivamogga Flagship Terminal',
    model: 'eSSL MB160',
    firmwareVersion: 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
    ipAddress: process.env.BIOMETRIC_DEV3_IP || '192.168.0.138',
    port: 4370,
    locationCode: process.env.BIOMETRIC_DEV3_LOCATION || 'SHI',
  },
];

async function syncDeviceRegistry() {
  console.log('================================================================');
  console.log('🔄 SYNCHRONIZING BIOMETRIC DEVICES WITH AUTHORITATIVE MYSQL');
  console.log('================================================================');

  for (const dev of DEVICES) {
    // Find locationId for locationCode
    const [locRows]: any = await pool.query(
      'SELECT id, name FROM location WHERE code = ? LIMIT 1',
      [dev.locationCode]
    );
    const locationId = locRows[0]?.id || null;
    const locationName = locRows[0]?.name || dev.locationCode;

    await pool.query(
      `INSERT INTO biometric_devices (
        id, serialNumber, name, model, firmwareVersion, ipAddress, port,
        locationId, locationCode, status, protocol, isActive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISCONNECTED', 'TCP_SDK', 1)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        model = VALUES(model),
        firmwareVersion = VALUES(firmwareVersion),
        ipAddress = VALUES(ipAddress),
        port = VALUES(port),
        locationId = VALUES(locationId),
        locationCode = VALUES(locationCode),
        isActive = 1,
        updatedAt = NOW()`,
      [
        dev.id,
        dev.serialNumber,
        dev.name,
        dev.model,
        dev.firmwareVersion,
        dev.ipAddress,
        dev.port,
        locationId,
        dev.locationCode,
      ]
    );

    console.log(
      `✔ Registered ${dev.name} [SN: ${dev.serialNumber}] -> ${dev.ipAddress}:${dev.port} (${locationName})`
    );
  }

  const [all]: any = await pool.query(
    'SELECT serialNumber, name, ipAddress, port, locationCode, status FROM biometric_devices'
  );
  console.log('\nCurrent MySQL Device Registry:');
  console.table(all);
  console.log('================================================================\n');

  await pool.end();
}

syncDeviceRegistry().catch((err) => {
  console.error('❌ Failed to update biometric device registry:', err);
  process.exit(1);
});
