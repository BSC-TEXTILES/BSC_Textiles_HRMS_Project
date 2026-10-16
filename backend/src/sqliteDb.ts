/**
 * BSC Textiles HRMS — Standalone SQLite Local Database Engine
 * Designed for 100% Offline Single-Computer Operation on Windows 10/11.
 * Provides drop-in compatibility with mysql2/promise `pool.query(sql, params)`.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let BetterSqlite3: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BetterSqlite3 = require('better-sqlite3');
} catch {
  // better-sqlite3 native addon unavailable in serverless / Lambda environment
}

export interface SqliteQueryResult<T = any> {
  rows: T[];
  insertId?: number | bigint;
  affectedRows?: number;
}

class SqliteEngine {
  private db: DatabaseType | null = null;
  private dbPath: string = '';
  private dataDir: string = '';

  constructor() {
    // Lazy: do not initialize in constructor to avoid cold-start serverless crashes
  }

  public getDataDirectory(): string {
    return this.dataDir;
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public getRawDb(): DatabaseType {
    if (!this.db) this.initDatabase();
    return this.db!;
  }

  private initDatabase() {
    if (this.db) return;
    if (!BetterSqlite3) {
      console.warn('[SQLite Engine] better-sqlite3 native driver not available in this environment.');
      return;
    }

    try {
      if (process.env.SQLITE_PATH) {
        this.dbPath = path.resolve(process.env.SQLITE_PATH);
        this.dataDir = path.dirname(this.dbPath);
      } else if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        this.dataDir = '/tmp/BSCTextiles/data';
        this.dbPath = path.join(this.dataDir, 'bsc_textiles.db');
      } else {
        const baseAppData =
          process.env.APPDATA ||
          (process.platform === 'win32'
            ? path.join(os.homedir(), 'AppData', 'Roaming')
            : path.join(os.homedir(), '.bsc_textiles'));

        this.dataDir = path.join(baseAppData, 'BSCTextiles', 'data');
        this.dbPath = path.join(this.dataDir, 'bsc_textiles.db');
      }

      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    } catch (fsErr: any) {
      console.warn('[SQLite Engine] Could not create local directory, falling back to /tmp:', fsErr.message);
      this.dataDir = '/tmp';
      this.dbPath = '/tmp/bsc_textiles.db';
    }

    const isNewDb = !fs.existsSync(this.dbPath) || fs.statSync(this.dbPath).size === 0;

    console.log(`[SQLite Engine] Connecting to local database: ${this.dbPath}`);
    try {
      this.db = new BetterSqlite3(this.dbPath, {
        verbose: process.env.DEBUG_SQL ? console.log : undefined,
      });
    } catch (dbErr: any) {
      console.error('[SQLite Engine] Initialization error:', dbErr.message);
      return;
    }

    // 2. Set performance and integrity pragmas
    if (this.db) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
    }

    // 3. Auto-initialize schema & master seed if newly created
    if (isNewDb) {
      this.bootstrapSchemaAndSeed();
    } else {
      // Verify schema integrity
      this.ensureTablesExist();
    }
  }

  private bootstrapSchemaAndSeed() {
    console.log('[SQLite Engine] Initializing database schema from schema.sql...');
    const schemaCandidates = [
      path.resolve(__dirname, '../../database/sqlite/schema.sql'),
      path.resolve(process.cwd(), 'database/sqlite/schema.sql'),
      path.resolve(process.cwd(), '../database/sqlite/schema.sql'),
    ];

    let schemaContent = '';
    for (const p of schemaCandidates) {
      if (fs.existsSync(p)) {
        schemaContent = fs.readFileSync(p, 'utf8');
        break;
      }
    }

    if (schemaContent) {
      this.db!.exec(schemaContent);
      console.log('[SQLite Engine] Schema created successfully.');
    } else {
      console.warn('[SQLite Engine] Warning: schema.sql not found at standard locations.');
    }

    console.log('[SQLite Engine] Seeding master and showroom records from seed.sql...');
    const seedCandidates = [
      path.resolve(__dirname, '../../database/sqlite/seed.sql'),
      path.resolve(process.cwd(), 'database/sqlite/seed.sql'),
      path.resolve(process.cwd(), '../database/sqlite/seed.sql'),
    ];

    let seedContent = '';
    for (const p of seedCandidates) {
      if (fs.existsSync(p)) {
        seedContent = fs.readFileSync(p, 'utf8');
        break;
      }
    }

    if (seedContent) {
      this.db!.exec(seedContent);
      console.log('[SQLite Engine] Master data seeded successfully.');
    }
  }

  private ensureTablesExist() {
    try {
      const check = this.db!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employee'").get();
      if (!check) {
        console.log('[SQLite Engine] Tables missing in existing DB. Bootstrapping...');
        this.bootstrapSchemaAndSeed();
      }
    } catch (err: any) {
      console.error('[SQLite Engine] Error checking tables:', err.message);
    }
  }

  /**
   * Translates MySQL dialect constructs to SQLite
   */
  private translateQuery(sql: string): string {
    let s = sql;

    // NOW(3) or NOW() -> datetime('now', 'localtime')
    s = s.replace(/\bNOW\(\d*\)/gi, "datetime('now', 'localtime')");

    // CURDATE() -> date('now', 'localtime')
    s = s.replace(/\bCURDATE\(\)/gi, "date('now', 'localtime')");

    // CURRENT_TIMESTAMP(3) -> CURRENT_TIMESTAMP
    s = s.replace(/\bCURRENT_TIMESTAMP\(\d*\)/gi, 'CURRENT_TIMESTAMP');

    // MySQL LIMIT offset, count -> SQLite LIMIT count OFFSET offset
    s = s.replace(/\bLIMIT\s+(\d+)\s*,\s*(\d+)/gi, 'LIMIT $2 OFFSET $1');

    // MONTH(col) -> CAST(strftime('%m', col) AS INTEGER)
    s = s.replace(/\bMONTH\(([^)]+)\)/gi, "CAST(strftime('%m', $1) AS INTEGER)");

    // YEAR(col) -> CAST(strftime('%Y', col) AS INTEGER)
    s = s.replace(/\bYEAR\(([^)]+)\)/gi, "CAST(strftime('%Y', $1) AS INTEGER)");

    // IFNULL(a, b) -> COALESCE(a, b)
    s = s.replace(/\bIFNULL\(/gi, 'COALESCE(');

    // ENUM(...) -> TEXT
    s = s.replace(/\bENUM\([^)]*\)/gi, 'TEXT');

    // Remove ENGINE=...
    s = s.replace(/\)\s*ENGINE=[^;]*/gi, ')');

    return s;
  }

  /**
   * Drop-in replacement for mysql2/promise `pool.query(sql, params)`
   */
  public async query(sql: string, params: any[] = []): Promise<[any, any]> {
    if (!this.db) this.initDatabase();

    const translatedSql = this.translateQuery(sql.trim());

    // Normalize params (handle undefined, Date, Booleans)
    const normalizedParams = (params || []).map((p) => {
      if (p === undefined) return null;
      if (p instanceof Date) return p.toISOString();
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });

    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(translatedSql);

    try {
      if (isSelect) {
        const stmt = this.db!.prepare(translatedSql);
        const rows = stmt.all(...normalizedParams);
        return [rows, []];
      } else {
        // Multi-statement script
        if (translatedSql.includes(';') && normalizedParams.length === 0) {
          this.db!.exec(translatedSql);
          return [{ affectedRows: 1, insertId: 0 }, []];
        }

        const stmt = this.db!.prepare(translatedSql);
        const info = stmt.run(...normalizedParams);
        const resultHeader = {
          affectedRows: info.changes,
          insertId: typeof info.lastInsertRowid === 'bigint' ? Number(info.lastInsertRowid) : info.lastInsertRowid,
          changes: info.changes,
        };
        return [resultHeader, []];
      }
    } catch (err: any) {
      console.error(`[SQLite Error] Query: "${translatedSql.slice(0, 150)}..." Params:`, normalizedParams, `Error:`, err.message);
      throw err;
    }
  }

  /**
   * Emulate pool.getConnection() for transaction workflows
   */
  public async getConnection() {
    const self = this;
    return {
      query: (sql: string, params: any[]) => self.query(sql, params),
      beginTransaction: async () => {
        self.db!.exec('BEGIN TRANSACTION');
      },
      commit: async () => {
        self.db!.exec('COMMIT');
      },
      rollback: async () => {
        self.db!.exec('ROLLBACK');
      },
      release: () => {
        // SQLite in single-process doesn't need to release connection
      },
    };
  }

  /**
   * Online Database Backup (Safe hot backup without locks)
   */
  public async backup(destinationPath: string): Promise<{ success: boolean; path: string; sizeBytes: number }> {
    if (!this.db) this.initDatabase();

    const targetDir = path.dirname(destinationPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    console.log(`[SQLite Backup] Starting hot backup to: ${destinationPath}`);
    await this.db!.backup(destinationPath);
    const stat = fs.statSync(destinationPath);
    console.log(`[SQLite Backup] Completed successfully (${stat.size} bytes).`);
    return { success: true, path: destinationPath, sizeBytes: stat.size };
  }

  /**
   * Database Restore from Backup with verification
   */
  public async restore(backupFilePath: string): Promise<{ success: boolean; message: string }> {
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file not found at: ${backupFilePath}`);
    }

    if (!BetterSqlite3) {
      throw new Error('better-sqlite3 driver is unavailable in this environment');
    }
    // Verify backup file integrity before applying
    const verifyDb = new BetterSqlite3(backupFilePath, { readonly: true });
    try {
      const integrity = verifyDb.pragma('integrity_check');
      if (!Array.isArray(integrity) || integrity[0]?.integrity_check !== 'ok') {
        throw new Error('Backup file failed SQLite integrity check');
      }
      verifyDb.close();
    } catch (err: any) {
      verifyDb.close();
      throw new Error(`Invalid or corrupt backup database: ${err.message}`);
    }

    // Close active db
    this.db?.close();
    this.db = null;

    // Create a safety copy of current db before restoring
    const safetyCopy = `${this.dbPath}.pre-restore-${Date.now()}`;
    if (fs.existsSync(this.dbPath)) {
      fs.copyFileSync(this.dbPath, safetyCopy);
    }

    // Copy backup over active db
    fs.copyFileSync(backupFilePath, this.dbPath);

    // Reopen
    this.initDatabase();

    return {
      success: true,
      message: `Database restored successfully from ${path.basename(backupFilePath)}. Safety snapshot saved at ${path.basename(safetyCopy)}`,
    };
  }

  public checkIntegrity(): string {
    if (!this.db) this.initDatabase();
    const result: any = this.db!.pragma('integrity_check');
    return result[0]?.integrity_check || 'ok';
  }

  public close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
  }
}

// Global Singleton Instance
export const sqliteEngine = new SqliteEngine();

// Export pool-compatible interface
export const sqlitePool = {
  query: (sql: string, params?: any[]) => sqliteEngine.query(sql, params),
  getConnection: () => sqliteEngine.getConnection(),
  end: async () => sqliteEngine.close(),
};

export default sqliteEngine;
