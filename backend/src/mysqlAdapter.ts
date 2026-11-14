/** MySQL connections use only explicitly configured credentials and databases. */
import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import fs from 'node:fs';
import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch { }

export function getExplicitUnixSocket(): string | undefined {
  if (process.platform === 'win32') return undefined;
  const envSocket = process.env.DB_SOCKET || process.env.MYSQL_UNIX_PORT;
  if (envSocket) {
    try {
      if (fs.existsSync(envSocket)) return envSocket;
    } catch { }
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

export function buildMysqlPoolOptions(uriOrConfig?: string, fallbackDb?: string): PoolOptions {
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
    connectTimeout: 10000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    decimalNumbers: true,
    dateStrings: ['DATE'],
    timezone: '+05:30',
    multipleStatements: true,
  };

  if (explicitSocket && ['localhost', '127.0.0.1', '::1'].includes(host)) {
    options.socketPath = explicitSocket;
  } else {
    options.host = host;
    options.port = port;
  }

  return options;
}

// mysql2 replaces failed connections itself. Never recover by changing user,
// password, host or database, or by sharing credentials between shard pools.
export function createAdaptiveMysqlPool(uri?: string, fallbackDb?: string): Pool {
  return mysql.createPool(buildMysqlPoolOptions(uri, fallbackDb));
}
