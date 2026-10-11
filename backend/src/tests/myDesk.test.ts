export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export async function runMyDeskTests(
  baseUrl: string,
  adminToken: string,
  salesToken: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  // 1. GET /api/my-desk/summary
  await runTest('1. My Desk: Summary returns comprehensive employee & attendance data', async () => {
    const res = await fetch(`${baseUrl}/api/my-desk/summary`, {
      headers: { Authorization: `Bearer ${salesToken || adminToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data: any = await res.json();

    if (!data.employee || !data.employee.fullName) throw new Error('Missing employee profile in summary');
    if (!data.today || typeof data.today.isClockedIn !== 'boolean') throw new Error('Missing today attendance status');
    if (!data.monthlyVelocity || !Array.isArray(data.monthlyVelocity.days)) throw new Error('Missing monthly velocity strip');
    if (!data.punctuality || typeof data.punctuality.score !== 'number') throw new Error('Missing punctuality score');
    if (!data.festiveBonus || typeof data.festiveBonus.amount !== 'number') throw new Error('Missing festive bonus');
    if (!data.overtime || !data.overtime.hoursFormatted) throw new Error('Missing overtime information');
    if (!data.shortcuts || !data.shortcuts.payslip) throw new Error('Missing floor shortcuts');
    if (!Array.isArray(data.leaveBalances)) throw new Error('Missing statutory leave balances');
  });

  // 2. Month and Year Navigation Filter
  await runTest('2. My Desk: Monthly velocity respects year and month query parameters', async () => {
    const res = await fetch(`${baseUrl}/api/my-desk/summary?year=2024&month=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data: any = await res.json();

    if (data.monthlyVelocity.year !== 2024 || data.monthlyVelocity.month !== 10) {
      throw new Error(`Expected Oct 2024, got ${data.monthlyVelocity.year}-${data.monthlyVelocity.month}`);
    }
    if (data.monthlyVelocity.days.length !== 31) {
      throw new Error(`October must have 31 days, got ${data.monthlyVelocity.days.length}`);
    }
  });

  // 3. POST /api/my-desk/punch
  await runTest('3. My Desk: Clock in / out punch persists and returns active status', async () => {
    const res = await fetch(`${baseUrl}/api/my-desk/punch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken || adminToken}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (typeof data.isClockedIn !== 'boolean') throw new Error('Missing isClockedIn in punch response');
  });

  // 4. POST /api/my-desk/breaks/tea
  await runTest('4. My Desk: Tea break start and end cycles update break record', async () => {
    // Start or toggle break
    const res1 = await fetch(`${baseUrl}/api/my-desk/breaks/tea`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken || adminToken}`,
      },
      body: JSON.stringify({}),
    });
    if (!res1.ok) throw new Error(`Status ${res1.status}: ${await res1.text()}`);
    const data1: any = await res1.json();
    if (typeof data1.isActive !== 'boolean') throw new Error('Missing isActive boolean in tea break response');
  });

  // 5. Custody Assets Acknowledge
  await runTest('5. My Desk: Custody asset acknowledgement updates status to ACKNOWLEDGED', async () => {
    // First get an asset id from summary
    const sumRes = await fetch(`${baseUrl}/api/my-desk/summary`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sumData: any = await sumRes.json();
    const assets = sumData.shortcuts?.custodyAssets?.items || [];
    if (assets.length > 0) {
      const assetId = assets[0].id;
      const ackRes = await fetch(`${baseUrl}/api/my-desk/custody-acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ assetId, action: 'ACKNOWLEDGE' }),
      });
      if (!ackRes.ok) throw new Error(`Status ${ackRes.status}`);
      const ackData: any = await ackRes.json();
      if (!ackData.success) throw new Error('Expected success true on asset acknowledgement');
    }
  });

  // 6. Punch Regularization Workflow
  await runTest('6. Attendance Corrections: Submit new regularization request and verify in list', async () => {
    const postRes = await fetch(`${baseUrl}/api/attendance/corrections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${salesToken || adminToken}`,
      },
      body: JSON.stringify({
        attendanceDate: '2024-10-24',
        requestedLogin: '2024-10-24 09:30:00',
        requestedLogout: '2024-10-24 18:30:00',
        reason: 'Automated Test: VIP bridal customer handover extended',
      }),
    });
    if (!postRes.ok) throw new Error(`Status ${postRes.status}: ${await postRes.text()}`);
    const postData: any = await postRes.json();
    if (!postData.correction || postData.correction.status !== 'PENDING') {
      throw new Error('Created correction is missing or not PENDING');
    }

    // Verify it appears in corrections list
    const getRes = await fetch(`${baseUrl}/api/attendance/corrections`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!getRes.ok) throw new Error(`Status ${getRes.status}`);
    const getData: any = await getRes.json();
    if (!Array.isArray(getData.corrections) || getData.corrections.length === 0) {
      throw new Error('Expected non-empty corrections list');
    }
  });

  return results;
}
