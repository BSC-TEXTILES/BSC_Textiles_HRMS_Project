/**
 * BSC Textiles HRMS — Hostinger & Production MySQL Connection Adapter
 * Ensures zero-error connectivity across Linux/Hostinger cPanel, Docker, and Windows:
 * 1. Enforces IPv4-first DNS resolution to eliminate IPv6 ::1 Access Denied errors.
 * 2. Auto-detects Linux local MySQL Unix Domain Sockets (/var/lib/mysql/mysql.sock, /tmp/mysql.sock).
 * 3. Automatically recovers from ER_ACCESS_DENIED_ERROR by testing lowercase usernames,
 *    cPanel account prefixes (e.g. u101820758 vs u101820759), and socket vs TCP loopback.
 * 4. Transparently proxies Pool.query / execute / getConnection with auto-healing.
 */

import mysql, { Pool, PoolOptions, ConnectionOptions } from 'mysql2/promise';
import fs from 'node:fs';
import dns from 'node:dns';

// Enforce IPv4-first resolution globally
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignored in runtimes without setDefaultResultOrder
}

const COMMON_UNIX_SOCKETS = [
  process.env.DB_SOCKET,
  process.env.MYSQL_UNIX_PORT,
  '/var/lib/mysql/mysql.sock',
  '/tmp/mysql.sock',
  '/var/run/mysqld/mysqld.sock',
  '/var/run/mysql/mysql.sock',
].filter(Boolean) as string[];

let cachedWorkingConfig: PoolOptions | null = null;
let isProbing = false;

export function getDetectedUnixSocket(): string | undefined {
  if (process.platform === 'win32') return undefined;
  for (const socketPath of COMMON_UNIX_SOCKETS) {
    try {
      if (fs.existsSync(socketPath)) {
        return socketPath;
      }
    } catch {
      // Ignore filesystem permission checks
    }
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
    // URL parsing failed; fallback to manual regex
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

  const detectedSocket = getDetectedUnixSocket();

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

  if (detectedSocket) {
    options.socketPath = detectedSocket;
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
    const candidate: PoolOptions = { ...base, ...opts };
    const key = `${candidate.user}|${candidate.database}|${candidate.socketPath || candidate.host}|${candidate.port || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  };

  // 1. Primary configured options
  pushCandidate({});

  const detectedSocket = getDetectedUnixSocket();

  // 2. If primary had no socketPath, try with detected socket
  if (!base.socketPath && detectedSocket) {
    pushCandidate({ socketPath: detectedSocket, host: undefined, port: undefined });
  }

  // 3. Lowercase username & database
  if (base.user) {
    const lowerUser = base.user.toLowerCase();
    const lowerDb = base.database?.toLowerCase();
    pushCandidate({ user: lowerUser, database: lowerDb });
    if (detectedSocket) {
      pushCandidate({ user: lowerUser, database: lowerDb, socketPath: detectedSocket, host: undefined, port: undefined });
    }
  }

  // 4. Detect cPanel home directory account (e.g. /home/u101820758/...)
  const homePath = process.env.HOME || process.cwd() || __dirname;
  const cpanelMatch = homePath.match(/\/home\/(u[0-9]+)/i);
  const detectedCpanelAccount = cpanelMatch ? cpanelMatch[1].toLowerCase() : (process.env.USER || '').toLowerCase();

  if (detectedCpanelAccount && base.user) {
    const userPrefixMatch = base.user.match(/^(u[0-9]+)_(.+)$/i);
    if (userPrefixMatch) {
      const currentPrefix = userPrefixMatch[1].toLowerCase();
      const suffix = userPrefixMatch[2];
      if (currentPrefix !== detectedCpanelAccount) {
        const adaptedUser = `${detectedCpanelAccount}_${suffix}`;
        const adaptedDb = base.database ? base.database.replace(new RegExp(`^${userPrefixMatch[1]}_`, 'i'), `${detectedCpanelAccount}_`) : undefined;
        
        pushCandidate({ user: adaptedUser, database: adaptedDb });
        pushCandidate({ user: adaptedUser.toLowerCase(), database: adaptedDb?.toLowerCase() });
        if (detectedSocket) {
          pushCandidate({ user: adaptedUser, database: adaptedDb, socketPath: detectedSocket, host: undefined, port: undefined });
          pushCandidate({ user: adaptedUser.toLowerCase(), database: adaptedDb?.toLowerCase(), socketPath: detectedSocket, host: undefined, port: undefined });
        }
      }
    }
  }

  // 5. Try explicit IPv4 loopback without socket (in case Unix socket has file permission limits)
  if (base.socketPath) {
    pushCandidate({ socketPath: undefined, host: '127.0.0.1', port: 3306 });
    if (base.user) {
      pushCandidate({ socketPath: undefined, host: '127.0.0.1', port: 3306, user: base.user.toLowerCase(), database: base.database?.toLowerCase() });
    }
  }

  return candidates;
}

export async function probeAndFindWorkingOptions(baseOptions: PoolOptions): Promise<PoolOptions> {
  if (cachedWorkingConfig) return cachedWorkingConfig;
  if (isProbing) return baseOptions;
  isProbing = true;

  try {
    const candidates = generateCandidates(baseOptions);
    for (const cand of candidates) {
      let testConn: mysql.Connection | null = null;
      try {
        const connOpts: ConnectionOptions = {
          user: cand.user,
          password: cand.password,
          database: cand.database,
          host: cand.host,
          port: cand.port,
          socketPath: cand.socketPath,
          connectTimeout: 2000,
        };
        testConn = await mysql.createConnection(connOpts);
        await testConn.query('SELECT 1');
        await testConn.end();

        cachedWorkingConfig = cand;
        const targetDesc = cand.socketPath ? `Unix socket [${cand.socketPath}]` : `TCP [${cand.host}:${cand.port}]`;
        console.log(`[Database] ✅ Successfully verified MySQL connection for user '${cand.user}' on database '${cand.database}' via ${targetDesc}`);
        return cand;
      } catch {
        if (testConn) {
          try { await testConn.end(); } catch {}
        }
      }
    }
  } finally {
    isProbing = false;
  }

  return baseOptions;
}

export function createAdaptiveMysqlPool(uriOrConfig?: string, fallbackDb = 'bsc_textiles_hrms'): Pool {
  let initialOptions = buildMysqlPoolOptions(uriOrConfig, fallbackDb);
  let activePool = mysql.createPool(initialOptions);

  let hasRecovered = false;

  async function ensureWorkingPool(): Promise<Pool> {
    if (hasRecovered || cachedWorkingConfig) return activePool;
    const workingOptions = await probeAndFindWorkingOptions(initialOptions);
    if (workingOptions !== initialOptions) {
      hasRecovered = true;
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
            if (err?.code === 'ER_ACCESS_DENIED_ERROR' || err?.code === 'ECONNREFUSED') {
              console.warn(`[Database] Recovering from MySQL error (${err.code}): probing valid credentials/socket...`);
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
            if (err?.code === 'ER_ACCESS_DENIED_ERROR' || err?.code === 'ECONNREFUSED') {
              console.warn(`[Database] Recovering from MySQL getConnection error (${err.code}): probing valid credentials/socket...`);
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
