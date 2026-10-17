/**
 * Runtime-adjustable security settings.
 *
 * The environment owns everything that should be reviewed with a deployment
 * (thresholds, TTLs, secrets). This table holds only the handful of switches an
 * Admin legitimately changes while the system is live — password expiry, whether
 * MFA is mandatory for privileged roles, single-session mode.
 */
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { cacheService } from './cacheService.js';

const CACHE_KEY = 'security:config';
const CACHE_MS = 30_000;

async function loadAll(): Promise<Record<string, string>> {
  const cached = cacheService.get<Record<string, string>>(CACHE_KEY);
  if (cached) return cached.data;
  try {
    const [rows]: any = await pool.query('SELECT `key`, `value` FROM `security_config`');
    const map: Record<string, string> = {};
    for (const row of rows || []) map[row.key] = String(row.value);
    cacheService.set(CACHE_KEY, map, CACHE_MS);
    return map;
  } catch (err: any) {
    // A missing table (pre-migration database) must not break authentication.
    console.warn('[settings] security_config unavailable:', err?.code || err?.message);
    return {};
  }
}

export function invalidateSecuritySettings(): void {
  cacheService.delete(CACHE_KEY);
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  const all = await loadAll();
  return all[key] ?? fallback;
}

export async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const raw = await getSetting(key, String(fallback));
  return raw === 'true' || raw === '1';
}

export async function getIntSetting(key: string, fallback: number): Promise<number> {
  const raw = Number(await getSetting(key, String(fallback)));
  return Number.isFinite(raw) ? raw : fallback;
}

/** Password rotation window; the DB row wins over the env default. */
export async function passwordExpiryDays(): Promise<number> {
  return getIntSetting('password_expiry_days', securityConfig.password.expiryDays);
}

export async function mfaRequiredForPrivileged(): Promise<boolean> {
  return getBoolSetting('mfa_required_for_privileged', securityConfig.mfa.requiredForPrivileged);
}

export async function singleActiveSession(): Promise<boolean> {
  return getBoolSetting('single_active_session', securityConfig.session.singleActiveSession);
}

export async function adminIpAllowlistEnabled(): Promise<boolean> {
  return getBoolSetting('admin_ip_allowlist_enabled', false);
}

/**
 * Networks allowed to sign in as Admin or Super Admin, when the allowlist is
 * enabled. Comma or newline separated CIDRs / single addresses, e.g.
 * "203.0.113.0/24, 198.51.100.17".
 */
export async function privilegedLoginCidrs(): Promise<string[]> {
  const raw = await getSetting('privileged_login_cidrs', '');
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function listSettings(): Promise<Array<{ key: string; value: string; description: string | null }>> {
  const [rows]: any = await pool.query(
    'SELECT `key`, `value`, `description` FROM `security_config` ORDER BY `key` ASC'
  );
  return rows || [];
}

const ALLOWED_KEYS = new Set([
  'password_expiry_days',
  'mfa_required_for_privileged',
  'single_active_session',
  'admin_ip_allowlist_enabled',
  'privileged_login_cidrs',
]);

export async function setSetting(key: string, value: string, actorId: string): Promise<void> {
  if (!ALLOWED_KEYS.has(key)) {
    throw new Error(`Setting "${key}" cannot be changed at runtime. Configure it through the environment.`);
  }
  await pool.query(
    `INSERT INTO \`security_config\` (\`key\`, \`value\`, \`updatedById\`, \`updatedAt\`)
     VALUES (?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), \`updatedById\` = VALUES(\`updatedById\`), \`updatedAt\` = NOW(3)`,
    [key, value, actorId]
  );
  invalidateSecuritySettings();
}
