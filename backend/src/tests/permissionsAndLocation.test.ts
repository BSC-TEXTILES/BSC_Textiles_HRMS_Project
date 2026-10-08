import assert from 'node:assert';
import { TestResult } from './attendance.test.js';

/**
 * Section 60.5: Permissions & Location Isolation Automated Tests
 * - Admin global unrestricted access
 * - Belagavi HR scoped strictly to Belagavi (BEL) data
 * - Shivamogga HR scoped strictly to Shivamogga (SHI) data
 * - Cross-location query tampering rejected server-side
 * - Sales employee unauthorized access rejected with 403 Forbidden
 */
export async function runPermissionsAndLocationTests(
  baseUrl: string,
  adminToken: string,
  belagaviHrToken: string,
  shivamoggaHrToken: string,
  salesEmployeeToken: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Permissions & Location Isolation', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Permissions & Location Isolation', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  await runTest('Super Admin can access all employees across all 4 locations', async () => {
    const res = await fetch(`${baseUrl}/api/employees?limit=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 for Admin, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.employees), 'Expected employees array');
    assert.ok(data.employees.length >= 30, `Expected >= 30 employees for Super Admin, got ${data.employees.length}`);
  });

  await runTest('Belagavi HR only sees Belagavi employees; cannot view Davanagere or Shivamogga', async () => {
    const res = await fetch(`${baseUrl}/api/employees?limit=50`, {
      headers: { Authorization: `Bearer ${belagaviHrToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 for Belagavi HR, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.employees), 'Expected employees array');
    assert.ok(data.employees.length > 0, 'Belagavi HR should see Belagavi employees');

    // Verify all returned employees belong to Belagavi
    for (const emp of data.employees) {
      const locCode = emp.location?.code;
      assert.ok(
        locCode === 'BEL' || locCode === undefined,
        `Belagavi HR should NEVER see non-Belagavi employee! Found location: ${locCode}`
      );
    }
  });

  await runTest('Shivamogga HR only sees Shivamogga employees; cannot view Belagavi or Hubballi', async () => {
    const res = await fetch(`${baseUrl}/api/employees?limit=50`, {
      headers: { Authorization: `Bearer ${shivamoggaHrToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 for Shivamogga HR, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.employees), 'Expected employees array');
    assert.ok(data.employees.length > 0, 'Shivamogga HR should see Shivamogga employees');

    // Verify all returned employees belong to Shivamogga
    for (const emp of data.employees) {
      const locCode = emp.location?.code;
      assert.ok(
        locCode === 'SHI' || locCode === undefined,
        `Shivamogga HR should NEVER see non-Shivamogga employee! Found location: ${locCode}`
      );
    }
  });

  await runTest('Cross-location URL parameter spoofing: Belagavi HR passing ?locationId=SHI is restricted server-side', async () => {
    // Attempting to forge query params to inspect Shivamogga
    const res = await fetch(`${baseUrl}/api/employees?locationId=3&limit=50`, {
      headers: { Authorization: `Bearer ${belagaviHrToken}` },
    });
    assert.strictEqual(res.status, 200, 'Endpoint responds');
    const data: any = await res.json();

    // Verify that server did NOT disclose Shivamogga employees to Belagavi HR
    for (const emp of data.employees) {
      assert.notStrictEqual(
        emp.location?.code,
        'SHI',
        'Security breach: Belagavi HR was able to see Shivamogga records via query tampering!'
      );
    }
  });

  await runTest('Sales Employee cannot access Admin audit logs (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/audit?limit=10`, {
      headers: { Authorization: `Bearer ${salesEmployeeToken}` },
    });
    assert.ok(
      res.status === 403 || res.status === 401,
      `Expected 403 Forbidden for Sales Employee accessing audit logs, got ${res.status}`
    );
  });

  await runTest('Sales Employee cannot access HR Payroll management (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/payroll/runs`, {
      headers: { Authorization: `Bearer ${salesEmployeeToken}` },
    });
    assert.ok(
      res.status === 403 || res.status === 401,
      `Expected 403 Forbidden for Sales Employee accessing payroll runs, got ${res.status}`
    );
  });

  return results;
}
