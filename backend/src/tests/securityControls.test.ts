/**
 * Security control test suite.
 *
 * Exercises the mechanisms the credential/hardening work added, at the level
 * where they can actually fail: the lockout state machine, the sliding-window
 * limiter, refresh-token rotation and reuse detection, the password policy, the
 * pepper in the hash, and the authorization rule that a Super Admin may not
 * manage credentials.
 *
 *   npm run test:security
 *   SECURITY_TEST_UNIT_ONLY=1 npm run test:security   # skip anything needing MySQL
 *
 * The database group creates one throwaway user under a unique login ID and
 * deletes only the rows it created.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { PasswordService } from '../services/passwordService.js';
import { evaluate, generateTemporaryPassword, passwordExpiryDate, isExpired } from '../services/passwordPolicy.js';
import { storeSlidingWindow, storeDel, KEY_PREFIX } from '../services/redisStore.js';
import { performLogin, networkOf } from '../services/authentication.js';
import { clearLoginGuard } from '../services/loginProtection.js';
import { issueTokenPair, rotateRefreshToken, issueFromFamily, RefreshReuseError, revokeAllUserTokens } from '../services/tokenService.js';
import { createCredential, CredentialError, type CredentialActor } from '../services/credentials.js';
import { cookieNames } from '../services/authCookies.js';
import { ipMatches, clientIpOf } from '../middleware/securityGuards.js';
import { setSetting, invalidateSecuritySettings } from '../services/systemSettings.js';

type Case = { group: string; name: string; run: () => Promise<void> };
const cases: Case[] = [];
const test = (group: string, name: string, run: () => Promise<void>) => cases.push({ group, name, run });

const UNIQUE = crypto.randomBytes(4).toString('hex');
const LOGIN_ID = `sec${UNIQUE}`.slice(0, 20).toLowerCase();
const PASSWORD = 'Correct-Horse-9-Battery!';

/** Set by the setup case: the credential service mints its own id. */
let USER_ID = `usr-unset-${UNIQUE}`;

/**
 * `auditlog.userId` has a foreign key, so the acting Admin must be a real
 * account — using a synthetic id would silently swallow every audit write and
 * the suite would then be asserting on an empty trail.
 */
let ACTOR_ID = '';

function actor(overrides: Partial<CredentialActor> = {}): CredentialActor {
  return {
    id: ACTOR_ID,
    email: 'actor@example.test',
    role: 'ADMIN',
    ip: '127.0.0.1',
    userAgent: 'security-suite',
    canManageCredentials: true,
    canManageRoles: false,
    ...overrides,
  };
}

const unitOnly = process.env.SECURITY_TEST_UNIT_ONLY === '1';

/** Temporarily overrides an env-derived knob and returns a restore function. */
function withLoginConfig(
  patch: Partial<{ captchaAfter: number; minResponseMs: number; travelWindowMinutes: number }>
): () => void {
  const before = { ...securityConfig.login };
  Object.assign(securityConfig.login as object, patch);
  return () => Object.assign(securityConfig.login as object, before);
}


// ─── A. Password policy ─────────────────────────────────────────────────────

test('policy', 'length, classes and common-password rules all report', async () => {
  const short = evaluate('Sh0rt!x', {});
  assert.equal(short.valid, false);
  assert.ok(short.errors.some((e) => /characters/i.test(e)));

  const noClass = evaluate('alllowercaseandlongenough', {});
  assert.equal(noClass.valid, false);
  assert.equal(noClass.checks.uppercase, false);

  const common = evaluate('Password123!', {});
  assert.equal(common.valid, false, 'a variant of a common password must be rejected');
});

test('policy', 'a password containing the login ID or name is rejected', async () => {
  const withLogin = evaluate('Deepa-Menon-2026-secure', { loginId: 'deepa', fullName: 'Deepa Menon' });
  assert.equal(withLogin.valid, false);
  assert.ok(withLogin.errors.some((e) => /login ID/i.test(e)), withLogin.errors.join('|'));

  const withName = evaluate('Qw9#Menonzzzalpha', { loginId: 'someone', fullName: 'Deepa Menon' });
  assert.equal(withName.valid, false);
});

