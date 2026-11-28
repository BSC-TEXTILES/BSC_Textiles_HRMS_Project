/**
 * Location Registry — the single, database-backed source of store locations.
 *
 * Replaces the hard-coded `{ bel: 'cmuwszr8t…', dav: 'cmuwszr95…' }` literal
 * that used to live in `middleware/auth.ts`. That map meant a location created
 * through `/api/locations` was invisible to every scoping, filtering and
 * alias-resolution path until someone edited source code, so a new store would
 * appear in the location list but not in attendance, payroll, analysis or the
 * organisation module.
 *
 * `resolveLocationCodeToId` stays synchronous (18 existing call sites depend on
 * that) and reads a snapshot that is reloaded:
 *   - once at server start (`registerLocationRegistryRefresh`),
 *   - after every location create / update / status change / delete,
 *   - on a TTL so a location inserted by another process is picked up.
 *
 * The authoritative table is `location`. The deprecated seed table `locations`
 * is read only to register its `loc_bel`-style ids as aliases of the matching
 * store code, so historical references keep resolving.
 */
import { pool } from '../nativeDb.js';

interface RegistrySnapshot {
  /** lowercase alias -> authoritative `location.id` */
  aliases: Map<string, string>;
  /** authoritative `location.id` -> location summary */
  byId: Map<string, LocationSummary>;
  loadedAt: number;
}

export interface LocationSummary {
  id: string;
  code: string;
  name: string;
  status: string;
}

const REFRESH_TTL_MS = 30_000;

const CANONICAL_SHOWROOMS: LocationSummary[] = [
  { id: 'cmuzam5fr00024n4p4izbomev', code: 'DAV', name: 'Davanagere Mega Store', status: 'ACTIVE' },
  { id: 'cmuzam5fe00014n4pq25hkcww', code: 'BEL', name: 'Belagavi Head Store', status: 'ACTIVE' },
  { id: 'cmuzam5g400034n4p89o33l8e', code: 'SHI', name: 'Shivamogga Flagship', status: 'ACTIVE' },
];

function buildDefaultSnapshot(): RegistrySnapshot {
  const snap: RegistrySnapshot = { aliases: new Map(), byId: new Map(), loadedAt: Date.now() };
  for (const s of CANONICAL_SHOWROOMS) {
    snap.byId.set(s.id, s);
    snap.aliases.set(normalise(s.id), s.id);
    snap.aliases.set(normalise(s.code), s.id);
    snap.aliases.set(normalise(s.name), s.id);
  }
  // Register standard aliases
  snap.aliases.set('loc_bel', 'cmuzam5fe00014n4pq25hkcww');
  snap.aliases.set('belagavi', 'cmuzam5fe00014n4pq25hkcww');
  snap.aliases.set('belgaum', 'cmuzam5fe00014n4pq25hkcww');
  snap.aliases.set('loc_dav', 'cmuzam5fr00024n4p4izbomev');
  snap.aliases.set('davanagere', 'cmuzam5fr00024n4p4izbomev');
  snap.aliases.set('davangere', 'cmuzam5fr00024n4p4izbomev');
  snap.aliases.set('loc_shi', 'cmuzam5g400034n4p89o33l8e');
  snap.aliases.set('shivamogga', 'cmuzam5g400034n4p89o33l8e');
  snap.aliases.set('shimoga', 'cmuzam5g400034n4p89o33l8e');
  snap.aliases.set('loc_hq', 'cmuzam5fe00014n4pq25hkcww');
  snap.aliases.set('hub', 'cmuzam5fe00014n4pq25hkcww');
  snap.aliases.set('hubballi', 'cmuzam5fe00014n4pq25hkcww');
  snap.aliases.set('hubli', 'cmuzam5fe00014n4pq25hkcww');
  return snap;
}

let snapshot: RegistrySnapshot = buildDefaultSnapshot();
let inflight: Promise<RegistrySnapshot> | null = null;

