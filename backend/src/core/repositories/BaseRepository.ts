import { pool } from '../../nativeDb.js';

/**
 * BaseRepository: Abstract OOP base class encapsulating MySQL operations
 * Encapsulation, prepared statement abstraction, and connection pooling.
 */
export abstract class BaseRepository<T> {
  protected abstract readonly tableName: string;

  public async query<R = T>(sql: string, params: any[] = []): Promise<R[]> {
    const [rows] = await pool.execute(sql, params);
    return rows as R[];
  }

  public async queryOne<R = T>(sql: string, params: any[] = []): Promise<R | null> {
    const rows = await this.query<R>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  public async execute(sql: string, params: any[] = []): Promise<any> {
    const [result] = await pool.execute(sql, params);
    return result;
  }

  public async findById(id: string): Promise<T | null> {
    return this.queryOne<T>(`SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`, [id]);
  }

  public async count(whereClause = '1=1', params: any[] = []): Promise<number> {
    const res = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${whereClause}`,
      params
    );
    return Number(res?.count || 0);
  }
}
