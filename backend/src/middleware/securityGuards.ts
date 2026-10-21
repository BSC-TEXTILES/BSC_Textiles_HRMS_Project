/**
 * Network-level guards: IP allow/deny rules and the Redis-backed rate limiter.
 *
 * Order matters and is enforced by `index.ts`: resolve the real client IP
 * (only from trusted proxy hops), apply the Admin's allow/deny list, then the
 * global limiter, then the stricter limiter on the sensitive endpoints.
 *
 * Repeated abuse escalates into a temporary `ip_rules` deny row so the block
 * survives a restart and is visible to the Admin, instead of living only in
 * process memory.
 */
import { Request, Response, NextFunction } from 'express';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { KEY_PREFIX, storeDeleteByPrefix, storeSlidingWindow } from '../services/redisStore.js';
import { raiseSecurityAlert } from '../services/securityAlerts.js';

interface IpRule {
  type: 'allow' | 'deny';
  match: (ip: string) => boolean;
  label: string;
  id: string;
}

let ruleCache: { rules: IpRule[]; fetchedAt: number } = { rules: [], fetchedAt: 0 };
const RULE_CACHE_MS = 30_000;

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** CIDR containment for IPv4; IPv6 falls back to exact match. */
export function ipMatches(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false;
  if (!cidr.includes('/')) return ip === cidr;
  const [network, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const a = ipv4ToLong(ip);
  const b = ipv4ToLong(network);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) >>> 0 === (b & mask) >>> 0;
}

async function loadRules(): Promise<IpRule[]> {
  if (Date.now() - ruleCache.fetchedAt < RULE_CACHE_MS) return ruleCache.rules;
  const [rows]: any = await pool.query(
    `SELECT \`id\`, \`type\`, \`ipAddress\`, \`cidr\`, \`label\` FROM \`ip_rules\`
      WHERE \`enabled\` = 1 AND (\`expiresAt\` IS NULL OR \`expiresAt\` > NOW(3))`
  );
  ruleCache = {
    fetchedAt: Date.now(),
    rules: (rows || []).map((row: any) => {
      const patterns = [row.ipAddress, row.cidr].filter(Boolean) as string[];
      return {
        id: row.id,
        type: row.type,
        label: row.label || patterns.join(','),
        match: (ip: string) => patterns.some((pattern) => ipMatches(ip, pattern)),
      };
    }),
  };
  return ruleCache.rules;
}

export function invalidateIpRuleCache(): void {
  ruleCache = { rules: [], fetchedAt: 0 };
}

/** Real client IP, taken from proxy headers only for the configured hop count. */
export function clientIpOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (securityConfig.transport.trustProxyHops > 0 && typeof forwarded === 'string') {
    const chain = forwarded.split(',').map((entry) => entry.trim()).filter(Boolean);
    if (chain.length) {
      const index = Math.max(0, chain.length - securityConfig.transport.trustProxyHops);
      return chain[index] || '0.0.0.0';
    }
  }
  return (req.ip || req.socket.remoteAddress || '0.0.0.0').replace('::ffff:', '');
}

function sendBlocked(res: Response, retryAfterSeconds: number): void {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterSeconds))));
  res.status(403).json({ error: 'Forbidden', message: 'This network address is not permitted to access the service.' });
}

/**
 * Deny-list check first, allow-list second: an allowlisted address skips the
 * rate limiter (monitoring probes, the device connector) but a denied address
 * is refused even if it also appears in the allow list.
 */
export async function ipRuleGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = clientIpOf(req);
  try {
    const rules = await loadRules();
    const denied = rules.find((rule) => rule.type === 'deny' && rule.match(ip));
    if (denied) {
      await pool.query('UPDATE `ip_rules` SET `hits` = `hits` + 1 WHERE `id` = ?', [denied.id]).catch(() => undefined);
      sendBlocked(res, 3600);
      return;
    }
    const allowed = rules.find((rule) => rule.type === 'allow' && rule.match(ip));
    if (allowed) {
      (req as any).rateLimitExempt = true;
      await pool.query('UPDATE `ip_rules` SET `hits` = `hits` + 1 WHERE `id` = ?', [allowed.id]).catch(() => undefined);
    }
  } catch (err: any) {
    // A failed rule lookup must not become an open door, but it must not take
    // the whole API down either: log loudly and continue with rate limiting on.
    console.error('[guards] ip rule lookup failed:', err?.message || err);
  }
  next();
}

function applyHeaders(res: Response, limit: number, remaining: number, resetMs: number): void {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil((Date.now() + resetMs) / 1000)));
}

async function tripCounter(key: string): Promise<number> {
  const hits = await storeSlidingWindow(`${KEY_PREFIX.ipBlocked}trips:${key}`, 1000, 15 * 60 * 1000);
  return hits.limit - hits.remaining;
}

/** Loopback can never be an abusive remote peer: blocking it only locks out local dev. */
function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