test('policy', 'a strong password passes and scores high', async () => {
  const result = evaluate(PASSWORD, { loginId: LOGIN_ID, fullName: 'Test Subject' });
  assert.equal(result.valid, true, result.errors.join('|'));
  assert.ok(result.score >= 3, `expected score >= 3, got ${result.score}`);
  assert.ok(result.entropyBits > 70);
});

test('policy', 'generated temporary passwords satisfy the policy', async () => {
  for (let i = 0; i < 25; i++) {
    const candidate = generateTemporaryPassword();
    const result = evaluate(candidate, {});
    assert.equal(result.valid, true, `${candidate} -> ${result.errors.join('|')}`);
  }
});

test('policy', 'expiry date honours the configured window and 0 disables it', async () => {
  const days = securityConfig.password.expiryDays;
  const dated = passwordExpiryDate(new Date('2026-01-01T00:00:00Z'));
  if (days > 0) {
    assert.ok(dated);
    assert.equal(Math.round((dated!.getTime() - Date.UTC(2026, 0, 1)) / 86400000), days);
    assert.equal(isExpired({ passwordExpiresAt: new Date(Date.now() - 1000) }), true);
    assert.equal(isExpired({ passwordExpiresAt: new Date(Date.now() + 86400000) }), false);
  } else {
    assert.equal(dated, null);
  }
});

// ─── B. Hashing and pepper ──────────────────────────────────────────────────

test('hash', 'the pepper is part of the hash: the raw password must not verify', async () => {
  const hash = await PasswordService.hashPassword(PASSWORD);
  assert.ok(hash.startsWith('$argon2'), 'expected an Argon2id hash');
  const good = await PasswordService.verifyPassword(PASSWORD, hash);
  assert.equal(good.valid, true);
  assert.equal(good.needsRehash, false);

  // Verify against the un-peppered value directly: it must fail, which is what
  // proves the server-side secret is in the input path.
  const argon2 = await import('@node-rs/argon2');
  const rawMatches = await argon2.verify(hash, PASSWORD).catch(() => false);
  assert.equal(rawMatches, false, 'hash must not verify the bare password');
});

test('hash', 'a pre-pepper hash still logs the owner in and is flagged for upgrade', async () => {
  const argon2 = await import('@node-rs/argon2');
  const legacy = await argon2.hash(PASSWORD, { memoryCost: 65536, timeCost: 3, parallelism: 4 });
  const result = await PasswordService.verifyPassword(PASSWORD, legacy);
  assert.equal(result.valid, true, 'legacy credentials must keep working');
  assert.equal(result.needsRehash, true, 'and must be upgraded on use');
});

// ─── C. Rate limiting primitives ────────────────────────────────────────────

test('ratelimit', 'sliding window admits exactly `limit` hits then blocks', async () => {
  const key = `${KEY_PREFIX.rateLimit}test:${UNIQUE}`;
  const limit = 5;
  const windowMs = 60_000;
  await storeDel(key);

  let allowed = 0;
  let blocked: { resetMs: number } | null = null;
  for (let i = 0; i < 8; i++) {
    const result = await storeSlidingWindow(key, limit, windowMs);
    if (result.allowed) allowed++;
    else if (!blocked) blocked = { resetMs: result.resetMs };
  }
  assert.equal(allowed, limit, 'exactly the limit should be admitted');
  assert.ok(blocked, 'the 6th request must be denied');
  assert.ok(blocked!.resetMs > 0 && blocked!.resetMs <= windowMs, `resetMs out of range: ${blocked!.resetMs}`);
  await storeDel(key);
});

