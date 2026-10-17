/**
 * BSC Textiles HRMS — Native MySQL 8.0 Connection Pool
 * Zero Prisma Dependency. High-Performance mysql2/promise driver.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });

const connectionUri = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';

export const pool = mysql.createPool({
  uri: connectionUri,
  waitForConnections: true,
  connectionLimit: 25,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true,
  dateStrings: false,
  timezone: '+05:30', // Authoritative Asia/Kolkata timezone
  multipleStatements: true,
});

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function executeRaw(sql: string): Promise<any> {
  const [result] = await pool.query(sql);
  return result;
}
