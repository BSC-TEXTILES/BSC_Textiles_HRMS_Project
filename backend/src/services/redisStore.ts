/**
 * Shared key-value store: Redis when configured, an equivalent in-process store
 * when it is not.
 *
 * Everything security-relevant that must outlive a single request — rate-limit
 * windows, login-attempt counters and cooldowns, the JWT revocation list, the
 * cached permission version — goes through here. Those counters are only
 * meaningful if they are shared across processes, so Redis is the real target;
 * the in-memory driver exists so the application still runs (and the semantics
 * still hold) on a single-process development machine with no Redis installed.
 *
 * Every key carries a TTL. Nothing is stored without one, so a restart or an
 * eviction can never leave a permanent lockout or an immortal blacklist entry.
 */
import { securityConfig } from '../config/security.js';

export type StoreDriver = 'redis' | 'memory';

export interface WindowResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the window that would admit the request opens. */
  resetMs: number;
  limit: number;
}

interface KeyValueStore {
  readonly driver: StoreDriver;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic "set only if absent" — used to make cooldowns idempotent. */
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  ttlMs(key: string): Promise<number>;
  /** Fixed-window counter that creates the key with a TTL on first hit. */
  increment(key: string, ttlMs: number): Promise<{ count: number; ttlMs: number }>;
  /** Sliding-log window: counts hits in the last `windowMs`. */
  slidingWindow(key: string, limit: number, windowMs: number, nowMs?: number): Promise<WindowResult>;
  setAdd(key: string, member: string, ttlMs: number): Promise<void>;
  setRem(key: string, member: string): Promise<void>;
  setMembers(key: string): Promise<string[]>;
  deleteByPrefix(prefix: string): Promise<number>;
  keys(prefix: string): Promise<string[]>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-process driver
// ---------------------------------------------------------------------------

interface Entry {
  value: string;
  expiresAt: number;
}

class MemoryStore implements KeyValueStore {
  readonly driver = 'memory' as const;
  private strings = new Map<string, Entry>();
  private sets = new Map<string, { members: Set<string>; expiresAt: number }>();
  private hits = new Map<string, { times: number[]; expiresAt: number }>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor() {
    // Sweep expired keys so a long-lived dev process does not grow unbounded.
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    if (typeof this.sweeper.unref === 'function') this.sweeper.unref();
  }

  private sweep(now = Date.now()): void {
    for (const [key, entry] of this.strings) if (entry.expiresAt <= now) this.strings.delete(key);
    for (const [key, set] of this.sets) if (set.expiresAt <= now) this.sets.delete(key);
    for (const [key, window] of this.hits) {
      const live = window.times.filter((t) => now - t < WINDOW_RETENTION_MS);
      if (window.expiresAt <= now || live.length === 0) this.hits.delete(key);
      else window.times = live;
    }
  }

  private liveString(key: string): Entry | undefined {
    const entry = this.strings.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.strings.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.liveString(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.strings.set(key, { value, expiresAt: Date.now() + Math.max(ttlMs, 1) });
  }

  async del(key: string): Promise<void> {
    this.strings.delete(key);
    this.sets.delete(key);
    this.hits.delete(key);
  }

  async setNx(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (this.liveString(key)) return false;
    await this.set(key, value, ttlMs);
    return true;
  }

  async ttlMs(key: string): Promise<number> {
    const entry = this.liveString(key);
    return entry ? Math.max(0, entry.expiresAt - Date.now()) : -2;
  }

  async increment(key: string, ttlMs: number): Promise<{ count: number; ttlMs: number }> {
    const entry = this.liveString(key);
    const count = Number(entry?.value || 0) + 1;
    const expiresAt = entry ? entry.expiresAt : Date.now() + ttlMs;
    this.strings.set(key, { value: String(count), expiresAt });
    return { count, ttlMs: Math.max(0, expiresAt - Date.now()) };
  }

  async slidingWindow(key: string, limit: number, windowMs: number, nowMs = Date.now()): Promise<WindowResult> {
    const window = this.hits.get(key);
    const times = (window ? window.times : []).filter((t) => nowMs - t < windowMs);
    if (times.length >= limit) {
      const oldest = times[0];
      return { allowed: false, remaining: 0, resetMs: Math.max(1, windowMs - (nowMs - oldest)), limit };
    }
    times.push(nowMs);
    this.hits.set(key, { times, expiresAt: nowMs + Math.max(windowMs, WINDOW_RETENTION_MS) });
    return { allowed: true, remaining: limit - times.length, resetMs: windowMs, limit };
  }

  async setAdd(key: string, member: string, ttlMs: number): Promise<void> {
    const existing = this.sets.get(key);
    const members = existing ? existing.members : new Set<string>();
    members.add(member);
    this.sets.set(key, { members, expiresAt: Date.now() + Math.max(ttlMs, 1) });
  }

  async setRem(key: string, member: string): Promise<void> {
    this.sets.get(key)?.members.delete(member);
  }

  async setMembers(key: string): Promise<string[]> {
    const entry = this.sets.get(key);
    if (!entry) return [];
    if (entry.expiresAt <= Date.now()) {
      this.sets.delete(key);
      return [];
    }
    return [...entry.members];
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let removed = 0;
    for (const map of [this.strings, this.sets, this.hits] as any[]) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(prefix)) {
          map.delete(key);
          removed++;
        }
      }
    }
    return removed;
  }

  async keys(prefix: string): Promise<string[]> {
    const all = [...this.strings.keys(), ...this.sets.keys(), ...this.hits.keys()];
    return [...new Set(all.filter((key) => key.startsWith(prefix)))];
  }

  async close(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    this.strings.clear();
    this.sets.clear();
    this.hits.clear();
  }
}