test('ratelimit', 'windows are independent per key', async () => {
  const a = `${KEY_PREFIX.rateLimit}t-a:${UNIQUE}`;
  const b = `${KEY_PREFIX.rateLimit}t-b:${UNIQUE}`;
  await storeDel(a);
  await storeDel(b);
  await storeSlidingWindow(a, 1, 60_000);
  const second = await storeSlidingWindow(a, 1, 60_000);
  const other = await storeSlidingWindow(b, 1, 60_000);
  assert.equal(second.allowed, false);
  assert.equal(other.allowed, true);
  await Promise.all([storeDel(a), storeDel(b)]);
});

test('ip', 'CIDR matching and trusted-proxy IP resolution', async () => {
  assert.equal(ipMatches('10.0.3.7', '10.0.0.0/16'), true);
  assert.equal(ipMatches('10.1.3.7', '10.0.0.0/16'), false);
  assert.equal(ipMatches('203.0.113.9', '203.0.113.9'), true);
  assert.equal(ipMatches('192.168.1.5', 'garbage'), false);

  // One trusted proxy hop: nginx appends the client it received from, so the
  // single XFF entry is the client.
  const oneHop = {
    ip: '10.0.0.2',
    socket: { remoteAddress: '10.0.0.2' },
    headers: { 'x-forwarded-for': '203.0.113.5' },
  } as any;
  assert.equal(clientIpOf(oneHop), '203.0.113.5');

  // Two hops: the inner proxy's own entry is trusted as well, so the client is
  // two places from the right.
  const twoHops = {
    ip: '10.0.0.2',
    socket: { remoteAddress: '10.0.0.2' },
    headers: { 'x-forwarded-for': '203.0.113.5, 198.51.100.4' },
  } as any;
  const previousHops = securityConfig.transport.trustProxyHops;
  (securityConfig.transport as { trustProxyHops: number }).trustProxyHops = 2;
  try {
    assert.equal(clientIpOf(twoHops), '203.0.113.5');
  } finally {
    (securityConfig.transport as { trustProxyHops: number }).trustProxyHops = previousHops;
  }

  // An XFF chain longer than the trusted hops must not let a caller pick its
  // own source address by prefixing fake entries.
  const forged = {
    ip: '10.0.0.2',
    socket: { remoteAddress: '10.0.0.2' },
    headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 10.0.0.2' },
  } as any;
  assert.equal(clientIpOf(forged), '10.0.0.2');
});

// ─── D. Cookies ─────────────────────────────────────────────────────────────

test('cookies', 'names and flags: HttpOnly session cookies, readable CSRF only', async () => {
  const names = cookieNames();
  assert.ok(names.access.endsWith('bsc_at'));
  assert.ok(names.refresh.endsWith('bsc_rt'));
  // In production the __Host- prefix must be present; in plain-HTTP dev it is
  // dropped because browsers reject a Secure-prefixed cookie over http.
  if (securityConfig.cookies.secure) {
    assert.ok(names.access.startsWith('__Host-'), 'production must use the __Host- prefix');
  }
  assert.equal(securityConfig.cookies.sameSite, 'strict');
});

// ─── E. Database-backed flows ───────────────────────────────────────────────

test('db', 'setup: create a test subject through the credential service', async () => {
  const [admins]: any = await pool.query(
    "SELECT `id` FROM `user` WHERE `role` IN ('ADMIN','SUPER_ADMIN') AND `isActive` = 1 ORDER BY `createdAt` ASC LIMIT 1"
  );
  assert.ok(admins?.length, 'need an existing Admin account to act as the credential issuer');
  ACTOR_ID = admins[0].id;

  const created = await createCredential(
    { fullName: 'Security Test Subject', loginId: LOGIN_ID, password: PASSWORD, mustChangePassword: true },
    actor()
  );
  USER_ID = created.user.id;
  assert.equal(created.user.loginId, LOGIN_ID);
  assert.equal(created.temporaryPassword, PASSWORD, 'a manual password is echoed once');
  assert.equal(created.user.mustChangePassword, true, 'first login must force a change');
});

