/**
 * BSC Textiles HRMS — Production & Hostinger MySQL Connection Adapter
 * Hardened for CloudLinux CageFS, LiteSpeed, Docker, and Windows:
 * 1. Enforces IPv4-first resolution to prevent ::1 IPv6 Access Denied errors.
 * 2. Uses TCP 127.0.0.1 loopback with rate-limited, gentle candidate probing to avoid socket exhaustion.
 * 3. Probes and auto-heals credential mismatches (e.g. u101820758 vs u101820759, lowercase vs uppercase).
 * 4. Discovers matching databases via `SHOW DATABASES` when user credentials succeed.
 * 5. Shares probing promise across concurrent boots so views, shards, and workers initialize cleanly.
 */

import mysql, { Pool, PoolOptions, ConnectionOptions } from 'mysql2/promise';
import fs from 'node:fs';
import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

let cachedWorkingConfig: PoolOptions | null = null;
let probePromise: Promise<PoolOptions> | null = null;
let lastProbeFailedTime = 0;

export function getExplicitUnixSocket(): string | undefined {
  if (process.platform === 'win32') return undefined;
  const envSocket = process.env.DB_SOCKET || process.env.MYSQL_UNIX_PORT;
  if (envSocket) {
    try {
      if (fs.existsSync(envSocket)) return envSocket;
    } catch {}
  }
  return undefined;
}

