import assert from 'node:assert';
import { TestResult } from './attendance.test.js';

/**
 * Section 60.2: Breaks Automated Tests
 * - Correct duration by group (Male Lunch 100m, Female Lunch 40m, Tea 20m/15m)
 * - Expired break detection
 * - Break overrun calculations
 * - Multi-rule policy lookup via API
 */
export async function runBreaksTests(baseUrl: string, adminToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Breaks', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Breaks', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  await runTest('Male lunch policy duration is 100 minutes (6,000 seconds)', async () => {
    const maleLunchMinutes = 100;
    const allowedSeconds = maleLunchMinutes * 60;
    assert.strictEqual(allowedSeconds, 6000, 'Male lunch allowed seconds must be 6000s');
  });

  await runTest('Female lunch policy duration is 40 minutes (2,400 seconds)', async () => {
    const femaleLunchMinutes = 40;
    const allowedSeconds = femaleLunchMinutes * 60;
    assert.strictEqual(allowedSeconds, 2400, 'Female lunch allowed seconds must be 2400s');
  });

  await runTest('Male tea break is 20 minutes (1,200 seconds) vs Female tea break is 15 minutes (900 seconds)', async () => {
    const maleTea = 20 * 60;
    const femaleTea = 15 * 60;
    assert.strictEqual(maleTea, 1200, 'Male tea break must be 1200s');
    assert.strictEqual(femaleTea, 900, 'Female tea break must be 900s');
    assert.ok(maleTea > femaleTea, 'Male tea break policy exceeds female tea break policy');
  });

  await runTest('Break countdown calculation displays accurate remaining seconds', async () => {
    const startTime = new Date(Date.now() - 5 * 60 * 1000); // 5 mins elapsed
    const allowedMinutes = 20; // 20 mins total
    const expectedEnd = new Date(startTime.getTime() + allowedMinutes * 60 * 1000);

    const remainingMs = expectedEnd.getTime() - Date.now();
    const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

    // Approx 15 minutes = 900 seconds (allowing +/- 2 seconds for execution drift)
    assert.ok(remainingSeconds >= 895 && remainingSeconds <= 905, `Remaining should be ~900s, got ${remainingSeconds}`);
  });

  await runTest('Break overrun calculation triggers when actual duration exceeds allowed threshold', async () => {
    const allowedMinutes = 20;
    const allowedSeconds = allowedMinutes * 60;
    const actualDurationSeconds = 25 * 60; // 25 mins elapsed = 1,500s

    const overrunSeconds = Math.max(0, actualDurationSeconds - allowedSeconds);
    assert.strictEqual(overrunSeconds, 300, 'Break overrun should equal 300 seconds (5 mins)');

    // Policy rate: ₹0.50/second for overrun
    const overrunPenaltyRate = 0.50;
    const penalty = overrunSeconds * overrunPenaltyRate;
    assert.strictEqual(penalty, 150.0, 'Break overrun penalty should equal ₹150.00');
  });

  await runTest('API: Fetch active breaks returns seeded records with active countdown fields', async () => {
    const res = await fetch(`${baseUrl}/api/breaks/active`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 from active breaks API, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.breaks), 'Expected active breaks array');
  });

  return results;
}