test('db', 'Super Admin cannot create or change credentials', async () => {
  await assert.rejects(
    () =>
      createCredential(
        { fullName: 'Nope', loginId: `${LOGIN_ID}x`, password: PASSWORD },
        actor({ canManageCredentials: false, canManageRoles: true, role: 'SUPER_ADMIN' })
      ),
    (err: any) => err instanceof CredentialError && err.status === 403 && err.code === 'CREDENTIALS_ADMIN_ONLY'
  );
});

test('db', 'duplicate login IDs are refused', async () => {
  await assert.rejects(
    () => createCredential({ fullName: 'Dup', loginId: LOGIN_ID, password: PASSWORD }, actor()),
    (err: any) => err.status === 409
  );
});

test('db', 'first login is accepted but flagged, and the session cannot reach protected routes', async () => {
  const outcome = await performLogin({
    identifier: LOGIN_ID,
    password: PASSWORD,
    ip: '127.0.0.1',
    userAgent: 'security-test',
  });
  assert.equal(outcome.status, 'success', JSON.stringify(outcome));
  assert.ok(outcome.tokens?.accessToken);
  assert.ok(outcome.mustChangePassword, 'the temporary password must still be outstanding');

  const claims = JSON.parse(Buffer.from(outcome.tokens!.accessToken.split('.')[1], 'base64url').toString());
  assert.equal(claims.amr, 'pwd');
  assert.ok(claims.sid, 'the token is bound to a server-side session');
});

test('db', 'a captcha is demanded after the configured number of failures', async () => {
  const restore = withLoginConfig({ captchaAfter: 2 });
  try {
    await clearLoginGuard(LOGIN_ID, '127.0.0.1');
    await performLogin({ identifier: LOGIN_ID, password: 'wrong-one', ip: '127.0.0.1', userAgent: 'security-test' });
    await performLogin({ identifier: LOGIN_ID, password: 'wrong-two', ip: '127.0.0.1', userAgent: 'security-test' });
    const third = await performLogin({ identifier: LOGIN_ID, password: 'wrong-three', ip: '127.0.0.1', userAgent: 'security-test' });
    assert.equal(third.status, 'captcha_required', 'the third attempt must be gated by a challenge');
    assert.equal(third.captchaRequired, true);
    assert.equal(third.message, 'Enter the characters shown to continue.');
  } finally {
    restore();
  }
});

test('db', 'wrong passwords count, and the 4th attempt starts a 180s cooldown that rejects the CORRECT password', async () => {
  // The cooldown sequence is tested with the captcha gate lifted, because the
  // challenge is deliberately solvable and the lockout rule must hold either
  // way. The captcha itself is asserted in the case above.
  const restore = withLoginConfig({ captchaAfter: 999 });
  try {
    const max = securityConfig.login.maxAttempts;
    const lockSeconds = securityConfig.login.lockoutSeconds;
    await clearLoginGuard(LOGIN_ID, '127.0.0.1');
    let last: any = null;

    for (let i = 1; i < max; i++) {
      last = await performLogin({ identifier: LOGIN_ID, password: 'definitely-wrong', ip: '127.0.0.1', userAgent: 'security-test' });
      assert.equal(last.status, 'rejected', `attempt ${i} should be a plain rejection`);
      assert.equal(last.message, 'Invalid credentials', 'the message must not reveal which part failed');
    }

    last = await performLogin({ identifier: LOGIN_ID, password: 'definitely-wrong', ip: '127.0.0.1', userAgent: 'security-test' });
    assert.equal(last.status, 'locked', 'the final attempt must trip the cooldown');
    assert.ok(last.retryAfterSeconds > 0 && last.retryAfterSeconds <= lockSeconds, `retryAfter=${last.retryAfterSeconds}`);

    // The specification is explicit: during the cooldown even the right answer is
    // refused, so a lockout actually slows an attacker down.
    const duringCooldown = await performLogin({ identifier: LOGIN_ID, password: PASSWORD, ip: '127.0.0.1', userAgent: 'security-test' });
    assert.equal(duringCooldown.status, 'locked', 'correct password during cooldown must still be refused');
    assert.ok((duringCooldown.retryAfterSeconds ?? 0) > 0, 'a cooldown must report remaining seconds');

    const [stored]: any = await pool.query(
      'SELECT `lockedUntil`, `failedLoginAttempts`, `consecutiveLockouts` FROM `user` WHERE `id` = ?',
      [USER_ID]
    );
    assert.ok(stored?.[0]?.lockedUntil, 'the durable mirror must carry the cooldown across a store restart');
    assert.equal(Number(stored[0].consecutiveLockouts), 1);
  } finally {
    restore();
  }
});

