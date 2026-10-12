/**
 * BSC Textiles HRMS — MySQL to SQLite One-Way Migration Utility
 * Copies all active data from local MySQL 8.0 into the standalone SQLite database.
 * Uses schema reflection to safely map intersecting columns.
 */

import mysql from 'mysql2/promise';
import { sqliteEngine } from '../backend/src/sqliteDb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const mysqlUri = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';

async function migrateData() {
  console.log('=== BSC TEXTILES HRMS: MYSQL -> SQLITE MIGRATION ===');
  console.log(`Connecting to source MySQL: ${mysqlUri}`);

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({ uri: mysqlUri, dateStrings: true });
    console.log('Connected to MySQL successfully.');
  } catch (err: any) {
    console.warn(`Could not connect to MySQL (${err.message}). Using SQLite default seeded data.`);
    process.exit(0);
  }

  const tablesToMigrate = [
    'location',
    'floor',
    'department',
    'section',
    'shift',
    'attendancerules',
    'employee',
    'user',
    'attendance',
    'late_attendance_record',
    'payrollrun',
    'payrollitem',
    'customer',
    'wedding_registration',
    'wedding_interaction',
    'customer_feedback',
    'showroom_footfall',
    'visual_merchandising',
    'auditlog'
  ];

  const sqliteRaw = sqliteEngine.getRawDb();

  for (const table of tablesToMigrate) {
    try {
      // 1. Get destination SQLite columns
      const pragmaCols: any[] = sqliteRaw.prepare(`PRAGMA table_info(\`${table}\`)`).all();
      if (!pragmaCols || pragmaCols.length === 0) {
        continue;
      }
      const targetColSet = new Set(pragmaCols.map(c => c.name));

      // 2. Fetch from MySQL
      const [rows]: any = await conn.query(`SELECT * FROM \`${table}\``);
      if (!rows || rows.length === 0) {
        continue;
      }

      // 3. Find intersecting columns
      const sample = rows[0];
      const validCols = Object.keys(sample).filter(c => targetColSet.has(c));
      if (!validCols.includes('employeeCode') && targetColSet.has('employeeCode') && table === 'payrollitem') {
        validCols.push('employeeCode');
      }
      if (!validCols.includes('fullName') && targetColSet.has('fullName') && table === 'payrollitem') {
        validCols.push('fullName');
      }
      if (!validCols.includes('salaryMonth') && targetColSet.has('salaryMonth') && table === 'payrollitem') {
        validCols.push('salaryMonth');
      }
      if (!validCols.includes('salaryYear') && targetColSet.has('salaryYear') && table === 'payrollitem') {
        validCols.push('salaryYear');
      }
      if (!validCols.includes('entity') && targetColSet.has('entity') && table === 'auditlog') {
        validCols.push('entity');
      }
      if (validCols.length === 0) continue;

      const placeholders = validCols.map(() => '?').join(', ');
      const insertSql = `INSERT OR REPLACE INTO \`${table}\` (${validCols.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
      const stmt = sqliteRaw.prepare(insertSql);

      // Preload employee information
      const empInfoMap = new Map<string, { employeeCode: string; fullName: string }>();
      if (table === 'payrollitem') {
        const empRows: any[] = sqliteRaw.prepare('SELECT id, employeeCode, fullName FROM employee').all();
        for (const er of empRows) empInfoMap.set(er.id, { employeeCode: er.employeeCode, fullName: er.fullName });
      }

      const insertMany = sqliteRaw.transaction((items: any[]) => {
        for (const item of items) {
          if (table === 'payrollitem') {
            const empInfo = empInfoMap.get(item.employeeId);
            if (!item.employeeCode) item.employeeCode = empInfo?.employeeCode || 'EMP-UNKNOWN';
            if (!item.fullName) item.fullName = empInfo?.fullName || 'Staff Member';
            if (!item.salaryMonth) item.salaryMonth = 'Aug';
            if (!item.salaryYear) item.salaryYear = 2026;
          }
          if (table === 'auditlog' && !item.entity) {
            item.entity = item.entityType || 'SYSTEM';
          }
          const values = validCols.map(c => {
            const val = item[c];
            if (val === undefined || val === null) return null;
            if (typeof val === 'object') return JSON.stringify(val);
            if (typeof val === 'boolean') return val ? 1 : 0;
            return val;
          });
          stmt.run(...values);
        }
      });

      insertMany(rows);
      console.log(`  -> Migrated ${rows.length} rows for [${table}] (${validCols.length} columns mapped).`);
    } catch (err: any) {
      if (!err.message.includes("doesn't exist")) {
        console.error(`  -> Failed migrating [${table}]:`, err.message);
      }
    }
  }

  await conn.end();
  console.log('\n=== MIGRATION TO SQLITE COMPLETE ===');
  console.log(`SQLite database location: ${sqliteEngine.getDatabasePath()}`);
}

migrateData().catch(console.error);
