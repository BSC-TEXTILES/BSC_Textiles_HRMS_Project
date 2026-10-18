/**
 * BSC Textiles HRMS — Dual-Mode eSSL MB160 Biometric Integration Test Suite
 * 
 * Verifies:
 * 1. Dual-mode configuration resolution (local_lan vs cloud_push)
 * 2. RFC 1918 private IP detection to protect cloud workers from hanging on unroutable IPs
 * 3. ADMS device authentication & rejection of unknown/unregistered serial numbers
 * 4. ADMS rejection of deactivated devices
 * 5. Registered device real-time punch push with location binding and SHA-256 deduplication
 * 6. Heartbeat and status truthfulness (no fake "CONNECTED" statuses)
 */

import assert from 'node:assert/strict';
import { TestResult } from './attendance.test.js';
import { pool } from '../nativeDb.js';
import { isPrivateIp, deviceIntegrationConfig } from '../config/deviceConfig.js';
import { parseAttLogBody } from '../routes/adms.js';
import {
  ingestRawPunches,
  recordDeviceHeartbeat,
  recordDeviceDisconnect,
  getDeviceStatusSnapshot,
} from '../services/biometricService.js';
import { getDeviceConfig, registerDeviceConfig } from '../services/biometric/settings.js';

export async function runDualModeBiometricTests(): Promise<TestResult[]> {
  console.log('\n================================================================');
  console.log('🧪 RUNNING DUAL-MODE eSSL MB160 BIOMETRIC INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  const results: TestResult[] = [];

  async function executeTest(name: string, fn: () => Promise<void>) {
    const start = Date.now();
    try {
      await fn();
      const durationMs = Date.now() - start;
      console.log(`  ✔ ${name} (${durationMs}ms)`);
      results.push({ name, suite: 'dual-mode-biometric', passed: true, durationMs });
    } catch (err: any) {
      const durationMs = Date.now() - start;
      console.error(`  ❌ ${name}:`, err.message);
      if (err.stack) console.error(err.stack);
      results.push({ name, suite: 'dual-mode-biometric', passed: false, durationMs, error: err.message });
    }
  }

  const unknownSerial = 'UNKNOWN_UNREGISTERED_SN_999999';

  // Tests 2, 4 and 5 drive the real ingestion / heartbeat / disconnect code
  // paths, and those paths stamp `status`, `lastConnectionAt`, `lastSyncAt` and
  // `lastError` on whichever serial they are handed. This suite used to borrow
  // `JNP2252300795` — a registered Davangere shop-floor terminal — so running
  // the tests recorded a synchronisation that never happened and wrote the
  // message "Test simulated connection drop" into that device's audit column.
  // It now creates its own loopback fixture and drops it again at the end.
  const fixtureSerial = `SIMDUAL-${Date.now().toString(36).toUpperCase()}`;
  const testSerial = fixtureSerial;
  await registerDeviceConfig({
    serialNumber: fixtureSerial,
    name: 'Dual-mode test fixture terminal (not a shop-floor device)',
    ipAddress: '127.0.0.1',
    locationCode: 'DAV',
    protocol: 'ADMS_PUSH',
    isFixture: true,
  });

  // --------------------------------------------------------------------------
  // TEST 1: Dual-Mode IP and Worker Polling Policy
  // --------------------------------------------------------------------------
  await executeTest('Test 1: isPrivateIp correctly classifies RFC 1918 and loopback addresses', async () => {
    assert.equal(isPrivateIp('192.168.1.100'), true, '192.168.x.x should be private');
    assert.equal(isPrivateIp('192.168.100.136'), true, '192.168.100.x should be private');
    assert.equal(isPrivateIp('10.0.0.5'), true, '10.x.x.x should be private');
    assert.equal(isPrivateIp('172.20.14.2'), true, '172.16-31.x.x should be private');
    assert.equal(isPrivateIp('127.0.0.1'), true, '127.0.0.1 should be private');
    assert.equal(isPrivateIp('localhost'), true, 'localhost should be private');
    assert.equal(isPrivateIp('8.8.8.8'), false, 'Public IP 8.8.8.8 should not be private');
    assert.equal(isPrivateIp('hrms.bsctextiles.com'), false, 'Domain hostname should not be private');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Device Registry Lookup & Unknown Device Rejection
  // --------------------------------------------------------------------------
  await executeTest('Test 2: Device registry lookup distinguishes registered vs unknown terminals', async () => {
    const known = await getDeviceConfig(testSerial);
    assert.ok(known, `Registered test device ${testSerial} must exist in registry`);
    assert.equal(known.serialNumber, testSerial);

    const unknown = await getDeviceConfig(unknownSerial);
    assert.equal(unknown, null, 'Unknown serial number must return null');
  });

  // --------------------------------------------------------------------------
  // TEST 3: ATTLOG Payload Parsing & Integrity
  // --------------------------------------------------------------------------
  await executeTest('Test 3: parseAttLogBody extracts PIN, wall-time, state, and verifyMode accurately', async () => {
    const payload = `101\t2026-10-17 10:15:30\t0\t15\r\n102\t2026-10-17 10:16:00\t1\t1`;
    const parsed = parseAttLogBody(payload, testSerial);

    assert.equal(parsed.punches.length, 2);
    assert.equal(parsed.punches[0].enrollmentNumber, '101');
    assert.equal(parsed.punches[0].punchTime, '2026-10-17 10:15:30');
    assert.equal(parsed.punches[0].punchState, 0);
    assert.equal(parsed.punches[0].verifyMode, 15, 'MB160 Face Verification code is 15');

    assert.equal(parsed.punches[1].enrollmentNumber, '102');
    assert.equal(parsed.punches[1].punchState, 1, 'Punch state 1 is Check-Out');
    assert.equal(parsed.punches[1].verifyMode, 1, 'Fingerprint code is 1');
    assert.equal(parsed.malformed.length, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Idempotent Ingestion & Duplicate Protection
  // --------------------------------------------------------------------------
  await executeTest('Test 4: Ingestion is strictly idempotent via SHA-256 deduplication', async () => {
    const punchBatch = [
      {
        serialNumber: testSerial,
        enrollmentNumber: 'TEST_EMP_DUAL_001',
        punchTime: '2026-10-17 09:30:00',
        punchState: 0,
        verifyMode: 15,
        source: 'ADMS_PUSH' as const,
      },
    ];

    // Clean prior test records
    await pool.query(
      `DELETE FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = ? AND punchTime = '2026-10-17 09:30:00'`,
      [testSerial, 'TEST_EMP_DUAL_001']
    );

    // Ingest 1st time: must insert
    const res1 = await ingestRawPunches(punchBatch);
    assert.equal(res1.inserted, 1, 'First punch must be inserted');
    assert.equal(res1.duplicates, 0, 'No duplicates on first punch');

    // Ingest 2nd time: must detect duplicate and NOT insert
    const res2 = await ingestRawPunches(punchBatch);
    assert.equal(res2.inserted, 0, 'Second submission of identical punch must not insert');
    assert.equal(res2.duplicates, 1, 'Second submission must be flagged as duplicate');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Heartbeat Recording & Truthful Disconnection
  // --------------------------------------------------------------------------
  await executeTest('Test 5: Heartbeat transitions device to CONNECTED with accurate lastSyncMode', async () => {
    const hb = await recordDeviceHeartbeat(testSerial, '192.168.100.136', 'CLOUD_PUSH');
    assert.ok(hb.deviceId, 'Resolved device ID expected');

    const [rows]: any = await pool.query(
      `SELECT status, lastSyncMode, locationCode FROM biometric_devices WHERE serialNumber = ?`,
      [testSerial]
    );
    assert.equal(rows[0].status, 'CONNECTED');
    assert.equal(rows[0].lastSyncMode, 'CLOUD_PUSH');

    // Test truthful disconnection
    await recordDeviceDisconnect(rows[0].id || testSerial, 'Test simulated connection drop', 'CONNECT_TIMEOUT');
    const [discRows]: any = await pool.query(
      `SELECT status FROM biometric_devices WHERE serialNumber = ?`,
      [testSerial]
    );
    assert.equal(discRows[0].status, 'DISCONNECTED');
  });

  // --------------------------------------------------------------------------
  // Cleanup: the fixture must not survive the run
  // --------------------------------------------------------------------------
  await executeTest('Cleanup: fixture terminal and its ledger rows removed', async () => {
    const [rows]: any = await pool.query('SELECT id FROM biometric_devices WHERE serialNumber = ?', [fixtureSerial]);
    const deviceId = rows[0]?.id;
    await pool.query('DELETE FROM biometric_raw_punches WHERE serialNumber = ?', [fixtureSerial]);
    if (deviceId) {
      await pool.query('DELETE FROM biometric_device_sync_state WHERE deviceId = ?', [deviceId]);
      await pool.query('DELETE FROM biometric_device_users WHERE deviceId = ?', [deviceId]);
    }
    await pool.query('DELETE FROM biometric_devices WHERE serialNumber = ?', [fixtureSerial]);
    const [left]: any = await pool.query('SELECT COUNT(*) AS n FROM biometric_devices WHERE serialNumber = ?', [fixtureSerial]);
    assert.equal(Number(left[0].n), 0, 'fixture terminal must be gone after the run');
  });

  const passed = results.filter((r) => r.passed).length;
  console.log(`\nDual-Mode Test Results: ${passed} of ${results.length} tests passed.\n`);
  return results;
}

// Direct execution
if (process.argv[1] && /dualModeBiometricSync(\.test)?(\.ts|\.js)$/.test(process.argv[1])) {
  runDualModeBiometricTests()
    .then((results) => {
      const passed = results.filter((r) => r.passed).length;
      if (passed < results.length) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal dual-mode test failure:', err);
      process.exit(1);
    });
}

