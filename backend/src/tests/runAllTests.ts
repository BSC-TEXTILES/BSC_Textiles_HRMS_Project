import { runAttendanceTests, TestResult } from './attendance.test.js';
import { runBreaksTests } from './breaks.test.js';
import { runQRTests } from './qr.test.js';
import { runFaceVerificationTests } from './faceVerification.test.js';
import { runPermissionsAndLocationTests } from './permissionsAndLocation.test.js';
import { runIncentivesTests } from './incentives.test.js';
import { runSecurityTests } from './security.test.js';
import { runComprehensiveSecurityTests } from './comprehensiveSecurity.test.js';
import { runKycTests } from './kyc.test.js';
import { runPayrollTestSuite } from './payroll.test.js';
import { runFnfAndLeaveTestSuite } from './fnfAndLeave.test.js';

const BASE_URL = process.env.API_URL || 'http://localhost:4000';

async function loginUser(email: string, password = 'password123'): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email} (${res.status}): ${text}`);
  }
  const data: any = await res.json();
  return data.token;
}

async function main() {
  console.log('================================================================');
  console.log('🚀 BSC TEXTILES HRMS — AUTOMATED TEST RUNNER (PRD SECTION 60)');
  console.log('================================================================');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Execution Time: ${new Date().toISOString()}`);
  console.log('Authenticating test personas...\n');

  let adminToken = '';
  let belagaviHrToken = '';
  let shivamoggaHrToken = '';
  let scannerToken = '';
  let salesToken = '';

  try {
    adminToken = await loginUser('admin@bsctextiles.com');
    console.log('  ✔ Super Admin Authenticated');

    // Belagavi HR
    belagaviHrToken = await loginUser('kavita.bhat@bsctextiles.com');
    console.log('  ✔ Belagavi HR Authenticated');

    // Shivamogga HR
    shivamoggaHrToken = await loginUser('vikram.singh@bsctextiles.com');
    console.log('  ✔ Shivamogga HR Authenticated');

    // Scanner
    scannerToken = await loginUser('ramesh.gowda@bsctextiles.com');
    console.log('  ✔ T-Shop Scanner Authenticated');

    // Sales Employee
    salesToken = await loginUser('rajesh.kumar@bsctextiles.com');
    console.log('  ✔ Sales Employee Authenticated');
  } catch (err: any) {
    console.error('❌ Failed to authenticate test personas:', err.message);
    process.exit(1);
  }

  console.log('\nRunning automated test suites...\n');

  const allResults: TestResult[] = [];

  // 1. Attendance Suite
  console.log('▶ Executing Suite 1: Attendance Calculations & Rules...');
  const attResults = await runAttendanceTests(BASE_URL, adminToken);
  allResults.push(...attResults);

  // 2. Breaks Suite
  console.log('▶ Executing Suite 2: Breaks Management & Overrun Calculations...');
  const breaksResults = await runBreaksTests(BASE_URL, adminToken);
  allResults.push(...breaksResults);

  // 3. QR Suite
  console.log('▶ Executing Suite 3: Daily QR Validation, Duplication & Security...');
  const qrResults = await runQRTests(BASE_URL, adminToken, scannerToken);
  allResults.push(...qrResults);

  // 4. Face Verification Suite
  console.log('▶ Executing Suite 4: Face Verification Thresholds & Logs...');
  const faceResults = await runFaceVerificationTests(BASE_URL, adminToken);
  allResults.push(...faceResults);

  // 5. Permissions & Location Suite
  console.log('▶ Executing Suite 5: RBAC & Location-Based Isolation Security...');
  const permResults = await runPermissionsAndLocationTests(
    BASE_URL,
    adminToken,
    belagaviHrToken,
    shivamoggaHrToken,
    salesToken
  );
  allResults.push(...permResults);

  // 6. Incentives & Penalties Suite
  console.log('▶ Executing Suite 6: Incentives, Penalties & Explainability...');
  const incResults = await runIncentivesTests(BASE_URL, adminToken);
  allResults.push(...incResults);

  // 7. Security Suite
  console.log('▶ Executing Suite 7: Authentication, JWT & Security Middleware...');
  const secResults = await runSecurityTests(BASE_URL);
  allResults.push(...secResults);

  console.log('▶ Executing Suite 7B: Enterprise Security Core (Argon2id, MFA, Sessions, RBAC, File Security & Audits)...');
  const compSecResults = await runComprehensiveSecurityTests(BASE_URL);
  allResults.push(...compSecResults);

  // 8. KYC & DigiLocker Suite
  console.log('▶ Executing Suite 8: Employee Aadhaar KYC & DigiLocker Integration...');
  const kycResults = await runKycTests(
    BASE_URL,
    adminToken,
    belagaviHrToken,
    shivamoggaHrToken,
    salesToken
  );
  allResults.push(...kycResults);

  // 9. Complete Payroll, PDF & Auto-Email Suite
  await runPayrollTestSuite();

  // 10. F&F Settlement, Leave Management & Mobile API Suite
  console.log('▶ Executing Suite 10: Full & Final Settlement, Leaves & Mobile API...');
  const fnfResults = await runFnfAndLeaveTestSuite(BASE_URL, adminToken, salesToken);
  allResults.push(...fnfResults);

  // Print Summary Table
  console.log('\n================================================================');
  console.log('📊 TEST EXECUTION SUMMARY REPORT');
  console.log('================================================================\n');

  let passedCount = 0;
  let failedCount = 0;
  let currentSuite = '';

  for (const r of allResults) {
    if (r.suite !== currentSuite) {
      currentSuite = r.suite;
      console.log(`\n📁 [${currentSuite.toUpperCase()}]`);
    }
    if (r.passed) {
      passedCount++;
      console.log(`  ✅ PASS: ${r.name} (${r.durationMs}ms)`);
    } else {
      failedCount++;
      console.log(`  ❌ FAIL: ${r.name} (${r.durationMs}ms)`);
      console.log(`     Error: ${r.error}`);
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`Total Tests Run: ${allResults.length}`);
  console.log(`Passed:          ${passedCount} (${((passedCount / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`Failed:          ${failedCount}`);
  console.log('----------------------------------------------------------------\n');

  if (failedCount > 0) {
    console.error('💥 Test suite completed with failures.');
    process.exit(1);
  } else {
    console.log('🎉 ALL AUTOMATED TESTS PASSED SUCCESSFULLY! 100% COMPLIANT WITH PRD SECTION 60.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
