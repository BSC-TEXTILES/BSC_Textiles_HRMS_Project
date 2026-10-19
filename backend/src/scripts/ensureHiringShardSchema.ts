import { pool } from '../nativeDb.js';
import fs from 'node:fs';
import path from 'node:path';

export async function ensureHiringShardSchema() {
  try {
    const [tables]: any = await pool.query("SHOW TABLES LIKE 'candidate'");
    if (tables && tables.length > 0) {
      return;
    }
    console.log('[schema] candidate table missing from primary DB. Applying hiring_shard_schema.sql...');
    const candidates = [
      path.resolve(process.cwd(), '../database/shards/hiring_shard_schema.sql'),
      path.resolve(process.cwd(), 'database/shards/hiring_shard_schema.sql'),
    ];
    const schemaPath = candidates.find((p) => fs.existsSync(p));
    if (schemaPath) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      const statements = sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 5);
      for (const stmt of statements) {
        await pool.query(stmt).catch((err: any) => {
          if (!err.message?.includes('already exists')) {
            console.warn('[ensureHiringShardSchema stmt warning]:', err.message);
          }
        });
      }
      console.log('[schema] hiring_shard_schema.sql applied.');
    }
  } catch (err: any) {
    console.warn('[ensureHiringShardSchema warning]:', err?.message || err);
  }
}