export function parseDatabaseUri(uri: string): {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  database?: string;
} {
  const result: { user?: string; password?: string; host?: string; port?: number; database?: string } = {};
  if (!uri || !uri.startsWith('mysql')) return result;

  try {
    const parsed = new URL(uri);
    result.host = parsed.hostname || undefined;
    result.port = parsed.port ? parseInt(parsed.port, 10) : undefined;
    result.user = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    result.password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    const db = parsed.pathname.replace(/^\//, '');
    if (db) result.database = db;
  } catch {
    const match = uri.match(/^mysql2?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/(.+)$/);
    if (match) {
      result.user = decodeURIComponent(match[1]);
      result.password = decodeURIComponent(match[2]);
      result.host = match[3];
      result.port = match[4] ? parseInt(match[4], 10) : 3306;
      result.database = match[5];
    }
  }
  return result;
}

export function buildMysqlPoolOptions(uriOrConfig?: string, fallbackDb = 'bsc_textiles_hrms'): PoolOptions {
  if (cachedWorkingConfig) {
    return {
      ...cachedWorkingConfig,
      database: fallbackDb && fallbackDb !== 'bsc_textiles_hrms' ? fallbackDb : cachedWorkingConfig.database,
    };
  }

  const rawUri = uriOrConfig || process.env.DATABASE_URL || '';
  const parsed = parseDatabaseUri(rawUri);

  const explicitSocket = getExplicitUnixSocket();

  let host = parsed.host || process.env.DB_HOST || '127.0.0.1';
  if (host === 'localhost' || host === '::1') {
    host = '127.0.0.1';
  }

  const user = parsed.user || process.env.DB_USER || 'root';
  const password = parsed.password || process.env.DB_PASSWORD || '';
  const database = parsed.database || fallbackDb || process.env.DB_NAME || 'bsc_textiles_hrms';
  const port = parsed.port || parseInt(process.env.DB_PORT || '3306', 10);

  const options: PoolOptions = {
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 25,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    decimalNumbers: true,
    dateStrings: ['DATE'],
    timezone: '+05:30',
    multipleStatements: true,
  };

  if (explicitSocket) {
    options.socketPath = explicitSocket;
  } else {
    options.host = host;
    options.port = port;
  }

  return options;
}

function generateCandidates(base: PoolOptions): PoolOptions[] {
  const candidates: PoolOptions[] = [];
  const seen = new Set<string>();

  const pushCandidate = (opts: Partial<PoolOptions>) => {
    const candidate: PoolOptions = {
      ...base,
      ...opts,
      socketPath: opts.socketPath !== undefined ? opts.socketPath : undefined,
      host: opts.host || '127.0.0.1',
      port: opts.port || 3306,
    };
    const key = `${candidate.user}|${candidate.database || ''}|${candidate.host}:${candidate.port}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  };

  // Detect hosting account prefix (e.g. /home/u101820758/...)
  const homePath = process.env.HOME || process.cwd() || __dirname;
  const cpanelMatch = homePath.match(/\/home\/(u[0-9]+)/i);
  const detectedAccount = cpanelMatch ? cpanelMatch[1].toLowerCase() : (process.env.USER || '').toLowerCase();

  const rawUser = base.user || '';
  const suffixMatch = rawUser.match(/^u[0-9]+_(.+)$/i);
  const suffix = suffixMatch ? suffixMatch[1] : 'bsc_smg_hrms';

  // 1. Exact configured credentials
  pushCandidate({ user: base.user, database: base.database, host: '127.0.0.1' });
  if (base.user) {
    pushCandidate({ user: base.user.toLowerCase(), database: base.database?.toLowerCase(), host: '127.0.0.1' });
  }

  // 2. Server account prefix variants (u101820758 vs u101820759)
  const prefixes = Array.from(new Set([detectedAccount, 'u101820758', 'u101820759'].filter(Boolean)));
  for (const p of prefixes) {
    pushCandidate({ user: `${p}_${suffix.toLowerCase()}`, database: `${p}_${suffix.toLowerCase()}`, host: '127.0.0.1' });
    pushCandidate({ user: `${p}_${suffix}`, database: `${p}_${suffix}`, host: '127.0.0.1' });
    // Without database constraint (for database discovery via SHOW DATABASES)
    pushCandidate({ user: `${p}_${suffix.toLowerCase()}`, database: undefined, host: '127.0.0.1' });
  }

  // Keep candidate list compact to prevent connection rate-limiting
  return candidates.slice(0, 6);
}

export async function probeAndFindWorkingOptions(baseOptions: PoolOptions): Promise<PoolOptions> {
  if (cachedWorkingConfig) return cachedWorkingConfig;
  const now = Date.now();
  if (now - lastProbeFailedTime < 30_000) {
    return baseOptions; // Throttle probing to avoid kernel socket exhaustion
  }
  if (probePromise) return probePromise;

  probePromise = (async () => {
    try {
      const candidates = generateCandidates(baseOptions);
      for (const cand of candidates) {
        let testConn: mysql.Connection | null = null;
        try {
          const connOpts: ConnectionOptions = {
            user: cand.user,
            password: cand.password,
            database: cand.database,
            host: cand.host || '127.0.0.1',
            port: cand.port || 3306,
            connectTimeout: 2500,
          };
          testConn = await mysql.createConnection(connOpts);

          // If no database was pre-specified, query SHOW DATABASES to find the exact database
          if (!cand.database) {
            try {
              const [dbs]: any = await testConn.query('SHOW DATABASES');
              if (Array.isArray(dbs)) {
                const match = dbs.find((d: any) => /bsc_smg|hrms/i.test(d?.Database || ''));
                if (match?.Database) {
                  cand.database = match.Database;
                }
              }
            } catch {}
          }

          await testConn.query('SELECT 1');
          await testConn.end();

          cachedWorkingConfig = cand;
          console.log(
            `[Database] ✅ Verified working MySQL configuration: user='${cand.user}' on database='${cand.database || baseOptions.database}' via TCP [${cand.host}:${cand.port}]`
          );
          return cand;
        } catch (err: any) {
          console.warn(
            `[Database Probe] Candidate ${cand.user}@${cand.host}:${cand.port} on db '${cand.database || '(none)'}' failed:`,
            err?.message || err
          );
          if (testConn) {
            try {
              await testConn.end();
            } catch {}
          }
        }
      }
      lastProbeFailedTime = Date.now();
    } finally {
      probePromise = null;
    }

    return baseOptions;
  })();

  return probePromise;
}

function isConnectionError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return (
    code === 'ER_ACCESS_DENIED_ERROR' ||
    code === 'ECONNREFUSED' ||
    code === 'EPERM' ||
    code === 'ER_DBACCESS_DENIED_ERROR' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    /access denied/i.test(msg) ||
    /connect eperm/i.test(msg) ||
    /connect econnrefused/i.test(msg)
  );
}

export function createAdaptiveMysqlPool(uriOrConfig?: string, fallbackDb = 'bsc_textiles_hrms'): Pool {
  let initialOptions = buildMysqlPoolOptions(uriOrConfig, fallbackDb);
  let activePool = mysql.createPool(initialOptions);

  async function ensureWorkingPool(): Promise<Pool> {
    if (cachedWorkingConfig && activePool) return activePool;
    const workingOptions = await probeAndFindWorkingOptions(initialOptions);
    if (workingOptions && workingOptions !== initialOptions) {
      try {
        await activePool.end();
      } catch {}
      activePool = mysql.createPool(workingOptions);
    }
    return activePool;
  }

  const poolProxy = new Proxy(activePool, {
    get(_target, prop: string | symbol) {
      if (prop === 'query' || prop === 'execute') {
        return async (...args: any[]) => {
          try {
            return await (activePool as any)[prop](...args);
          } catch (err: any) {
            if (isConnectionError(err)) {
              console.warn(
                `[Database] Recovering from connection issue (${err.code || err.message}): verifying valid MySQL connection...`
              );
              const pool = await ensureWorkingPool();
              return await (pool as any)[prop](...args);
            }
            throw err;
          }
        };
      }

      if (prop === 'getConnection') {
        return async () => {
          try {
            return await activePool.getConnection();
          } catch (err: any) {
            if (isConnectionError(err)) {
              console.warn(
                `[Database] Recovering from getConnection issue (${err.code || err.message}): verifying valid MySQL connection...`
              );
              const pool = await ensureWorkingPool();
              return await pool.getConnection();
            }
            throw err;
          }
        };
      }

      const val = (activePool as any)[prop];
      if (typeof val === 'function') {
        return val.bind(activePool);
      }
      return val;
    },
  });

  return poolProxy as unknown as Pool;
}
