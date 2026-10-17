/**
 * Login protection: failed-attempt counting, cooldown, and the state the login
 * screen renders.
 *
 * Counters live in Redis with a TTL and are keyed by both login ID and source
 * IP, so one account hammered from many addresses and one address hammering
 * many accounts are both throttled. The user row carries a mirror of the
 * cooldown (`lockedUntil`) so a Redis flush cannot silently unlock an account.
 *
 * Every externally visible answer is deliberately generic: "Invalid
 * credentials" for a wrong password whether or not the account exists, and
 * "Too many attempts" for a cooldown. Only the remaining seconds are exposed,
 * because the specification requires a countdown on the login form — the
 * trade-off is documented in SECURITY.md.
 */
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { KEY_PREFIX, storeDel, storeGet, storeIncrement, storeSetNx, storeTtlMs } from './redisStore.js';
import { captchaRequiredFor } from './captchaService.js';
import { PasswordService } from './passwordService.js';
import { raiseSecurityAlert } from './securityAlerts.js';

export interface LoginGuardStatus {
  locked: boolean;
  remainingSeconds: number;
  attempts: number;
  captchaRequired: boolean;
  maxAttempts: number;
  lockoutSeconds: number;
}

export interface FailureContext {
  loginId: string;
  ip: string;
  userId?: string | null;
  userAgent?: string;
  email?: string | null;
}

/** Failed attempts stay counted for 3x the cooldown, so retries cannot pace themselves. */
const ATTEMPT_WINDOW_SECONDS = () => Math.max(securityConfig.login.lockoutSeconds * 3, 300);

function attemptKey(loginId: string): string {
  return `${KEY_PREFIX.loginAttempt}id:${loginId.toLowerCase()}`;
}

function ipAttemptKey(ip: string): string {
  return `${KEY_PREFIX.loginAttempt}ip:${ip}`;
}

function cooldownKey(loginId: string): string {
  return `${KEY_PREFIX.cooldown}id:${loginId.toLowerCase()}`;
}

function ipCooldownKey(ip: string): string {
  return `${KEY_PREFIX.cooldown}ip:${ip}`;
}

function remainingFromTtl(ttl: number): number {
  if (ttl <= 0) return 0;
  return Math.ceil(ttl / 1000);
}

/**
 * Current lock state for a login ID and IP. Reads the durable cooldown first,
 * then Redis, and reports whichever is longer — the two must never disagree in
 * a way that lets an attempt through.
 */
export async function getLoginGuardStatus(loginId: string, ip: string): Promise<LoginGuardStatus> {
  const [attempts, ipAttempts, cdTtl, ipCdTtl] = await Promise.all([
    readCount(attemptKey(loginId)),
    readCount(ipAttemptKey(ip)),
    storeTtlMs(cooldownKey(loginId)),
    storeTtlMs(ipCooldownKey(ip)),
  ]);

  let remainingSeconds = Math.max(remainingFromTtl(cdTtl), remainingFromTtl(ipCdTtl));

  const [rows]: any = await pool.query(
    'SELECT `lockedUntil` FROM `user` WHERE LOWER(`loginId`) = ? OR LOWER(`email`) = ? LIMIT 1',
    [loginId.toLowerCase(), loginId.toLowerCase()]
  );
  if (rows?.[0]?.lockedUntil) {
    const until = new Date(rows[0].lockedUntil).getTime();
    const dbRemaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    remainingSeconds = Math.max(remainingSeconds, dbRemaining);
  }

  const locked = remainingSeconds > 0;
  const count = Math.max(attempts, ipAttempts);

  return {
    locked,
    remainingSeconds: locked ? remainingSeconds : 0,
    attempts: count,
    captchaRequired: locked || captchaRequiredFor(attempts),
    maxAttempts: securityConfig.login.maxAttempts,
    lockoutSeconds: securityConfig.login.lockoutSeconds,
  };
}

