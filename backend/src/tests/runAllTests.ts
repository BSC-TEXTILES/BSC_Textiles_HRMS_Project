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
import { runFloorOperationsTests } from './floorOperations.test.js';
import { runLateFinesTests } from './lateFines.test.js';
import { runEmployeeDocumentsTests } from './employeeDocuments.test.js';
import { runAttendanceBoardTests } from './attendanceBoard.test.js';
import { runMyDeskTests } from './myDesk.test.js';
import { runAnalysisTests } from './analysis.test.js';
import { runEmployeeImportTests } from './employeeImport.test.js';
import { runBiometricIntegrationTests } from './biometricIntegration.test.js';

const BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

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

  // Ensure target server is online before running tests
  let serverOnline = false;
  for (let i = 0; i < 6; i++) {
    try {
      const h = await fetch(`${BASE_URL}/health`);
      if (h.ok) {
        serverOnline = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (!serverOnline) {
    console.error(`❌ Backend server is not running at ${BASE_URL}.`);
    console.error(`   Please start the backend server with: 'npm run dev:backend' or 'npx tsx src/index.ts'`);
    process.exit(1);
  }

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

  // 11. Floor Operations, Salesmen Tracking & Retail Hierarchy Suite
  console.log('▶ Executing Suite 11: Floor Operations, Salesmen Tracking & Retail Hierarchy...');
  const floorResults = await runFloorOperationsTests(adminToken, belagaviHrToken);
  allResults.push(...floorResults);

  // 12. Late Attendance & Fine Management Suite
  console.log('▶ Executing Suite 12: Late Attendance & Fine Management...');
  const lateFineResults = await runLateFinesTests(adminToken, belagaviHrToken);
  allResults.push(...lateFineResults);

  // 13. Employee Document Management Suite
  console.log('▶ Executing Suite 13: Employee Document Management...');
  const docResults = await runEmployeeDocumentsTests(adminToken, belagaviHrToken, shivamoggaHrToken);
  allResults.push(...docResults);

  // 14. Attendance & Shifts Board Suite
  console.log('▶ Executing Suite 14: Attendance & Shifts Board (filters, pagination, CSV)...');
  const boardResults = await runAttendanceBoardTests(BASE_URL, adminToken, belagaviHrToken);
  allResults.push(...boardResults);

  // 15. My Desk Self-Service Suite
  console.log('▶ Executing Suite 15: My Desk Self-Service & Punch Corrections...');
  const deskResults = await runMyDeskTests(BASE_URL, adminToken, salesToken);
  allResults.push(...deskResults.map((r) => ({ ...r, suite: 'my-desk' })));

  // 16. HR Analysis Module Suite
  console.log('▶ Executing Suite 16: HR Analytics, Connected Dots & Drilldown...');
  const analysisResults = await runAnalysisTests(BASE_URL, adminToken);
  allResults.push(...analysisResults);

  // 17. Bulk Employee Import & ID Management Suite
  console.log('▶ Executing Suite 17: Bulk Employee Import, ID Management & Data Quality...');
  const importResults = await runEmployeeImportTests(BASE_URL, adminToken);
  allResults.push(...importResults);

  // 18. Biometric Attendance, eSSL IoT & Cloud MySQL Sync Suite
  console.log('▶ Executing Suite 18: Biometric Attendance, eSSL IoT & Cloud MySQL Sync...');
  const bioResults = await runBiometricIntegrationTests(BASE_URL, adminToken);
  allResults.push(...bioResults.map((r) => ({ ...r, suite: 'biometric-iot' })));

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
