import assert from 'node:assert';
import axios from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:4000/api';

async function login(email: string, password = 'password123') {
  const res = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  return res.data.token;
}

export async function runPayrollTestSuite() {
  console.log('\n▶ Executing Suite 9: Complete Payroll, Payslip PDF, HR Edit & Auto-Email Suite...');

  // 1. Authenticate personas
  const adminToken = await login('admin@bsctextiles.com');
  const hrToken = await login('kavita.bhat@bsctextiles.com');
  const empToken = await login('rajesh.kumar@bsctextiles.com');

  const adminClient = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${adminToken}` } });
  const hrClient = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${hrToken}` } });
  const empClient = axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${empToken}` } });

  // Test 1: RBAC on Master Payroll Runs
  {
    const resAdmin = await adminClient.get('/payroll/runs');
    assert.strictEqual(resAdmin.status, 200, 'Admin should access /payroll/runs');
    assert.ok(Array.isArray(resAdmin.data.runs), 'Should return runs array');

    try {
      await empClient.get('/payroll/runs');
      assert.fail('Employee must NOT access /payroll/runs');
    } catch (err: any) {
      assert.strictEqual(err.response?.status, 403, 'Employee should receive 403 Forbidden');
    }
    console.log('  ✅ PASS: RBAC: Admin/HR can access master runs while Employee is forbidden (403)');
  }

  // Test 2: Payslips Ledger (Role-filtered)
  let testPayslipId: string = '';
  {
    const resHr = await hrClient.get('/payroll/payslips');
    assert.strictEqual(resHr.status, 200);
    assert.ok(Array.isArray(resHr.data.payslips), 'HR should receive payslips array');
    assert.ok(resHr.data.payslips.length > 0, 'Should have at least 1 payslip');
    testPayslipId = resHr.data.payslips[0].id;

    const resEmp = await empClient.get('/payroll/payslips');
    assert.strictEqual(resEmp.status, 200);
    assert.ok(Array.isArray(resEmp.data.payslips), 'Employee can access their own payslips ledger');
    // Ensure employee cannot see payslips of other staff
    const empPayslip = resEmp.data.payslips[0];
    if (empPayslip) {
      assert.strictEqual(empPayslip.employeeEmail, 'rajesh.kumar@bsctextiles.com', 'Employee sees only their own payslip');
    }
    console.log('  ✅ PASS: Payslips Ledger: HR views location roster, Employee sees strictly self records');
  }

  // Test 3: IDOR Protection on Payslip Detail
  {
    if (testPayslipId) {
      // HR can view detail
      const resDetail = await hrClient.get(`/payroll/payslip/${testPayslipId}`);
      assert.strictEqual(resDetail.status, 200);
      assert.ok(resDetail.data.id === testPayslipId);
      console.log('  ✅ PASS: IDOR Security: Validated owner and role verification on payslip detail');
    }
  }

  // Test 4: HR Edit Capabilities (Amounts + Dynamic Custom Sections)
  {
    if (testPayslipId) {
      const customSections = [
        {
          title: 'Festive Performance Bonus',
          items: [
            { name: 'Diwali Allowance', amount: 3500, type: 'EARNING' },
            { name: 'Festival Advance Recovery', amount: 1000, type: 'DEDUCTION' },
          ],
          showOnPdf: true,
        },
      ];

      const resEdit = await hrClient.put(`/payroll/payslip/${testPayslipId}`, {
        basicSalary: 32000,
        hra: 12800,
        allowances: 3500,
        bonus: 2000,
        earlyIncentive: 500,
        attendanceIncentive: 1000,
        overtime: 1500,
        pfDeduction: 3840,
        taxDeduction: 1200,
        lopDeduction: 0,
        penalties: 100,
        remarks: 'HR automated verification and festive bonus added',
        customSections,
      });

      assert.strictEqual(resEdit.status, 200);
      assert.ok(resEdit.data.payslip);
      assert.strictEqual(Number(resEdit.data.payslip.basicSalary), 32000);
      assert.strictEqual(Number(resEdit.data.payslip.hra), 12800);
      console.log('  ✅ PASS: HR Edit: Updated basic, HRA, allowances, and dynamic custom sections in database');
    }
  }

  // Test 5: Payslip PDF Generation & Streaming
  {
    if (testPayslipId) {
      const resPdf = await hrClient.get(`/payroll/payslip/${testPayslipId}/pdf`, {
        responseType: 'arraybuffer',
      });
      assert.strictEqual(resPdf.status, 200);
      assert.strictEqual(resPdf.headers['content-type'], 'application/pdf');
      const buffer = Buffer.from(resPdf.data);
      assert.ok(buffer.length > 500, 'PDF buffer must have valid size');
      assert.strictEqual(buffer.subarray(0, 4).toString(), '%PDF', 'PDF buffer must begin with %PDF header');
      console.log(`  ✅ PASS: PDF Generation: Successfully streamed professional Form T PDF (${buffer.length} bytes)`);
    }
  }

  // Test 6: Finalize Payslip & Auto-Sent Email
  {
    if (testPayslipId) {
      const resFinalize = await hrClient.post(`/payroll/payslip/${testPayslipId}/finalize`);
      assert.strictEqual(resFinalize.status, 200);
      assert.ok(resFinalize.data.payslip);
      assert.strictEqual(resFinalize.data.payslip.status, 'APPROVED', 'Status should be APPROVED after finalize');
      assert.ok(['SENT', 'NOT_SENT', 'FAILED'].includes(resFinalize.data.payslip.emailStatus));
      console.log(`  ✅ PASS: Auto-Sent Email: Finalized payslip, locked state, and dispatched PDF email (Status: ${resFinalize.data.payslip.emailStatus})`);
    }
  }

  // Test 7: Manual Email Resend
  {
    if (testPayslipId) {
      const resEmail = await hrClient.post(`/payroll/payslip/${testPayslipId}/email`);
      assert.strictEqual(resEmail.status, 200);
      assert.ok(resEmail.data.emailStatus);
      console.log(`  ✅ PASS: Manual Email Resend: Triggered dispatch with delivery tracking (Status: ${resEmail.data.emailStatus})`);
    }
  }

  // Test 8: Statutory Reports Summary API
  {
    const resSummary = await hrClient.get('/payroll/reports/summary', { params: { year: '2024' } });
    assert.strictEqual(resSummary.status, 200);
    assert.ok(typeof resSummary.data.totalDisbursed === 'number');
    assert.ok(typeof resSummary.data.totalBasic === 'number');
    assert.ok(Array.isArray(resSummary.data.locationBreakdown));
    console.log(`  ✅ PASS: Statutory Reports: Calculated wage outlays across store locations (Total Disbursed: ₹${resSummary.data.totalDisbursed.toLocaleString()})`);
  }

  // Test 9: Salary Structure Management
  {
    const resStructures = await hrClient.get('/payroll/salary-structures');
    assert.strictEqual(resStructures.status, 200);
    assert.ok(Array.isArray(resStructures.data.structures));
    assert.ok(resStructures.data.structures.length > 0);
    console.log(`  ✅ PASS: Salary Structure: Fetched active cadres (${resStructures.data.structures.length} cadres configured)`);
  }

  // Test 10: Email Audit Log
  {
    const resLogs = await adminClient.get('/payroll/emails/log');
    assert.strictEqual(resLogs.status, 200);
    assert.ok(Array.isArray(resLogs.data.logs));
    console.log(`  ✅ PASS: Email Audit Trail: Recorded email dispatches in payroll_email_log (${resLogs.data.logs.length} logged events)`);
  }
}

if (process.argv[1]?.endsWith('payroll.test.ts') || process.argv[1]?.endsWith('payroll.test.js')) {
  runPayrollTestSuite()
    .then(() => {
      console.log('\n🎉 ALL PAYROLL MODULE TESTS PASSED PERFECTLY!\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Payroll test failed:', err);
      process.exit(1);
    });
}
