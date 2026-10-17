/**
 * Candidate Hiring — automatic shard provisioning.
 *
 * Every location gets its own MySQL database (`bsc_shard_<code>`) holding
 * candidates, applications, answers, notes, timelines, interviews and
 * documents. This service is the single entry point that:
 *
 *   1. derives the shard identity from the location code,
 *   2. creates the physical database when missing,
 *   3. applies `database/shards/hiring_shard_schema.sql` (idempotent),
 *   4. registers/repairs the `database_shards` row (including stale
 *      location_ids that would otherwise break isolation),
 *   5. refreshes the connection manager and runs a health check.
 *
 * It is called:
 *   * when a location is created (routes/locations.ts),
 *   * by the CLI backfill script (`npm run provision:hiring-shards`),
 *   * by admin retry endpoints when a shard is in a failed state.
 *
 * Failure policy: provisioning errors are reported, never thrown at callers
 * that only create locations — a location without a ready shard keeps
 * `hiringEnabled = 0` semantics at the API layer and can be retried.
 */

import mysql from 'mysql2/promise';
import path from 'node:path';
import fs from 'node:fs';
import { shardManager, shardRegistry } from '../../core/sharding/index.js';

export const HIRING_SHARD_SCHEMA_VERSION = '1.0.0';

export const HIRING_SHARD_TABLES = [
  'candidate',
  'application',
  'application_answer',
  'application_note',
  'application_timeline',
  'interview',
  'application_document',
] as const;

export interface HiringLocationRef {
  id: string;
  code: string;
  name?: string | null;
}

export interface HiringShardReport {
  databaseId: string;
  databaseName: string;
  locationId: string;
  locationCode: string;
  action: 'CREATED' | 'REGISTERED' | 'REPAIRED' | 'ALREADY_READY';
  schemaApplied: boolean;
  missingTables: string[];
  healthStatus: string;
  latencyMs: number;
  error?: string;
}

export interface HiringShardOverviewEntry {
  databaseId: string;
  databaseName: string;
  shardName: string;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  locationStatus: string | null;
  hiringEnabled: boolean;
  isControlShard: boolean;
  status: string;
  healthStatus: string;
  latencyMs: number;
  lastHealthCheckAt: string | null;
  hiringSchemaReady: boolean;
  missingTables: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Identity derivation
// ---------------------------------------------------------------------------

const SHARD_CODE_PATTERN = /^[A-Z][A-Z0-9]{0,15}$/;

export function normalizeShardCode(code: string): string {
  return String(code ?? '').trim().toUpperCase();
}

export function isValidShardCode(code: string): boolean {
  return SHARD_CODE_PATTERN.test(normalizeShardCode(code));
}

export function deriveShardDatabaseName(code: string): string {
  return `bsc_shard_${normalizeShardCode(code).toLowerCase()}`;
}

export function deriveShardDatabaseId(code: string): string {
  return `BSC-SHARD-${normalizeShardCode(code)}-001`;
}

/** Read the control database name from the registry (fallback: DATABASE_URL). */
async function resolveControlDatabaseName(): Promise<string> {
  try {
    const shards = shardManager.getRegisteredShards();
    const control = shards.find((s) => Boolean(s.is_control_shard));
    if (control?.database_name) return control.database_name;
  } catch {
    // fall through to env parsing
  }
  const base = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';
  try {
    const url = new URL(base.startsWith('mysql://') ? base : `mysql://${base}`);
    return (url.pathname || '/bsc_textiles_hrms').replace(/^\//, '') || 'bsc_textiles_hrms';
  } catch {
    return 'bsc_textiles_hrms';
  }
}

// ---------------------------------------------------------------------------
// DDL loading & splitting
// ---------------------------------------------------------------------------

const DDL_PATH_CANDIDATES = [
  process.env.HIRING_SHARD_SCHEMA_PATH,
  () => path.resolve(process.cwd(), '../database/shards/hiring_shard_schema.sql'),
  () => path.resolve(process.cwd(), 'database/shards/hiring_shard_schema.sql'),
  () => path.resolve(process.cwd(), '../../database/shards/hiring_shard_schema.sql'),
].filter(Boolean) as Array<string | (() => string)>;

let cachedDdl: string | null = null;

export function loadHiringShardDdl(): string {
  if (cachedDdl) return cachedDdl;
  for (const candidate of DDL_PATH_CANDIDATES) {
    const p = typeof candidate === 'function' ? candidate() : candidate;
    if (p && fs.existsSync(p)) {
      cachedDdl = fs.readFileSync(p, 'utf-8');
      return cachedDdl;
    }
  }
  throw new Error(
    'Could not locate database/shards/hiring_shard_schema.sql. Set HIRING_SHARD_SCHEMA_PATH or run from the repository root.'
  );
}

/** Split a plain-DDL script (no procedures) into executable statements. */
export function splitDdlStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function baseConnectionOptions() {
  const base = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';
  const url = new URL(base.startsWith('mysql://') ? base : `mysql://${base}`);
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username || 'root'),
    password: decodeURIComponent(url.password || ''),
  };
}

