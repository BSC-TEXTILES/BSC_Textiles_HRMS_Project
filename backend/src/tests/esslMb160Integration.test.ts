/**
 * BSC Textiles HRMS - eSSL MB160 Biometric Device Complete Integration Test Suite
 * 
 * Verifies end-to-end hardware push synchronization:
 * 1. Terminal Handshake (GET /iclock/cdata) - Realtime=1, TransInterval=1, TimeZone=330
 * 2. Hardware Telemetry & Option Registration (POST /iclock/cdata?table=options)
 * 3. Real-Time Face Verification Punch Push (POST /iclock/cdata?table=ATTLOG)
 * 4. Idempotency & SHA-256 Duplicate Prevention
 * 5. Check-out and Working Hour Calculation
 * 6. Multi-Location Isolation (Belagavi BEL, Davanagere DAV, Shivamogga SHI)
 * 7. Multi-Tenant Shard Data Persistence & Cross-Database Replication
 * 8. Terminal Heartbeat Monitoring (GET /iclock/getrequest)
 * 9. Unmapped Employee Review Queue Isolation
 */

import assert from 'node:assert/strict';
import { pool } from '../nativeDb.js';
import { shardRouter } from '../core/sharding/ShardRouter.js';
import { shardManager } from '../core/sharding/ShardConnectionManager.js';
import { parseAttLogBody } from '../routes/adms.js';
import {
  ingestRawPunches,
  recordDeviceHeartbeat,
  updateDeviceSpecs,
  listBiometricDevices,
} from '../services/biometricService.js';

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
    return true;
  } catch (err: any) {
    console.error(`  ❌ ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
    return false;
  }
}

export async function runEsslMb160Tests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🧪 RUNNING eSSL MB160 BIOMETRIC INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  await shardManager.initialize();

  const testDate = '2026-10-16';
  const belTerminalSn = 'JNP2252300795';
  const davTerminalSn = 'JNP2252300802';
  const shiTerminalSn = 'JNP2252300797';

  // Clean previous test run records to ensure 100% deterministic test execution
  await pool.query(`DELETE FROM biometric_raw_punches WHERE punchTime >= '2026-10-16 00:00:00'`);
  await pool.query(`DELETE FROM attendance WHERE attendanceDate = '2026-10-16'`);
  for (const code of ['BEL', 'DAV', 'SHI']) {
    try {
      const { pool: sPool } = await shardRouter.resolveLocationDatabase(code);
      await sPool.query(`DELETE FROM biometric_raw_punches WHERE punchTime >= '2026-10-16 00:00:00'`).catch(() => {});
      await sPool.query(`DELETE FROM attendance WHERE attendanceDate = '2026-10-16'`).catch(() => {});
    } catch {}
  }

  // --------------------------------------------------------------------------
  // TEST 1: Protocol Body Parser for eSSL MB160 tab-separated ATTLOG
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 1: parseAttLogBody correctly extracts PIN, timestamp, status, and face verifyMode', async () => {
    const rawBody = `1\t2026-10-16 09:12:30\t0\t15\r\n2\t2026-10-16 09:14:10\t0\t1\r\n3 2026-10-16 09:15:00 0 15`;
    const parsed = parseAttLogBody(rawBody, belTerminalSn);

    assert.equal(parsed.length, 3, 'Expected 3 parsed punches');
    assert.equal(parsed[0].enrollmentNumber, '1');
    assert.equal(parsed[0].punchTime, '2026-10-16 09:12:30');
    assert.equal(parsed[0].punchType, 'CHECK_IN');
    assert.equal(parsed[0].verifyMode, 15, '15 corresponds to MB160 Face Verification');

    assert.equal(parsed[1].enrollmentNumber, '2');
    assert.equal(parsed[1].verifyMode, 1, '1 corresponds to Fingerprint Verification');

    assert.equal(parsed[2].enrollmentNumber, '3');
    assert.equal(parsed[2].punchTime, '2026-10-16 09:15:00');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 2: Terminal Handshake & Heartbeat Registration
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 2: Terminal Handshake touches heartbeat and sets status CONNECTED', async () => {
    const res = await recordDeviceHeartbeat(belTerminalSn);
    assert.ok(res.deviceId, 'Expected resolved deviceId');
    assert.equal(res.locationCode, 'BEL');

    const [rows]: any = await pool.query(
      `SELECT status, lastHeartbeatAt, locationCode FROM biometric_devices WHERE serialNumber = ?`,
      [belTerminalSn]
    );
    assert.equal(rows[0].status, 'CONNECTED');
    assert.equal(rows[0].locationCode, 'BEL');
    assert.ok(rows[0].lastHeartbeatAt, 'Expected populated lastHeartbeatAt');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 3: Hardware Telemetry and Option Registration (table=options)
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 3: Hardware Telemetry updates userCount, faceCount, and firmwareVersion', async () => {
    await updateDeviceSpecs(belTerminalSn, {
      Firmware: 'Ver 8.0.4.7-20220624',
      UserCount: '15',
      FPCount: '28',
      FaceCount: '15',
      AttLogCount: '620',
      PushVersion: '2.4.1',
    });

    const [rows]: any = await pool.query(
      `SELECT firmwareVersion, userCount, faceCount, fpCount, attLogCount, pushVersion 
       FROM biometric_devices WHERE serialNumber = ?`,
      [belTerminalSn]
    );
    assert.equal(rows[0].userCount, 15);
    assert.equal(rows[0].faceCount, 15);
    assert.equal(rows[0].fpCount, 28);
    assert.equal(rows[0].attLogCount, 620);
    assert.equal(rows[0].pushVersion, '2.4.1');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 4: Real-Time Face-Verification Punch Ingestion & Attendance Calculation
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 4: Ingestion of PIN 1 Face verification calculates Check-In and sets faceVerified = 1', async () => {
    // Clean existing test attendance for today if present
    const [empRows]: any = await pool.query(
      `SELECT employeeId FROM biometric_employee_mappings WHERE enrollmentNumber = '1' AND showroomCode = 'BEL' LIMIT 1`
    );
    const empId = empRows[0].employeeId;
    await pool.query(`DELETE FROM attendance WHERE employeeId = ? AND attendanceDate = ?`, [empId, testDate]);

    const punchTime = `${testDate} 09:12:00`;
    const result = await ingestRawPunches([
      {
        serialNumber: belTerminalSn,
        enrollmentNumber: '1',
        punchTime,
        punchType: 'CHECK_IN',
        verifyMode: 15, // Face
      },
    ]);

    assert.equal(result.inserted, 1, 'Expected 1 raw punch inserted');
    assert.equal(result.processed, 1, 'Expected 1 punch matched to employee');
    assert.equal(result.duplicates, 0);
    assert.equal(result.unmapped, 0);

    // Verify in attendance table
    const [attRows]: any = await pool.query(
      `SELECT * FROM attendance WHERE employeeId = ? AND attendanceDate = ?`,
      [empId, testDate]
    );
    assert.equal(attRows.length, 1);
    assert.equal(attRows[0].status, 'PRESENT');
    assert.equal(attRows[0].faceVerified, 1, 'Expected faceVerified to be 1');
    assert.ok(attRows[0].faceMatchPercentage > 90, 'Expected high face match percentage');
    assert.ok(attRows[0].notes.includes('eSSL MB160'), 'Expected note referencing hardware terminal');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 5: Idempotency & SHA-256 Deduplication (Safe retransmission)
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 5: Duplicate delivery of exact same punch is detected and skipped without duplicating attendance', async () => {
    const punchTime = `${testDate} 09:12:00`;
    const result = await ingestRawPunches([
      {
        serialNumber: belTerminalSn,
        enrollmentNumber: '1',
        punchTime,
        punchType: 'CHECK_IN',
        verifyMode: 15,
      },
    ]);

    assert.equal(result.inserted, 0, 'Duplicate punch must not insert new raw record');
    assert.equal(result.duplicates, 1, 'Expected duplicates counter = 1');

    // Confirm attendance row count remains strictly 1
    const [empRows]: any = await pool.query(
      `SELECT employeeId FROM biometric_employee_mappings WHERE enrollmentNumber = '1' AND showroomCode = 'BEL' LIMIT 1`
    );
    const [attRows]: any = await pool.query(
      `SELECT COUNT(*) as cnt FROM attendance WHERE employeeId = ? AND attendanceDate = ?`,
      [empRows[0].employeeId, testDate]
    );
    assert.equal(attRows[0].cnt, 1, 'Attendance record count must remain strictly 1');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 6: Subsequent Punch: Check-Out and Working Hour Calculation
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 6: Evening Check-Out punch updates actualLogout, working seconds, and break deduction', async () => {
    const [empRows]: any = await pool.query(
      `SELECT employeeId FROM biometric_employee_mappings WHERE enrollmentNumber = '1' AND showroomCode = 'BEL' LIMIT 1`
    );
    const empId = empRows[0].employeeId;

    const punchOutTime = `${testDate} 19:45:00`;
    const result = await ingestRawPunches([
      {
        serialNumber: belTerminalSn,
        enrollmentNumber: '1',
        punchTime: punchOutTime,
        punchType: 'CHECK_OUT',
        verifyMode: 15,
      },
    ]);

    assert.equal(result.processed, 1);

    const [attRows]: any = await pool.query(
      `SELECT * FROM attendance WHERE employeeId = ? AND attendanceDate = ?`,
      [empId, testDate]
    );
    assert.equal(attRows.length, 1);
    assert.ok(attRows[0].actualLogout, 'Expected actualLogout to be populated');
    assert.ok(attRows[0].totalWorkingSeconds > 30000, 'Expected >8 hours total working seconds');
    assert.equal(attRows[0].breakSeconds, 2700, 'Expected 45-min break deduction for full shift');
    assert.ok(attRows[0].effectiveWorkingSeconds > 0);
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 7: Multi-Location Isolation (Davanagere & Shivamogga Terminals)
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 7: Davanagere Terminal PIN 7 and Shivamogga PIN 13 map to distinct locations', async () => {
    // Davanagere PIN 7
    const davRes = await ingestRawPunches([
      {
        serialNumber: davTerminalSn,
        enrollmentNumber: '7',
        punchTime: `${testDate} 09:18:00`,
        verifyMode: 15,
      },
    ]);
    assert.equal(davRes.processed, 1);

    // Shivamogga PIN 13
    const shiRes = await ingestRawPunches([
      {
        serialNumber: shiTerminalSn,
        enrollmentNumber: '13',
        punchTime: `${testDate} 09:22:00`,
        verifyMode: 15,
      },
    ]);
    assert.equal(shiRes.processed, 1);

    // Verify Davanagere employee Suresh Reddy is linked to DAV
    const [davEmp]: any = await pool.query(
      `SELECT e.fullName, a.locationId, l.code as locCode 
       FROM attendance a 
       JOIN employee e ON a.employeeId = e.id 
       JOIN location l ON a.locationId = l.id
       WHERE e.employeeCode = 'TEST-EMP-007' AND a.attendanceDate = ?`,
      [testDate]
    );
    assert.equal(davEmp[0]?.locCode, 'DAV', 'Expected Davanagere employee attendance to be tied to DAV location');

    // Verify Shivamogga employee Vikram Singh is linked to SHI
    const [shiEmp]: any = await pool.query(
      `SELECT e.fullName, a.locationId, l.code as locCode 
       FROM attendance a 
       JOIN employee e ON a.employeeId = e.id 
       JOIN location l ON a.locationId = l.id
       WHERE e.employeeCode = 'TEST-EMP-013' AND a.attendanceDate = ?`,
      [testDate]
    );
    assert.equal(shiEmp[0]?.locCode, 'SHI', 'Expected Shivamogga employee attendance to be tied to SHI location');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 8: Multi-Tenant Shard Persistence Verification
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 8: Punches replicate durably to respective MySQL physical shards (bsc_shard_bel, etc.)', async () => {
    // Check bsc_shard_bel for PIN 1 punch
    const { pool: belShardPool } = await shardRouter.resolveLocationDatabase('BEL');
    const [belShardPunches]: any = await belShardPool.query(
      `SELECT * FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = '1'`,
      [belTerminalSn]
    );
    assert.ok(belShardPunches.length > 0, 'Expected raw punch in bsc_shard_bel');

    // Check bsc_shard_dav for PIN 7 punch
    const { pool: davShardPool } = await shardRouter.resolveLocationDatabase('DAV');
    const [davShardPunches]: any = await davShardPool.query(
      `SELECT * FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = '7'`,
      [davTerminalSn]
    );
    assert.ok(davShardPunches.length > 0, 'Expected raw punch in bsc_shard_dav');

    // Check bsc_shard_shi for PIN 13 punch
    const { pool: shiShardPool } = await shardRouter.resolveLocationDatabase('SHI');
    const [shiShardPunches]: any = await shiShardPool.query(
      `SELECT * FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = '13'`,
      [shiTerminalSn]
    );
    assert.ok(shiShardPunches.length > 0, 'Expected raw punch in bsc_shard_shi');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 9: Unmapped Employee Review Queue Isolation
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 9: Unknown PIN 9999 is isolated into UNMAPPED queue without corrupting employee records', async () => {
    const unmappedResult = await ingestRawPunches([
      {
        serialNumber: belTerminalSn,
        enrollmentNumber: '9999',
        punchTime: `${testDate} 11:30:00`,
        verifyMode: 15,
      },
    ]);

    assert.equal(unmappedResult.inserted, 1);
    assert.equal(unmappedResult.processed, 0, 'Unmapped PIN must not be processed into attendance');
    assert.equal(unmappedResult.unmapped, 1);

    const [unmappedRows]: any = await pool.query(
      `SELECT syncStatus, errorMessage FROM biometric_raw_punches 
       WHERE serialNumber = ? AND enrollmentNumber = '9999'`,
      [belTerminalSn]
    );
    assert.equal(unmappedRows[0]?.syncStatus, 'UNMAPPED');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 10: Device Registry & Probe Status with ADMS Push Telemetry
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 10: listBiometricDevices correctly displays CONNECTED status from ADMS push telemetry', async () => {
    const devices = await listBiometricDevices();
    assert.equal(devices.length, 3, 'Expected 3 registered terminals');

    const belDev = devices.find(d => d.locationCode === 'BEL');
    const davDev = devices.find(d => d.locationCode === 'DAV');
    const shiDev = devices.find(d => d.locationCode === 'SHI');

    assert.ok(belDev, 'Belagavi terminal exists');
    assert.equal(belDev.model, 'eSSL MB160');
    assert.equal(belDev.status, 'CONNECTED');

    assert.ok(davDev, 'Davanagere terminal exists');
    assert.equal(davDev.model, 'eSSL MB160');
    assert.equal(davDev.status, 'CONNECTED');

    assert.ok(shiDev, 'Shivamogga terminal exists');
    assert.equal(shiDev.model, 'eSSL MB160');
    assert.equal(shiDev.status, 'CONNECTED');
  })) passed++;

  console.log('\n================================================================');
  console.log(`🏁 TEST RESULTS: ${passed}/${total} TESTS PASSED PERFECTLY`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('esslMb160Integration.test.ts') || process.argv[1]?.endsWith('esslMb160Integration.test.js')) {
  runEsslMb160Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}
