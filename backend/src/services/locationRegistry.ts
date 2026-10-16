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

let snapshot: RegistrySnapshot = { aliases: new Map(), byId: new Map(), loadedAt: 0 };
let inflight: Promise<RegistrySnapshot> | null = null;

function normalise(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

async function load(): Promise<RegistrySnapshot> {
  const next: RegistrySnapshot = { aliases: new Map(), byId: new Map(), loadedAt: Date.now() };

  const [rows] = await pool.query<any[]>(
    `SELECT \`id\`, \`code\`, \`name\`, \`city\`, \`status\` FROM \`location\` ORDER BY \`code\``
  );

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

/** Every live location, for filter option lists. Never a hard-coded array. */
export function listKnownLocations(includeArchived = false): LocationSummary[] {
  const all = [...snapshot.byId.values()];
  const visible = includeArchived ? all : all.filter((l) => l.status !== 'INACTIVE' && l.status !== 'ARCHIVED');
  return visible.sort((a, b) => a.code.localeCompare(b.code));
}

export function isKnownLocationId(value: unknown): boolean {
  return value != null && snapshot.byId.has(String(value));
}
