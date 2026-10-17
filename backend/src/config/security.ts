/**
 * Security configuration — every tunable in one place, all environment driven.
 *
 * The values default to what the security specification asks for, so a
 * developer gets the intended posture by running `npm run dev` with no .env at
 * all; production overrides them via the environment (see .env.example).
 *
 * Anything that must never be guessed in production throws at boot rather than
 * silently falling back, which is the failure mode that hid the previous
 * hard-coded JWT secret.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const IS_PROD = process.env.NODE_ENV === 'production';

function bool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function num(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.warn(`[security] ${name}="${raw}" is not a number — using ${fallback}`);
    return fallback;
  }
  return parsed;
}

/** Accepts "15m", "7d", "45s", "90" (seconds) or a plain number of seconds. */
export function parseDuration(raw: string | number | undefined, unit: 's' | 'm' | 'h' | 'd' = 's'): number {
  if (raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return raw * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit]);
  const match = /^(\d+)\s*([smhd])?$/i.exec(String(raw).trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[(match[2] || 's').toLowerCase() as 's'];
  return value * factor;
}

/**
 * Secrets come from the environment or, when `SECRETS_DIR` is set, from a file
 * in that directory (the Kubernetes/Docker secret mount convention). That is
 * the "secrets manager" seam: swap the mount for a vault agent and no code
 * changes.
 */
export function readSecretValue(name: string): string | null {
  const inline = (process.env[name] || '').trim();
  if (inline) return inline;
  const dir = (process.env.SECRETS_DIR || '').trim();
  if (!dir) return null;
  try {
    const file = path.resolve(dir, name.toLowerCase());
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  } catch (err: any) {
    console.warn(`[security] could not read secret ${name} from SECRETS_DIR: ${err?.message}`);
  }
  return null;
}

function requiredSecret(name: string): string {
  const value = readSecretValue(name);
  if (value) return value;
  if (IS_PROD) {
    throw new Error(`[security] ${name} is required in production (set it or provide SECRETS_DIR).`);
  }
  // Deterministic dev pepper so hashes survive hot reloads.
  return `dev-${name.toLowerCase()}-not-for-production`;
}

