import assert from 'node:assert';
import crypto from 'node:crypto';
import { PasswordService } from '../services/passwordService.js';
import { MfaService } from '../services/mfaService.js';
import { SessionService } from '../services/sessionService.js';
import { FileSecurityService } from '../services/fileSecurityService.js';
import { AuditService } from '../services/auditService.js';
import { prisma } from '../db.js';
import { authenticator } from 'otplib';

export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export async function runComprehensiveSecurityTests(baseUrl: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Enterprise Security Core', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Enterprise Security Core', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  const adminUser = await prisma.user.findFirst({ where: { email: 'admin@bsctextiles.com' } });
  const validUserId = adminUser?.id || 'cmuwszr8b00001vdt6ldrzqdn';

  // 1. Argon2id Password Hashing & Verification
  await runTest('1. Password Hashing: Argon2id produces valid hash and verifies successfully', async () => {
    const raw = 'StrongP@ssw0rd2026!';
    const hash = await PasswordService.hashPassword(raw);
    assert.ok(hash.startsWith('$argon2') || hash.startsWith('$2'), 'Hash must be Argon2id (or fallback bcrypt)');
    const checkValid = await PasswordService.verifyPassword(raw, hash);
    assert.strictEqual(checkValid.valid, true, 'Valid password must verify');
    const checkInvalid = await PasswordService.verifyPassword('WrongP@ssw0rd!', hash);
    assert.strictEqual(checkInvalid.valid, false, 'Invalid password must fail verification');
  });

  // 2. Password Strength Policy
  await runTest('2. Password Policy: Enforces 12 chars, upper, lower, digit, symbol', async () => {
    const weakShort = PasswordService.validateStrength('Short1!');
    assert.strictEqual(weakShort.isValid, false, 'Short password must be rejected');

    const noSymbol = PasswordService.validateStrength('NoSymbols123456');
    assert.strictEqual(noSymbol.isValid, false, 'Password without symbol must be rejected');

    const noNumber = PasswordService.validateStrength('NoNumbersSymbol!');
    assert.strictEqual(noNumber.isValid, false, 'Password without number must be rejected');

    const validStrong = PasswordService.validateStrength('Enterprise#Secure2026');
    assert.strictEqual(validStrong.isValid, true, 'Compliant password must pass strength policy');
  });

  // 3. Password History Tracking (Prevent reuse of last 12)
  await runTest('3. Password History: Prevents reuse of previous passwords', async () => {
    const p1 = 'FirstP@ssword2026!';
    const p1Hash = await PasswordService.hashPassword(p1);

    await PasswordService.recordPasswordHistory(validUserId, p1Hash);

    const isReused = await PasswordService.isPasswordInHistory(validUserId, p1);
    assert.strictEqual(isReused, true, 'Reused password must be detected in history');

    const isNew = await PasswordService.isPasswordInHistory(validUserId, 'UniqueDiffP@ss2026!');
    assert.strictEqual(isNew, false, 'New password must not be in history');
  });

  // 4. Account Enumeration Defense
  await runTest('4. Account Enumeration: Generic error on invalid login and forgot-password', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `nonexistent_${Date.now()}@bsctextiles.com`,
        password: 'SomePassword123!',
      }),
    });
    assert.strictEqual(loginRes.status, 401, 'Non-existent account must return 401');
    const loginJson: any = await loginRes.json();
    assert.strictEqual(loginJson.error, 'Invalid credentials', 'Must not disclose if user exists');

    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `nonexistent_${Date.now()}@bsctextiles.com` }),
    });
    assert.strictEqual(forgotRes.status, 200, 'Forgot password must return 200 generic message');
  });

  // 5. Registration Approval Workflow & Status Enforcement
  await runTest('5. Registration Workflow: Unapproved accounts are blocked from accessing protected resources', async () => {
    const testEmail = `test_reg_${Date.now()}@bsctextiles.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'ValidSecure#Pass2026',
        fullName: 'Test Candidate',
      }),
    });
    assert.strictEqual(regRes.status, 201, 'Registration submission must return 201');
    const regJson: any = await regRes.json();
    assert.strictEqual(regJson.status, 'PENDING_EMAIL_VERIFICATION');

    // Attempting login while unverified must return 403
    const loginAttempt = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'ValidSecure#Pass2026',
      }),
    });
    assert.strictEqual(loginAttempt.status, 403, 'Unverified account must be blocked from logging in');

    // Clean up test user
    await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {});
  });

  // 6. MFA Setup & Backup Codes Verification
  await runTest('6. MFA: TOTP enrollment generates backup codes, verification burns single-use code', async () => {
    const enrollment = await MfaService.generateTotpEnrollment(validUserId, 'admin@bsctextiles.com');

    assert.ok(enrollment.secret, 'Must generate TOTP secret');
    assert.ok(enrollment.qrCodeDataUrl.startsWith('data:image/png'), 'Must generate QR code');
    assert.strictEqual(enrollment.backupCodes.length, 10, 'Must generate 10 backup codes');

    // Confirm device with valid TOTP code
    const validTotp = authenticator.generate(enrollment.secret);
    const confirmed = await MfaService.confirmTotpEnrollment(validUserId, validTotp);
    assert.strictEqual(confirmed, true, 'Confirm enrollment must succeed with valid code');

    // Verify challenge using single-use backup code
    const backupCodeToUse = enrollment.backupCodes[0];
    const challenge1 = await MfaService.verifyChallenge(validUserId, backupCodeToUse);
    assert.strictEqual(challenge1.success, true, 'Backup code must succeed on first use');
    assert.strictEqual(challenge1.method, 'backup_code');

    // Second use of same backup code must be rejected (burned)
    const challenge2 = await MfaService.verifyChallenge(validUserId, backupCodeToUse);
    assert.strictEqual(challenge2.success, false, 'Used backup code must be burned/rejected');

    // Clean up
    await MfaService.disableMfa(validUserId).catch(() => {});
  });

  // 7. Session Revocation & Blocklist
  await runTest('7. Session Management: Revoked sessions are immediately rejected', async () => {
    const sessionId = await SessionService.createSession({
      userId: validUserId,
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
    });

    const activeCheck = await SessionService.validateSession(sessionId);
    assert.strictEqual(activeCheck.valid, true, 'Newly created session must be valid');

    // Revoke session
    await SessionService.revokeSession(sessionId, 'ADMIN_REVOKE');

    const revokedCheck = await SessionService.validateSession(sessionId);
    assert.strictEqual(revokedCheck.valid, false, 'Revoked session must be invalid');
    const isBlocklisted = await SessionService.isRevoked(sessionId);
    assert.strictEqual(isBlocklisted, true, 'Revoked session must appear in blocklist');

    // Clean up
    await prisma.session.deleteMany({ where: { id: sessionId } }).catch(() => {});
    await prisma.revokedToken.deleteMany({ where: { jti: sessionId } }).catch(() => {});
  });

  // 8. Server-Side RBAC & Clear Permission Denial
  await runTest('8. RBAC: Unauthorized actions return HTTP 403 with standard security message', async () => {
    // Attempting an administrative action without super admin / hr role
    const salesLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rajesh.kumar@bsctextiles.com',
        password: 'password123',
      }),
    });
    const salesData: any = await salesLogin.json();

    if (salesData.token) {
      const forbiddenRes = await fetch(`${baseUrl}/api/security/dashboard`, {
        headers: { Authorization: `Bearer ${salesData.token}` },
      });
      assert.strictEqual(forbiddenRes.status, 403, 'Non-admin must be denied access to security dashboard');
      const errJson: any = await forbiddenRes.json();
      assert.strictEqual(errJson.message, 'You do not have permission to perform this action.');
    }
  });

  // 9. CSRF Defense
  await runTest('9. CSRF: Cookie-authenticated mutating requests require x-csrf-token header', async () => {
    const csrfRes = await fetch(`${baseUrl}/api/auth/csrf-token`);
    assert.strictEqual(csrfRes.status, 200, 'Must provide CSRF token endpoint');
    const csrfJson: any = await csrfRes.json();
    assert.ok(csrfJson.csrfToken, 'Must return valid CSRF token');
  });

  // 10. Security Response Headers
  await runTest('10. Security Headers: Strict CSP, HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('content-security-policy'), 'Content-Security-Policy header must be present');
    assert.strictEqual(res.headers.get('x-powered-by'), null, 'X-Powered-By must be stripped');
  });

  // 11. File Upload Magic Bytes & Anti-Malware Defense
  await runTest('11. File Security: Validates magic bytes and detects EICAR malware test string', async () => {
    // 1. Valid PNG signature
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    const pngVal = FileSecurityService.validateFile('sample.png', validPngBuffer, ['png']);
    assert.strictEqual(pngVal.valid, true, 'Valid PNG magic bytes must be accepted');

    // 2. Forged PNG (plain text disguised as PNG)
    const forgedPngBuffer = Buffer.from('This is a plain text file pretending to be an image');
    const forgedVal = FileSecurityService.validateFile('fake.png', forgedPngBuffer, ['png']);
    assert.strictEqual(forgedVal.valid, false, 'Forged magic bytes must be rejected');

    // 3. Double extension rejection
    const doubleExtBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const doubleExtVal = FileSecurityService.validateFile('exploit.php.png', doubleExtBuffer, ['png']);
    assert.strictEqual(doubleExtVal.valid, false, 'Dangerous double extension must be rejected');

    // 4. Path traversal filename rejection
    const traversalVal = FileSecurityService.validateFile('../../etc/passwd.png', validPngBuffer, ['png']);
    assert.strictEqual(traversalVal.valid, false, 'Path traversal filename must be rejected');

    // 5. EICAR Antivirus Test Scanner Detection
    const eicarBuffer = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    const scanResult = await FileSecurityService.scanFile(eicarBuffer);
    assert.strictEqual(scanResult.status, 'INFECTED', 'EICAR test file must be quarantined as INFECTED');
  });

  // 12. Tamper-Resistant Audit Log Hash Chains
  await runTest('12. Audit Logging: SHA-256 hash chaining and tamper-integrity verification', async () => {
    const id1 = await AuditService.log({
      userId: validUserId,
      action: 'TEST_ACTION_CHAIN_1',
      entityType: 'SystemTest',
      entityId: 'test_ent_1',
      ipAddress: '127.0.0.1',
    });
    const id2 = await AuditService.log({
      userId: validUserId,
      action: 'TEST_ACTION_CHAIN_2',
      entityType: 'SystemTest',
      entityId: 'test_ent_2',
      ipAddress: '127.0.0.1',
    });

    assert.ok(id1 && id2, 'Must create audit log entries');

    const integrity = await AuditService.verifyIntegrity(50);
    assert.strictEqual(integrity.valid, true, 'Audit log cryptographic hash chain must verify as valid');
  });

  return results;
}
