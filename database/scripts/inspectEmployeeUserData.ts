import { pool } from '../src/pool.js';

async function main() {
  const [users]: any = await pool.query(`
    SELECT id, email, fullName, role, locationId, employeeId, isActive, status
    FROM user
  `);
  console.log(`=== USERS (${users.length}) ===`);
  for (const u of users) {
    console.log(`[USER] ID: ${u.id} | Email: ${u.email} | Role: ${u.role} | EmpId: ${u.employeeId || 'none'} | Status: ${u.status}`);
  }

  const [employees]: any = await pool.query(`
    SELECT e.id, e.employeeCode, e.fullName, e.email, e.locationId, l.code as locationCode, e.status
    FROM employee e
    LEFT JOIN location l ON e.locationId = l.id
    ORDER BY l.code, e.employeeCode
  `);
  console.log(`\n=== EMPLOYEES (${employees.length}) ===`);
  for (const e of employees) {
    console.log(`[EMP] Code: ${e.employeeCode} | Name: ${e.fullName} | Loc: ${e.locationCode || 'none'} | Status: ${e.status}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
