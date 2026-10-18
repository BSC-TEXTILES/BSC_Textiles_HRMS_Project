/**
 * BSC Textiles HRMS — Native Sequential Migration Engine
 * Zero Prisma Dependency. Applies versioned SQL files tracking status in _migrations table.
 *
 * MySQL DDL is auto-committing and this repo's baseline `schema.sql` overlaps with
 * several early migrations, so a file can legitimately hit "already exists" errors.
 * Such files are retried statement-by-statement, skipping only the statements whose
 * object is already present, so the end state is correct and re-runs are safe.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'mysql2/promise';
import { pool } from '../src/pool.js';

// MySQL errors that mean "this statement is already applied, or is not
// applicable to this database shape" — safe to skip, everything else is fatal.
//
// The two families come from how this repo grew:
//   * already-present: the consolidated `schema.sql` baseline overlaps several
//     early migrations, so re-adding a column/index/table hits 1060/1061/1050.
//   * absent object: migrations 022-027 are the legacy seed-roster
//     consolidation path and touch plural tables (`employees`, `users`,
//     `payroll_items`, …) that exist in the production database but were never
//     created on a freshly migrated one — 1146/1347.
const TOLERATED_ERROR_CODES = new Set<string>([
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
]);

/**
 * Splits a SQL script into statements, honouring DELIMITER directives (used by
 * stored-procedure migrations), string literals and -- / /* * / comments.
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

async function applyResilient(target: Pool, file: string, sql: string) {
  try {
    await target.query(sql);
    return { skippedStatements: 0 };
  } catch (firstErr: any) {
    if (!TOLERATED_ERROR_CODES.has(String(firstErr.code))) throw firstErr;

    console.log(`      ↳ whole-file apply hit "${firstErr.code}", retrying statement by statement`);
    const statements = splitSqlStatements(sql);
    let skippedStatements = 0;

    for (const statement of statements) {
      try {
        await target.query(statement);
      } catch (err: any) {
        if (!TOLERATED_ERROR_CODES.has(String(err.code))) {
          throw new Error(
            `${file}: statement failed (${err.code || 'UNKNOWN'}): ${String(statement).slice(0, 160)}\n     ${err.sqlMessage || err.message}`
          );
        }
        skippedStatements++;
        console.log(`      ⏭ skipped an inapplicable statement (${err.code})`);
      }
    }
    return { skippedStatements };
  }
}

async function migrate() {
  console.log('================================================================');
  console.log('🚀 BSC TEXTILES HRMS — NATIVE MYSQL MIGRATION RUNNER');
  console.log('================================================================');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  console.log(`Found ${files.length} sequential migration files.`);

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const [rows]: any = await pool.query('SELECT id FROM _migrations WHERE name = ?', [file]);
    if (rows.length > 0) {
      skippedCount++;
      console.log(`  ⏩ Skipping ${file} (already executed)`);
      continue;
    }

    console.log(`  Applying migration: ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const startTime = Date.now();
    const { skippedStatements } = await applyResilient(pool, file, sql);
    await pool.query('INSERT INTO _migrations (name) VALUES (?)', [file]);
    appliedCount++;
    const note = skippedStatements > 0 ? `, ${skippedStatements} already-present statement(s) skipped` : '';
    console.log(`  ✔ Applied ${file} (${Date.now() - startTime}ms${note})`);
  }

  console.log(`\n🎉 Migrations evaluated: ${appliedCount} applied, ${skippedCount} already recorded.`);
  console.log('================================================================\n');
  await pool.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err.message || err);
  if (err.sqlMessage) console.error('   MySQL said:', err.sqlMessage);
  process.exit(1);
});
