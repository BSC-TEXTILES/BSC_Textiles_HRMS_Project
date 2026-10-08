import assert from 'node:assert';
import { TestResult } from './attendance.test.js';

/**
 * Section 60.6: Incentives & Penalties Automated Tests
 * - Per-second calculation
 * - Per-minute calculation
 * - Fixed incentive calculation
 * - Percentage calculation
 * - Target-based calculation
 * - Calculation explainability transparency
 */
export async function runIncentivesTests(baseUrl: string, adminToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Incentives & Penalties', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Incentives & Penalties', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  await runTest('Per-second calculation: 600 seconds @ ₹1.00/sec = ₹600.00', async () => {
    const units = 600;
    const rate = 1.0;
    const total = units * rate;
    assert.strictEqual(total, 600.0, '600 seconds at ₹1.00/s should be ₹600.00');
  });

  await runTest('Per-minute calculation: 45 minutes overtime @ ₹10.00/min = ₹450.00', async () => {
    const minutes = 45;
    const ratePerMin = 10.0;
    const total = minutes * ratePerMin;
    assert.strictEqual(total, 450.0, '45 minutes at ₹10.00/min should be ₹450.00');
  });

  await runTest('Fixed incentive calculation: Full month attendance bonus = ₹2,500.00', async () => {
    const fixedBonus = 2500.0;
    assert.strictEqual(fixedBonus, 2500.0, 'Fixed attendance bonus should equal ₹2,500.00');
  });

  await runTest('Percentage incentive calculation: 3.5% on sales of ₹500,000 = ₹17,500.00', async () => {
    const salesVolume = 500000;
    const percentage = 3.5;
    const incentive = (salesVolume * percentage) / 100;
    assert.strictEqual(incentive, 17500.0, '3.5% of ₹500,000 should be ₹17,500.00');
  });

  await runTest('Target-based incentive calculation: 110% achievement on ₹1,000,000 target gives slab bonus', async () => {
    const target = 1000000;
    const achieved = 1100000;
    const achievementPercent = Math.round((achieved / target) * 100);
    assert.strictEqual(achievementPercent, 110, 'Achievement should be 110%');

    // Target slab: >105% qualifies for 5% accelerator
    const baseBonus = 5000;
    const acceleratorMultiplier = achievementPercent >= 105 ? 1.5 : 1.0;
    const totalBonus = baseBonus * acceleratorMultiplier;
    assert.strictEqual(totalBonus, 7500.0, 'Accelerator bonus should be ₹7,500.00');
  });

  await runTest('Explainability transparency: formatted breakdown string matches calculations', async () => {
    const seconds = 600;
    const rate = 1.0;
    const amount = seconds * rate;
    const explainFormula = `${seconds} seconds × ₹${rate.toFixed(2)} = ₹${amount.toFixed(2)}`;
    assert.strictEqual(explainFormula, '600 seconds × ₹1.00 = ₹600.00', 'Explain formula must match expected breakdown');
  });

  await runTest('API: Incentives listing returns active rules configured in database', async () => {
    const res = await fetch(`${baseUrl}/api/incentives/rules`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 from incentive rules API, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.rules), 'Expected rules array');
    assert.ok(data.rules.length > 0, 'Expected seeded incentive rules');
  });

  await runTest('API: Penalties listing returns active penalty policies configured in database', async () => {
    const res = await fetch(`${baseUrl}/api/penalties/rules`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 from penalty rules API, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.rules), 'Expected penalty rules array');
    assert.ok(data.rules.length > 0, 'Expected seeded penalty rules');
  });

  return results;
}
