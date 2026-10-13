import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });
import { pool } from '../nativeDb.js';

async function main() {
  await pool.query(`
    UPDATE employee SET
      pfNo = '10653',
      esiNo = '5858975468',
      uanNo = '101278107174',
      bankName = 'HDFC',
      bankAccount = '50100374312528',
      salesmanNo = 'TEST-EMP-003',
      batch = 'SHIFT II',
      pfPay = 32000.00,
      fixedGrossSalary = 44800.00,
      basicSalary = 32000.00,
      hra = 12800.00,
      daysPayable = 31.00,
      perDaySalary = 516.13
    WHERE employeeCode = 'TEST-EMP-003'
  `);
  
  const earningsJson = JSON.stringify([
    { id: 'basic', label: 'BASIC PAY', amount: 32000, enabled: true },
    { id: 'hra', label: 'HRA', amount: 12800, enabled: true },
    { id: 'ot', label: 'OT', amount: 1500, enabled: true },
    { id: 'govt_holiday', label: 'GOVT.HOLIDAY', amount: 0, enabled: true }
  ]);

  const deductionsJson = JSON.stringify([
    { id: 'pf', label: 'EMPLOYEE PF', amount: 3840, enabled: true },
    { id: 'esi', label: 'EMPLOYEE ESI', amount: 153, enabled: true },
    { id: 'pt', label: 'PROF TAX', amount: 0, enabled: true },
    { id: 'sal_adv', label: 'SALARY ADVANCE', amount: 0, enabled: true },
    { id: 'loan_adv', label: 'LOAN ADVANCE', amount: 0, enabled: true },
    { id: 'late_fine', label: 'LATE FINE DEDUCTION (₹1.0/SEC)', amount: 100, enabled: true }
  ]);

  await pool.query(`
    UPDATE payrollitem SET
      pfNo = '10653',
      esiNo = '5858975468',
      uanNo = '101278107174',
      bankName = 'HDFC',
      bankAccount = '50100374312528',
      salesmanNo = 'TEST-EMP-003',
      section = 'Billing & Reception',
      shiftName = 'General Shift',
      batch = 'SHIFT II',
      locationCode = 'BEL',
      pfPay = 32000.00,
      fixedGrossSalary = 44800.00,
      basicSalary = 32000.00,
      hra = 12800.00,
      perDaySalary = 516.13,
      daysPayable = 31.00,
      grossSalary = 46300.00,
      totalEarnings = 46300.00,
      totalDeductions = 4093.00,
      totalPayable = 42207.00,
      netPay = 42207.00,
      salaryAdvance = 0.00,
      loanAdvance = 0.00,
      employerPf = 3840.00,
      employerEsi = 0.00,
      ctc = 50140.00,
      earningsConfig = ?,
      deductionsConfig = ?,
      remarks = 'HR automated verification and festive bonus added'
    WHERE employeeId IN (SELECT id FROM employee WHERE employeeCode = 'TEST-EMP-003')
  `, [earningsJson, deductionsJson]);

  console.log('Database updated successfully for Amit Patel (TEST-EMP-003)!');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
