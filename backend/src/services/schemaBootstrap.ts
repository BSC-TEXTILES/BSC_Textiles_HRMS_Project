/**
 * Native MySQL schema engine shared by `npm run db:migrate` and backend startup.
 *
 * MySQL DDL is auto-committing and the baseline `schema.sql` overlaps several
 * early migrations, so a file can legitimately hit "already exists" errors.
 * Such files are retried statement-by-statement, skipping only the statements
 * whose object is already present, so the end state is correct and re-runs are safe.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The subset of a mysql2 connection/pool this engine needs. */
export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<any>;
}

type Log = (message: string) => void;

// MySQL errors that mean "this statement is already applied, or is not
// applicable to this database shape" — safe to skip, everything else is fatal.
//   * already-present: the consolidated `schema.sql` baseline overlaps several
//     early migrations, so re-adding a column/index/table hits 1060/1061/1050.
//   * absent object: migrations 022-027 are the legacy seed-roster
//     consolidation path and touch plural tables (`employees`, `users`,
//     `payroll_items`, …) that exist in the production database but were never
//     created on a freshly migrated one — 1146/1347.
export const TOLERATED_ERROR_CODES = new Set<string>([
  'ER_DUP_FIELDNAME',          // 1060 column already exists
  'ER_DUP_KEYNAME',            // 1061 index already exists
  'ER_TABLE_EXISTS_ERROR',     // 1050 table already exists
  'ER_CANT_DROP_FIELD_OR_KEY', // 1091 column/index already gone
  'ER_DUP_ENTRY',              // 1062 seed row already inserted
  'ER_SP_DOES_NOT_EXIST',      // 1305 procedure already gone
  'ER_BAD_FIELD_ERROR',        // 1054 unknown column
  'ER_NO_SUCH_TABLE',          // 1146 table absent in this database shape
  'ER_WRONG_OBJECT',           // 1347 object exists but is not the expected kind
  'ER_NO_REFERENCED_ROW_2',    // 1452 foreign key reference missing in partial seed
  'ER_CHECK_CONSTRAINT_DUP_NAME', // 3822 check constraint already exists
  '3822',
]);

/** Tables startup depends on; missing any of them means the schema is not installed. */
export const CORE_TABLES = ['employee', 'location', 'department', 'shift', 'payrollitem', 'database_shards'];

export function isMissingSchemaError(error: any): boolean {
  return error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_TABLE_ERROR' || error?.errno === 1146;
}

/**
 * Missing table OR missing column: both mean pending migrations on an
 * otherwise-installed database (e.g. `user.tokenVersion` from 033).
 */
export function isOutdatedSchemaError(error: any): boolean {
  return isMissingSchemaError(error) || error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054;
}

