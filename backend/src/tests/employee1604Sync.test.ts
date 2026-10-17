import { pool } from '../nativeDb.js';
import { ingestRawPunches, probeDeviceSocket } from '../services/biometricService.js';
import jwt from 'jsonwebtoken';

async function runTests() {
  console.log('=== [TEST SUITE] Employee 1604 Full Biometric Attendance Verification ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Verify Employee 1604 identity and Davanagere location
    const [empRows]: any = await pool.query(
      `SELECT e.id, e.employeeCode, e.fullName, e.locationId, l.code as locationCode, s.name as shiftName
       FROM employee e
       LEFT JOIN location l ON e.locationId = l.id
       LEFT JOIN shift s ON e.shiftId = s.id
       WHERE e.employeeCode = '1604' OR e.id = 'emp_bsc_1604'`
    );
    assert(empRows.length > 0, 'Employee 1604 exists in database');
    assert(empRows[0]?.fullName === 'Gagan C B', `Employee 1604 resolves to 'Gagan C B' (got: ${empRows[0]?.fullName})`);
    assert(empRows[0]?.locationCode === 'DAV', `Employee location is Davanagere ('DAV') (got: ${empRows[0]?.locationCode})`);

    // 2. Verify Davanagere Biometric Devices
    const [devices]: any = await pool.query(
      `SELECT serialNumber, name, ipAddress, port, locationCode FROM biometric_devices WHERE locationCode = 'DAV'`
    );
    assert(devices.length >= 3, `All 3 Davanagere devices registered in database (found: ${devices.length})`);
    const snList = devices.map((d: any) => d.serialNumber);
    assert(snList.some((s: string) => s.includes('0795')), 'Device 1 (JNP2252300795) registered');
    assert(snList.some((s: string) => s.includes('0802')), 'Device 2 (JNPJNP2252300802) registered');
    assert(snList.some((s: string) => s.includes('0797')), 'Device 3 (JNP2252300797) registered');

    // 3. Verify Biometric Employee Mappings
    const [mappings]: any = await pool.query(
      `SELECT * FROM biometric_employee_mappings WHERE enrollmentNumber = '1604' AND showroomCode = 'DAV' AND status = 'ACTIVE'`
    );
    assert(mappings.length >= 1, `Biometric mapping exists for Employee 1604 under showroom DAV (found: ${mappings.length})`);
    assert(mappings[0]?.employeeId === 'emp_bsc_1604', 'Biometric mapping points to emp_bsc_1604');

    // 4. Test Ingestion and Strict Deduplication
    const testPunchTime = '2026-10-16T05:00:00.000Z';
    const testPunches = [
      {
        serialNumber: 'JNP2252300795',
        enrollmentNumber: '1604',
        punchTime: testPunchTime,
        punchType: 'CHECK_IN',
        verifyMode: 15,
      },
    ];

    const ingest1 = await ingestRawPunches(testPunches);
    const ingest2 = await ingestRawPunches(testPunches);
    assert(ingest2.duplicates >= 1 && ingest2.inserted === 0, 'Deduplication works: identical punch is rejected with zero duplicate insertion');

    // 5. Test Dedicated Employee Attendance API
    const loginRes = await fetch('http://127.0.0.1:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@bsctextiles.com', password: 'password123' }),
    });
    const loginData: any = await loginRes.json();
    const token = loginData.token;

    const res = await fetch('http://127.0.0.1:4000/api/attendance/employee/1604?year=2026&month=10', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const apiData: any = await res.json();
    assert(res.status === 200, `API endpoint /api/attendance/employee/1604 returned HTTP 200 (status: ${res.status})`);
    assert(apiData.data?.employee?.name === 'Gagan C B', 'API returns Gagan C B');
    assert(apiData.data?.dailyRecords?.length === 31, `API returns exactly 31 daily calendar rows for October 2026 (got: ${apiData.data?.dailyRecords?.length})`);
    assert(apiData.data?.dailyRecords[1]?.status === 'HOLIDAY', 'Oct 2 is classified as Holiday (Gandhi Jayanti)');
    assert(apiData.data?.dailyRecords[3]?.status === 'WEEKLY_OFF', 'Oct 4 is classified as Weekly Off (Sunday)');
    assert(apiData.data?.dailyRecords[30]?.isFutureDate === true, 'Oct 31 is classified as Future Date');

    // 6. Verify No Raw IP Addresses Leaked in Output
    const jsonStr = JSON.stringify(apiData);
    assert(!jsonStr.includes('192.168.0.') && !jsonStr.includes('192.168.30.'), 'Zero private IP addresses leaked in client API payload');
    assert(jsonStr.includes('Protected Showroom LAN'), 'Sanitized network label displayed instead');

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
    if (failed > 0) process.exit(1);
    process.exit(0);
  }
}

runTests();
