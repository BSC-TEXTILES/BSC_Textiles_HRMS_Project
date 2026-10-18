/**
 * BSC Textiles HRMS - Biometric Attendance, eSSL IoT & Cloud MySQL Integration Test Suite
 * Validates PRD Sections:
 * - 2: Hardware Information & Configuration Verification
 * - 4: Cloud MySQL Idempotent Storage & Deduplication
 * - 6: Biometric Integration Module & SDK Status
 * - 8: Biometric Employee Mappings & Unmapped Punch Isolation
 * - 9: Attendance Processing Engine & Break/Shift Rules
 * - 10: Dual-Key Connector Security & RBAC
 */

import { pool } from '../nativeDb.js';
import { registerDeviceConfig } from '../services/biometric/settings.js';

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: any;
}

export async function runBiometricIntegrationTests(baseUrl: string, adminToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const CONNECTOR_KEY = process.env.BIOMETRIC_CONNECTOR_KEY || 'bsc-biometric-connector-secret-key-2024';

  // Ingestion stamps `status`, `lastConnectionAt`, `lastHeartbeatAt`, `lastSeenAt`
  // and `lastSyncAt` on the device row the serial resolves to. This suite used to
  // submit punches under `JNP2252300795` and `JNP2252300797` — two real,
  // registered shop-floor terminals — so every test run rewrote their history to
  // say they had just synchronized, which they had not. It now uses its own
  // loopback fixture terminal and deletes it again at the end.
  const fixtureSerial = `SIMINT-${Date.now().toString(36).toUpperCase()}`;
  let fixtureDeviceId: string | null = null;
  try {
    const created = await registerDeviceConfig({
      serialNumber: fixtureSerial,
      name: 'Integration test fixture terminal (not a shop-floor device)',
      ipAddress: '127.0.0.1',
      locationCode: 'DAV',
      protocol: 'TCP_SDK',
      isFixture: true,
    });
    fixtureDeviceId = created.id;
  } catch (err: any) {
    console.error('  ⚠ fixture terminal could not be created:', err.message);
  }

  async function cleanupFixture() {
    try {
      await pool.query('DELETE FROM biometric_raw_punches WHERE serialNumber = ?', [fixtureSerial]);
      if (fixtureDeviceId) {
        await pool.query('DELETE FROM biometric_device_sync_state WHERE deviceId = ?', [fixtureDeviceId]);
        await pool.query('DELETE FROM biometric_device_users WHERE deviceId = ?', [fixtureDeviceId]);
      }
      await pool.query('DELETE FROM biometric_devices WHERE serialNumber = ?', [fixtureSerial]);
    } catch (err: any) {
      console.error('  ⚠ fixture cleanup failed:', err.message);
    }
  }

  async function recordTest(name: string, fn: () => Promise<any>) {
    const start = Date.now();
    try {
      const details = await fn();
      results.push({
        name,
        passed: true,
        durationMs: Date.now() - start,
        details,
      });
      console.log(`  ✔ [PASS] ${name} (${Date.now() - start}ms)`);
    } catch (err: any) {
      results.push({
        name,
        passed: false,
        durationMs: Date.now() - start,
        error: err.message,
      });
      console.error(`  ❌ [FAIL] ${name} (${Date.now() - start}ms):`, err.message);
    }
  }

  // 1. Verify Device Registry against Hardware Information
  await recordTest('Biometric Device Registry: Verify 3 Showroom Terminals & IP Subnets', async () => {
    const res = await fetch(`${baseUrl}/api/devices`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (!data.success || !Array.isArray(data.devices)) throw new Error('Invalid response structure');

    const devices = data.devices;
    if (devices.length < 3) throw new Error(`Expected at least 3 devices, found ${devices.length}`);

    // Check Terminal 1
    const devBel = devices.find((d: any) => d.serialNumber === 'JNP2252300795');
    if (!devBel) throw new Error('Terminal 1 (SN: JNP2252300795) not found');
    if (!devBel.ipAddress.startsWith('192.168.100.')) throw new Error(`Terminal 1 IP mismatch: expected 192.168.100.x, got ${devBel.ipAddress}`);
    if (devBel.port !== 4370) throw new Error(`Terminal 1 port mismatch: expected 4370, got ${devBel.port}`);
    if (devBel.locationCode !== 'DAV') throw new Error(`Terminal 1 locationCode mismatch: expected DAV, got ${devBel.locationCode}`);

    // Check Terminal 2 (handles both JNPJNP2252300802 and JNP2252300802)
    const devDav = devices.find((d: any) => d.serialNumber.includes('2252300802'));
    if (!devDav) throw new Error('Terminal 2 (SN: JNP2252300802) not found');
    if (!devDav.ipAddress.startsWith('192.168.100.')) throw new Error(`Terminal 2 IP mismatch: expected 192.168.100.x, got ${devDav.ipAddress}`);
    if (devDav.locationCode !== 'DAV') throw new Error(`Terminal 2 locationCode mismatch: expected DAV, got ${devDav.locationCode}`);

    // Check Terminal 3
    const devShi = devices.find((d: any) => d.serialNumber === 'JNP2252300797');
    if (!devShi) throw new Error('Terminal 3 (SN: JNP2252300797) not found');
    if (!devShi.ipAddress.startsWith('192.168.100.')) throw new Error(`Terminal 3 IP mismatch: expected 192.168.100.x, got ${devShi.ipAddress}`);
    if (devShi.locationCode !== 'DAV') throw new Error(`Terminal 3 locationCode mismatch: expected DAV, got ${devShi.locationCode}`);

    return { totalDevices: devices.length, verifiedSerials: [devBel.serialNumber, devDav.serialNumber, devShi.serialNumber] };
  });

  // 2. Hardware Compatibility & SDK Status
  await recordTest('Biometric SDK Status: Protocol & Subnet Isolation Reporting', async () => {
    const res = await fetch(`${baseUrl}/api/devices/sdk-status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (!data.success) throw new Error('SDK status returned unsuccessful');
    if (data.sdkCompatibility !== 'SUPPORTED') throw new Error(`Expected sdkCompatibility=SUPPORTED, got ${data.sdkCompatibility}`);
    if (!data.networkEnvironment?.isolatedShowroomSubnets) throw new Error('Missing isolatedShowroomSubnets reporting');
    return { protocol: data.protocol, network: data.networkEnvironment };
  });

  // 3. Raw Punch Ingestion & Deduplication Hash Verification
  await recordTest('Raw Biometric Punch Ingestion: SHA256 Deduplication & Idempotence', async () => {
    const testPunchTime = new Date('2026-10-15T09:15:00+05:30').toISOString();
    const testBatch = [
      {
        serialNumber: fixtureSerial,
        enrollmentNumber: '9901', // Enrolled test persona
        punchTime: testPunchTime,
        punchType: 'CHECK_IN',
        verifyMode: 1, // Fingerprint
      },
    ];

    // First ingestion: Should insert
    const res1 = await fetch(`${baseUrl}/api/devices/ingest-raw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ punches: testBatch }),
    });
    if (!res1.ok) throw new Error(`HTTP ${res1.status}: ${await res1.text()}`);
    const data1: any = await res1.json();
    if (!data1.success) throw new Error('First ingestion failed');

    // Second ingestion with identical serial + enrollment + timestamp: MUST BE SKIPPED as duplicate
    const res2 = await fetch(`${baseUrl}/api/devices/ingest-raw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ punches: testBatch }),
    });
    if (!res2.ok) throw new Error(`HTTP ${res2.status}: ${await res2.text()}`);
    const data2: any = await res2.json();
    if (!data2.success) throw new Error('Second ingestion failed');
    if (data2.result.duplicates !== 1) {
      throw new Error(`Deduplication failure: expected 1 duplicate skipped, got ${data2.result.duplicates}`);
    }

    return { firstResult: data1.result, secondResult: data2.result };
  });

  // 4. Edge Connector Authentication (Dual-Key Auth without User JWT)
  await recordTest('Edge Connector Authentication: Authorized via x-connector-key', async () => {
    const punchTime = new Date().toISOString();
    const batch = [
      {
        serialNumber: fixtureSerial,
        enrollmentNumber: '9902',
        punchTime,
        punchType: 'CHECK_IN',
        verifyMode: 1,
      },
    ];

    // Valid connector key
    const resAuth = await fetch(`${baseUrl}/api/devices/ingest-raw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-connector-key': CONNECTOR_KEY,
      },
      body: JSON.stringify({ punches: batch }),
    });
    if (!resAuth.ok) throw new Error(`Connector key auth failed: HTTP ${resAuth.status}: ${await resAuth.text()}`);
    const data: any = await resAuth.json();
    if (!data.success) throw new Error('Connector ingestion failed');

    // Invalid connector key
    const resBad = await fetch(`${baseUrl}/api/devices/ingest-raw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-connector-key': 'invalid-bogus-key',
      },
      body: JSON.stringify({ punches: batch }),
    });
    if (resBad.status !== 401) {
      throw new Error(`Expected HTTP 401 for invalid connector key, got ${resBad.status}`);
    }

    return { connectorAuthorized: true, rejectionVerified: true };
  });

  // 5. Unmapped Enrollment Isolation & Zero-Data-Loss Verification
  await recordTest('Unmapped Enrollment Handling: Preserved in Ledger Without Overwriting', async () => {
    const ghostEnrollment = `ghost-${Date.now().toString(36)}`;
    const punchTime = new Date().toISOString();
    const batch = [
      {
        serialNumber: fixtureSerial,
        enrollmentNumber: ghostEnrollment,
        punchTime,
        punchType: 'CHECK_IN',
        verifyMode: 1,
      },
    ];

    const resIngest = await fetch(`${baseUrl}/api/devices/ingest-raw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ punches: batch }),
    });
    if (!resIngest.ok) throw new Error(`HTTP ${resIngest.status}: ${await resIngest.text()}`);
    const data: any = await resIngest.json();
    if (data.result.unmapped < 1) throw new Error('Expected punch to be flagged as unmapped');

    // Query unmapped endpoint
    const resUnmapped = await fetch(`${baseUrl}/api/devices/unmapped?limit=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!resUnmapped.ok) throw new Error(`HTTP ${resUnmapped.status}: ${await resUnmapped.text()}`);
    const unmappedData: any = await resUnmapped.json();
    const found = unmappedData.unmapped.some((u: any) => u.enrollmentNumber === ghostEnrollment);
    if (!found) throw new Error('Unmapped ghost punch not found in unmapped ledger');

    return { ghostEnrollment, unmappedLogged: true };
  });

  // 6. Device Synchronization Log Persistence
  await recordTest('Synchronization Audit History: Device Connection & Audit Logging', async () => {
    const res = await fetch(`${baseUrl}/api/devices/sync-logs?limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (!data.success || !Array.isArray(data.logs)) throw new Error('Invalid sync logs response');

    return { totalLogs: data.logs.length, sample: data.logs[0] || null };
  });

  await cleanupFixture();

  return results;
}
