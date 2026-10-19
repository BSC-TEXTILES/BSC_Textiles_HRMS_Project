/**
 * Privacy layer: cookie consent records, subject data export and the retention
 * purge.
 *
 * The self-service data-request workflow that used to orchestrate an
 * anonymised erasure (`anonymiseSubject`) was removed with the My Privacy
 * screen. Statutory payroll, attendance and audit records keep their retention
 * regime via `runRetentionPurge`.
 */
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { securityConfig } from '../config/security.js';
import { AuditService } from './auditService.js';

export const CONSENT_POLICY_VERSION = process.env.CONSENT_POLICY_VERSION || '2026-10';

const CONSENT_COOKIE = 'bsc_consent';

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  preferences: boolean;
  version: string;
  recorded: boolean;
  visitorId: string;
}

function cookieValue(state: { analytics: boolean; preferences: boolean; version: string }): string {
  return `${state.version}.${state.analytics ? 'a' : '-'}${state.preferences ? 'p' : '-'}`;
}

function parseCookie(raw?: string): { version: string; analytics: boolean; preferences: boolean } | null {
  if (!raw) return null;
  const [version, flags] = raw.split('.');
  if (!version || !flags) return null;
  return { version, analytics: flags.includes('a'), preferences: flags.includes('p') };
}

/**
 * Reads consent from the cookie, falling back to the stored record so a user
 * who cleared cookies on the same device is not re-prompted for a choice they
 * already made.
 */
export async function readConsent(req: any, visitorId: string): Promise<ConsentState> {
  const fromCookie = parseCookie(req.cookies?.[CONSENT_COOKIE]);
  if (fromCookie && fromCookie.version === CONSENT_POLICY_VERSION) {
    return {
      necessary: true,
      analytics: fromCookie.analytics,
      preferences: fromCookie.preferences,
      version: CONSENT_POLICY_VERSION,
      recorded: true,
      visitorId,
    };
  }

  const [rows]: any = await pool.query(
    'SELECT `analytics`, `preferences` FROM `cookie_consent` WHERE `visitorId` = ? AND `policyVersion` = ? LIMIT 1',
    [visitorId, CONSENT_POLICY_VERSION]
  );
  if (rows?.length) {
    return {
      necessary: true,
      analytics: Boolean(rows[0].analytics),
      preferences: Boolean(rows[0].preferences),
      version: CONSENT_POLICY_VERSION,
      recorded: true,
      visitorId,
    };
  }

  return { necessary: true, analytics: false, preferences: false, version: CONSENT_POLICY_VERSION, recorded: false, visitorId };
}

export async function saveConsent(
  req: any,
  res: any,
  visitorId: string,
  input: { analytics?: unknown; preferences?: unknown },
  userId?: string | null
): Promise<ConsentState> {
  const state: ConsentState = {
    necessary: true,
    analytics: input.analytics === true || input.analytics === 'true',
    preferences: input.preferences === true || input.preferences === 'true',
    version: CONSENT_POLICY_VERSION,
    recorded: true,
    visitorId,
  };

  res.cookie(CONSENT_COOKIE, cookieValue(state), {
    httpOnly: false,
    sameSite: 'lax',
    secure: securityConfig.cookies.secure,
    path: '/',
    maxAge: 330 * 24 * 60 * 60 * 1000,
  });

  await pool.query(
    `INSERT INTO \`cookie_consent\`
       (\`id\`, \`visitorId\`, \`userId\`, \`policyVersion\`, \`necessary\`, \`analytics\`, \`preferences\`, \`ipAddress\`, \`userAgent\`, \`createdAt\`, \`updatedAt\`)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE \`analytics\` = VALUES(\`analytics\`), \`preferences\` = VALUES(\`preferences\`),
                             \`userId\` = COALESCE(VALUES(\`userId\`), \`userId\`), \`updatedAt\` = NOW(3)`,
    [
      `cn_${crypto.randomUUID()}`,
      visitorId,
      userId ?? null,
      CONSENT_POLICY_VERSION,
      state.analytics ? 1 : 0,
      state.preferences ? 1 : 0,
      req.ip || '127.0.0.1',
      String(req.headers['user-agent'] || '').slice(0, 255),
    ]
  );

  return state;
}