async function openConnection(databaseName?: string) {
  const base = await baseConnectionOptions();
  return mysql.createConnection({ ...base, database: databaseName, multipleStatements: false });
}

// ---------------------------------------------------------------------------
// Schema application
// ---------------------------------------------------------------------------

export async function ensurePhysicalDatabase(databaseName: string): Promise<boolean> {
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error(`Unsafe database name: ${databaseName}`);
  const conn = await openConnection();
  try {
    const [rows]: any = await conn.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [databaseName]
    );
    if (rows.length > 0) return false;
    await conn.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    return true;
  } finally {
    await conn.end();
  }
}

export async function applyHiringShardSchema(databaseName: string): Promise<void> {
  const ddl = loadHiringShardDdl();
  const statements = splitDdlStatements(ddl);
  const conn = await openConnection(databaseName);
  try {
    for (const statement of statements) {
      await conn.query(statement);
    }
  } finally {
    await conn.end();
  }
}

export async function verifyHiringSchema(databaseId: string): Promise<{ ready: boolean; missingTables: string[] }> {
  const pool = shardManager.getPool(databaseId);
  try {
    const [rows]: any = await pool.query(
      'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)',
      [[...HIRING_SHARD_TABLES]]
    );
    const present = new Set(rows.map((r: any) => r.t));
    const missingTables = HIRING_SHARD_TABLES.filter((t) => !present.has(t));
    return { ready: missingTables.length === 0, missingTables };
  } catch {
    return { ready: false, missingTables: [...HIRING_SHARD_TABLES] };
  }
}

// ---------------------------------------------------------------------------
// Registry upsert
// ---------------------------------------------------------------------------

async function repairRegistryRow(
  existing: {
    database_id: string;
    location_id: string | null;
    location_code: string | null;
    database_name: string;
    is_control_shard: boolean | number;
  },
  location: HiringLocationRef,
  code: string
): Promise<'REPAIRED' | 'ALREADY_READY'> {
  // The control shard is never location-bound: leave its row untouched.
  if (Boolean(existing.is_control_shard)) return 'ALREADY_READY';

  const control = shardManager.getControlPool();
  const locationIdMismatch = existing.location_id !== location.id;
  const codeMismatch = (existing.location_code || '').toUpperCase() !== code;

  if (!locationIdMismatch && !codeMismatch) return 'ALREADY_READY';

  await control.query(
    `UPDATE database_shards
     SET location_id = ?, location_code = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE database_id = ?`,
    [location.id, code, existing.database_id]
  );
  return 'REPAIRED';
}