export const securityConfig = {
  redis: {
    url: (process.env.REDIS_URL || '').trim(),
    tls: bool('REDIS_TLS', false),
    /** Set true to refuse boot when Redis is unreachable instead of degrading. */
    required: bool('REDIS_REQUIRED', false),
    keyPrefix: (process.env.REDIS_KEY_PREFIX || 'bsc:').trim(),
  },

  login: {
    maxAttempts: num('MAX_ATTEMPTS', 4),
    lockoutSeconds: num('LOCKOUT_SECONDS', 180),
    captchaAfter: num('CAPTCHA_AFTER_ATTEMPTS', 2),
    /** Lock the account for good (until an Admin unlocks) after N cooldowns. */
    escalateAfterLockouts: num('ESCALATE_AFTER_LOCKOUTS', 0),
    alertAdminAfterLockouts: num('ALERT_AFTER_LOCKOUTS', 2),
    /**
     * Whether a cooldown also applies to the whole source IP. Off by default:
     * every showroom signs in through one NAT address, so twenty staff sharing a
     * broadband line means one person's four typos lock out the entire store.
     * Attempts are still counted per IP (that counter feeds the dashboard, the
     * brute-force alert and the auto-block list), and the credential endpoints
     * are rate limited per IP + login ID, so a spray from one address is still
     * throttled — it just cannot take down colleagues who share the line.
     */
    lockoutPerIp: bool('LOCKOUT_PER_IP', false),
    allowSelfRegistration: bool('ALLOW_SELF_REGISTRATION', false),
    allowPublicPasswordReset: bool('ALLOW_PUBLIC_PASSWORD_RESET', false),
    /**
     * Two successful sign-ins for one account from different /24 networks inside
     * this window raise an IMPOSSIBLE_TRAVEL alert. 0 disables it.
     */
    travelWindowMinutes: num('IMPOSSIBLE_TRAVEL_WINDOW_MINUTES', 15),
    /**
     * Every login response is held until this many milliseconds have elapsed.
     * Argon2id equalises the cost of a *password* check, but a locked account, a
     * captcha refusal and an unknown login ID all return much faster than a real
     * verification — and that difference is itself an oracle. The floor is the
     * cheap way to close it without pretending to be constant-time everywhere.
     */
    minResponseMs: num('LOGIN_MIN_RESPONSE_MS', 350),
  },

  rateLimit: {
    globalPerSecond: num('RATE_LIMIT_PER_SECOND', 100),
    sensitivePerWindow: num('RATE_LIMIT_SENSITIVE', 5),
    sensitiveWindowSeconds: num('RATE_LIMIT_SENSITIVE_WINDOW', 60),
    /** A source IP is auto-blocked for this long once it trips the limiter. */
    autoBlockSeconds: num('RATE_LIMIT_AUTOBLOCK_SECONDS', 900),
    autoBlockTrips: num('RATE_LIMIT_AUTOBLOCK_TRIPS', 5),
    enabled: bool('RATE_LIMIT_ENABLED', true),
  },

  tokens: {
    issuer: (process.env.JWT_ISSUER || 'bsc-textiles-hrms').trim(),
    audience: (process.env.JWT_AUDIENCE || 'bsc-textiles-hrms-web').trim(),
    algorithm: (process.env.JWT_ALGORITHM || 'ES256').trim().toUpperCase(),
    accessTtlSeconds: parseDuration(process.env.ACCESS_TOKEN_TTL || '15m') || 900,
    refreshTtlSeconds: parseDuration(process.env.REFRESH_TOKEN_TTL || '7d') || 604800,
    keyRotationDays: num('JWT_KEY_ROTATION_DAYS', 90),
    /** Retire a signing key only after this grace period so old tokens verify. */
    keyGraceSeconds: parseDuration(process.env.JWT_KEY_GRACE || '24h') || 86400,
  },

  session: {
    idleTimeoutSeconds: parseDuration(process.env.IDLE_TIMEOUT || '15m') || 900,
    absoluteTimeoutSeconds: parseDuration(process.env.ABSOLUTE_TIMEOUT || '8h') || 28800,
    warningSeconds: num('SESSION_WARNING_SECONDS', 60),
    singleActiveSession: bool('SINGLE_ACTIVE_SESSION', false),
    maxConcurrentSessions: num('MAX_CONCURRENT_SESSIONS', 3),
  },

  password: {
    minLength: num('PASSWORD_MIN_LENGTH', 12),
    historyCount: num('PASSWORD_HISTORY_COUNT', 5),
    expiryDays: num('PASSWORD_EXPIRY_DAYS', 90),
    pepper: requiredSecret('PASSWORD_PEPPER'),
    blockUsername: bool('PASSWORD_BLOCK_USERNAME', true),
    checkBreached: bool('PASSWORD_CHECK_BREACHED', true),
  },

  cookies: {
    /**
     * `__Host-` pins the cookie to an exact origin, no path and no domain —
     * which is what stops a subdomain from setting or reading it. It only works
     * over HTTPS with Secure + SameSite=Strict and Path=/, so in plain-HTTP
     * local development the prefix is dropped (the browser would reject it).
     */
    prefix: bool('COOKIE_SECURE', IS_PROD) ? '__Host-' : '',
    secure: bool('COOKIE_SECURE', IS_PROD),
    sameSite: (process.env.COOKIE_SAME_SITE || 'strict').trim().toLowerCase() as 'strict' | 'lax',
    domain: (process.env.COOKIE_DOMAIN || '').trim(), // must never be a wildcard
    path: '/',
  },

  transport: {
    trustProxyHops: num('TRUST_PROXY_HOPS', 1),
    requireHttps: bool('REQUIRE_HTTPS', IS_PROD),
    hstsHeader: (process.env.HSTS_HEADER || 'max-age=31536000; includeSubDomains; preload').trim(),
    strictCsp: bool('STRICT_CSP', IS_PROD),
    corsAllowlist: (process.env.CORS_ALLOWLIST || process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  },

  alerts: {
    adminEmail: (process.env.SECURITY_ALERT_EMAIL || process.env.ADMIN_EMAIL || '').trim(),
    webhookUrl: (process.env.SECURITY_WEBHOOK_URL || '').trim(),
    emailEnabled: bool('SECURITY_ALERTS_EMAIL', true),
    webhookEnabled: bool('SECURITY_ALERTS_WEBHOOK', Boolean((process.env.SECURITY_WEBHOOK_URL || '').trim())),
  },

  mfa: {
    requiredForPrivileged: bool('MFA_REQUIRED_FOR_PRIVILEGED', false),
    issuer: (process.env.TOTP_ISSUER || 'BSC Textiles HRMS').trim(),
  },

  privacy: {
    retentionDays: {
      auditLogs: num('RETENTION_AUDIT_LOG_DAYS', 730),
      loginAttempts: num('RETENTION_LOGIN_ATTEMPT_DAYS', 180),
      sessions: num('RETENTION_SESSION_DAYS', 90),
      revokedTokens: num('RETENTION_REVOKED_TOKEN_DAYS', 30),
      refreshTokens: num('RETENTION_REFRESH_TOKEN_DAYS', 30),
    },
    purgeIntervalHours: num('RETENTION_PURGE_INTERVAL_HOURS', 24),
  },
} as const;

/** Boot-time warnings for postures that are unsafe but not fatal in dev. */
export function auditSecurityConfig(): string[] {
  const problems: string[] = [];
  if (!securityConfig.redis.url) problems.push('REDIS_URL is unset — rate limits, lockouts and the token blacklist are per-process only.');
  if (securityConfig.redis.url && !securityConfig.redis.tls && !securityConfig.redis.url.startsWith('rediss://') && IS_PROD) {
    problems.push('Redis URL is not TLS (rediss://) in production.');
  }
  if (securityConfig.cookies.domain.startsWith('.')) problems.push('COOKIE_DOMAIN must not be a wildcard domain.');
  if (securityConfig.password.expiryDays > 0 && securityConfig.password.expiryDays > 365) {
    problems.push('PASSWORD_EXPIRY_DAYS above 365 is longer than any standard policy.');
  }
  if (securityConfig.transport.trustProxyHops === 0 && IS_PROD) {
    problems.push('TRUST_PROXY_HOPS=0 behind a proxy means rate limits key on the proxy IP.');
  }
  return problems;
}
