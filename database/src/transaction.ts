import { pool } from './pool.js';
import type { PoolConnection } from 'mysql2/promise';

/**
 * Executes a callback within a managed database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK with clean connection release.
 */
export async function withTransaction<T>(
  callback: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
