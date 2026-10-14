import { pool } from '../nativeDb.js';
import crypto from 'crypto';

function genId(prefix = 'lar') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

export async function setupLateFines() {
  const conn = pool;
  console.log('Connected to MySQL database via pool...');

  // 1. Create late_attendance_record table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`late_attendance_record\` (
      \`id\` VARCHAR(191) PRIMARY KEY,
      \`attendanceId\` VARCHAR(191) NULL,
      \`employeeId\` VARCHAR(191) NOT NULL,
      \`locationId\` VARCHAR(191) NOT NULL,
      \`departmentId\` VARCHAR(191) NULL,
      \`shiftId\` VARCHAR(191) NULL,
      \`recordDate\` DATE NOT NULL,
      \`scheduledLogin\` DATETIME(3) NULL,
      \`actualPunchIn\` DATETIME(3) NULL,
      \`gracePeriodMinutes\` INT NOT NULL DEFAULT 5,
      \`lateSeconds\` INT NOT NULL DEFAULT 0,
      \`chargeableLateSeconds\` INT NOT NULL DEFAULT 0,
      \`fineCalculationType\` ENUM('PER_SECOND', 'PER_MINUTE', 'FIXED_AMOUNT', 'PERCENTAGE') NOT NULL DEFAULT 'PER_SECOND',
      \`fineRate\` DECIMAL(12, 4) NOT NULL DEFAULT 1.0000,
      \`calculatedFine\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      \`approvedFine\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      \`waivedFine\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      \`finalFine\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      \`fineStatus\` ENUM('NO_FINE', 'CALCULATED', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'WAIVED', 'APPLIED_TO_PAYROLL', 'REVERSED') NOT NULL DEFAULT 'PENDING_APPROVAL',
      \`approvalStatus\` ENUM('PENDING', 'APPROVED', 'REJECTED', 'WAIVED') NOT NULL DEFAULT 'PENDING',
      \`payrollStatus\` ENUM('NOT_APPLIED', 'READY_FOR_PAYROLL', 'APPLIED_TO_PAYROLL') NOT NULL DEFAULT 'NOT_APPLIED',
      \`earlySeconds\` INT NOT NULL DEFAULT 0,
      \`earlyIncentive\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      \`managerRemarks\` VARCHAR(500) NULL,
      \`reviewedById\` VARCHAR(191) NULL,
      \`reviewedAt\` DATETIME(3) NULL,
      \`payrollRunId\` VARCHAR(191) NULL,
      \`historyJson\` TEXT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`idx_lar_emp_date\` (\`employeeId\`, \`recordDate\`),
      INDEX \`idx_lar_loc_date\` (\`locationId\`, \`recordDate\`),
      INDEX \`idx_lar_status\` (\`fineStatus\`),
      INDEX \`idx_lar_payroll\` (\`payrollStatus\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('late_attendance_record table ready.');

  // 2. Fetch active employees and shifts
  const [employees]: any = await conn.query(`
    SELECT id, employeeCode, fullName, designation, departmentId, locationId, shiftId 
    FROM employee 
    WHERE status = 'ACTIVE'
    ORDER BY employeeCode ASC
  `);
  console.log(`Found ${employees.length} active employees.`);

  const [shifts]: any = await conn.query(`SELECT id, name, locationId, gracePeriod FROM shift`);
  const [rules]: any = await conn.query(`SELECT * FROM attendancerules LIMIT 1`);
  const activeRule = rules[0] || { gracePeriodMinutes: 5, latePenaltyRatePerSecond: 1.0 };
  const graceMinutes = activeRule.gracePeriodMinutes || 5;
  const fineRatePerSec = Number(activeRule.latePenaltyRatePerSecond || 1.0);

  // 3. Check if table is already seeded
  const [existing]: any = await conn.query('SELECT id FROM late_attendance_record LIMIT 1');
  if (existing.length > 0 && process.env.FORCE_RESEED_LATE_FINES !== 'true') {
    console.log('late_attendance_record already populated, skipping re-seed.');
    return;
  }

  // Clear existing late records to re-seed cleanly
  await conn.query('DELETE FROM late_attendance_record');
  console.log('Cleared old late_attendance_records.');

  // 4. Generate records across dates: 2026-10-01 to 2026-10-11
  const dates = [
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
    '2026-10-09', '2026-10-10', '2026-10-11'
  ];

  let totalLateGenerated = 0;

  for (const dateStr of dates) {
    const isPastWeek = dateStr <= '2026-10-06';
    const isMidWeek = dateStr > '2026-10-06' && dateStr <= '2026-10-09';
    const isRecent = dateStr >= '2026-10-10';

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const shiftId = emp.shiftId || shifts[0]?.id;

      // Scheduled login time is 10:30:00 AM on that date
      const scheduledStr = `${dateStr} 10:30:00`;
      const scheduledLogin = new Date(scheduledStr);

      // Varied punch scenarios:
      // i % 9 === 0: Weekly off / Leave -> skip
      if (i % 9 === 0) continue;

      // i % 11 === 0: Missing punch
      if (i % 11 === 0) {
        await conn.query(`
          INSERT INTO late_attendance_record (
            id, employeeId, locationId, departmentId, shiftId, recordDate,
            scheduledLogin, actualPunchIn, gracePeriodMinutes,
            lateSeconds, chargeableLateSeconds, fineCalculationType, fineRate,
            calculatedFine, approvedFine, waivedFine, finalFine,
            fineStatus, approvalStatus, payrollStatus, managerRemarks, createdAt, updatedAt
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, NULL, ?,
            0, 0, 'PER_SECOND', ?,
            0.00, 0.00, 0.00, 0.00,
            'PENDING_REVIEW', 'PENDING', 'NOT_APPLIED', 'Missing biometric punch-in', NOW(3), NOW(3)
          )
        `, [
          genId('lar'), emp.id, emp.locationId, emp.departmentId, shiftId, dateStr,
          scheduledLogin, graceMinutes, fineRatePerSec
        ]);
        continue;
      }

      // Repeated late offenders: emp[4] (TEST-EMP-005) and emp[16] (TEST-EMP-017) are consistently late!
      const isFrequentLate = (i === 4 || i === 16);

      let actualMinuteOffset = 0; // minutes relative to 10:30
      let actualSecondOffset = 15;

      if (isFrequentLate) {
        // Late by 8 to 22 minutes (beyond grace period of 5 mins)
        actualMinuteOffset = 8 + (i + dateStr.charCodeAt(dateStr.length - 1)) % 14;
      } else if (i % 5 === 0) {
        // Late by 6 to 18 minutes
        actualMinuteOffset = 6 + (i % 12);
      } else if (i % 3 === 0) {
        // Within grace period! e.g., 2 to 4 minutes after 10:30 (10:32 to 10:34)
        actualMinuteOffset = 2 + (i % 3);
      } else {
        // Early or exactly on time: -15 to -2 minutes (10:15 to 10:28)
        actualMinuteOffset = -2 - (i % 12);
      }

      const punchDate = new Date(scheduledLogin.getTime() + (actualMinuteOffset * 60 + actualSecondOffset) * 1000);
      const totalDiffSeconds = Math.round((punchDate.getTime() - scheduledLogin.getTime()) / 1000);

      let earlySeconds = 0;
      let earlyIncentive = 0;
      let rawLateSeconds = 0;
      let chargeableSeconds = 0;
      let calculatedFine = 0;
      let approvedFine = 0;
      let waivedFine = 0;
      let finalFine = 0;
      let fineStatus = 'NO_FINE';
      let approvalStatus = 'PENDING';
      let payrollStatus = 'NOT_APPLIED';
      let remarks: string | null = null;

      if (totalDiffSeconds < 0) {
        // Early punch
        earlySeconds = Math.abs(totalDiffSeconds);
        earlyIncentive = Math.min(300, Math.round(earlySeconds * 1.0)); // up to ₹300 early incentive
        fineStatus = 'NO_FINE';
      } else {
        rawLateSeconds = totalDiffSeconds;
        const graceSeconds = graceMinutes * 60; // 300s

        if (rawLateSeconds <= graceSeconds) {
          // Within grace period! No fine generated!
          chargeableSeconds = 0;
          calculatedFine = 0;
          fineStatus = 'NO_FINE';
          remarks = `Arrival within ${graceMinutes} min grace period tolerance`;
        } else {
          // Beyond grace period! Exact late calculation
          chargeableSeconds = rawLateSeconds - graceSeconds;
          calculatedFine = Math.round(chargeableSeconds * fineRatePerSec);

          if (isPastWeek) {
            // Historical week: some approved & applied to payroll, some waived
            if (i % 6 === 0) {
              fineStatus = 'WAIVED';
              approvalStatus = 'WAIVED';
              waivedFine = calculatedFine;
              approvedFine = 0;
              finalFine = 0;
              remarks = 'Public transport disruption approved by Floor Manager';
            } else {
              fineStatus = 'APPLIED_TO_PAYROLL';
              approvalStatus = 'APPROVED';
              approvedFine = calculatedFine;
              finalFine = calculatedFine;
              payrollStatus = 'APPLIED_TO_PAYROLL';
              remarks = 'Approved and deducted in statutory payroll run';
            }
          } else if (isMidWeek) {
            // Mid week: Approved, ready for payroll
            fineStatus = 'APPROVED';
            approvalStatus = 'APPROVED';
            approvedFine = calculatedFine;
            finalFine = calculatedFine;
            payrollStatus = 'READY_FOR_PAYROLL';
            remarks = 'Verified by HR Manager; ready for month-end payroll deduction';
          } else {
            // Recent days (Oct 10-11): Pending review or pending approval
            if (i % 2 === 0) {
              fineStatus = 'PENDING_APPROVAL';
              approvalStatus = 'PENDING';
              remarks = 'Awaiting Store Operations Manager approval';
            } else {
              fineStatus = 'PENDING_REVIEW';
              approvalStatus = 'PENDING';
              remarks = 'Attendance punch logged; pending HR review';
            }
          }
          totalLateGenerated++;
        }
      }

      await conn.query(`
        INSERT INTO late_attendance_record (
          id, employeeId, locationId, departmentId, shiftId, recordDate,
          scheduledLogin, actualPunchIn, gracePeriodMinutes,
          lateSeconds, chargeableLateSeconds, fineCalculationType, fineRate,
          calculatedFine, approvedFine, waivedFine, finalFine,
          fineStatus, approvalStatus, payrollStatus, earlySeconds, earlyIncentive,
          managerRemarks, reviewedById, reviewedAt, createdAt, updatedAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, 'PER_SECOND', ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, NULL, ${approvalStatus !== 'PENDING' ? 'NOW(3)' : 'NULL'}, NOW(3), NOW(3)
        )
      `, [
        genId('lar'), emp.id, emp.locationId, emp.departmentId, shiftId, dateStr,
        scheduledLogin, punchDate, graceMinutes,
        rawLateSeconds, chargeableSeconds, fineRatePerSec,
        calculatedFine, approvedFine, waivedFine, finalFine,
        fineStatus, approvalStatus, payrollStatus, earlySeconds, earlyIncentive,
        remarks
      ]);

      // Also ensure corresponding attendance table row matches this punch
      const [attExist]: any = await conn.query(`
        SELECT id FROM attendance WHERE employeeId = ? AND DATE(attendanceDate) = ?
      `, [emp.id, dateStr]);

      const attStatus = rawLateSeconds > (graceMinutes * 60) ? 'LATE' : 'PRESENT';
      if (attExist.length > 0) {
        await conn.query(`
          UPDATE attendance 
          SET scheduledLogin = ?, actualLogin = ?, 
              lateLoginSeconds = ?, lateLoginPenalty = ?,
              earlyLoginSeconds = ?, earlyLoginIncentive = ?,
              status = ?
          WHERE id = ?
        `, [
          scheduledLogin, punchDate, 
          chargeableSeconds, calculatedFine, 
          earlySeconds, earlyIncentive, 
          attStatus, attExist[0].id
        ]);
      } else {
        await conn.query(`
          INSERT INTO attendance (
            id, employeeId, locationId, shiftId, attendanceDate,
            scheduledLogin, actualLogin, lateLoginSeconds, lateLoginPenalty,
            earlyLoginSeconds, earlyLoginIncentive, status, faceVerified, createdAt, updatedAt
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, 1, NOW(3), NOW(3)
          )
        `, [
          genId('att'), emp.id, emp.locationId, shiftId, dateStr,
          scheduledLogin, punchDate, chargeableSeconds, calculatedFine,
          earlySeconds, earlyIncentive, attStatus
        ]);
      }
    }
  }

  console.log(`Successfully seeded ${dates.length} days of attendance & late fine records (${totalLateGenerated} late fine entries).`);
  console.log('Setup finished!');
}

if (process.argv[1]?.includes('setupLateFines')) {
  setupLateFines()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