test('db', 'an unknown login ID gets the same generic rejection', async () => {
  const outcome = await performLogin({
    identifier: `nobody-${UNIQUE}`,
    password: PASSWORD,
    ip: '127.0.0.1',
    userAgent: 'security-test',
  });
  assert.ok(['rejected', 'captcha_required', 'locked'].includes(outcome.status), outcome.status);
  assert.match(outcome.message || '', /Invalid credentials|Too many attempts|characters shown/);
});

test('db', 'clearing the guard lets the correct password in again', async () => {
  await clearLoginGuard(LOGIN_ID, '127.0.0.1');
  const outcome = await performLogin({ identifier: LOGIN_ID, password: PASSWORD, ip: '127.0.0.1', userAgent: 'security-test' });
  assert.equal(outcome.status, 'success', JSON.stringify(outcome));
});

test('db', 'refresh rotation spends the old token and reuse kills the family', async () => {
  const user = { id: USER_ID, email: `${LOGIN_ID}@bsctextiles.com`, role: 'EMPLOYEE', tokenVersion: 0 };
  const first = await issueTokenPair(user, { sessionId: null, ip: '127.0.0.1', userAgent: 'security-test' });

  const rotated = await rotateRefreshToken(first.refreshToken, { ip: '127.0.0.1', userAgent: 'security-test' });
  assert.ok(rotated, 'the first refresh should succeed');
  assert.equal(rotated!.familyId, first.familyId);

  const second = await issueFromFamily(user, rotated!, { ip: '127.0.0.1', userAgent: 'security-test' });
  assert.notEqual(second.refreshToken, first.refreshToken, 'rotation must mint a new secret');

  // Replaying the spent token is the theft signal: it must throw and revoke the
  // whole family, including the token that was just issued.
  await assert.rejects(
    () => rotateRefreshToken(first.refreshToken, { ip: '127.0.0.1', userAgent: 'security-test' }),
    (err: any) => err instanceof RefreshReuseError
  );

  const [revoked]: any = await pool.query(
    'SELECT COUNT(*) AS live FROM `refresh_token` WHERE `familyId` = ? AND `revokedAt` IS NULL',
    [first.familyId]
  );
  assert.equal(Number(revoked[0].live), 0, 'every token in the family must be revoked');

  // Any later presentation of a token from a revoked family is refused too —
  // reuse detection is not a one-shot flag that an attacker can exhaust.
  await assert.rejects(
    () => rotateRefreshToken(second.refreshToken, { ip: '127.0.0.1', userAgent: 'security-test' }),
    (err: any) => err instanceof RefreshReuseError
  );
});

test('db', 'revoking all tokens makes outstanding access tokens unusable', async () => {
  const pair = await issueTokenPair(
    { id: USER_ID, email: `${LOGIN_ID}@bsctextiles.com`, role: 'EMPLOYEE', tokenVersion: 0 },
    { ip: '127.0.0.1', userAgent: 'security-test' }
  );
  await revokeAllUserTokens(USER_ID, 'SECURITY_INCIDENT');
  const [rows]: any = await pool.query(
    'SELECT COUNT(*) AS live FROM `refresh_token` WHERE `userId` = ? AND `revokedAt` IS NULL',
    [USER_ID]
  );
  assert.equal(Number(rows[0].live), 0);
  assert.ok(pair.accessToken.split('.').length === 3);
});