function normalise(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

async function load(): Promise<RegistrySnapshot> {
  const next: RegistrySnapshot = buildDefaultSnapshot();

  let [rows] = await pool.query<any[]>(
    `SELECT \`id\`, \`code\`, \`name\`, \`city\`, \`status\` FROM \`location\` ORDER BY \`code\``
  ).catch(() => [[]]);

  if (!rows || rows.length === 0) {
    // Self-heal MySQL location table with canonical showrooms
    await pool.query(`
      INSERT INTO \`location\` (\`id\`, \`code\`, \`name\`, \`city\`, \`state\`, \`status\`, \`createdAt\`, \`updatedAt\`)
      VALUES
        ('cmuzam5fe00014n4pq25hkcww', 'BEL', 'Belagavi Head Store', 'Belagavi', 'Karnataka', 'ACTIVE', NOW(3), NOW(3)),
        ('cmuzam5fr00024n4p4izbomev', 'DAV', 'Davanagere Mega Store', 'Davanagere', 'Karnataka', 'ACTIVE', NOW(3), NOW(3)),
        ('cmuzam5g400034n4p89o33l8e', 'SHI', 'Shivamogga Flagship', 'Shivamogga', 'Karnataka', 'ACTIVE', NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE \`status\` = 'ACTIVE', \`updatedAt\` = NOW(3)
    `).catch(() => undefined);

    const [healedRows] = await pool.query<any[]>(
      `SELECT \`id\`, \`code\`, \`name\`, \`city\`, \`status\` FROM \`location\` ORDER BY \`code\``
    ).catch(() => [[]]);
    rows = healedRows || [];
  }

  for (const row of rows) {
    const id = String(row.id);
    const summary: LocationSummary = {
      id,
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      status: String(row.status ?? 'ACTIVE'),
    };
    next.byId.set(id, summary);
    // The id itself is always a valid reference.
    next.aliases.set(normalise(id), id);
    if (row.code) next.aliases.set(normalise(row.code), id);
    if (row.city) next.aliases.set(normalise(row.city), id);
    if (row.name) next.aliases.set(normalise(row.name), id);
  }

  // Historical/plural seed ids still appear in old payloads and client routes.
  try {
    const [seedRows] = await pool.query<any[]>(
      `SELECT \`id\`, \`code\` FROM \`locations\``
    );
    for (const seed of seedRows) {
      const target = String(seed.code ? next.aliases.get(normalise(String(seed.code)).slice(0, 3)) ?? '' : '');
      if (target) next.aliases.set(normalise(seed.id), target);
    }
  } catch {
    // `locations` may not exist on a trimmed-down deployment; not an error.
  }

  snapshot = next;
  return next;
}

/** Reload the snapshot, coalescing concurrent callers onto one query. */
export async function refreshLocationRegistry(force = false): Promise<RegistrySnapshot> {
  if (!force && Date.now() - snapshot.loadedAt < REFRESH_TTL_MS && snapshot.byId.size > 0) {
    return snapshot;
  }
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Synchronous alias resolution. Unknown values are passed through unchanged so
 * a caller that already holds an authoritative id keeps working; a value that
 * matches a known store returns the authoritative id.
 */
export function resolveLocationAlias(value?: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = String(value);
  if (raw === '' || raw === 'all' || raw === 'ALL') return undefined;
  return snapshot.aliases.get(normalise(raw)) ?? raw;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Load the snapshot once at boot and keep it fresh on a TTL.
 *
 * Without this call the snapshot stays empty and `resolveLocationAlias` degrades
 * to pass-through, so a location CODE reaches a place that expects the location
 * ID (e.g. the `auditlog.locationId` foreign key) and the write fails.
 */
export async function registerLocationRegistryRefresh(): Promise<void> {
  await refreshLocationRegistry(true);
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    refreshLocationRegistry(true).catch((err) => {
      console.warn('[locationRegistry] refresh failed:', err?.message || err);
    });
  }, REFRESH_TTL_MS);
  if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
}

/** Every live location, for filter option lists. Never a hard-coded array. */
export function listKnownLocations(includeArchived = false): LocationSummary[] {
  const all = [...snapshot.byId.values()];
  const visible = includeArchived ? all : all.filter((l) => l.status !== 'INACTIVE' && l.status !== 'ARCHIVED');
  return visible.sort((a, b) => a.code.localeCompare(b.code));
}

export function isKnownLocationId(value: unknown): boolean {
  return value != null && snapshot.byId.has(String(value));
}