async function readCount(key: string): Promise<number> {
  const raw = await storeGet(key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface FailureResult extends LoginGuardStatus {
  consecutiveLockouts: number;
}

/**
 * Records a rejected attempt. Returns the state to render; never reveals
 * whether the account or the password was the problem.
 */
export async function registerFailedAttempt(context: FailureContext): Promise<FailureResult> {
  const ttlMs = ATTEMPT_WINDOW_SECONDS() * 1000;
  const [loginHit, ipHit] = await Promise.all([
    storeIncrement(attemptKey(context.loginId), ttlMs),
    storeIncrement(ipAttemptKey(context.ip), ttlMs),
  ]);

  const attempts = loginHit.count;
  let remainingSeconds = 0;

  if (attempts >= securityConfig.login.maxAttempts) {
    const lockSeconds = securityConfig.login.lockoutSeconds;
    const cooldowns: Promise<unknown>[] = [
      // setNx: a second concurrent failure must not extend an active cooldown.
      storeSetNx(cooldownKey(context.loginId), String(attempts), lockSeconds * 1000),
    ];
    // Off unless LOCKOUT_PER_IP=true: see the comment in config/security.ts. The
    // per-IP attempt counter keeps running either way — only the cooldown is
    // gated, because that is the part that can lock out a whole showroom.
    if (securityConfig.login.lockoutPerIp) {
      cooldowns.push(storeSetNx(ipCooldownKey(context.ip), String(attempts), lockSeconds * 1000));
    }
    await Promise.all(cooldowns);
    remainingSeconds = lockSeconds;
  }

  let consecutiveLockouts = 0;
  if (context.userId) {
    const recorded = await PasswordService.recordFailedLogin(context.userId);
    remainingSeconds = Math.max(remainingSeconds, recorded.remainingSeconds);
    consecutiveLockouts = recorded.consecutiveLockouts;
  } else {
    // Unknown login ID: still mirror the cooldown against any row that matches
    // by email, so enumeration attempts cannot use the absence of a row as a
    // signal.
    await pool
      .query(
        'UPDATE `user` SET `failedLoginAttempts` = `failedLoginAttempts` + 1, `lastFailedLoginAt` = NOW(3) WHERE LOWER(`loginId`) = ? OR LOWER(`email`) = ?',
        [context.loginId.toLowerCase(), context.loginId.toLowerCase()]
      )
      .catch(() => undefined);
  }

  if (remainingSeconds > 0) {
    await pool
      .query('UPDATE `user` SET `lockedUntil` = DATE_ADD(NOW(3), INTERVAL ? SECOND) WHERE LOWER(`loginId`) = ? OR LOWER(`email`) = ?', [
        remainingSeconds,
        context.loginId.toLowerCase(),
        context.loginId.toLowerCase(),
      ])
      .catch(() => undefined);

    const alertThreshold = securityConfig.login.alertAdminAfterLockouts;
    if (alertThreshold > 0 && consecutiveLockouts >= alertThreshold) {
      await raiseSecurityAlert({
        title: `Repeated account lockout: ${context.loginId}`,
        message: `Login "${context.loginId}" has been locked ${consecutiveLockouts} times in a row from ${context.ip}. Each lockout lasts ${securityConfig.login.lockoutSeconds} seconds.`,
        event: {
          type: 'BRUTE_FORCE',
          severity: consecutiveLockouts >= alertThreshold * 2 ? 'CRITICAL' : 'HIGH',
          userId: context.userId ?? undefined,
          ipAddress: context.ip,
          riskScore: Math.min(95, 60 + consecutiveLockouts * 5),
          details: {
            loginId: context.loginId,
            attempts,
            consecutiveLockouts,
            userAgent: context.userAgent,
            cooldownSeconds: remainingSeconds,
          },
        },
      });
    } else {
      await raiseSecurityAlert({
        title: `Account locked after failed sign-ins: ${context.loginId}`,
        message: `Cooldown of ${remainingSeconds}s started for "${context.loginId}" from ${context.ip}.`,
        event: {
          type: 'BRUTE_FORCE',
          severity: 'MEDIUM',
          userId: context.userId ?? undefined,
          ipAddress: context.ip,
          riskScore: 45,
          details: { loginId: context.loginId, attempts, userAgent: context.userAgent },
        },
      });
    }
  }

  return {
    locked: remainingSeconds > 0,
    remainingSeconds,
    attempts,
    captchaRequired: remainingSeconds > 0 || captchaRequiredFor(ipHit.count),
    maxAttempts: securityConfig.login.maxAttempts,
    lockoutSeconds: securityConfig.login.lockoutSeconds,
    consecutiveLockouts,
  };
}

/**
 * Clears the counters after a successful authentication, or before a test
 * sequence. Both stores are reset together: leaving the durable `lockedUntil`
 * behind would mean a cleared cooldown that still rejects the next sign-in.
 */
export async function clearLoginGuard(loginId: string, ip: string): Promise<void> {
  const normalised = String(loginId || '').toLowerCase();
  await Promise.all([
    storeDel(attemptKey(loginId)),
    storeDel(ipAttemptKey(ip)),
    storeDel(cooldownKey(loginId)),
    storeDel(ipCooldownKey(ip)),
  ]);
  await pool
    .query(
      'UPDATE `user` SET `failedLoginAttempts` = 0, `lockedUntil` = NULL, `lastFailedLoginAt` = NULL WHERE LOWER(`loginId`) = ? OR LOWER(`email`) = ?',
      [normalised, normalised]
    )
    .catch(() => undefined);
}

/** Admin unlock: clears Redis, the durable mirror and the lockout counter. */
export async function forceUnlock(userId: string, actor: { id: string; email: string; ip: string }): Promise<void> {
  const [rows]: any = await pool.query('SELECT `loginId`, `email` FROM `user` WHERE `id` = ? LIMIT 1', [userId]);
  await PasswordService.clearLockout(userId, actor.id);
  const loginId = rows?.[0]?.loginId;
  if (loginId) {
    await Promise.all([
      storeDel(attemptKey(loginId)),
      storeDel(cooldownKey(loginId)),
      storeDel(`${KEY_PREFIX.loginAttempt}id:${String(rows[0].email || '').toLowerCase()}`),
      storeDel(`${KEY_PREFIX.cooldown}id:${String(rows[0].email || '').toLowerCase()}`),
    ]);
  }

  const { AuditService } = await import('./auditService.js');
  await AuditService.log({
    userId: actor.id,
    action: 'UNLOCK',
    entityType: 'UserCredential',
    entityId: userId,
    ipAddress: actor.ip,
    riskScore: 40,
    tags: ['credential', 'unlock'],
    after: { unlockedUser: rows?.[0]?.email || userId, by: actor.email },
  }).catch(() => undefined);
}

/**
 * A constant-time dummy comparison, used when the account does not exist so the
 * response time does not announce which login IDs are real.
 */
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$' + crypto.randomBytes(16).toString('base64');

export async function burnHashTime(password: string): Promise<void> {
  await PasswordService.verifyPassword(password, DUMMY_HASH).catch(() => undefined);
}
