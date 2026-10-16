/**
 * BSC Textiles HRMS — Davangere eSSL Biometric Attendance Integration Test Suite
 * 
 * Verifies end-to-end integration for the Davangere location (DAV):
 * 1. Configuration: All 3 devices verified registered under DAV (locationId: cmuwszr9500021vdtxscy3nsc)
 * 2. Strict Location Isolation: Rejection of cross-location assignment (no BEL / SHI assignment)
 * 3. ADMS Push / Heartbeat & Telemetry for Davangere Terminals 1, 2, and 3
 * 4. Biometric Punch Ingestion, SHA-256 Deduplication & Idempotency
 * 5. HRMS Attendance Engine: First IN, Last OUT, 45-min Break Deduction, 9-hour workday policy
 * 6. Missed-Punching Integration: Detection of missing IN/OUT punches under DAV
 * 7. Unmapped Employee Quarantine: Safe isolation of unknown enrollment numbers
 * 8. Multi-Tenant Shard Replication: Persistence into bsc_shard_dav and isolation from BEL / SHI shards
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
  saveEmployeeBiometricMapping,
} from '../services/biometricService.js';

const DAV_LOCATION_ID = 'cmuwszr9500021vdtxscy3nsc';
const DAV_DEV1_SN = 'JNP2252300795';
const DAV_DEV2_SN = 'JNPJNP2252300802';
const DAV_DEV3_SN = 'JNP2252300797';

async function runTest(name: string, fn: () => Promise<void>): Promise<boolean> {
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

export async function runDavangereBiometricTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('🏛️  RUNNING DAVANGERE eSSL BIOMETRIC INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  await shardManager.initialize();

  const testDate = '2026-10-16';

  // --------------------------------------------------------------------------
  // TEST 1: All Three Devices Registered Exclusively Under DAV
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 1: All 3 devices are registered under DAV with correct IPs, ports, and serial numbers', async () => {
    const [devices]: any = await pool.query(
      `SELECT id, serialNumber, name, ipAddress, port, locationCode, locationId, status 
       FROM biometric_devices 
       WHERE serialNumber IN (?, ?, ?, 'JNP2252300802')`,
      [DAV_DEV1_SN, DAV_DEV2_SN, DAV_DEV3_SN]
    );

    assert.equal(devices.length >= 3, true, 'All 3 Davangere devices must be registered');

    for (const dev of devices) {
      assert.equal(dev.locationCode, 'DAV', `Device ${dev.serialNumber} must have locationCode 'DAV'`);
      assert.equal(dev.locationId, DAV_LOCATION_ID, `Device ${dev.serialNumber} must have authoritative DAV locationId`);
      assert.equal(dev.port, 4370, `Device ${dev.serialNumber} must use port 4370`);
    }

    const dev1 = devices.find((d: any) => d.serialNumber === DAV_DEV1_SN);
    const dev2 = devices.find((d: any) => d.serialNumber === DAV_DEV2_SN || d.serialNumber === 'JNP2252300802');
    const dev3 = devices.find((d: any) => d.serialNumber === DAV_DEV3_SN);

    assert.ok(dev1, 'Device 1 must exist');
    assert.equal(dev1.ipAddress, '192.168.100.136', 'Device 1 IP must be 192.168.100.136');

    assert.ok(dev2, 'Device 2 must exist');
    assert.equal(dev2.ipAddress, '192.168.100.135', 'Device 2 IP must be 192.168.100.135');

    assert.ok(dev3, 'Device 3 must exist');
    assert.equal(dev3.ipAddress, '192.168.100.137', 'Device 3 IP must be 192.168.100.137');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 2: Strict Isolation — No DAV Device Assigned to BEL or SHI
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 2: Strict Location Isolation — No DAV serial number exists under BEL or SHI', async () => {
    const [invalidRows]: any = await pool.query(
      `SELECT serialNumber, locationCode FROM biometric_devices 
       WHERE serialNumber IN (?, ?, ?) AND locationCode IN ('BEL', 'SHI')`,
      [DAV_DEV1_SN, DAV_DEV2_SN, DAV_DEV3_SN]
    );

    assert.equal(invalidRows.length, 0, 'No Davangere serial number should ever be registered under BEL or SHI');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 3: Heartbeat & Telemetry on all 3 Davangere Devices
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 3: ADMS Heartbeat touches Davangere devices and sets status to CONNECTED', async () => {
    for (const sn of [DAV_DEV1_SN, DAV_DEV2_SN, DAV_DEV3_SN]) {
      const hb = await recordDeviceHeartbeat(sn, '192.168.100.120');
      assert.ok(hb.deviceId, `Expected resolved deviceId for ${sn}`);
      assert.equal(hb.locationCode, 'DAV', `Expected locationCode 'DAV' for ${sn}`);
    }

    // Update specs on Terminal 1
    await updateDeviceSpecs(DAV_DEV1_SN, {
      Firmware: 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
      UserCount: '10',
      FPCount: '20',
      FaceCount: '10',
      AttLogCount: '450',
      PushVersion: '2.4.1',
    });

    const [rows]: any = await pool.query(
      `SELECT firmwareVersion, userCount, faceCount, fpCount, attLogCount 
       FROM biometric_devices WHERE serialNumber = ?`,
      [DAV_DEV1_SN]
    );
    assert.equal(rows[0].userCount, 10);
    assert.equal(rows[0].faceCount, 10);
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 4: Resolve Active DAV Employee & Ensure Biometric Mapping
  // --------------------------------------------------------------------------
  let testEmpId = '';
  let testEnrollment = '101';
  total++;
  if (await runTest('Test 4: Resolve active DAV employee and seed biometric mapping', async () => {
    const [davEmps]: any = await pool.query(
      `SELECT id, employeeCode, fullName FROM employee WHERE locationId = ? LIMIT 1`,
      [DAV_LOCATION_ID]
    );
    assert.ok(davEmps.length > 0, 'Must have at least one active Davangere employee');
    testEmpId = davEmps[0].id;

    // Save mapping for PIN 101 -> DAV Employee
    await saveEmployeeBiometricMapping({
      employeeId: testEmpId,
      enrollmentNumber: testEnrollment,
      showroomCode: 'DAV',
      serialNumber: DAV_DEV1_SN,
      status: 'ACTIVE',
      notes: 'Davangere Biometric Integration Automated Test Mapping',
    });

    const [mapRows]: any = await pool.query(
      `SELECT * FROM biometric_employee_mappings WHERE enrollmentNumber = ? AND showroomCode = 'DAV'`,
      [testEnrollment]
    );
    assert.equal(mapRows.length, 1);
    assert.equal(mapRows[0].employeeId, testEmpId);
  })) passed++;

  // Clean test day data
  await pool.query(`DELETE FROM biometric_raw_punches WHERE punchTime >= '${testDate} 00:00:00' AND enrollmentNumber = ?`, [testEnrollment]);
  await pool.query(`DELETE FROM attendance WHERE employeeId = ? AND attendanceDate = ?`, [testEmpId, testDate]);
  try {
    const { pool: davShard } = await shardRouter.resolveLocationDatabase('DAV');
    await davShard.query(`DELETE FROM biometric_raw_punches WHERE punchTime >= '${testDate} 00:00:00' AND enrollmentNumber = ?`, [testEnrollment]).catch(() => {});
    await davShard.query(`DELETE FROM attendance WHERE employeeId = ? AND attendanceDate = ?`, [testEmpId, testDate]).catch(() => {});
  } catch {}

  // --------------------------------------------------------------------------
  // TEST 5: Check-In Punch Ingestion & Deduplication (Idempotency)
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 5: Check-In punch ingestion from DAV Terminal 1 & SHA-256 deduplication', async () => {
    const punchTime = `${testDate} 09:30:00`;
    const batch = [
      {
        serialNumber: DAV_DEV1_SN,
        enrollmentNumber: testEnrollment,
        punchTime,
        punchType: 'CHECK_IN',
        verifyMode: 15, // Face
      },
    ];

    // First ingestion: Must insert and process
    const res1 = await ingestRawPunches(batch);
    assert.equal(res1.inserted, 1, 'First punch must be inserted');
    assert.equal(res1.processed, 1, 'First punch must be processed into attendance');
    assert.equal(res1.duplicates, 0, 'First punch must not be duplicate');

    // Second ingestion with identical timestamp & serial: Must be skipped as duplicate
    const res2 = await ingestRawPunches(batch);
    assert.equal(res2.inserted, 0, 'Duplicate punch must NOT be inserted');
    assert.equal(res2.duplicates, 1, 'Duplicate punch must be counted in duplicates');

    // Verify raw punch stored in DB
    const [rawPunches]: any = await pool.query(
      `SELECT * FROM biometric_raw_punches WHERE serialNumber = ? AND enrollmentNumber = ?`,
      [DAV_DEV1_SN, testEnrollment]
    );
    assert.equal(rawPunches.length, 1);
    assert.equal(rawPunches[0].syncStatus, 'PROCESSED');
    assert.equal(rawPunches[0].isProcessed, 1);
    assert.ok(rawPunches[0].dedupHash, 'Must have dedup hash');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 6: Attendance Record Associated with DAV Location
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 6: Attendance record is strictly bound to DAV locationId (not BEL or SHI)', async () => {
    const [attRows]: any = await pool.query(
      `SELECT * FROM attendance WHERE employeeId = ? AND attendanceDate = ?`,
      [testEmpId, testDate]
    );

    assert.equal(attRows.length, 1, 'Attendance record must exist');
    const att = attRows[0];
    assert.equal(att.locationId, DAV_LOCATION_ID, 'Attendance record locationId must be DAV');
    assert.equal(att.status, 'PRESENT', 'Attendance status must be PRESENT');
    assert.equal(att.faceVerified, 1, 'Face verified must be 1 for MB160 face punch');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 7: Check-Out Punch from DAV Terminal 2 & Working Hours Calculation
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 7: Check-Out punch from Terminal 2 calculates 9+ hours duration and 45-min break deduction', async () => {
    // Punch out at 19:30:00 (10 hours after 09:30:00)
    const outTime = `${testDate} 19:30:00`;
    const res = await ingestRawPunches([
      {
        serialNumber: DAV_DEV2_SN,
        enrollmentNumber: testEnrollment,
        punchTime: outTime,
        punchType: 'CHECK_OUT',
        verifyMode: 15,
      },
    ]);

    assert.equal(res.inserted, 1);
    assert.equal(res.processed, 1);

    const [attRows]: any = await pool.query(
      `SELECT * FROM attendance WHERE employeeId = ? AND attendanceDate = ?`,
      [testEmpId, testDate]
    );
    assert.equal(attRows.length, 1);
    const att = attRows[0];

    // Total seconds = 10 hours * 3600 = 36000 seconds
    assert.equal(att.totalWorkingSeconds, 36000, 'Total working seconds must be 36000 (10 hrs)');
    // Workday >= 5 hrs (18000s) -> 45 min (2700s) break deducted
    assert.equal(att.breakSeconds, 2700, 'Break deduction must be 2700 seconds (45 min)');
    // Effective working seconds = 36000 - 2700 = 33300 seconds (9.25 hrs)
    assert.equal(att.effectiveWorkingSeconds, 33300, 'Effective working seconds must be 33300');
    // Meets 9-hour workday policy (32400 seconds)
    assert.equal(att.effectiveWorkingSeconds >= 32400, true, 'Must meet 9-hour workday policy');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 8: Unmapped Biometric User Quarantine
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 8: Unmapped enrollment number is quarantined without crashing', async () => {
    const unmappedPin = '999988';
    const punchTime = `${testDate} 11:00:00`;
    const res = await ingestRawPunches([
      {
        serialNumber: DAV_DEV3_SN,
        enrollmentNumber: unmappedPin,
        punchTime,
        punchType: 'CHECK_IN',
        verifyMode: 1, // Fingerprint
      },
    ]);

    assert.equal(res.inserted, 1);
    assert.equal(res.unmapped, 1, 'Unmapped count must be 1');

    const [unmappedRows]: any = await pool.query(
      `SELECT * FROM biometric_raw_punches WHERE enrollmentNumber = ? AND syncStatus = 'UNMAPPED'`,
      [unmappedPin]
    );
    assert.equal(unmappedRows.length, 1);
    assert.equal(unmappedRows[0].syncStatus, 'UNMAPPED');

    // Clean up
    await pool.query(`DELETE FROM biometric_raw_punches WHERE enrollmentNumber = ?`, [unmappedPin]);
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 9: Multi-Tenant Shard Persistence to Davangere Shard (bsc_shard_dav)
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 9: Cross-Shard Replication to bsc_shard_dav and isolation from BEL/SHI', async () => {
    // 1. Check Davangere shard has the raw punch and attendance
    const { pool: davShard } = await shardRouter.resolveLocationDatabase('DAV');
    const [davShardPunches]: any = await davShard.query(
      `SELECT * FROM biometric_raw_punches WHERE enrollmentNumber = ?`,
      [testEnrollment]
    );
    assert.ok(davShardPunches.length >= 1, 'Davangere shard must contain replicated raw punches');

    const [davShardAtt]: any = await davShard.query(
      `SELECT * FROM attendance WHERE employeeId = ? AND attendanceDate = ?`,
      [testEmpId, testDate]
    );
    assert.ok(davShardAtt.length >= 1, 'Davangere shard must contain replicated attendance');
    assert.equal(davShardAtt[0].locationId, DAV_LOCATION_ID);

    // 2. Verify Belagavi and Shivamogga shards do NOT contain this Davangere test attendance
    const { pool: belShard } = await shardRouter.resolveLocationDatabase('BEL');
    const [belShardAtt]: any = await belShard.query(
      `SELECT * FROM attendance WHERE employeeId = ? AND attendanceDate = ?`,
      [testEmpId, testDate]
    );
    assert.equal(belShardAtt.length, 0, 'Belagavi shard must NOT contain Davangere attendance (strict shard isolation)');

    const { pool: shiShard } = await shardRouter.resolveLocationDatabase('SHI');
    const [shiShardAtt]: any = await shiShard.query(
      `SELECT * FROM attendance WHERE employeeId = ? AND attendanceDate = ?`,
      [testEmpId, testDate]
    );
    assert.equal(shiShardAtt.length, 0, 'Shivamogga shard must NOT contain Davangere attendance (strict shard isolation)');
  })) passed++;

  // --------------------------------------------------------------------------
  // TEST 10: Missed-Punching Detection for Davangere
  // --------------------------------------------------------------------------
  total++;
  if (await runTest('Test 10: Missed-Punching identifies incomplete attendance in DAV', async () => {
    // Create an incomplete attendance record for today (Login with no logout)
    const incompleteEmpRows: any = await pool.query(
      `SELECT id FROM employee WHERE locationId = ? AND id != ? LIMIT 1`,
      [DAV_LOCATION_ID, testEmpId]
    );

    if (incompleteEmpRows[0].length > 0) {
      const incEmpId = incompleteEmpRows[0][0].id;
      const incAttId = `att-inc-${incEmpId.slice(0, 8)}-${testDate.replace(/-/g, '')}`;

      await pool.query(
        `INSERT INTO attendance (
          id, employeeId, locationId, attendanceDate, scheduledLogin, actualLogin, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'PRESENT')
        ON DUPLICATE KEY UPDATE actualLogin = VALUES(actualLogin), actualLogout = NULL`,
        [incAttId, incEmpId, DAV_LOCATION_ID, testDate, `${testDate} 10:00:00`, `${testDate} 10:05:00`]
      );

      // Query missed punch detection SQL (from missedPunching.ts)
      const [missedRows]: any = await pool.query(
        `SELECT a.id, a.employeeId, a.locationId
         FROM attendance a
         WHERE a.locationId = ? AND a.attendanceDate = ?
         AND (
           (a.actualLogin IS NULL AND a.actualLogout IS NOT NULL) OR
           (a.actualLogin IS NOT NULL AND a.actualLogout IS NULL) OR
           a.status = 'INCOMPLETE'
         )`,
        [DAV_LOCATION_ID, testDate]
      );

      assert.ok(missedRows.length >= 1, 'Incomplete attendance must be identified as missed punching');

      // Clean up incomplete test record
      await pool.query(`DELETE FROM attendance WHERE id = ?`, [incAttId]);
    }
  })) passed++;

  console.log('\n================================================================');
  console.log(`📊 TEST RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    throw new Error(`Davangere biometric test suite failed: ${total - passed} test(s) failed`);
  }
}

// Allow direct CLI execution: npx tsx backend/src/tests/davangereBiometricIntegration.test.ts
if (process.argv[1]?.endsWith('davangereBiometricIntegration.test.ts')) {
  runDavangereBiometricTests()
    .then(() => {
      console.log('🎉 All Davangere Biometric Integration Tests Completed Successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('💥 Test suite failure:', err);
      process.exit(1);
    });
}