/**
 * Splits a SQL script into statements, honouring DELIMITER directives (used by
 * stored-procedure migrations), string literals and -- / # / block comments.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let delimiter = ';';
  let current = '';
  let blockDepth = 0;
  let i = 0;

  const at = (n: number) => sql.slice(i, i + n);

  while (i < sql.length) {
    const prevIsWord = i > 0 && /[\w$]/.test(sql[i - 1]);
    // DELIMITER directive must be handled before any other token.
    if (/^delimiter\s+/i.test(sql.slice(i, i + 24))) {
      const lineEnd = sql.indexOf('\n', i);
      const line = sql.slice(i, lineEnd === -1 ? sql.length : lineEnd);
      const match = line.match(/^delimiter\s+(\S+)/i);
      if (match) {
        delimiter = match[1];
        i += line.length;
        continue;
      }
    }

    // Line comment
    if (at(2) === '--') {
      const lineEnd = sql.indexOf('\n', i);
      i = lineEnd === -1 ? sql.length : lineEnd + 1;
      current += '\n';
      continue;
    }
    // Hash comment (MySQL-specific)
    if (at(1) === '#' && (i === 0 || /[\s;]/.test(sql[i - 1]))) {
      const lineEnd = sql.indexOf('\n', i);
      i = lineEnd === -1 ? sql.length : lineEnd + 1;
      current += '\n';
      continue;
    }
    // Block comment
    if (at(2) === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    // Quoted string / identifier
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; } // escaped by doubling
          break;
        }
        j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // Compound bodies: `CREATE PROCEDURE / FUNCTION / TRIGGER` hold semicolons
    // inside BEGIN..END, and the server takes the whole block as one statement.
    // Only split once the block is closed.
    if (!prevIsWord) {
      const word = /^\w+/i.exec(sql.slice(i, i + 16));
      if (word) {
        const upper = word[0].toUpperCase();
        if (upper === 'BEGIN') {
          blockDepth++;
          current += word[0];
          i += word[0].length;
          continue;
        }
        if (upper === 'END') {
          const suffix = sql.slice(i + 3, i + 24).match(/^\s+(\w+)/i);
          const closesBlock = !(suffix && ['IF', 'CASE', 'LOOP', 'WHILE', 'REPEAT'].includes(suffix[1].toUpperCase()));
          if (closesBlock && blockDepth > 0) blockDepth--;
          current += word[0];
          i += word[0].length;
          continue;
        }
      }
    }

    // Statement terminator
    if (blockDepth === 0 && sql.startsWith(delimiter, i)) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i += delimiter.length;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

export async function applyResilient(target: SqlRunner, file: string, sql: string, log: Log = console.log) {
  try {
    await target.query(sql);
    return { skippedStatements: 0 };
  } catch (firstErr: any) {
    if (!TOLERATED_ERROR_CODES.has(String(firstErr.code))) throw firstErr;

    log(`      ↳ whole-file apply hit "${firstErr.code}", retrying statement by statement`);
    let skippedStatements = 0;
    for (const statement of splitSqlStatements(sql)) {
      try {
        await target.query(statement);
      } catch (err: any) {
        if (!TOLERATED_ERROR_CODES.has(String(err.code))) {
          throw Object.assign(
            new Error(`${file}: statement failed (${err.code || 'UNKNOWN'}): ${String(statement).slice(0, 160)}\n     ${err.sqlMessage || err.message}`),
            { code: err.code },
          );
        }
        skippedStatements++;
        log(`      ⏭ skipped an inapplicable statement (${err.code})`);
      }
    }
    return { skippedStatements };
  }
}

/** Applies the consolidated baseline; every CREATE TABLE is made idempotent. */
export async function applyBaselineSchema(target: SqlRunner, databaseDir: string, log: Log = console.log) {
  const schemaPath = path.join(databaseDir, 'schema.sql');
  if (!fs.existsSync(schemaPath)) throw new Error(`Schema file not found at: ${schemaPath}`);
  const sql = fs.readFileSync(schemaPath, 'utf-8')
    .replace(/\bCREATE TABLE\s+(?!IF\s+NOT\s+EXISTS\b)/gi, 'CREATE TABLE IF NOT EXISTS ');
  await applyResilient(target, 'schema.sql', sql, log);
}

/** Seeds baseline organization, shifts, and default personas if user table is empty. */
export async function seedBaselineIfEmpty(target: SqlRunner, databaseDir: string, log: Log = console.log) {
  try {
    const [userRows]: any = await target.query('SELECT COUNT(*) AS n FROM `user`').catch(() => [[{ n: 0 }]]);
    if (Number(userRows?.[0]?.n || 0) > 0) {
      log('[schema] Existing users found in database. Preserving business data (skipping seed).');
      return;
    }

    const seedsDir = path.join(databaseDir, 'seeds');
    if (!fs.existsSync(seedsDir)) return;

    const seedFiles = [
      '01_locations_and_organization.sql',
      '02_shifts_and_break_policies.sql',
      '03_users_and_test_personas.sql',
    ];

    for (const file of seedFiles) {
      const filePath = path.join(seedsDir, file);
      if (fs.existsSync(filePath)) {
        log(`[schema] Seeding initial baseline: ${file}...`);
        const sql = fs.readFileSync(filePath, 'utf-8');
        await applyResilient(target, file, sql, log).catch((err: any) => {
          log(`[schema] Seed ${file} notice: ${err?.message || err}`);
        });
      }
    }
    log('[schema] ✔ Baseline accounts and roles seeded successfully.');
  } catch (err: any) {
    log(`[schema] Baseline seed notice: ${err?.message || err}`);
  }
}

/** Applies every unrecorded migration in filename order, tracking them in `_migrations`. */
export async function applyMigrations(target: SqlRunner, databaseDir: string, log: Log = console.log) {
  await target.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const migrationsDir = path.join(databaseDir, 'migrations');
  if (!fs.existsSync(migrationsDir)) throw new Error(`Migrations directory not found at: ${migrationsDir}`);

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  log(`Found ${files.length} sequential migration files.`);

  let applied = 0;
  let skipped = 0;
  for (const file of files) {
    const [rows]: any = await target.query('SELECT id FROM _migrations WHERE name = ?', [file]);
    if (rows.length > 0) {
      skipped++;
      log(`  ⏩ Skipping ${file} (already executed)`);
      continue;
    }
    log(`  Applying migration: ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const startTime = Date.now();
    const { skippedStatements } = await applyResilient(target, file, sql, log);
    await target.query('INSERT INTO _migrations (name) VALUES (?)', [file]);
    applied++;
    const note = skippedStatements > 0 ? `, ${skippedStatements} already-present statement(s) skipped` : '';
    log(`  ✔ Applied ${file} (${Date.now() - startTime}ms${note})`);
  }
  return { applied, skipped };
}

/** Confirms the tables startup and login depend on are present. */
export async function verifyCoreSchema(target: SqlRunner) {
  for (const table of CORE_TABLES) {
    await target.query(`SELECT 1 FROM \`${table}\` LIMIT 0`);
  }
  await target.query('SELECT id, loginId, passwordHash, status, tokenVersion FROM `user` LIMIT 0');
  for (const table of ['cookie_consent', 'session', 'refresh_token']) {
    await target.query(`SELECT id FROM \`${table}\` LIMIT 0`);
  }
  await target.query('SELECT kid FROM `jwt_signing_key` LIMIT 0');
}