// ---------------------------------------------------------------------------
// Data minimisation
// ---------------------------------------------------------------------------

/** "98765 43210" → "****** *210" — enough to confirm, not enough to expose. */
export function maskPhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}

export function maskIdNumber(value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (raw.length < 4) return '****';
  return `${raw.slice(0, 2)}${'*'.repeat(Math.max(0, raw.length - 5))}${raw.slice(-3)}`;
}

export function maskEmail(value?: string | null): string | null {
  if (!value) return null;
  const [name, domain] = String(value).split('@');
  if (!domain) return '****';
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

// ---------------------------------------------------------------------------
// Subject data export (GDPR Art. 15 / DPDP access)
// ---------------------------------------------------------------------------

const EXPORT_TABLES: Array<{ table: string; column: string; label: string; limit: number }> = [
  { table: 'attendance', column: 'employeeId', label: 'attendance', limit: 5000 },
  { table: 'leaverequest', column: 'employeeId', label: 'leaveRequests', limit: 2000 },
  { table: 'leave_applications', column: 'employeeId', label: 'leaveApplications', limit: 2000 },
  { table: 'payrollitem', column: 'employeeId', label: 'payrollItems', limit: 2000 },
  { table: 'employeebreak', column: 'employeeId', label: 'breaks', limit: 5000 },
  { table: 'employee_documents', column: 'employeeId', label: 'documents', limit: 1000 },
  { table: 'kyc_documents', column: 'employeeId', label: 'kyc', limit: 500 },
  { table: 'observation', column: 'employeeId', label: 'observations', limit: 1000 },
];

async function tableExists(table: string): Promise<boolean> {
  const [rows]: any = await pool.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER(?)',
    [table]
  );
  return Number(rows?.[0]?.n || 0) > 0;
}

export async function buildDataExport(userId: string): Promise<Record<string, unknown>> {
  const [userRows]: any = await pool.query('SELECT * FROM `user` WHERE `id` = ? LIMIT 1', [userId]);
  if (!userRows?.length) throw new Error('User not found');
  const user = userRows[0];
  delete user.passwordHash;

  const export_: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    subject: { id: user.id, email: user.email, loginId: user.loginId, fullName: user.fullName, role: user.role },
    profile: null,
    sessions: [],
    loginAttempts: [],
    auditTrail: [],
    consents: [],
    records: {},
  };

  if (user.employeeId) {
    const [emp]: any = await pool.query('SELECT * FROM `employee` WHERE `id` = ? LIMIT 1', [user.employeeId]);
    if (emp?.[0]) {
      const row = emp[0];
      if (row.phone) row.phone = maskPhone(row.phone);
      export_.profile = row;
    }
  }

  const [sessions]: any = await pool.query(
    'SELECT `id`, `ipAddress`, `userAgent`, `createdAt`, `lastActivityAt`, `expiresAt`, `revoked`, `revokedReason` FROM `session` WHERE `userId` = ? ORDER BY `createdAt` DESC LIMIT 200',
    [userId]
  );
  export_.sessions = sessions || [];

  const [attempts]: any = await pool.query(
    'SELECT `id`, `ipAddress`, `userAgent`, `success`, `failureReason`, `createdAt` FROM `login_attempt` WHERE `userId` = ? OR `email` = ? ORDER BY `createdAt` DESC LIMIT 500',
    [userId, user.email]
  );
  export_.loginAttempts = attempts || [];

  const [audit]: any = await pool.query(
    'SELECT `id`, `action`, `entityType`, `entityId`, `ipAddress`, `createdAt`, `oldValue`, `newValue` FROM `auditlog` WHERE `userId` = ? ORDER BY `createdAt` DESC LIMIT 1000',
    [userId]
  );
  export_.auditTrail = audit || [];

  const [consents]: any = await pool.query(
    'SELECT `policyVersion`, `necessary`, `analytics`, `preferences`, `createdAt`, `updatedAt` FROM `cookie_consent` WHERE `userId` = ? OR `visitorId` = ? ORDER BY `createdAt` DESC',
    [userId, user.id]
  );
  export_.consents = consents || [];

  if (user.employeeId) {
    const records: Record<string, unknown[]> = {};
    for (const spec of EXPORT_TABLES) {
      if (!(await tableExists(spec.table))) continue;
      try {
        const [rows]: any = await pool.query(
          `SELECT * FROM \`${spec.table}\` WHERE \`${spec.column}\` = ? ORDER BY 1 DESC LIMIT ${spec.limit}`,
          [user.employeeId]
        );
        records[spec.label] = rows || [];
      } catch (err: any) {
        records[spec.label] = [{ error: `Could not export ${spec.table}: ${err?.code || err?.message}` }];
      }
    }
    export_.records = records;
  }

  return export_;
}

