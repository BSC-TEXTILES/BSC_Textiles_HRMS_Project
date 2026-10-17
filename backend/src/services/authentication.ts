/**
 * The sign-in core, shared by the cookie login route and the legacy bearer
 * route so there is exactly one place that decides whether a credential is
 * accepted.
 *
 * Order of operations is a security decision, not an accident:
 *   1. cooldown and CAPTCHA gates run *before* any password work, so a locked
 *      account cannot be probed and brute force is rate-limited by design;
 *   2. an unknown login ID still performs a dummy hash verification, so the
 *      response time does not reveal which accounts exist;
 *   3. the password is verified with the same Argon2 parameters either way;
 *   4. on success the stored hash is upgraded (pepper, newer cost) if it needs it.
 */
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { PasswordService } from './passwordService.js';
import { SessionService } from './sessionService.js';
import { AuditService } from './auditService.js';
import { SecurityMonitoringService } from './securityMonitoringService.js';
import { getLoginGuardStatus, registerFailedAttempt, clearLoginGuard } from './loginProtection.js';
import { verifyCaptcha } from './captchaService.js';
import { issueTokenPair, bumpTokenVersion } from './tokenService.js';
import { raiseSecurityAlert } from './securityAlerts.js';
import {
  mfaRequiredForPrivileged,
  adminIpAllowlistEnabled,
  privilegedLoginCidrs,
} from './systemSettings.js';
import { ipMatches } from '../middleware/securityGuards.js';
import { storeSet, storeGet, storeDel, KEY_PREFIX } from './redisStore.js';
import { isExpired as passwordIsExpired } from './passwordPolicy.js';

export interface LoginRequest {
  identifier: string;
  password: string;
  captchaId?: string;
  captchaAnswer?: string;
  ip: string;
  userAgent: string;
}

export interface LoginOutcome {
  status: 'success' | 'mfa_required' | 'rejected' | 'locked' | 'captcha_required' | 'password_expired';
  user?: PublicUser;
  sessionId?: string | null;
  tokens?: { accessToken: string; refreshToken: string; accessExpiresIn: number };
  ticket?: string;
  mustChangePassword?: boolean;
  /** Seconds left on an active cooldown — the only lockout detail exposed. */
  retryAfterSeconds?: number;
  captchaRequired?: boolean;
  message?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  loginId: string | null;
  fullName: string;
  role: string;
  permissions: string[];
  locationId: string | null;
  employeeId: string | null;
  mfaEnabled: boolean;
}

function toPublicUser(row: any): PublicUser {
  return {
    id: row.id,
    email: row.email,
    loginId: row.loginId ?? null,
    fullName: row.fullName,
    role: row.role,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    locationId: row.locationId ?? null,
    employeeId: row.employeeId ?? null,
    mfaEnabled: Boolean(row.mfaEnabled),
  };
}

async function findUser(identifier: string): Promise<any | null> {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const [byLogin]: any = await pool.query(
    'SELECT * FROM `user` WHERE LOWER(`loginId`) = ? OR LOWER(`email`) = ? LIMIT 1',
    [lower, lower]
  );
  if (byLogin?.length) return byLogin[0];

  // Employee code sign-in, as before: the code resolves to its linked account.
  const [byCode]: any = await pool.query(
    `SELECT u.* FROM \`user\` u JOIN \`employee\` e ON e.\`id\` = u.\`employeeId\`
      WHERE e.\`employeeCode\` = ? OR e.\`employeeCode\` = ? LIMIT 1`,
    [raw, raw.toUpperCase()]
  );
  return byCode?.[0] || null;
}

/** A constant-time dummy verify so a missing account costs the same as a wrong password. */
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$' + crypto.randomBytes(16).toString('base64');

async function burn(password: string): Promise<void> {
  await PasswordService.verifyPassword(password, DUMMY_HASH).catch(() => undefined);
}

/**
 * Network prefix for a source address: /24 for IPv4, /64 for IPv6. Two sign-ins
 * from the same prefix are treated as the same place; two from different
 * prefixes are not. Exported for the test suite — the travel check is only as
 * good as this function, and a wrong prefix would silently disable it.
 */
export function networkOf(ip: string): string {
  const value = String(ip || '').trim();
  if (!value) return '';
  if (value.includes(':')) return value.split(':').slice(0, 4).join(':');
  return value.split('.').slice(0, 3).join('.');
}