/** Hit timestamps older than this are dropped; keeps the sliding log bounded. */
const WINDOW_RETENTION_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Redis driver
// ---------------------------------------------------------------------------

/**
 * Sliding-log window in one atomic script: prune, count, decide, record.
 * Without the atomic form, concurrent requests can all read a count below the
 * limit and all be admitted.
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset = window
  if oldest[2] then reset = (tonumber(oldest[2]) + window) - now end
  if reset < 0 then reset = 0 end
  return {0, 0, reset}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, ttl)
return {1, limit - count - 1, window}
`;

const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

class RedisStore implements KeyValueStore {
  readonly driver = 'redis' as const;
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  private key(name: string): string {
    return `${securityConfig.redis.keyPrefix}${name}`;
  }

  async get(name: string): Promise<string | null> {
    return await this.client.get(this.key(name));
  }

  async set(name: string, value: string, ttlMs: number): Promise<void> {
    await this.client.set(this.key(name), value, 'PX', Math.max(Math.round(ttlMs), 1));
  }

  async del(name: string): Promise<void> {
    await this.client.del(this.key(name));
  }

  async setNx(name: string, value: string, ttlMs: number): Promise<boolean> {
    const reply = await this.client.set(this.key(name), value, 'PX', Math.max(Math.round(ttlMs), 1), 'NX');
    return reply === 'OK';
  }

  async ttlMs(name: string): Promise<number> {
    const ttl = await this.client.pttl(this.key(name));
    return Number(ttl);
  }

  async increment(name: string, ttlMs: number): Promise<{ count: number; ttlMs: number }> {
    const [count, ttl] = await this.client.eval(INCREMENT_SCRIPT, 1, this.key(name), String(Math.max(Math.round(ttlMs), 1)));
    return { count: Number(count), ttlMs: Number(ttl) };
  }

  async slidingWindow(name: string, limit: number, windowMs: number, nowMs = Date.now()): Promise<WindowResult> {
    const member = `${nowMs}-${Math.random().toString(36).slice(2, 10)}`;
    const [allowed, remaining, resetMs] = await this.client.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      this.key(name),
      String(nowMs),
      String(windowMs),
      String(limit),
      member,
      String(Math.max(windowMs * 2, 2000))
    );
    return { allowed: Number(allowed) === 1, remaining: Number(remaining), resetMs: Number(resetMs), limit };
  }

  async setAdd(name: string, member: string, ttlMs: number): Promise<void> {
    const key = this.key(name);
    await this.client.sadd(key, member);
    await this.client.pexpire(key, Math.max(Math.round(ttlMs), 1));
  }

  async setRem(name: string, member: string): Promise<void> {
    await this.client.srem(this.key(name), member);
  }

  async setMembers(name: string): Promise<string[]> {
    return (await this.client.smembers(this.key(name))) || [];
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    const full = this.key(prefix);
    let cursor = '0';
    let removed = 0;
    do {
      const [next, found] = await this.client.scan(cursor, 'MATCH', `${full}*`, 'COUNT', 200);
      cursor = next;
      if (found?.length) {
        await this.client.unlink(...found);
        removed += found.length;
      }
    } while (cursor !== '0');
    return removed;
  }

  async keys(prefix: string): Promise<string[]> {
    const full = this.key(prefix);
    let cursor = '0';
    const out: string[] = [];
    do {
      const [next, found] = await this.client.scan(cursor, 'MATCH', `${full}*`, 'COUNT', 200);
      cursor = next;
      for (const key of found || []) out.push(String(key).slice(securityConfig.redis.keyPrefix.length));
    } while (cursor !== '0');
    return out;
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

let store: KeyValueStore | null = null;
let connecting: Promise<KeyValueStore> | null = null;
let lastError: string | null = null;

async function buildStore(): Promise<KeyValueStore> {
  const { url, tls, required } = securityConfig.redis;
  if (!url) {
    if (required) {
      throw new Error('[redis] REDIS_REQUIRED=true but REDIS_URL is not set');
    }
    lastError = 'REDIS_URL not set — using the in-process store';
    console.warn(`[redis] ${lastError}`);
    return new MemoryStore();
  }

  try {
    // Required lazily so the package is optional for installs that skip it.
    const ioredis: any = await import('ioredis');
    const Redis = ioredis.default ?? ioredis;
    const client = new Redis(url, {
      tls: tls || url.startsWith('rediss://') ? {} : undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (tries: number) => (tries > 5 ? null : Math.min(tries * 200, 2000)),
    });
    await client.connect();
    await client.ping();
    client.on('error', (err: Error) => {
      lastError = err.message;
    });
    lastError = null;
    return new RedisStore(client);
  } catch (err: any) {
    lastError = err?.message || String(err);
    if (required) throw new Error(`[redis] required but unreachable: ${lastError}`);
    console.warn(`[redis] unavailable (${lastError}) — falling back to the in-process store`);
    return new MemoryStore();
  }
}

export async function getStore(): Promise<KeyValueStore> {
  if (store) return store;
  if (!connecting) {
    connecting = buildStore()
      .then((built) => {
        store = built;
        return built;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

/** Fire-and-forget helpers for code paths that must not await a connection. */
export async function storeGet(key: string): Promise<string | null> {
  return (await getStore()).get(key);
}

