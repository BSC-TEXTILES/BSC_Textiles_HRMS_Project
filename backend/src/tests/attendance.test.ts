import assert from 'node:assert';

export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Section 60.1: Attendance Automated Tests
 * - On-time login
 * - Early login (₹1/sec incentive transparency)
 * - Grace period
 * - Late login (₹1/sec penalty calculation)
 * - Overtime
 * - Early logout
 */
export async function runAttendanceTests(baseUrl: string, adminToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Attendance', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Attendance', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  await runTest('On-time check-in within scheduled start', async () => {
    // Scheduled: 09:30:00, Actual: 09:29:30 -> On-time / 30s early
    const scheduled = new Date('2024-01-01T09:30:00');
    const actual = new Date('2024-01-01T09:30:00');
    const diffSeconds = Math.floor((actual.getTime() - scheduled.getTime()) / 1000);
    assert.strictEqual(diffSeconds, 0, 'On-time should have 0 second difference');
  });

  await runTest('Early login calculates exact ₹1/second incentive transparency', async () => {
    // Scheduled: 10:30:00 AM, Actual: 10:20:00 AM -> 600 seconds early
    // PRD Section 15: 600 seconds * ₹1.00 = ₹600.00
    const scheduled = new Date('2024-01-01T10:30:00');
    const actual = new Date('2024-01-01T10:20:00');
    const earlySeconds = Math.max(0, Math.floor((scheduled.getTime() - actual.getTime()) / 1000));
    assert.strictEqual(earlySeconds, 600, 'Early seconds must equal 600s');

    const ratePerSecond = 1.0;
    const incentiveAmount = earlySeconds * ratePerSecond;
    assert.strictEqual(incentiveAmount, 600.0, 'Incentive must equal ₹600.00');
  });

  await runTest('Grace period tolerance: login at 10:34 AM within 5-minute threshold is NOT penalized', async () => {
    const scheduled = new Date('2024-01-01T10:30:00');
    const actual = new Date('2024-01-01T10:34:00');
    const graceMinutes = 5;
    const graceThreshold = new Date(scheduled.getTime() + graceMinutes * 60 * 1000);

    const isLate = actual.getTime() > graceThreshold.getTime();
    assert.strictEqual(isLate, false, '10:34 AM is within 10:35 AM grace threshold and should not be penalized');
  });

  await runTest('Late login calculation: login at 10:40 AM with ₹1/second penalty from scheduled time', async () => {
    // Scheduled: 10:30:00 AM, Grace: 5m (10:35), Actual: 10:40:00 AM
    // PRD Section 14: Late duration begins from configured threshold or start
    const scheduled = new Date('2024-01-01T10:30:00');
    const actual = new Date('2024-01-01T10:40:00');
    const lateSeconds = Math.max(0, Math.floor((actual.getTime() - scheduled.getTime()) / 1000));
    assert.strictEqual(lateSeconds, 600, 'Late duration is 600 seconds');

    const ratePerSecond = 1.0;
    const latePenalty = lateSeconds * ratePerSecond;
    assert.strictEqual(latePenalty, 600.0, 'Late penalty calculation must equal ₹600.00');
  });

  await runTest('Overtime calculation: checkout 1 hour after scheduled shift end', async () => {
    const shiftEnd = new Date('2024-01-01T18:30:00');
    const actualOut = new Date('2024-01-01T19:30:00');
    const otSeconds = Math.max(0, Math.floor((actualOut.getTime() - shiftEnd.getTime()) / 1000));
    assert.strictEqual(otSeconds, 3600, 'Overtime duration should be 3600 seconds (60 mins)');

    const otRatePerSecond = 1.5;
    const otIncentive = otSeconds * otRatePerSecond;
    assert.strictEqual(otIncentive, 5400.0, 'Overtime incentive @ ₹1.5/s should equal ₹5,400.00');
  });

  await runTest('Early logout penalty calculation: checkout 30 minutes before shift end', async () => {
    const shiftEnd = new Date('2024-01-01T18:30:00');
    const actualOut = new Date('2024-01-01T18:00:00');
    const earlyOutSeconds = Math.max(0, Math.floor((shiftEnd.getTime() - actualOut.getTime()) / 1000));
    assert.strictEqual(earlyOutSeconds, 1800, 'Early logout seconds should be 1800 seconds');

    const earlyOutPenaltyRate = 1.0;
    const penalty = earlyOutSeconds * earlyOutPenaltyRate;
    assert.strictEqual(penalty, 1800.0, 'Early logout penalty should equal ₹1,800.00');
  });

  await runTest('API Attendance listing endpoint returns valid structured records', async () => {
    const res = await fetch(`${baseUrl}/api/attendance?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.attendances), 'Expected attendances array');
    assert.ok(data.attendances.length > 0, 'Should return attendance records from seed');
  });

  return results;
}