async function detectAnomaly(user: any, ip: string, userAgent: string): Promise<void> {
  try {
    const [rows]: any = await pool.query(
      'SELECT `ipAddress`, `createdAt` FROM `login_attempt` WHERE `userId` = ? AND `success` = 1 ORDER BY `createdAt` DESC LIMIT 10',
      [user.id]
    );
    const history = (rows || []).filter((r: any) => r.ipAddress);
    const previous = history.map((r: any) => r.ipAddress);

    if (previous.length && !previous.includes(ip)) {
      const [devices]: any = await pool.query(
        'SELECT `id` FROM `device_fingerprint` WHERE `userId` = ? AND `userAgent` = ? LIMIT 1',
        [user.id, userAgent]
      );
      if (!devices?.length) {
        await raiseSecurityAlert({
          title: `New device or network signed in as ${user.loginId || user.email}`,
          message: `${user.email} signed in from ${ip} (previously seen: ${previous.slice(0, 3).join(', ')}).`,
          alsoEmail: [user.email],
          event: {
            type: 'NEW_DEVICE',
            severity: 'MEDIUM',
            userId: user.id,
            ipAddress: ip,
            riskScore: 40,
            details: { previousIps: previous.slice(0, 5), userAgent },
          },
        });
      }
    }

    // Impossible travel. There is no GeoIP database here, so this is a network
    // velocity check, not a distance one: the same account succeeding from two
    // different /24 (or /64) networks inside the window. That catches the case
    // the requirement is actually about — credentials working in two places at
    // once — without phoning a third party with employee IP addresses on every
    // sign-in. See SECURITY.md §15 for what upgrading it to real distances costs.
    const windowMs = securityConfig.login.travelWindowMinutes * 60_000;
    if (windowMs > 0) {
      const here = networkOf(ip);
      const nearby = history.find((r: any) => {
        const when = new Date(r.createdAt).getTime();
        return Number.isFinite(when) && Math.abs(Date.now() - when) <= windowMs && networkOf(r.ipAddress) !== here;
      });
      if (nearby) {
        const minutes = Math.max(1, Math.round((Date.now() - new Date(nearby.createdAt).getTime()) / 60_000));
        await raiseSecurityAlert({
          title: `Account ${user.loginId || user.email} signed in from two networks in ${minutes} min`,
          message: `${user.email} signed in from ${ip}, but signed in from ${nearby.ipAddress} ${minutes} minute(s) ago. If this was not the same person moving, treat the account as compromised.`,
          alsoEmail: [user.email],
          event: {
            type: 'IMPOSSIBLE_TRAVEL',
            severity: 'HIGH',
            userId: user.id,
            ipAddress: ip,
            riskScore: 70,
            details: {
              previousIp: nearby.ipAddress,
              minutesSincePreviousLogin: minutes,
              windowMinutes: securityConfig.login.travelWindowMinutes,
              method: 'network-prefix-change',
            },
          },
        });
      }
    }
  } catch (err: any) {
    console.warn('[auth] anomaly check skipped:', err?.message);
  }
}

/**
 * Public entry point. Every outcome — cooldown refusal, captcha refusal, wrong
 * password, success — is held until `LOGIN_MIN_RESPONSE_MS` has elapsed.
 *
 * Argon2id already equalises the expensive branch, but a locked account returns
 * in about a millisecond while a real verification takes hundreds. Without this
 * floor, timing alone tells an attacker which login IDs exist and which are
 * currently locked, which is exactly the enumeration the rest of this module is
 * arranged to prevent.
 */
export async function performLogin(request: LoginRequest): Promise<LoginOutcome> {
  const startedAt = Date.now();
  const outcome = await performLoginInner(request);
  const elapsed = Date.now() - startedAt;
  const floor = securityConfig.login.minResponseMs;
  if (floor > elapsed) {
    await new Promise((resolve) => setTimeout(resolve, floor - elapsed));
  }
  return outcome;
}