export async function storeSet(key: string, value: string, ttlMs: number): Promise<void> {
  await (await getStore()).set(key, value, ttlMs);
}

export async function storeDel(key: string): Promise<void> {
  await (await getStore()).del(key);
}

export async function storeSlidingWindow(key: string, limit: number, windowMs: number): Promise<WindowResult> {
  return (await getStore()).slidingWindow(key, limit, windowMs);
}

export async function storeIncrement(key: string, ttlMs: number): Promise<{ count: number; ttlMs: number }> {
  return (await getStore()).increment(key, ttlMs);
}

export async function storeSetAdd(key: string, member: string, ttlMs: number): Promise<void> {
  await (await getStore()).setAdd(key, member, ttlMs);
}

export async function storeSetMembers(key: string): Promise<string[]> {
  return (await getStore()).setMembers(key);
}

export async function storeDeleteByPrefix(prefix: string): Promise<number> {
  return (await getStore()).deleteByPrefix(prefix);
}

export async function storeKeys(prefix: string): Promise<string[]> {
  return (await getStore()).keys(prefix);
}

export async function storeTtlMs(key: string): Promise<number> {
  return (await getStore()).ttlMs(key);
}

export async function storeSetNx(key: string, value: string, ttlMs: number): Promise<boolean> {
  return (await getStore()).setNx(key, value, ttlMs);
}

export async function redisHealth(): Promise<{ driver: StoreDriver; reachable: boolean; lastError: string | null }> {
  const built = await getStore();
  return { driver: built.driver, reachable: true, lastError };
}

export const KEY_PREFIX = {
  rateLimit: 'rl:',
  loginAttempt: 'la:',
  cooldown: 'cd:',
  captcha: 'cap:',
  tokenBlocklist: 'jwt:bl:',
  session: 'sess:',
  permissionCache: 'perm:',
  permissionVersion: 'perm:version:',
  ipRules: 'ip:rules',
  ipBlocked: 'ip:blocked:',
  retention: 'retention:',
} as const;