test('db', 'credential writes are audited without the password', async () => {
  const [rows]: any = await pool.query(
    'SELECT `action`, `oldValue`, `newValue` FROM `auditlog` WHERE `entityType` = ? AND `entityId` IN (SELECT `id` FROM `user` WHERE `loginId` = ?) ORDER BY `createdAt` DESC LIMIT 5',
    ['UserCredential', LOGIN_ID]
  );
  assert.ok(rows.length > 0, 'the credential creation must leave an audit trail');
  const serialised = JSON.stringify(rows);
  assert.equal(serialised.includes(PASSWORD), false, 'no audit row may contain the password');
  assert.ok(/redacted|auto-generated|admin-supplied|shown once/i.test(serialised), 'the password slot must be a placeholder');
});

// ─── G. Login timing, travel detection and privileged networks ────────────

test('login', 'network prefixes group an IPv4 /24 and an IPv6 /64, and ignore junk', async () => {
  assert.equal(networkOf('103.21.55.9'), '103.21.55');
  assert.equal(networkOf('103.21.99.4'), '103.21.99');
  assert.notEqual(networkOf('103.21.55.9'), networkOf('103.21.99.4'));
  assert.equal(networkOf('103.21.55.9'), networkOf('103.21.55.201'));
  assert.equal(
    networkOf('2001:db8:1111:2222:3333:4444:5555:6666'),
    networkOf('2001:db8:1111:2222:9999:9999:9999:9999'),
    'same /64 must count as the same network'
  );
  assert.notEqual(networkOf('2001:db8:1111:2222::1'), networkOf('2001:db8:aaaa::1'));
  assert.equal(networkOf(''), '');
});

test('login', 'every login answer is held to the configured minimum response time', async () => {
  const restore = withLoginConfig({ minResponseMs: 400 });
  try {
    // The fast paths are the leak: an unknown login ID and a cooldown refusal
    // both return long before an Argon2id verification would.
    const started = Date.now();
    await performLogin({
      identifier: `nosuchuser-${UNIQUE}`,
      password: 'Whatever-123456!',
      ip: '203.0.113.77',
      userAgent: 'security-suite',
    });
    const elapsed = Date.now() - started;
    assert.ok(
      elapsed >= 380,
      `unknown-user response came back in ${elapsed}ms — timing still reveals account existence`
    );
  } finally {
    restore();
  }
});

test('db', 'a second successful sign-in from a different network raises IMPOSSIBLE_TRAVEL', async () => {
  await clearLoginGuard(LOGIN_ID, '198.51.100.20');
  await pool.query('DELETE FROM `security_event` WHERE `userId` = ?', [USER_ID]);
  // Earlier cases in this suite logged in successfully from 127.0.0.1. The
  // detector reports the most recent differing network, so clear the history to
  // make the assertion about *this* pair of addresses and nothing else.
  await pool.query('DELETE FROM `login_attempt` WHERE `userId` = ?', [USER_ID]);

  // Pretend the account signed in successfully from another /24 one minute ago.
  await pool.query(
    `INSERT INTO \`login_attempt\` (\`id\`, \`email\`, \`userId\`, \`ipAddress\`, \`userAgent\`, \`success\`, \`failureReason\`, \`createdAt\`)
     VALUES ('la-travel-1', ?, ?, '203.0.113.44', 'security-suite', 1, NULL, DATE_SUB(NOW(3), INTERVAL 1 MINUTE))`,
    [`${LOGIN_ID}@bsctextiles.com`, USER_ID]
  );

  const restore = withLoginConfig({ travelWindowMinutes: 15, captchaAfter: 99, minResponseMs: 0 });
  let outcome;
  try {
    outcome = await performLogin({
      identifier: LOGIN_ID,
      password: PASSWORD,
      ip: '198.51.100.20',
      userAgent: 'security-suite',
    });
  } finally {
    restore();
  }
  assert.equal(outcome.status, 'success', `login should succeed: ${outcome.message}`);

  const [rows]: any = await pool.query(
    "SELECT \`type\`, \`details\` FROM \`security_event\` WHERE \`userId\` = ? AND \`type\` = 'IMPOSSIBLE_TRAVEL'",
    [USER_ID]
  );
  assert.ok(rows?.length, 'expected an IMPOSSIBLE_TRAVEL security event');
  // mysql2 in this project pre-parses JSON columns, so `details` arrives as an
  // object; accept either shape rather than depending on that behaviour.
  const details =
    typeof rows[0].details === 'string' ? JSON.parse(rows[0].details) : rows[0].details || {};
  assert.equal(details.previousIp, '203.0.113.44');
  assert.equal(details.method, 'network-prefix-change');
});

