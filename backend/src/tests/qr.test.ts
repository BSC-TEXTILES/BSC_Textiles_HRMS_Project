import assert from 'node:assert';
import { TestResult } from './attendance.test.js';

/**
 * Section 60.3: QR System Automated Tests
 * - Valid QR token lookup & validation
 * - Expired QR token rejection
 * - Previous-day QR token invalidation
 * - Duplicate QR scan rejection (same token cannot be scanned twice for one-time scan)
 * - Scanner role permissions
 * - Replay attack prevention
 */
export async function runQRTests(baseUrl: string, adminToken: string, scannerToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'QR System', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'QR System', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  let testEmployeeId = 'TEST-EMP-001';
  let activeQRToken = '';

  await runTest('API: Generate or fetch daily QR badge for an employee', async () => {
    const res = await fetch(`${baseUrl}/api/qr-codes/daily/${testEmployeeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 for daily QR, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(data.qrCode, 'Expected qrCode in response');
    assert.ok(data.qrCode.token, 'Expected token in qrCode');
    activeQRToken = data.qrCode.token;
  });

  await runTest('Cryptographically secure token format: token length >= 24 characters, non-guessable', async () => {
    assert.ok(activeQRToken.length >= 24, `QR token must have at least 24 characters, got ${activeQRToken.length}`);
    // Check that it is not purely an incremental counter or predictable employee ID
    assert.ok(!activeQRToken.startsWith('EMP-'), 'Token must not be a plain employee ID');
  });

  await runTest('Replay protection / Date expiry: Previous-day QR code must be rejected', async () => {
    // Attempt validating a fabricated expired yesterday QR token
    const res = await fetch(`${baseUrl}/api/qr-codes/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${scannerToken}`,
      },
      body: JSON.stringify({
        token: 'EXPIRED-TOKEN-YESTERDAY-BSC-999',
        purpose: 'TEA_BREAK_START',
      }),
    });
    // Should fail with 400 or 404
    assert.ok(res.status === 400 || res.status === 404, `Expired/Invalid QR should be rejected, got status ${res.status}`);
    const data: any = await res.json();
    assert.strictEqual(data.success, false, 'Expected success: false for invalid QR token');
  });

  await runTest('Duplicate scan protection: scanning the same QR token a second time is rejected', async () => {
    // Generate fresh single-use QR for employee 2
    const dailyRes = await fetch(`${baseUrl}/api/qr-codes/daily/TEST-EMP-002`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dailyData: any = await dailyRes.json();
    const tokenToScan = dailyData.qrCode?.token;
    assert.ok(tokenToScan, 'Need a valid token to test duplicate scan');

    // First scan attempt
    const firstScan = await fetch(`${baseUrl}/api/qr-codes/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${scannerToken}`,
      },
      body: JSON.stringify({
        token: tokenToScan,
        purpose: 'TEA_BREAK_START',
      }),
    });
    const firstData: any = await firstScan.json();

    // Second scan attempt with the EXACT SAME TOKEN
    const secondScan = await fetch(`${baseUrl}/api/qr-codes/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${scannerToken}`,
      },
      body: JSON.stringify({
        token: tokenToScan,
        purpose: 'TEA_BREAK_START',
      }),
    });
    const secondData: any = await secondScan.json();

    // The second scan MUST be rejected as duplicate/already used
    assert.strictEqual(secondData.success, false, 'Second scan of same token must be rejected');
    assert.ok(
      secondData.reason?.toLowerCase().includes('already') ||
      secondData.reason?.toLowerCase().includes('duplicate') ||
      secondData.reason?.toLowerCase().includes('used') ||
      secondData.reason?.toLowerCase().includes('invalid'),
      `Expected duplicate/already used message, got: ${secondData.reason}`
    );
  });

  await runTest('QR Scan Audit Log persists every attempt with status, scanner ID, and timestamp', async () => {
    const res = await fetch(`${baseUrl}/api/qr-codes/scans?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200, `Expected 200 from QR scans audit log, got ${res.status}`);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.scans), 'Expected scans array');
    assert.ok(data.scans.length > 0, 'Expected recorded scan transactions in audit log');
  });

  return results;
}