async function performLoginInner(request: LoginRequest): Promise<LoginOutcome> {
  const identifier = String(request.identifier || '').trim();
  const ip = request.ip;

  const guard = await getLoginGuardStatus(identifier, ip);
  if (guard.locked) {
    await SecurityMonitoringService.recordLoginAttempt({
      email: identifier,
      ipAddress: ip,
      userAgent: request.userAgent,
      success: false,
      failureReason: 'Account in cooldown',
    }).catch(() => undefined);
    return {
      status: 'locked',
      retryAfterSeconds: guard.remainingSeconds,
      captchaRequired: true,
      message: 'Too many attempts. Please wait before trying again.',
    };
  }

  if (guard.captchaRequired) {
    const ok = await verifyCaptcha(request.captchaId || '', request.captchaAnswer || '');
    if (!ok) {
      return {
        status: 'captcha_required',
        captchaRequired: true,
        message: 'Enter the characters shown to continue.',
      };
    }
  }

  const user = await findUser(identifier);

  if (!user) {
    // Same work, same message: the response must not distinguish "no such user".
    await burn(request.password);
    const failure = await registerFailedAttempt({ loginId: identifier, ip, userId: null, userAgent: request.userAgent });
    await SecurityMonitoringService.recordLoginAttempt({
      email: identifier,
      ipAddress: ip,
      userAgent: request.userAgent,
      success: false,
      failureReason: 'User not found',
    }).catch(() => undefined);
    return rejectOutcome(failure);
  }

  if (!user.isActive || (user.status && user.status !== 'ACTIVE')) {
    await burn(request.password);
    return {
      status: 'rejected',
      message: 'Invalid credentials',
      captchaRequired: guard.captchaRequired,
    };
  }

  const verification = await PasswordService.verifyPassword(request.password, user.passwordHash);
  if (!verification.valid) {
    const failure = await registerFailedAttempt({
      loginId: identifier,
      ip,
      userId: user.id,
      userAgent: request.userAgent,
      email: user.email,
    });
    await SecurityMonitoringService.recordLoginAttempt({
      email: user.email,
      ipAddress: ip,
      userAgent: request.userAgent,
      success: false,
      failureReason: 'Invalid password',
      userId: user.id,
      locationId: user.locationId || undefined,
    }).catch(() => undefined);
    return rejectOutcome(failure);
  }

  // Upgrade the stored hash in place (pepper or cost changes) on a good login.
  if (verification.needsRehash) {
    const fresh = await PasswordService.hashPassword(request.password);
    await pool.query('UPDATE `user` SET `passwordHash` = ? WHERE `id` = ?', [fresh, user.id]);
    await PasswordService.recordPasswordHistory(user.id, fresh);
  }

  // Privileged logins from an unapproved network are refused *after* the
  // password has been verified. Refusing earlier would answer "wrong password"
  // and "you are not on the allowed network" with the same bytes, which is what
  // makes the control usable without turning it into an account oracle.
  if (['SUPER_ADMIN', 'ADMIN'].includes(String(user.role).toUpperCase())) {
    const enforced = await adminIpAllowlistEnabled();
    const cidrs = enforced ? await privilegedLoginCidrs() : [];
    // Enabled with an empty list is a misconfiguration, not a policy. Locking
    // every Admin out with no way back except database surgery is the worse
    // failure, so this warns and allows — and says so in the health output.
    if (enforced && cidrs.length === 0) {
      console.warn(
        '[auth] privileged IP allowlist is enabled but empty — enforcement skipped. Set privileged_login_cidrs.'
      );
    } else if (enforced && cidrs.length && !cidrs.some((entry) => ipMatches(ip, entry))) {
      await clearLoginGuard(identifier, ip);
      await raiseSecurityAlert({
        title: `Privileged sign-in blocked from ${ip}`,
        message: `${user.email} has the right password but signed in from ${ip}, which is not in the privileged allowlist.`,
        event: {
          type: 'PRIVILEGED_LOGIN_BLOCKED',
          severity: 'HIGH',
          userId: user.id,
          ipAddress: ip,
          riskScore: 80,
          details: { role: user.role, allowlist: cidrs, userAgent: request.userAgent },
        },
      });
      return {
        status: 'rejected',
        message: 'Your password is correct, but this network is not allowed for administrator sign-ins.',
      };
    }
  }

  const needsMfa =
    Boolean(user.mfaEnabled) ||
    (await mfaRequiredForPrivileged() && ['SUPER_ADMIN', 'ADMIN'].includes(String(user.role).toUpperCase()));

  if (needsMfa) {
    const challengeId = crypto.randomUUID();
    await storeSet(
      `${KEY_PREFIX.session}mfa:${challengeId}`,
      JSON.stringify({ userId: user.id, ip, userAgent: request.userAgent }),
      300_000
    );
    return {
      status: 'mfa_required',
      message: 'Enter your authenticator code to finish signing in.',
      user: toPublicUser(user),
      sessionId: challengeId,
    };
  }

  if (user.passwordExpiresAt && passwordIsExpired(user)) {
    // Expired passwords are accepted only to change the password; the caller
    // gets a distinct status so the UI can route there instead of the app.
    const sessionId = await createSession(user, ip, request.userAgent, false);
    const tokens = await issueFor(user, sessionId, ip, request.userAgent, 'pwd');
    return {
      status: 'password_expired',
      user: toPublicUser(user),
      sessionId,
      tokens,
      mustChangePassword: true,
      message: 'Your password has expired. Choose a new one to continue.',
    };
  }

  const sessionId = await createSession(user, ip, request.userAgent, Boolean(user.mfaVerified));
  const tokens = await issueFor(user, sessionId, ip, request.userAgent, user.mfaEnabled ? 'pwd+mfa' : 'pwd');
  const ticket = crypto.randomBytes(24).toString('base64url');
  await storeSet(
    `${KEY_PREFIX.session}ticket:${ticket}`,
    JSON.stringify({ userId: user.id, sessionId, ip, userAgent: request.userAgent }),
    60_000
  );

  await clearLoginGuard(identifier, ip);
  await PasswordService.resetFailedLogins(user.id).catch(() => undefined);
  await pool.query('UPDATE `user` SET `lastLoginAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ?', [user.id]);

  await SecurityMonitoringService.recordLoginAttempt({
    email: user.email,
    ipAddress: ip,
    userAgent: request.userAgent,
    success: true,
    userId: user.id,
    locationId: user.locationId || undefined,
  }).catch(() => undefined);

  await AuditService.log({
    userId: user.id,
    locationId: user.locationId || undefined,
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: user.id,
    ipAddress: ip,
    userAgent: request.userAgent,
    sessionId,
    riskScore: 0,
    tags: ['auth', 'login'],
  }).catch(() => undefined);

  await detectAnomaly(user, ip, request.userAgent);

  return {
    status: 'success',
    user: toPublicUser(user),
    sessionId,
    tokens,
    ticket,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

function rejectOutcome(failure: { locked: boolean; remainingSeconds: number; captchaRequired: boolean }): LoginOutcome {
  if (failure.locked) {
    return {
      status: 'locked',
      retryAfterSeconds: failure.remainingSeconds,
      captchaRequired: true,
      message: 'Too many attempts. Please wait before trying again.',
    };
  }
  return {
    status: 'rejected',
    message: 'Invalid credentials',
    captchaRequired: failure.captchaRequired,
  };
}

async function createSession(user: any, ip: string, userAgent: string, mfaVerified: boolean): Promise<string> {
  return SessionService.createSession({
    userId: user.id,
    ipAddress: ip,
    userAgent,
    locationId: user.locationId || undefined,
    mfaVerified,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  });
}

async function issueFor(
  user: any,
  sessionId: string,
  ip: string,
  userAgent: string,
  authMethod: string
): Promise<{ accessToken: string; refreshToken: string; accessExpiresIn: number }> {
  const pair = await issueTokenPair(
    { id: user.id, email: user.email, role: user.role, tokenVersion: Number(user.tokenVersion || 0) },
    { sessionId, ip, userAgent, authMethod }
  );
  return { accessToken: pair.accessToken, refreshToken: pair.refreshToken, accessExpiresIn: pair.accessExpiresIn };
}

/** Completes an MFA challenge: verifies the code, then issues the real session. */
export async function exchangeMfaChallenge(challengeId: string, userId: string, ip: string, userAgent: string): Promise<LoginOutcome> {
  const stored = await storeGet(`${KEY_PREFIX.session}mfa:${challengeId}`);
  if (!stored) {
    return { status: 'rejected', message: 'Your verification step expired. Sign in again.' };
  }
  await pool.query('UPDATE `user` SET `mfaVerified` = 1 WHERE `id` = ?', [userId]).catch(() => undefined);
  const [rows]: any = await pool.query('SELECT * FROM `user` WHERE `id` = ? LIMIT 1', [userId]);
  const user = rows?.[0];
  if (!user) return { status: 'rejected', message: 'Invalid credentials' };

  const sessionId = await createSession(user, ip, userAgent, true);
  const tokens = await issueFor(user, sessionId, ip, userAgent, 'pwd+mfa');
  const ticket = crypto.randomBytes(24).toString('base64url');
  await storeSet(`${KEY_PREFIX.session}ticket:${ticket}`, JSON.stringify({ userId: user.id, sessionId, ip, userAgent }), 60_000);

  await AuditService.log({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: user.id,
    ipAddress: ip,
    userAgent,
    sessionId,
    riskScore: 0,
    tags: ['auth', 'login', 'mfa'],
  }).catch(() => undefined);

  return {
    status: 'success',
    user: toPublicUser(user),
    sessionId,
    tokens,
    ticket,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

/** Single-use ticket so the Next.js session layer never sees a password. */
export async function consumeTicket(ticket: string, ip: string, userAgent: string): Promise<{ userId: string; sessionId: string } | null> {
  const key = `${KEY_PREFIX.session}ticket:${ticket}`;
  const raw = await storeGet(key);
  if (!raw) return null;
  await storeDel(key);
  try {
    const parsed = JSON.parse(raw);
    if (parsed.ip && parsed.ip !== ip) return null;
    return { userId: parsed.userId, sessionId: parsed.sessionId };
  } catch {
    return null;
  }
}

/** Used by the first-login flow: bumping the version invalidates the temp token. */
export async function invalidateUserSessions(userId: string, reason: string): Promise<void> {
  await bumpTokenVersion(userId);
  await SessionService.revokeAllUserSessions(userId, reason);
}
