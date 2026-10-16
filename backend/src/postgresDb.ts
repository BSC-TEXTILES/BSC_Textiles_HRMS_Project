/**
 * BSC Textiles HRMS — Native PostgreSQL / Supabase Engine
 * Provides 100% drop-in compatibility with mysql2/promise `pool.query(sql, params)`
 * and supports Supabase Cloud PostgreSQL 17 on session pooler with SSL.
 */

import pg, { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const DEFAULT_SUPABASE_URL =
  'postgresql://postgres.opoeigmbiwctvqtzxkde:HRMS_Project%402026@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres';

export class PostgresPoolAdapter {
  public pgPool: Pool;
  private uri: string;

  constructor(connectionUri?: string) {
    this.uri =
      connectionUri ||
      process.env.SUPABASE_POOLER_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      DEFAULT_SUPABASE_URL;

    this.pgPool = new Pool({
      connectionString: this.uri,
      ssl: { rejectUnauthorized: false },
      max: process.env.VERCEL ? 10 : 25,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pgPool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]:', err.message);
    });
  }

  public translateSql(sql: string): { sql: string; isInsert: boolean } {
    let s = sql.trim();

    // 1. Transform MySQL backticks to standard SQL / PostgreSQL double quotes
    s = s.replace(/`([^`]+)`/g, '"$1"');

    // 2. Ensure PostgreSQL reserved words used as table names are safely quoted
    s = s.replace(/\bFROM\s+user\b/gi, 'FROM "user"');
    s = s.replace(/\bJOIN\s+user\b/gi, 'JOIN "user"');
    s = s.replace(/\bINTO\s+user\b/gi, 'INTO "user"');
    s = s.replace(/\bUPDATE\s+user\b/gi, 'UPDATE "user"');

    s = s.replace(/\bFROM\s+session\b/gi, 'FROM "session"');
    s = s.replace(/\bJOIN\s+session\b/gi, 'JOIN "session"');
    s = s.replace(/\bINTO\s+session\b/gi, 'INTO "session"');

    s = s.replace(/\bFROM\s+role\b/gi, 'FROM "role"');
    s = s.replace(/\bJOIN\s+role\b/gi, 'JOIN "role"');
    s = s.replace(/\bINTO\s+role\b/gi, 'INTO "role"');

    // 3. MySQL dialect functions to PostgreSQL equivalents
    s = s.replace(/\bIFNULL\(/gi, 'COALESCE(');
    s = s.replace(/\bCURDATE\(\)/gi, 'CURRENT_DATE');
    s = s.replace(/\bNOW\(\d*\)/gi, 'NOW()');
    s = s.replace(/\bCURRENT_TIMESTAMP\(\d*\)/gi, 'CURRENT_TIMESTAMP');
    s = s.replace(/\bLIMIT\s+(\d+)\s*,\s*(\d+)/gi, 'LIMIT $2 OFFSET $1');
    s = s.replace(/\bUNIX_TIMESTAMP\(([^)]+)\)/gi, 'EXTRACT(EPOCH FROM $1)::bigint');
    s = s.replace(/\bUNIX_TIMESTAMP\(\)/gi, 'EXTRACT(EPOCH FROM NOW())::bigint');

    // 4. Transform `?` placeholders into `$1`, `$2`, `$3`... while ignoring strings
    let paramIndex = 0;
    let inString = false;
    let quoteChar = '';
    let resultSql = '';

    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      if (!inString && (char === "'" || char === '"')) {
        inString = true;
        quoteChar = char;
        resultSql += char;
      } else if (inString && char === quoteChar) {
        if (s[i + 1] === quoteChar) {
          resultSql += char + quoteChar;
          i++;
        } else {
          inString = false;
          resultSql += char;
        }
      } else if (!inString && char === '?') {
        paramIndex++;
        resultSql += `$${paramIndex}`;
      } else {
        resultSql += char;
      }
    }
    s = resultSql;

    // 5. Append RETURNING * for inserts so `insertId` and created records are captured
    const isInsert = /^\s*INSERT\s+INTO\b/i.test(s);
    if (isInsert && !/\bRETURNING\b/i.test(s)) {
      s += ' RETURNING *';
    }

    return { sql: s, isInsert };
  }

  public async query(sql: string, params: any[] = []): Promise<[any, any]> {
    const { sql: pgSql, isInsert } = this.translateSql(sql);

    // Normalize parameters
    const normalizedParams = (params || []).map((p) => {
      if (p === undefined) return null;
      return p;
    });

    const isSelect = /^\s*(SELECT|EXPLAIN|WITH|SHOW)\b/i.test(pgSql);

    try {
      const res = await this.pgPool.query(pgSql, normalizedParams);

      if (isSelect) {
        return [res.rows || [], res.fields || []];
      }

      if (isInsert) {
        const resultHeader: any = res.rows || [];
        resultHeader.affectedRows = res.rowCount || 0;
        resultHeader.insertId = res.rows[0]?.id || 0;
        return [resultHeader, res.fields || []];
      }

      const resultHeader = {
        affectedRows: res.rowCount || 0,
        insertId: 0,
      };
      return [resultHeader, res.fields || []];
    } catch (err: any) {
      console.error(
        `[Postgres Error] SQL: "${pgSql.slice(0, 160)}..." Params:`,
        normalizedParams,
        `Error:`,
        err.message
      );
      throw err;
    }
  }

  public async getConnection(): Promise<any> {
    const client: PoolClient = await this.pgPool.connect();
    const self = this;

    return {
      query: async (sql: string, params: any[] = []) => {
        const { sql: pgSql, isInsert } = self.translateSql(sql);
        const normalizedParams = (params || []).map((p) => (p === undefined ? null : p));
        const isSelect = /^\s*(SELECT|EXPLAIN|WITH|SHOW)\b/i.test(pgSql);
        const res = await client.query(pgSql, normalizedParams);

        if (isSelect) {
          return [res.rows || [], res.fields || []];
        }
        if (isInsert) {
          const resultHeader: any = res.rows || [];
          resultHeader.affectedRows = res.rowCount || 0;
          resultHeader.insertId = res.rows[0]?.id || 0;
          return [resultHeader, res.fields || []];
        }
        return [{ affectedRows: res.rowCount || 0, insertId: 0 }, res.fields || []];
      },
      beginTransaction: async () => {
        await client.query('BEGIN');
      },
      commit: async () => {
        await client.query('COMMIT');
      },
      rollback: async () => {
        await client.query('ROLLBACK');
      },
      release: () => {
        client.release();
      },
    };
  }

  public async end(): Promise<void> {
    await this.pgPool.end();
  }
}

export const postgresPool = new PostgresPoolAdapter();
export default postgresPool;
