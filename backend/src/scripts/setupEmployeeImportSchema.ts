/**
 * Bulk Employee Import & Employee ID Management — schema bootstrap.
 *
 * Idempotent, additive-only migration that prepares the existing MySQL schema
 * for the Workforce Directory bulk import feature:
 *
 *   1. Adds nullable, backwards-compatible columns to `employee` for the CSV
 *      fields that have no home in the legacy model (contact, statutory and
 *      administrative references). Every existing module keeps working because
 *      all new columns are NULLable with safe defaults.
 *   2. Creates `employee_id_sequence` — a database-backed sequence used by the
 *      centralized, concurrency-safe Employee ID allocator. IDs are NEVER
 *      derived from row counts or frontend counters.
 *   3. Creates `employee_import_batch` — the import history / audit ledger.
 *   4. Seeds the sequence above the highest existing employee code so freshly
 *      generated IDs can never collide with legacy IDs such as `1372` or the
 *      existing `TEST-EMP-*` test identifiers.
 *
 * Existing official Employee IDs (for example `1372` — SADASHIVA LINGARAJAPPA
 * HADIMANI) are never rewritten by this script.
 */
import { pool } from '../nativeDb.js';

export interface EmployeeIdPolicyRow {
  id: string;
  format_key: string;
  prefix: string;
  padding: number;
  next_value: number;
  sample_format: string;
}

