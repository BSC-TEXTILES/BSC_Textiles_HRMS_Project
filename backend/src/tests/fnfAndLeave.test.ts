import assert from 'node:assert';
import { TestResult } from './attendance.test.js';

export async function runFnfAndLeaveTestSuite(
  baseUrl: string,
  adminToken: string,
  employeeToken: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const headers = (token: string) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Full & Final & Leaves', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Full & Final & Leaves', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  // 1. Leave Types
  await runTest('Fetch Active Leave Types & Quotas (CL, SL, EL, LOP)', async () => {
    const res = await fetch(`${baseUrl}/api/leaves/types`, { headers: headers(adminToken) });
    assert.strictEqual(res.ok, true, `Status ${res.status}`);
    const types: any = await res.json();
    assert.ok(Array.isArray(types) && types.length >= 3, 'Must have at least 3 leave types');
  });

  // 2. Leave Balances
  await runTest('Retrieve Employee Leave Balances with Quotas', async () => {
    const res = await fetch(`${baseUrl}/api/leaves/balances`, { headers: headers(adminToken) });
    assert.strictEqual(res.ok, true, `Status ${res.status}`);
    const balances: any = await res.json();
    assert.ok(Array.isArray(balances), 'Balances must be an array');
  });

  // 3. Ex-Employees Stats 10 KPIs
  await runTest('Retrieve Ex-Employees Dashboard 10 KPIs', async () => {
    const res = await fetch(`${baseUrl}/api/exits/dashboard-stats`, { headers: headers(adminToken) });
    assert.strictEqual(res.ok, true, `Status ${res.status}`);
    const data: any = await res.json();
    const stats = data.stats || data;
    assert.strictEqual(typeof stats.totalExits, 'number', 'totalExits must be a number');
    assert.strictEqual(typeof stats.closedPaid, 'number', 'closedPaid must be a number');
  });

  // 4. Ex-Employees List
  await runTest('Paginated Ex-Employees & Settlements List', async () => {
    const res = await fetch(`${baseUrl}/api/exits?page=1&limit=10`, { headers: headers(adminToken) });
    assert.strictEqual(res.ok, true, `Status ${res.status}`);
    const data: any = await res.json();
    const exits = data.exits || [];
    assert.ok(Array.isArray(exits), 'Exits must be an array');
  });

  // 5. Mobile Profile & Balances
  await runTest('Mobile API: Authenticated Profile & Leave Quotas', async () => {
    const [profRes, balRes] = await Promise.all([
      fetch(`${baseUrl}/api/mobile/profile`, { headers: headers(employeeToken) }),
      fetch(`${baseUrl}/api/mobile/leave-balances`, { headers: headers(employeeToken) }),
    ]);
    assert.strictEqual(profRes.ok, true, `Profile status ${profRes.status}`);
    assert.strictEqual(balRes.ok, true, `Balances status ${balRes.status}`);
    const prof: any = await profRes.json();
    const bals: any = await balRes.json();
    assert.ok(prof.fullName || prof.email, 'Profile must have fullName or email');
    assert.ok(Array.isArray(bals), 'Mobile balances must be an array');
  });

  // 6. Mobile Punch
  await runTest('Mobile API: Geofenced Biometric Attendance Punching', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/punch`, {
      method: 'POST',
      headers: headers(employeeToken),
      body: JSON.stringify({
        punchType: 'CHECK_IN',
        latitude: 15.8497,
        longitude: 74.4977,
        deviceInfo: 'Automated Mobile Test Runner',
      }),
    });
    assert.strictEqual(res.ok, true, `Punch status ${res.status}`);
    const punch: any = await res.json();
    assert.strictEqual(punch.success, true, 'Punch success must be true');
  });

  return results;
}
