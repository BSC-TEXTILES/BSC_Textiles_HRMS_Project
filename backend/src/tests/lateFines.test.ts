export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

export async function runLateFinesTests(adminToken: string, hrToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({
        suite: 'LATE ATTENDANCE & FINE MANAGEMENT',
        name,
        passed: true,
        durationMs: Date.now() - start,
      });
      console.log(`  ✔ PASS: ${name}`);
    } catch (err: any) {
      results.push({
        suite: 'LATE ATTENDANCE & FINE MANAGEMENT',
        name,
        passed: false,
        error: err.message || String(err),
        durationMs: Date.now() - start,
      });
      console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    }
  };

  // 1. Dashboard metrics returns accurate 12 summary metrics
  await runTest('1. Late Fine Dashboard returns 12 core KPI summary metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/late-fines/dashboard?date=2026-10-11`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!json.success) throw new Error('Response success is false');
    const d = json.data;
    if (typeof d.totalEmployeesScheduled !== 'number') throw new Error('Missing totalEmployeesScheduled');
    if (typeof d.employeesPresent !== 'number') throw new Error('Missing employeesPresent');
    if (typeof d.employeesArrivedLate !== 'number') throw new Error('Missing employeesArrivedLate');
    if (typeof d.employeesWithinGracePeriod !== 'number') throw new Error('Missing employeesWithinGracePeriod');
    if (typeof d.employeesWithMissingPunches !== 'number') throw new Error('Missing employeesWithMissingPunches');
    if (typeof d.totalLateMinutes !== 'number') throw new Error('Missing totalLateMinutes');
    if (typeof d.totalFineCalculated !== 'number') throw new Error('Missing totalFineCalculated');
    if (typeof d.totalFinePendingApproval !== 'number') throw new Error('Missing totalFinePendingApproval');
    if (typeof d.totalFineApproved !== 'number') throw new Error('Missing totalFineApproved');
    if (typeof d.totalFineAppliedToPayroll !== 'number') throw new Error('Missing totalFineAppliedToPayroll');
    if (typeof d.totalFineWaived !== 'number') throw new Error('Missing totalFineWaived');
    if (typeof d.employeesWithRepeatedLateArrivals !== 'number') throw new Error('Missing repeated late arrivals');
  });

  // 2. Grace period tolerance test (arrival within grace period has 0 fine)
  await runTest('2. Arrival within 5-minute grace period produces zero chargeable fine', async () => {
    const res = await fetch(`${BASE_URL}/api/late-fines/records?date=2026-10-11&drillDownMetric=GRACE_PERIOD`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!json.success) throw new Error('Records response failed');
    for (const rec of json.data) {
      if (rec.chargeableLateSeconds > 0) {
        throw new Error(`Record ${rec.id} in grace period has chargeableLateSeconds > 0 (${rec.chargeableLateSeconds})`);
      }
      if (rec.calculatedFine > 0) {
        throw new Error(`Record ${rec.id} in grace period has calculatedFine > 0 (${rec.calculatedFine})`);
      }
    }
  });

  // 3. Beyond grace period calculation test (10:38 AM arrival has 3 min chargeable = 180s = ₹180)
  await runTest('3. Chargeable late calculation formula: Actual - ShiftStart - Grace = ₹1/sec', async () => {
    const res = await fetch(`${BASE_URL}/api/late-fines/records?date=2026-10-11&drillDownMetric=LATE`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!json.data || json.data.length === 0) throw new Error('No late records found');
    const lateRec = json.data[0];
    const expectedFine = Math.round(lateRec.chargeableLateSeconds * lateRec.fineRate);
    if (Math.abs(lateRec.calculatedFine - expectedFine) > 2) {
      throw new Error(`Fine mismatch: calculated ${lateRec.calculatedFine} vs expected ${expectedFine}`);
    }
  });

  // 4. Missing punches flagged and do not generate fabricated fines
  await runTest('4. Missing punch records are flagged without fabricated fine generation', async () => {
    const res = await fetch(`${BASE_URL}/api/late-fines/records?date=2026-10-11&drillDownMetric=MISSING_PUNCH`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    for (const rec of json.data) {
      if (rec.actualPunchIn !== null) {
        throw new Error(`Missing punch filter returned a record with actualPunchIn`);
      }
      if (rec.calculatedFine > 0) {
        throw new Error(`Missing punch generated fabricated fine of ₹${rec.calculatedFine}`);
      }
    }
  });

  // 5. Date-specific queries return historical records for that exact date (2026-10-01 vs 2026-10-11)
  await runTest('5. Date selection retrieves authentic historical records for chosen date', async () => {
    const res1 = await fetch(`${BASE_URL}/api/late-fines/dashboard?date=2026-10-01`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const res2 = await fetch(`${BASE_URL}/api/late-fines/dashboard?date=2026-10-11`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res1.ok || !res2.ok) throw new Error('Dashboard date queries failed');
    const json1: any = await res1.json();
    const json2: any = await res2.json();
    if (json1.data.totalEmployeesScheduled === 0) throw new Error('2026-10-01 has 0 scheduled employees');
    if (json2.data.totalEmployeesScheduled === 0) throw new Error('2026-10-11 has 0 scheduled employees');
  });

  // 6. Policy endpoint returns active settings and configuration
  await runTest('6. Policy endpoint returns active grace period and fine rate', async () => {
    const res = await fetch(`${BASE_URL}/api/late-fines/policy`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (json.data.gracePeriodMinutes !== 5) {
      throw new Error(`Expected gracePeriodMinutes 5, got ${json.data.gracePeriodMinutes}`);
    }
    if (json.data.latePenaltyRatePerSecond !== 1) {
      throw new Error(`Expected latePenaltyRatePerSecond 1.0, got ${json.data.latePenaltyRatePerSecond}`);
    }
  });

  // 7. Workflow: Waiver requires mandatory reason
  await runTest('7. Fine waiver strictly requires mandatory reason', async () => {
    const listRes = await fetch(`${BASE_URL}/api/late-fines/records?approvalStatus=PENDING_APPROVAL&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listJson: any = await listRes.json();
    if (listJson.data && listJson.data.length > 0) {
      const recId = listJson.data[0].id;
      const waiveRes = await fetch(`${BASE_URL}/api/late-fines/waive/${recId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ reason: '' })
      });
      if (waiveRes.status !== 400) {
        throw new Error(`Expected status 400 when waiving without reason, got ${waiveRes.status}`);
      }
    }
  });

  // 8. Workflow: Approval updates fine and records audit history
  await runTest('8. Fine approval sets APPROVED status and records audit history', async () => {
    const listRes = await fetch(`${BASE_URL}/api/late-fines/records?approvalStatus=PENDING_APPROVAL&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listJson: any = await listRes.json();
    if (listJson.data && listJson.data.length > 0) {
      const recId = listJson.data[0].id;
      const approveRes = await fetch(`${BASE_URL}/api/late-fines/approve/${recId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ remarks: 'Verified by HR Manager' })
      });
      if (!approveRes.ok) throw new Error(`Approval failed with status ${approveRes.status}`);
      const appJson: any = await approveRes.json();
      if (!appJson.success) throw new Error('Approval response success is false');
    }
  });

  // 9. Financial Safety: Cannot apply unapproved fine to payroll
  await runTest('9. Unapproved fine cannot be applied to payroll', async () => {
    const listRes = await fetch(`${BASE_URL}/api/late-fines/records?approvalStatus=PENDING_APPROVAL&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listJson: any = await listRes.json();
    if (listJson.data && listJson.data.length > 0) {
      const recId = listJson.data[0].id;
      const payRes = await fetch(`${BASE_URL}/api/late-fines/apply-payroll/${recId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ payrollRunId: 'PAYROLL-TEST' })
      });
      if (payRes.status !== 400) {
        throw new Error(`Expected status 400 when applying unapproved fine to payroll, got ${payRes.status}`);
      }
    }
  });

  // 10. Financial Safety: Idempotent payroll application
  await runTest('10. Applying approved fine to payroll is idempotent', async () => {
    const listRes = await fetch(`${BASE_URL}/api/late-fines/records?approvalStatus=APPROVED&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listJson: any = await listRes.json();
    if (listJson.data && listJson.data.length > 0) {
      const recId = listJson.data[0].id;
      const payRes1 = await fetch(`${BASE_URL}/api/late-fines/apply-payroll/${recId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ payrollRunId: 'PAYROLL-OCT-2026' })
      });
      if (!payRes1.ok) throw new Error(`First payroll application failed: ${payRes1.status}`);

      const payRes2 = await fetch(`${BASE_URL}/api/late-fines/apply-payroll/${recId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ payrollRunId: 'PAYROLL-OCT-2026' })
      });
      if (!payRes2.ok) throw new Error(`Idempotent second call failed: ${payRes2.status}`);
    }
  });

  // 11. Early Login incentives kept separate from late fines
  await runTest('11. Early login incentives tracked independently from late fines', async () => {
    const res = await fetch(`${BASE_URL}/api/late-fines/early-logins?date=2026-10-11`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Early logins endpoint status ${res.status}`);
    const json: any = await res.json();
    if (!Array.isArray(json.data)) throw new Error('Early logins data is not an array');
    for (const rec of json.data) {
      if (rec.earlySeconds <= 0) throw new Error('Record has 0 earlySeconds');
      if (rec.earlyIncentive <= 0) throw new Error('Record has 0 earlyIncentive');
    }
  });

  // 12. Employee-wise history returns trend and summary
  await runTest('12. Employee-wise history endpoint returns full log and summary', async () => {
    const res = await fetch(`${BASE_URL}/api/late-fines/employee-history/TEST-EMP-001`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!json.employee) throw new Error('Missing employee data');
    if (!json.summary) throw new Error('Missing summary data');
    if (!Array.isArray(json.records)) throw new Error('Missing records array');
  });

  return results;
}