async function insertRegistryRow(
  location: HiringLocationRef,
  code: string,
  databaseName: string,
  databaseId: string
): Promise<void> {
  const control = shardManager.getControlPool();
  await control.query(
    `INSERT INTO database_shards
       (database_id, shard_name, location_code, location_id, database_name, secret_reference,
        is_control_shard, is_writable, is_readable, status, health_status, schema_version, notes)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 'ACTIVE', 'UNKNOWN', ?, ?)`,
    [
      databaseId,
      `${location.name || code} Hiring Shard`,
      code,
      location.id,
      databaseName,
      `DATABASE_URL_${code}`,
      HIRING_SHARD_SCHEMA_VERSION,
      `Hiring data shard for location ${code}`,
    ]
  );
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

/**
 * Ensure the location has a physical shard with the hiring schema applied and
 * a healthy registry row. Safe to call repeatedly and concurrently (registry
 * lookup precedes insert; DDL is idempotent).
 */
export async function ensureHiringShardForLocation(location: HiringLocationRef): Promise<HiringShardReport> {
  const code = normalizeShardCode(location.code);
  if (!isValidShardCode(code)) {
    throw new Error(`Location code '${location.code}' cannot be used for a shard (use A-Z, 0-9, max 16 chars)`);
  }

  const controlDatabaseName = await resolveControlDatabaseName();
  const isControlLocation = deriveShardDatabaseName(code) === controlDatabaseName;
  const databaseName = isControlLocation ? controlDatabaseName : deriveShardDatabaseName(code);
  const databaseId = deriveShardDatabaseId(code);

  const started = Date.now();
  const report: HiringShardReport = {
    databaseId,
    databaseName,
    locationId: location.id,
    locationCode: code,
    action: 'ALREADY_READY',
    schemaApplied: false,
    missingTables: [],
    healthStatus: 'UNKNOWN',
    latencyMs: 0,
  };

  try {
    let existing = await shardRegistry.getShardByLocation(location.id);
    if (!existing) existing = await shardRegistry.getShardByLocation(code);

    if (existing) {
      report.databaseId = existing.database_id;
      report.databaseName = existing.database_name;
      report.action = await repairRegistryRow(existing, location, code);
    } else {
      if (!isControlLocation) {
        const created = await ensurePhysicalDatabase(databaseName);
        report.action = created ? 'CREATED' : 'REGISTERED';
      } else {
        report.action = 'REGISTERED';
      }
      await insertRegistryRow(location, code, databaseName, databaseId);
    }

    await applyHiringShardSchema(report.databaseName);
    report.schemaApplied = true;

    await shardManager.refreshRegistry();

    const control = shardManager.getControlPool();
    await control.query(
      `UPDATE database_shards SET schema_version = ? WHERE database_id = ?`,
      [HIRING_SHARD_SCHEMA_VERSION, report.databaseId]
    );

    const verification = await verifyHiringSchema(report.databaseId);
    report.missingTables = verification.missingTables;

    const health = await shardManager.checkShardHealth(report.databaseId);
    report.healthStatus = health.healthStatus;
    report.latencyMs = Date.now() - started;
    return report;
  } catch (err: any) {
    report.error = err.message;
    report.latencyMs = Date.now() - started;
    console.error(`[HiringShardProvisioner] Failed to provision shard for ${code}:`, err.message);
    return report;
  }
}

/**
 * Backfill/repair shards for every location. Sequential on purpose: DDL storms
 * against a single MySQL server cause metadata-lock contention.
 */
export async function ensureHiringShardsForAllLocations(): Promise<HiringShardReport[]> {
  const control = shardManager.getControlPool();
  const [rows]: any = await control.query(
    'SELECT id, code, name, status FROM location ORDER BY code'
  );
  const reports: HiringShardReport[] = [];
  for (const row of rows) {
    if (!isValidShardCode(row.code)) {
      console.warn(`[HiringShardProvisioner] Skipping location ${row.code}: code not shard-safe`);
      continue;
    }
    reports.push(await ensureHiringShardForLocation({ id: row.id, code: row.code, name: row.name }));
  }
  return reports;
}

/**
 * Per-shard state for the Location Management page: registry row + location
 * hiring flags + live hiring-schema check. Never throws — per-shard failures
 * are reported inline.
 */
export async function getHiringShardOverview(): Promise<HiringShardOverviewEntry[]> {
  const shards = await shardRegistry.getAllShards();
  const control = shardManager.getControlPool();
  const [locations]: any = await control.query(
    'SELECT id, code, name, status, hiringEnabled FROM location'
  );
  const byId = new Map<string, any>(locations.map((l: any) => [l.id, l]));
  const byCode = new Map<string, any>(locations.map((l: any) => [(l.code || '').toUpperCase(), l]));

  const entries: HiringShardOverviewEntry[] = [];
  for (const shard of shards) {
    const location = (shard.location_id && byId.get(shard.location_id)) || byCode.get((shard.location_code || '').toUpperCase());
    const entry: HiringShardOverviewEntry = {
      databaseId: shard.database_id,
      databaseName: shard.database_name,
      shardName: shard.shard_name,
      locationId: location?.id ?? shard.location_id ?? null,
      locationCode: shard.location_code ?? location?.code ?? null,
      locationName: location?.name ?? null,
      locationStatus: location?.status ?? null,
      hiringEnabled: location ? Boolean(location.hiringEnabled) : false,
      isControlShard: Boolean(shard.is_control_shard),
      status: shard.status,
      healthStatus: shard.health_status,
      latencyMs: Number(shard.latency_ms) || 0,
      lastHealthCheckAt: shard.last_health_check_at ? new Date(shard.last_health_check_at as any).toISOString() : null,
      hiringSchemaReady: false,
      missingTables: [],
    };
    try {
      const verification = await verifyHiringSchema(shard.database_id);
      entry.hiringSchemaReady = verification.ready;
      entry.missingTables = verification.missingTables;
    } catch (err: any) {
      entry.error = err.message;
      entry.missingTables = [...HIRING_SHARD_TABLES];
    }
    entries.push(entry);
  }
  return entries;
}