/** Columns added to `employee`. All NULLable → non-breaking for existing modules. */
const EMPLOYEE_COLUMNS: Array<{ name: string; def: string }> = [
  { name: 'middleName', def: "VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'alternatePhone', def: "VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'emergencyContactName', def: "VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'emergencyContactNumber', def: "VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'currentAddress', def: "VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'permanentAddress', def: "VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'city', def: "VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'state', def: "VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'pincode', def: "VARCHAR(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'employmentType', def: "VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'employeeCategory', def: "VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'confirmationDate', def: 'datetime(3) DEFAULT NULL' },
  { name: 'reportingManagerId', def: "VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'payrollEmployeeCode', def: "VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'pfApplicable', def: 'tinyint(1) DEFAULT NULL' },
  { name: 'esiApplicable', def: 'tinyint(1) DEFAULT NULL' },
  { name: 'panNumber', def: "VARCHAR(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  // Status flag only. The Aadhaar NUMBER is intentionally never stored here.
  { name: 'aadhaarVerificationStatus', def: "VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'biometricDeviceEmployeeId', def: "VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'attendanceEligible', def: 'tinyint(1) DEFAULT 1' },
  { name: 'photoReference', def: "VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'documentStatus', def: "VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  { name: 'remarks', def: "VARCHAR(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  // Legacy / pre-existing identifier preserved alongside the official display ID.
  { name: 'legacyEmployeeCode', def: "VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
  // Traceability: which bulk-import batch created / last updated this record.
  { name: 'importBatchId', def: "VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL" },
];

const SEQUENCE_DDL = [
  `CREATE TABLE IF NOT EXISTS \`employee_id_sequence\` (
     \`id\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`format_key\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`prefix\` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`padding\` int NOT NULL DEFAULT '4',
     \`next_value\` bigint NOT NULL DEFAULT '1',
     \`sample_format\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
     PRIMARY KEY (\`id\`),
     UNIQUE KEY \`employee_id_sequence_format_key\` (\`format_key\`)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const IMPORT_BATCH_DDL = [
  `CREATE TABLE IF NOT EXISTS \`employee_import_batch\` (
     \`id\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`batch_ref\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`file_name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`file_hash\` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`mode\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`status\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
     \`total_rows\` int NOT NULL DEFAULT '0',
     \`created_rows\` int NOT NULL DEFAULT '0',
     \`updated_rows\` int NOT NULL DEFAULT '0',
     \`failed_rows\` int NOT NULL DEFAULT '0',
     \`skipped_rows\` int NOT NULL DEFAULT '0',
     \`location_scope\` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
     \`imported_by\` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
     \`imported_by_name\` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
     \`id_format_used\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
     \`rows_json\` mediumtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
     \`error_report\` mediumtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
     \`failure_details\` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
     \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     PRIMARY KEY (\`id\`),
     UNIQUE KEY \`employee_import_batch_ref_key\` (\`batch_ref\`),
     KEY \`employee_import_batch_created_idx\` (\`created_at\`),
     KEY \`employee_import_batch_imported_by_idx\` (\`imported_by\`)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const DEFAULT_FORMAT_KEY = 'BSC-EMP';
const DEFAULT_PREFIX = 'BSC-EMP-';
const DEFAULT_PADDING = 4;

function isSqlite(): boolean {
  return String(process.env.DB_TYPE || 'mysql').toLowerCase() === 'sqlite';
}

function sqliteDdl(): string[] {
  const cols = EMPLOYEE_COLUMNS.map((c) => {
    const t = /int|bigint|tinyint/i.test(c.def)
      ? 'INTEGER'
      : /datetime/i.test(c.def)
        ? 'TEXT'
        : 'TEXT';
    return `ALTER TABLE "employee" ADD COLUMN "${c.name}" ${t}`;
  });
  return [
    ...cols,
    `CREATE TABLE IF NOT EXISTS "employee_id_sequence" ("id" TEXT NOT NULL PRIMARY KEY, "format_key" TEXT NOT NULL, "prefix" TEXT NOT NULL, "padding" INTEGER NOT NULL DEFAULT 4, "next_value" INTEGER NOT NULL DEFAULT 1, "sample_format" TEXT NOT NULL, "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS "employee_import_batch" ("id" TEXT NOT NULL PRIMARY KEY, "batch_ref" TEXT NOT NULL, "file_name" TEXT NOT NULL, "file_hash" TEXT NOT NULL, "mode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "total_rows" INTEGER NOT NULL DEFAULT 0, "created_rows" INTEGER NOT NULL DEFAULT 0, "updated_rows" INTEGER NOT NULL DEFAULT 0, "failed_rows" INTEGER NOT NULL DEFAULT 0, "skipped_rows" INTEGER NOT NULL DEFAULT 0, "location_scope" TEXT, "imported_by" TEXT NOT NULL, "imported_by_name" TEXT, "id_format_used" TEXT, "rows_json" TEXT, "error_report" TEXT, "failure_details" TEXT, "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  ];
}

/**
 * Highest numeric suffix already present in `employee.employeeCode`, used to
 * seed the sequence so a freshly minted ID can never shadow an existing one.
 */
async function maxExistingNumericSuffix(): Promise<number> {
  const [rows]: any = await pool.query(`SELECT employeeCode FROM employee`);
  let max = 0;
  for (const row of rows || []) {
    const code = String(row.employeeCode || '').trim();
    const std = code.match(/^BSC-EMP-(\d+)$/i);
    if (std) {
      max = Math.max(max, parseInt(std[1], 10));
      continue;
    }
    if (/^\d+$/.test(code)) {
      max = Math.max(max, parseInt(code, 10));
    }
  }
  return max;
}

let ready: Promise<void> | null = null;

/** Idempotent — safe to invoke on every server boot. */
export function ensureEmployeeImportSchema(): Promise<void> {
  if (!ready) {
    ready = initialize().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

async function initialize(): Promise<void> {
  if (isSqlite()) {
    for (const stmt of sqliteDdl()) {
      try {
        await pool.query(stmt);
      } catch (err: any) {
        // ADD COLUMN on an already-migrated table is expected to fail once.
        if (!/duplicate column/i.test(err?.message || '')) {
          console.warn('[setupEmployeeImportSchema] sqlite stmt warning:', err.message);
        }
      }
    }
    await seedSequence();
    return;
  }

  console.log('--- Preparing Bulk Employee Import & Employee ID schema ---');

  const [cols]: any = await pool.query(`SHOW COLUMNS FROM employee`);
  const existing = new Set(cols.map((c: any) => c.Field));
  for (const col of EMPLOYEE_COLUMNS) {
    if (!existing.has(col.name)) {
      try {
        await pool.query(`ALTER TABLE employee ADD COLUMN ${col.name} ${col.def}`);
        console.log(`+ Added employee.${col.name}`);
      } catch (err: any) {
        console.warn(`Warning adding employee.${col.name}:`, err.message);
      }
    }
  }

  // Helpful index for the import matcher (mobile-number secondary lookup).
  try {
    await pool.query(`CREATE INDEX idx_emp_phone ON employee (phone)`);
    console.log('+ Added idx_emp_phone');
  } catch {
    /* index already exists — ignore */
  }

  for (const stmt of [...SEQUENCE_DDL, ...IMPORT_BATCH_DDL]) {
    await pool.query(stmt);
  }
  console.log('+ Ensured employee_id_sequence & employee_import_batch tables');

  await seedSequence();
  console.log('--- Bulk Import schema ready ---');
}

async function seedSequence(): Promise<void> {
  const seedFrom = (await maxExistingNumericSuffix()) + 1;
  if (isSqlite()) {
    await pool.query(
      `INSERT OR IGNORE INTO employee_id_sequence (id, format_key, prefix, padding, next_value, sample_format)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [DEFAULT_FORMAT_KEY, DEFAULT_FORMAT_KEY, DEFAULT_PREFIX, DEFAULT_PADDING, seedFrom, `${DEFAULT_PREFIX}${String(seedFrom).padStart(DEFAULT_PADDING, '0')}`]
    );
    return;
  }
  await pool.query(
    `INSERT INTO employee_id_sequence (id, format_key, prefix, padding, next_value, sample_format)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE format_key = format_key`,
    [DEFAULT_FORMAT_KEY, DEFAULT_FORMAT_KEY, DEFAULT_PREFIX, DEFAULT_PADDING, seedFrom, `${DEFAULT_PREFIX}${String(seedFrom).padStart(DEFAULT_PADDING, '0')}`]
  );
  console.log(`+ Employee ID sequence seeded to start at ${DEFAULT_PREFIX}${String(seedFrom).padStart(DEFAULT_PADDING, '0')}`);
}

if (process.argv[1]?.includes('setupEmployeeImportSchema')) {
  ensureEmployeeImportSchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