async function autoBlockIfNeeded(ip: string, path: string): Promise<void> {
  const cfg = securityConfig.rateLimit;
  if (cfg.autoBlockSeconds <= 0 || cfg.autoBlockTrips <= 0) return;
  if (isLoopback(ip)) return;
  const trips = await tripCounter(ip);
  if (trips < cfg.autoBlockTrips) return;

  const [existing]: any = await pool.query(
    "SELECT `id` FROM `ip_rules` WHERE `source` = 'auto_block' AND `ipAddress` = ? AND (`expiresAt` IS NULL OR `expiresAt` > NOW(3)) LIMIT 1",
    [ip]
  );
  if (existing?.length) return;

  await pool.query(
    `INSERT INTO \`ip_rules\` (\`id\`, \`type\`, \`ipAddress\`, \`label\`, \`reason\`, \`source\`, \`enabled\`, \`expiresAt\`, \`createdAt\`)
     VALUES (?, 'deny', ?, 'Automatic block', ?, 'auto_block', 1, DATE_ADD(NOW(3), INTERVAL ? SECOND), NOW(3))`,
    [`ipr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, ip, `Rate limit exceeded ${trips} times (last path ${path.slice(0, 80)})`, cfg.autoBlockSeconds]
  );
  invalidateIpRuleCache();

  await raiseSecurityAlert({
    title: `IP auto-blocked for rate-limit abuse: ${ip}`,
    message: `${ip} tripped the request limiter ${trips} times and was blocked for ${cfg.autoBlockSeconds} seconds.`,
    event: {
      type: 'BRUTE_FORCE',
      severity: 'HIGH',
      ipAddress: ip,
      riskScore: 70,
      details: { trips, blockedSeconds: cfg.autoBlockSeconds, lastPath: path },
    },
  });
}

interface LimiterOptions {
  name: string;
  limit: number;
  windowMs: number;
  sensitive: boolean;
  autoBlock: boolean;
  /**
   * Sensitive endpoints get a second, wider per-IP ceiling. The per-account
   * bucket stops one login being hammered; this one stops credential spraying
   * across many accounts without punishing colleagues on a shared NAT.
   */
  ipLimit?: number;
  ipWindowMs?: number;
}

function sendRateLimited(res: Response, options: LimiterOptions, retryAfter: number): void {
  res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
  res.status(429).json({
    error: 'Too many requests',
    message: options.sensitive
      ? 'This action is rate limited. Please wait before trying again.'
      : 'Request limit exceeded for this network address.',
    retryAfterSeconds: Math.max(1, retryAfter),
  });
}

function limiter(options: LimiterOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!securityConfig.rateLimit.enabled || (req as any).rateLimitExempt) return next();
    const ip = clientIpOf(req);
    // Credential endpoints are bucketed per account as well as per network.
    // `identifier` is the field the live login screen sends; keeping only the
    // legacy names made every user behind one NAT share a single bucket.
    const identity = options.sensitive
      ? `${ip}:${String((req.body?.identifier || req.body?.loginId || req.body?.email || '')).toLowerCase().trim()
          || `anon${req.path}`}`
      : ip;
    const key = `${KEY_PREFIX.rateLimit}${options.name}:${identity}`;
    try {
      const result = await storeSlidingWindow(key, options.limit, options.windowMs);
      if (!result.allowed) {
        if (options.autoBlock) await autoBlockIfNeeded(ip, req.path);
        sendRateLimited(res, options, Math.ceil(result.resetMs / 1000));
        return;
      }

      if (options.ipLimit && options.ipLimit > 0) {
        const ipKey = `${KEY_PREFIX.rateLimit}${options.name}:ip:${ip}`;
        const ipResult = await storeSlidingWindow(ipKey, options.ipLimit, options.ipWindowMs ?? options.windowMs);
        if (!ipResult.allowed) {
          sendRateLimited(res, options, Math.ceil(ipResult.resetMs / 1000));
          return;
        }
      }

      applyHeaders(res, options.limit, result.remaining, result.resetMs);
    } catch (err: any) {
      // Fail open on a store outage: a Redis blip must not black-hole the API.
      console.error('[guards] rate limiter unavailable:', err?.message || err);
    }
    next();
  };
}

/** Global: RATE_LIMIT_PER_SECOND requests per second per IP. */
export const globalRateLimit = limiter({
  name: 'global',
  limit: securityConfig.rateLimit.globalPerSecond,
  windowMs: 1000,
  sensitive: false,
  autoBlock: true,
});

/**
 * Sensitive: login, password change and credential APIs.
 *
 * Deliberately NO IP auto-block here. A typo, a captcha refresh and a retry can
 * trip this limiter, and an auto-block would then refuse *every* request from
 * that address — including the correct password and the captcha needed to
 * recover. Behind a showroom NAT that also locks out every colleague. The
 * per-account attempt counter and cooldown already stop password guessing;
 * persistent network-level abuse is caught by the global limiter instead.
 */
export const sensitiveRateLimit = limiter({
  name: 'sensitive',
  limit: securityConfig.rateLimit.sensitivePerWindow,
  windowMs: securityConfig.rateLimit.sensitiveWindowSeconds * 1000,
  ipLimit: securityConfig.rateLimit.sensitiveIpPerWindow,
  ipWindowMs: securityConfig.rateLimit.sensitiveIpWindowSeconds * 1000,
  sensitive: true,
  autoBlock: false,
});

/**
 * Captcha issuance. Its own bucket: a user may refresh the image a few times
 * after a failed password without eating the credential attempts, and one
 * person's refreshes must not leave colleagues without a challenge.
 */
export const captchaRateLimit = limiter({
  name: 'captcha',
  limit: 30,
  windowMs: 60 * 1000,
  sensitive: false,
  autoBlock: false,
});

/** Hardware ADMS: tailored for eSSL/ZKTeco real-time pushes and heartbeats. */
export const admsRateLimit = limiter({
  name: 'adms',
  limit: 240, // 240 requests/min per device IP (allows rapid real-time bursts)
  windowMs: 60 * 1000,
  sensitive: false,
  autoBlock: true,
});

/** Drops every stored window, used by the Admin "clear limiter state" action. */
export async function resetRateLimitState(): Promise<number> {
  return storeDeleteByPrefix(KEY_PREFIX.rateLimit);
}
