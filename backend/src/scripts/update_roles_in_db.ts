import { pool } from '../db.js';
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const TARGET_ROLES = [
  {
    id: 'role_super_admin',
    name: 'SUPER_ADMIN',
    description: 'Executive Governance',
    isSystem: 1,
  },
  {
    id: 'role_hr_manager',
    name: 'HR_MANAGER',
    description: 'Staff & Payroll',
    isSystem: 0,
  },
  {
    id: 'role_staff_member',
    name: 'STAFF',
    description: 'My Desk & Attendance',
    isSystem: 0,
  },
  {
    id: 'role_sales_employee',
    name: 'SALES_EMPLOYEE',
    description: 'My Desk & Attendance',
    isSystem: 0,
  },
];

async function updateDatabases() {
  console.log('================================================================');
  console.log('UPDATING ROLES DETAILS IN BOTH MYSQL & SUPABASE POSTGRES');
  console.log('================================================================');

  // 1. Update MySQL
  console.log('\n--- 1. Updating MySQL `role` Table ---');
  for (const r of TARGET_ROLES) {
    await pool.query(
      `INSERT INTO \`role\` (id, name, description, isSystem, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE description = VALUES(description), updatedAt = NOW(3)`,
      [r.id, r.name, r.description, r.isSystem]
    );
    console.log(`✓ MySQL Role Updated: [${r.name}] -> "${r.description}"`);
  }

  const [mysqlRoles]: any = await pool.query('SELECT name, description FROM `role`');
  console.log('Current MySQL Roles:');
  console.table(mysqlRoles);

  // 2. Update Supabase PostgreSQL
  console.log('\n--- 2. Updating Supabase PostgreSQL `role` Table ---');
  const pgClient = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  for (const r of TARGET_ROLES) {
    const updateRes = await pgClient.query(
      `UPDATE public."role" SET "description" = $1, "updatedAt" = NOW() WHERE "name" = $2`,
      [r.description, r.name]
    );
    if (updateRes.rowCount === 0) {
      await pgClient.query(
        `INSERT INTO public."role" ("id", "name", "description", "isSystem", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [r.id, r.name, r.description, Boolean(r.isSystem)]
      );
    }
    console.log(`✓ Supabase Role Updated: [${r.name}] -> "${r.description}"`);
  }

  const pgRoles = await pgClient.query('SELECT "name", "description" FROM public."role" ORDER BY "name"');
  console.log('Current Supabase Roles:');
  console.table(pgRoles.rows);

  await pgClient.end();
  await pool.end();
  console.log('\n================================================================');
  console.log('ROLES DETAILS SUCCESSFULLY UPDATED IN BOTH DATABASES!');
  console.log('================================================================');
  process.exit(0);
}

updateDatabases().catch((err) => {
  console.error('Update failed:', err);
  process.exit(1);
});
