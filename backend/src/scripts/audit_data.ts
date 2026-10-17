import { pool } from '../nativeDb.js';

async function auditData() {
  const [dbEmps]: any = await pool.query('SELECT id, employeeCode FROM employee');
  const validIds = new Set(dbEmps.map((e: any) => e.id));
  const validCodes = new Set(dbEmps.map((e: any) => String(e.employeeCode)));

  console.log(`Valid 56 Employee IDs loaded.`);

  const tablesToCheck = [
    { table: 'employee_custody_assets', col: 'employeeId' },
    { table: 'employee_documents', col: 'employeeId' },
    { table: 'kyc_documents', col: 'employeeId' },
    { table: 'kyc_consents', col: 'employeeId' },
    { table: 'late_attendance_record', col: 'employeeId' },
    { table: 'payroll_runs', col: 'location_id' },
    { table: 'user', col: 'employeeId' },
    { table: 'users', col: 'employee_id' },
  ];

  for (const { table, col } of tablesToCheck) {
    try {
      const [rows]: any = await pool.query(`SELECT DISTINCT \`${col}\` FROM \`${table}\``);
      const invalid = rows.filter((r: any) => r[col] && !validIds.has(r[col]));
      console.log(`Table ${table}.${col}: total distinct=${rows.length}, invalid=${invalid.length}`);
      if (invalid.length > 0) {
        console.log(`  Invalid IDs in ${table}:`, invalid.map((r: any) => r[col]));
      }
    } catch (e: any) {
      console.log(`Table ${table} error:`, e.message);
    }
  }

  process.exit(0);
}

auditData();
