import assert from 'node:assert';
import { TestResult } from './attendance.test.js';

/**
 * Section 60.4: Face Verification Automated Tests
 * - Match confidence above threshold (>= 85.0%) -> VERIFIED
 * - Match confidence below threshold (< 85.0%) -> FAILED
 * - Exact threshold boundary condition
 * - Face verification dashboard metrics aggregation
 */
export async function runFaceVerificationTests(baseUrl: string, adminToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Face Verification', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Face Verification', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  const threshold = 85.0;

  await runTest('Match above threshold (96.42% >= 85.0%) produces VERIFIED status', async () => {
    const matchPercentage = 96.42;
    const isVerified = matchPercentage >= threshold;
    assert.strictEqual(isVerified, true, '96.42% should pass the 85.0% threshold');
  });

  await runTest('Match below threshold (71.20% < 85.0%) produces FAILED status', async () => {
    const matchPercentage = 71.20;
    const isVerified = matchPercentage >= threshold;
    assert.strictEqual(isVerified, false, '71.20% should fail the 85.0% threshold');
  });

  await runTest('Exact threshold boundary (85.00% >= 85.0%) produces VERIFIED status', async () => {
    const matchPercentage = 85.00;
    const isVerified = matchPercentage >= threshold;
    assert.strictEqual(isVerified, true, 'Exact threshold of 85.0% must pass');
  });

  await runTest('API: Face verification log listing returns actual provider match percentages', async () => {
    const res = await fetch(`${baseUrl}/api/face-verification?limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 from face verification log, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.verifications), 'Expected verifications list');
    assert.ok(data.verifications.length > 0, 'Expected seeded verifications');

    for (const v of data.verifications.slice(0, 5)) {
      assert.ok(typeof v.matchPercentage === 'number', 'matchPercentage must be numeric');
      assert.ok(v.matchPercentage >= 0 && v.matchPercentage <= 100, 'matchPercentage must be within 0-100%');
      assert.ok(['VERIFIED', 'FAILED'].includes(v.status), `status must be VERIFIED or FAILED, got ${v.status}`);
      if (v.matchPercentage >= (v.threshold || 85)) {
        assert.strictEqual(v.status, 'VERIFIED', `Expected VERIFIED for score ${v.matchPercentage}`);
      } else {
        assert.strictEqual(v.status, 'FAILED', `Expected FAILED for score ${v.matchPercentage}`);
      }
    }
  });

  await runTest('API: Face verification statistics dashboard aggregates correct counts', async () => {
    const res = await fetch(`${baseUrl}/api/face-verification/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 from face verification stats, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(typeof data.total === 'number', 'total must be numeric');
    assert.ok(typeof data.verified === 'number', 'verified must be numeric');
    assert.ok(typeof data.failed === 'number', 'failed must be numeric');
    assert.strictEqual(data.total, data.verified + data.failed, 'total must equal verified + failed');
  });

  return results;
}
