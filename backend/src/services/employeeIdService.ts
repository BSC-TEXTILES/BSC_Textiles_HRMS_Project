/**
 * Centralized Employee ID service.
 *
 * Every BSC Textiles employee gets ONE persistent, unique Employee ID that is
 * valid across BEL, DAV, SHI, HUB and any future registered location.
 *
 * Guarantees
 * ----------
 *  - IDs are allocated from a DATABASE-BACKED SEQUENCE (`employee_id_sequence`)
 *    under a `SELECT ... FOR UPDATE` row lock, so two simultaneous imports can
 *    never mint the same ID. The unique index on `employee.employeeCode`
 *    remains the final hard constraint.
 *  - The format is CONFIGURABLE (stored in `system_settings`), never hard-coded
 *    throughout the application. Default: `BSC-EMP-0001`.
 *  - IDs are never derived from the current row count or a frontend counter.
 *  - Existing official IDs (e.g. `1372`) and legacy/test identifiers
 *    (e.g. `TEST-EMP-001`) are classified, preserved, and never silently
 *    overwritten. Converting a legacy/test ID to a production ID requires an
 *    explicit, authorized migration (see the import preview + approval flow).
 */
import crypto from 'node:crypto';
import { prisma, pool } from '../db.js';

export interface EmployeeIdPolicy {
  formatKey: string;
  prefix: string;
  padding: number;
  sampleFormat: string;
}

export const DEFAULT_ID_POLICY: EmployeeIdPolicy = {
  formatKey: 'BSC-EMP',
  prefix: 'BSC-EMP-',
  padding: 4,
  sampleFormat: 'BSC-EMP-0001',
};

export const EMPLOYEE_ID_SETTINGS_KEY = 'employee_id_format';

export type EmployeeCodeKind =
  | 'standard' // matches the configured production format (BSC-EMP-0001)
  | 'numeric-legacy' // bare numeric legacy payroll IDs such as 1372
  | 'test' // seeded test identifiers such as TEST-EMP-001
  | 'other-assigned' // any other pre-existing assigned ID
  | 'missing';

export function formatEmployeeId(policy: { prefix: string; padding: number }, value: number): string {
  return `${policy.prefix}${String(value).padStart(policy.padding, '0')}`;
}

function normalisePolicy(raw: any): EmployeeIdPolicy {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ID_POLICY };
  const prefix = typeof raw.prefix === 'string' && raw.prefix.trim() ? raw.prefix.trim() : DEFAULT_ID_POLICY.prefix;
  const padding = Number.isInteger(Number(raw.padding)) && Number(raw.padding) > 0 && Number(raw.padding) <= 12
    ? Number(raw.padding)
    : DEFAULT_ID_POLICY.padding;
  const formatKey = (typeof raw.formatKey === 'string' && raw.formatKey.trim()
    ? raw.formatKey.trim()
    : prefix.replace(/[^A-Za-z0-9]/g, '') || DEFAULT_ID_POLICY.formatKey).slice(0, 64);
  return { formatKey, prefix, padding, sampleFormat: formatEmployeeId({ prefix, padding }, 1) };
}

/** Current effective policy: `system_settings` → sequence table → built-in default. */
export async function getEmployeeIdPolicy(): Promise<EmployeeIdPolicy> {
  try {
    const rows: any[] = await prisma.$queryRaw(
      `SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1`,
      [EMPLOYEE_ID_SETTINGS_KEY]
    );
    if (rows && rows.length > 0) {
      const value = typeof rows[0].setting_value === 'string'
        ? JSON.parse(rows[0].setting_value)
        : rows[0].setting_value;
      return normalisePolicy(value);
    }
  } catch {
    /* system_settings may not exist on a fresh desktop build */
  }

  try {
    const rows: any[] = await prisma.$queryRaw(
      `SELECT format_key, prefix, padding, sample_format FROM employee_id_sequence LIMIT 1`
    );
    if (rows && rows.length > 0) {
      return normalisePolicy({
        formatKey: rows[0].format_key,
        prefix: rows[0].prefix,
        padding: rows[0].padding,
        sampleFormat: rows[0].sample_format,
      });
    }
  } catch {
    /* sequence table not created yet */
  }

  return { ...DEFAULT_ID_POLICY };
}

/** SUPER_ADMIN-only reconfiguration of the Employee ID format. */
export async function setEmployeeIdPolicy(policy: Partial<EmployeeIdPolicy>): Promise<EmployeeIdPolicy> {
  const merged = normalisePolicy({ ...DEFAULT_ID_POLICY, ...policy });
  const payload = JSON.stringify(merged);
  const id = crypto.randomUUID();
  await prisma.$executeRaw(
    `INSERT INTO system_settings (id, setting_key, setting_value, description, updated_at)
     VALUES (?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), description = VALUES(description), updated_at = NOW(3)`,
    [id, EMPLOYEE_ID_SETTINGS_KEY, payload, 'Bulk import Employee ID format (prefix + zero padding)']
  );
  // Keep the sequence table's copy in sync so the preview shows the live format.
  try {
    await prisma.$executeRaw(
      `UPDATE employee_id_sequence SET prefix = ?, padding = ?, sample_format = ? WHERE format_key = ?`,
      [merged.prefix, merged.padding, merged.sampleFormat, merged.formatKey]
    );
  } catch {
    /* sequence table absent — the policy in system_settings still applies */
  }
  return merged;
}

