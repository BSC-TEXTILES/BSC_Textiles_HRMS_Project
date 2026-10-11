import { pool } from '../nativeDb.js';

export async function setupPunchCorrections() {
  const [countRows]: any = await pool.query('SELECT count(*) as c FROM attendancecorrection');
  if (countRows[0].c === 0) {
    const [emps]: any = await pool.query('SELECT id, employeeCode, fullName, locationId FROM employee LIMIT 5');
    if (emps.length > 0) {
      const emp1 = emps[0];
      const emp2 = emps[1] || emps[0];
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      await pool.query(
        `INSERT INTO attendancecorrection 
         (id, employeeId, locationId, attendanceDate, originalLogin, originalLogout, requestedLogin, requestedLogout, reason, status, reviewNote, createdAt, updatedAt)
         VALUES 
         (CONCAT('corr_', UUID()), ?, ?, ?, ?, NULL, ?, ?, 'VIP bridal customer handover extended past turnstile reader lockdown', 'PENDING', NULL, NOW(3), NOW(3)),
         (CONCAT('corr_', UUID()), ?, ?, ?, ?, ?, ?, ?, 'Turnstile RFID sensor glitch BEL-READER-03 during shift change', 'APPROVED', 'Verified with security CCTV log', NOW(3), NOW(3))`,
        [
          emp1.id, emp1.locationId, today, `${today} 09:30:00`, `${today} 09:28:00`, `${today} 18:35:00`,
          emp2.id, emp2.locationId, yesterday, `${yesterday} 09:45:00`, `${yesterday} 18:30:00`, `${yesterday} 09:25:00`, `${yesterday} 18:30:00`,
        ]
      );
      console.log('Seeded sample attendance corrections.');
    }
  } else {
    console.log(`Punch corrections already present: ${countRows[0].c}`);
  }
}

if (process.argv[1]?.includes('setupPunchCorrections')) {
  setupPunchCorrections()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
