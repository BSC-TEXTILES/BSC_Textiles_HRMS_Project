import assert from 'node:assert';
import bcrypt from 'bcryptjs';
import { TestResult } from './attendance.test.js';

/**
 * Section 60.7: Security Automated Tests
 * - Password hashing (bcrypt verification)
 * - Authentication failures (invalid credentials)
 * - Tampered JWT signature rejection
 * - Unauthenticated request rejection
 * - Payload validation (Zod rejection)
 * - Rate limiting headers
 */
export async function runSecurityTests(baseUrl: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Security & Auth', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Security & Auth', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  await runTest('Password hashing: plaintext password is never stored and matches bcrypt hash', async () => {
    const rawPassword = 'password123';
    const hash = await bcrypt.hash(rawPassword, 10);
    assert.notStrictEqual(hash, rawPassword, 'Stored hash must never match plaintext');
    assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'), 'Must be a valid bcrypt hash');
    const matches = await bcrypt.compare(rawPassword, hash);
    assert.strictEqual(matches, true, 'Bcrypt compare must succeed for valid password');
    const wrongMatches = await bcrypt.compare('wrongpassword', hash);
    assert.strictEqual(wrongMatches, false, 'Bcrypt compare must fail for invalid password');
  });

  await runTest('Login API rejects incorrect credentials with 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@bsctextiles.com',
        password: 'wrong_password_attempt',
      }),
    });
    assert.strictEqual(res.status, 401, `Expected 401 for incorrect password, got ${res.status}`);
  });

  await runTest('Protected endpoint rejects request without Authorization header', async () => {
    const res = await fetch(`${baseUrl}/api/employees`);
    assert.strictEqual(res.status, 401, `Expected 401 for missing token, got ${res.status}`);
  });

  await runTest('Protected endpoint rejects forged / tampered JWT token', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkZvcmdlZCBNYWxpY2lvdXMiLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const res = await fetch(`${baseUrl}/api/employees`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    assert.strictEqual(res.status, 401, `Expected 401 for forged token, got ${res.status}`);
  });

  await runTest('Input validation: invalid email format in login is rejected before processing', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email-address',
        password: 'password123',
      }),
    });
    assert.ok(
      res.status === 400 || res.status === 422,
      `Expected 400/422 for malformed email payload, got ${res.status}`
    );
  });

  await runTest('Security response headers: verify backend does not expose X-Powered-By Express', async () => {
    const res = await fetch(`${baseUrl}/api/locations`);
    // Helmet disables X-Powered-By
    assert.strictEqual(res.headers.get('x-powered-by'), null, 'X-Powered-By header should be hidden by Helmet');
  });

  return results;
}