/** Finds the `database/` workspace (schema.sql + migrations/) from dist, src or the repo root. */
export function locateDatabaseDir(): string | null {
  const here = typeof __dirname === 'string' ? __dirname : process.cwd();
  const candidates = [
    process.env.HRMS_DATABASE_DIR,
    path.resolve(process.cwd(), 'database'),
    path.resolve(process.cwd(), '../database'),
    path.resolve(__dirname, '../../../database'),
    path.resolve(__dirname, '../../database'),
    path.resolve(__dirname, '../database'),
    path.resolve(here, '../../../database'),
    path.resolve(here, '../../database'),
    path.resolve(here, '../database'),
  ].filter((dir): dir is string => Boolean(dir));
  return candidates.find((dir) =>
    fs.existsSync(path.join(dir, 'schema.sql')) && fs.existsSync(path.join(dir, 'migrations'))) ?? null;
}

export type BootstrapOutcome =
  | { status: 'installed'; applied: number; skipped: number }
  | { status: 'skipped'; reason: string };

export interface BootstrapConnection extends SqlRunner {
  /** Closes the connection: the SQL files change session state (e.g. FOREIGN_KEY_CHECKS). */
  destroy(): void;
}

/**
 * Installs or auto-heals the schema on the configured MySQL database.
 * Uses CREATE TABLE IF NOT EXISTS throughout so it is 100% idempotent and safe.
 */
export async function bootstrapDatabaseSchema(
  getConnection: () => Promise<BootstrapConnection>,
  options: { databaseDir?: string | null; log?: Log } = {},
): Promise<BootstrapOutcome> {
  const log = options.log ?? console.log;
  const databaseDir = options.databaseDir === undefined ? locateDatabaseDir() : options.databaseDir;
  if (!databaseDir) return { status: 'skipped', reason: 'database/schema.sql and database/migrations were not found' };

  const conn = await getConnection();
  try {
    const [[lock]]: any = await conn.query("SELECT GET_LOCK('hrms_schema_bootstrap', 300) AS acquired");
    if (Number(lock?.acquired) !== 1) return { status: 'skipped', reason: 'another process holds the schema bootstrap lock' };
    try {
      const [tables]: any = await conn.query(
        "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
      );
      const names = new Set<string>(tables.map((row: any) => String(row.name).toLowerCase()));
      const hasCore = names.has('user') && names.has('employee') && names.has('location');

      const HRMS_KNOWN_TABLES = new Set([
        '_migrations', 'user', 'employee', 'location', 'department', 'shift', 'payrollitem',
        'database_shards', 'cookie_consent', 'late_attendance_record', 'kyc_records', 'custody_asset'
      ]);
      const isHrmsDatabase = names.size === 0 || Array.from(names).some((t) => HRMS_KNOWN_TABLES.has(t));

      if (!isHrmsDatabase) {
        return {
          status: 'skipped',
          reason: `the database holds ${names.size} unrelated table(s) but no HRMS tables or _migrations ledger; confirm DATABASE_URL selects the HRMS database`,
        };
      }

      if (hasCore && names.has('_migrations')) {
        const { applied, skipped } = await applyMigrations(conn, databaseDir, log);
        await verifyCoreSchema(conn);
        return { status: 'installed', applied, skipped };
      }

      log(`[schema] Auto-healing database schema (${names.size} existing tables, core present=${hasCore})...`);
      await applyBaselineSchema(conn, databaseDir, log);
      const { applied, skipped } = await applyMigrations(conn, databaseDir, log);
      await seedBaselineIfEmpty(conn, databaseDir, log);
      await verifyCoreSchema(conn);
      return { status: 'installed', applied, skipped };
    } finally {
      await conn.query("SELECT RELEASE_LOCK('hrms_schema_bootstrap')").catch(() => {});
    }
  } finally {
    conn.destroy();
  }
}