/**
 * Allocate the next Employee ID.
 *
 * Concurrency safety: when a transaction proxy is supplied the sequence row is
 * locked with `SELECT ... FOR UPDATE` so parallel imports serialize on the row
 * and receive strictly increasing, non-colliding values. When called without a
 * transaction a short dedicated transaction is opened internally.
 */
export async function allocateEmployeeId(tx?: any): Promise<string> {
  const policy = await getEmployeeIdPolicy();
  const client = tx || prisma;

  const run = async (exec: any): Promise<string> => {
    const rows: any[] = await exec(
      `SELECT id, prefix, padding, next_value FROM employee_id_sequence WHERE format_key = ? FOR UPDATE`,
      [policy.formatKey]
    );

    if (!rows || rows.length === 0) {
      // Sequence row missing (fresh/offline build): seed it above the current max.
      const maxRows: any[] = await exec(`SELECT employeeCode FROM employee`);
      let max = 0;
      for (const r of maxRows || []) {
        const code = String(r.employeeCode || '').trim();
        const std = code.match(/(\d+)\s*$/);
        if (std) max = Math.max(max, parseInt(std[1], 10));
      }
      const start = max + 1;
      await exec(
        `INSERT INTO employee_id_sequence (id, format_key, prefix, padding, next_value, sample_format, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
        [policy.formatKey, policy.formatKey, policy.prefix, policy.padding, start + 1, formatEmployeeId(policy, start)]
      );
      return formatEmployeeId(policy, start);
    }

    const seq = rows[0];
    const value = Number(seq.next_value);
    const code = formatEmployeeId({ ...policy, prefix: seq.prefix || policy.prefix, padding: Number(seq.padding) || policy.padding }, value);
    await exec(`UPDATE employee_id_sequence SET next_value = ?, updated_at = NOW(3) WHERE id = ?`, [value + 1, seq.id]);
    return code;
  };

  if (tx) {
    // Caller owns the transaction; the FOR UPDATE lock is held until it commits.
    return run((sql: string, params: any[]) => (tx.$queryRaw ? tx.$queryRaw(sql, ...params) : prisma.$queryRaw(sql, ...params)));
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query(
      `SELECT id, prefix, padding, next_value FROM employee_id_sequence WHERE format_key = ? FOR UPDATE`,
      [policy.formatKey]
    );
    let code: string;
    if (!rows || rows.length === 0) {
      const [maxRows]: any = await conn.query(`SELECT employeeCode FROM employee`);
      let max = 0;
      for (const r of maxRows || []) {
        const m = String(r.employeeCode || '').trim().match(/(\d+)\s*$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
      const start = max + 1;
      code = formatEmployeeId(policy, start);
      await conn.query(
        `INSERT INTO employee_id_sequence (id, format_key, prefix, padding, next_value, sample_format, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
        [policy.formatKey, policy.formatKey, policy.prefix, policy.padding, start + 1, code]
      );
    } else {
      const seq = rows[0];
      const value = Number(seq.next_value);
      code = formatEmployeeId({ ...policy, prefix: seq.prefix || policy.prefix, padding: Number(seq.padding) || policy.padding }, value);
      await conn.query(`UPDATE employee_id_sequence SET next_value = ?, updated_at = NOW(3) WHERE id = ?`, [value + 1, seq.id]);
    }
    await conn.commit();
    return code;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Classify an identifier so legacy/test IDs are preserved rather than overwritten. */
export function classifyEmployeeCode(code: string | null | undefined, policy?: EmployeeIdPolicy): EmployeeCodeKind {
  const value = String(code ?? '').trim();
  if (!value) return 'missing';
  if (/^TEST-EMP-/i.test(value)) return 'test';
  if (/^\d+$/.test(value)) return 'numeric-legacy';
  if (policy) {
    const escaped = policy.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^${escaped}\\d+$`, 'i').test(value)) return 'standard';
  } else if (/^BSC-EMP-\d+$/i.test(value)) {
    return 'standard';
  }
  return 'other-assigned';
}

/** Does the value conform to the currently configured production format? */
export function matchesActiveFormat(code: string, policy: EmployeeIdPolicy): boolean {
  const escaped = policy.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\d+$`, 'i').test(String(code ?? '').trim());
}

export interface IdAllocationInfo {
  policy: EmployeeIdPolicy;
  nextValue: number;
  nextEmployeeId: string;
  totalEmployees: number;
  withStandardId: number;
  withLegacyNumericId: number;
  withTestId: number;
  missingId: number;
}

/** Allocation dashboard data (authorized viewers only). */
export async function getIdAllocationInfo(): Promise<IdAllocationInfo> {
  const policy = await getEmployeeIdPolicy();
  const rows: any[] = await prisma.$queryRaw(`SELECT next_value FROM employee_id_sequence WHERE format_key = ?`, [
    policy.formatKey,
  ]);
  const nextValue = rows && rows.length > 0 ? Number(rows[0].next_value) : 1;

  const all: any[] = await prisma.$queryRaw(`SELECT employeeCode FROM employee`);
  let withStandardId = 0;
  let withLegacyNumericId = 0;
  let withTestId = 0;
  let missingId = 0;
  for (const r of all || []) {
    const kind = classifyEmployeeCode(r.employeeCode, policy);
    if (kind === 'standard') withStandardId++;
    else if (kind === 'numeric-legacy') withLegacyNumericId++;
    else if (kind === 'test') withTestId++;
    else if (kind === 'missing') missingId++;
  }

  return {
    policy,
    nextValue,
    nextEmployeeId: formatEmployeeId(policy, nextValue),
    totalEmployees: all?.length || 0,
    withStandardId,
    withLegacyNumericId,
    withTestId,
    missingId,
  };
}