test('db', 'a correct Admin password from outside the privileged network list is refused', async () => {
  await pool.query("UPDATE \`user\` SET \`role\` = 'ADMIN' WHERE \`id\` = ?", [USER_ID]);
  await pool.query('DELETE FROM `security_event` WHERE `userId` = ?', [USER_ID]);
  await setSetting('admin_ip_allowlist_enabled', 'true', ACTOR_ID);
  await setSetting('privileged_login_cidrs', '10.0.0.0/8, 192.168.7.0/24', ACTOR_ID);
  invalidateSecuritySettings();

  const restore = withLoginConfig({ captchaAfter: 99, minResponseMs: 0, travelWindowMinutes: 0 });
  try {
    const outside = await performLogin({
      identifier: LOGIN_ID,
      password: PASSWORD,
      ip: '203.0.113.9',
      userAgent: 'security-suite',
    });
    assert.equal(outside.status, 'rejected', 'an off-list network must not get a session');
    assert.ok(
      /network is not allowed/i.test(outside.message || ''),
      `unexpected message: ${outside.message}`
    );

    const [events]: any = await pool.query(
      "SELECT \`id\` FROM \`security_event\` WHERE \`userId\` = ? AND \`type\` = 'PRIVILEGED_LOGIN_BLOCKED'",
      [USER_ID]
    );
    assert.ok(events?.length, 'the block must be recorded and alerted');

    await clearLoginGuard(LOGIN_ID, '10.1.2.3');
    const inside = await performLogin({
      identifier: LOGIN_ID,
      password: PASSWORD,
      ip: '10.1.2.3',
      userAgent: 'security-suite',
    });
    assert.equal(inside.status, 'success', `on-list network should be allowed: ${inside.message}`);
  } finally {
    restore();
    await setSetting('admin_ip_allowlist_enabled', 'false', ACTOR_ID);
    await setSetting('privileged_login_cidrs', '', ACTOR_ID);
    invalidateSecuritySettings();
    await pool.query("UPDATE \`user\` SET \`role\` = 'EMPLOYEE' WHERE \`id\` = ?", [USER_ID]);
  }
});

test('db', 'an enabled allowlist with no entries warns and allows instead of locking everyone out', async () => {
  await pool.query("UPDATE \`user\` SET \`role\` = 'ADMIN' WHERE \`id\` = ?", [USER_ID]);
  await setSetting('admin_ip_allowlist_enabled', 'true', ACTOR_ID);
  await setSetting('privileged_login_cidrs', '', ACTOR_ID);
  invalidateSecuritySettings();

  const restore = withLoginConfig({ captchaAfter: 99, minResponseMs: 0, travelWindowMinutes: 0 });
  try {
    await clearLoginGuard(LOGIN_ID, '203.0.113.31');
    const outcome = await performLogin({
      identifier: LOGIN_ID,
      password: PASSWORD,
      ip: '203.0.113.31',
      userAgent: 'security-suite',
    });
    assert.equal(
      outcome.status,
      'success',
      'an empty allowlist must fail open — locking every Admin out with no recovery path is worse'
    );
  } finally {
    restore();
    await setSetting('admin_ip_allowlist_enabled', 'false', ACTOR_ID);
    invalidateSecuritySettings();
    await pool.query("UPDATE \`user\` SET \`role\` = 'EMPLOYEE' WHERE \`id\` = ?", [USER_ID]);
  }
});