/** Checks which of the given column names exist on the live table (schema-validated SQL). */
async function existingColumns(table: string, candidates: string[]): Promise<string[]> {
  const [rows]: any = await pool.query(
    `SELECT \`column_name\` FROM information_schema.columns
      WHERE \`table_schema\` = DATABASE() AND LOWER(\`table_name\`) = LOWER(?) AND LOWER(\`column_name\`) IN (?)`,
    [table, candidates.map((c) => c.toLowerCase())]
  );
  return (rows || []).map((r: any) => String(Object.values(r)[0]));
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export interface PurgeResult {
  name: string;
  table: string;
  deleted: number;
  retentionDays: number;
  error?: string;
}

/**
 * Purges log rows past their retention window. Driven by the `retention_policy`
 * table so an Admin can change a window without a deploy; the table and column
 * names are validated against information_schema first because the values are
 * interpolated into SQL.
 */
export async function runRetentionPurge(options: { force?: boolean } = {}): Promise<PurgeResult[]> {
  const [policies]: any = await pool.query(
    'SELECT `id`, `name`, `targetTable`, `dateColumn`, `retentionDays`, `lastPurgedAt` FROM `retention_policy` WHERE `enabled` = 1'
  );
  const results: PurgeResult[] = [];

  for (const policy of policies || []) {
    const exists = await tableExists(policy.targetTable);
    if (!exists) {
      results.push({ name: policy.name, table: policy.targetTable, deleted: 0, retentionDays: policy.retentionDays, error: 'table missing' });
      continue;
    }
    const columns = await existingColumns(policy.targetTable, [policy.dateColumn]);
    if (!columns.length) {
      results.push({ name: policy.name, table: policy.targetTable, deleted: 0, retentionDays: policy.retentionDays, error: 'date column missing' });
      continue;
    }
    if (!options.force && policy.lastPurgedAt && Date.now() - new Date(policy.lastPurgedAt).getTime() < securityConfig.privacy.purgeIntervalHours * 3600_000) {
      continue;
    }

    try {
      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) AS n FROM \`${policy.targetTable}\` WHERE \`${policy.dateColumn}\` < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
        [policy.retentionDays]
      );
      const [deleted]: any = await pool.query(
        `DELETE FROM \`${policy.targetTable}\` WHERE \`${policy.dateColumn}\` < DATE_SUB(NOW(3), INTERVAL ? DAY) LIMIT 50000`,
        [policy.retentionDays]
      );
      const count = Number(countRows?.[0]?.n || 0);
      await pool.query('UPDATE `retention_policy` SET `lastPurgedAt` = NOW(3), `lastPurgedRows` = ? WHERE `id` = ?', [
        deleted?.affectedRows ?? count,
        policy.id,
      ]);
      results.push({ name: policy.name, table: policy.targetTable, deleted: Number(deleted?.affectedRows || 0), retentionDays: policy.retentionDays });
    } catch (err: any) {
      results.push({ name: policy.name, table: policy.targetTable, deleted: 0, retentionDays: policy.retentionDays, error: err?.message });
    }
  }

  if (results.some((r) => r.deleted > 0)) {
    await AuditService.log({
      action: 'PURGE',
      entityType: 'RetentionPolicy',
      entityId: 'retention',
      userId: 'system',
      riskScore: 30,
      tags: ['privacy', 'retention'],
      after: { purged: results.filter((r) => r.deleted > 0) },
    }).catch(() => undefined);
  }

  return results;
}

export async function listRetentionPolicies(): Promise<any[]> {
  const [rows]: any = await pool.query(
    'SELECT `id`, `name`, `description`, `targetTable`, `dateColumn`, `retentionDays`, `enabled`, `lastPurgedAt`, `lastPurgedRows` FROM `retention_policy` ORDER BY `name` ASC'
  );
  return rows || [];
}
