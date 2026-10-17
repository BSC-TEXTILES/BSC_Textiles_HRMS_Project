import { pool } from '../nativeDb.js';

export async function setupFormerEmployees() {
  console.log('--- Checking Former Employees Schema ---');

  // Ensure employee.status ENUM allows all former employee statuses
  try {
    await pool.query("ALTER TABLE employee MODIFY COLUMN status ENUM('ACTIVE','INACTIVE','ON_LEAVE','TERMINATED','RESIGNED','RETIRED','EX_EMPLOYEE') NOT NULL DEFAULT 'ACTIVE'");
  } catch (err: any) {
    console.warn('[setupFormerEmployees warning] Could not alter employee.status enum:', err.message);
  }
}

if (process.argv[1]?.includes('setupFormerEmployees')) {
  setupFormerEmployees()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error in setupFormerEmployees:', err);
      process.exit(1);
    });
}