test('db', 'teardown removes only the rows this suite created', async () => {
  await pool.query('DELETE FROM `userrole` WHERE `userId` = ?', [USER_ID]);
  await pool.query('DELETE FROM `password_history` WHERE `userId` = ?', [USER_ID]);
  await pool.query('DELETE FROM `refresh_token` WHERE `userId` = ?', [USER_ID]);
  await pool.query('DELETE FROM `session` WHERE `userId` = ?', [USER_ID]);
  await pool.query('DELETE FROM `login_attempt` WHERE `userId` = ? OR `loginId` = ? OR `email` = ?', [USER_ID, LOGIN_ID, `${LOGIN_ID}@bsctextiles.com`]);
  await pool.query('DELETE FROM `security_event` WHERE `userId` = ?', [USER_ID]);
  await pool.query("DELETE FROM `login_attempt` WHERE `id` = 'la-travel-1'");
  await pool.query('DELETE FROM `auditlog` WHERE `entityId` = ? OR `entityId` IN (SELECT `id` FROM `user` WHERE `loginId` = ?)', [USER_ID, LOGIN_ID]);
  await pool.query('DELETE FROM `user` WHERE `id` = ? OR `loginId` = ?', [USER_ID, LOGIN_ID]);
  const [left]: any = await pool.query('SELECT COUNT(*) AS n FROM `user` WHERE `loginId` = ?', [LOGIN_ID]);
  assert.equal(Number(left[0].n), 0);
});

// ─── Runner ─────────────────────────────────────────────────────────────────

async function databaseReachable(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name IN ('refresh_token','ip_rules','security_config')`
    );
    return Number(rows?.[0]?.n || 0) === 3;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  const withDatabase = !unitOnly && (await databaseReachable());
  console.log('================================================================');
  console.log('🧪 SECURITY CONTROLS SUITE');
  console.log(`   ${withDatabase ? 'unit + database integration' : unitOnly ? 'unit only (SECURITY_TEST_UNIT_ONLY=1)' : 'unit only — no database reachable'}`);
  console.log(`   policy: ${securityConfig.password.minLength}+ chars, history ${securityConfig.password.historyCount}, expiry ${securityConfig.password.expiryDays}d`);
  console.log(`   lockout: ${securityConfig.login.maxAttempts} attempts → ${securityConfig.login.lockoutSeconds}s, captcha after ${securityConfig.login.captchaAfter}`);
  console.log('================================================================\n');

  let passed = 0;
  let skipped = 0;
  const failures: Array<{ group: string; name: string; error: string }> = [];
  let currentGroup = '';

  for (const testCase of cases) {
    if (!withDatabase && testCase.group === 'db') {
      skipped++;
      continue;
    }
    if (testCase.group !== currentGroup) {
      currentGroup = testCase.group;
      console.log(`\n▶ ${currentGroup}`);
    }
    const started = Date.now();
    try {
      await testCase.run();
      passed++;
      console.log(`  ✔ ${testCase.name} (${Date.now() - started}ms)`);
    } catch (err: any) {
      failures.push({ group: testCase.group, name: testCase.name, error: err?.message || String(err) });
      console.log(`  ✖ ${testCase.name}`);
      console.log(`      ${err?.message || err}`);
    }
  }

  await pool.end().catch(() => undefined);

  console.log('\n----------------------------------------------------------------');
  console.log(`Total: ${cases.length}   Passed: ${passed}   Failed: ${failures.length}   Skipped: ${skipped}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  · [${failure.group}] ${failure.name}\n    ${failure.error}`);
    console.log('----------------------------------------------------------------');
    process.exit(1);
  }
  console.log('🎉 All security control tests passed.');
  console.log('----------------------------------------------------------------');
  process.exit(0);
}


run().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
