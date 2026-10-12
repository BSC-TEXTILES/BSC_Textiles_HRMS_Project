import { pool } from '../nativeDb.js';

export async function upgradePayrollAndEmployeeSchema() {
  console.log('--- Upgrading Employee & Payroll Schema for BSC Textiles ---');

  // 1. Employee columns
  const employeeCols = [
    { name: 'pfNo', def: 'VARCHAR(50) NULL' },
    { name: 'esiNo', def: 'VARCHAR(50) NULL' },
    { name: 'uanNo', def: 'VARCHAR(50) NULL' },
    { name: 'bankName', def: 'VARCHAR(100) NULL' },
    { name: 'bankAccount', def: 'VARCHAR(50) NULL' },
    { name: 'bankIfsc', def: 'VARCHAR(50) NULL' },
    { name: 'salesmanNo', def: 'VARCHAR(50) NULL' },
    { name: 'batch', def: 'VARCHAR(50) NULL' },
    { name: 'pfPay', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'fixedGrossSalary', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'perDaySalary', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'daysPayable', def: 'DECIMAL(5,2) DEFAULT 31.00' },
    { name: 'basicSalary', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'hra', def: 'DECIMAL(15,2) DEFAULT 0.00' },
  ];

  const [existingEmpCols]: any = await pool.query(`SHOW COLUMNS FROM employee`);
  const existingEmpColSet = new Set(existingEmpCols.map((c: any) => c.Field));

  for (const col of employeeCols) {
    if (!existingEmpColSet.has(col.name)) {
      try {
        await pool.query(`ALTER TABLE employee ADD COLUMN ${col.name} ${col.def}`);
        console.log(`+ Added employee.${col.name}`);
      } catch (err: any) {
        console.warn(`Warning adding employee.${col.name}:`, err.message);
      }
    }
  }

  // 2. PayrollItem columns
  const payrollItemCols = [
    { name: 'pfNo', def: 'VARCHAR(50) NULL' },
    { name: 'esiNo', def: 'VARCHAR(50) NULL' },
    { name: 'uanNo', def: 'VARCHAR(50) NULL' },
    { name: 'bankName', def: 'VARCHAR(100) NULL' },
    { name: 'bankAccount', def: 'VARCHAR(50) NULL' },
    { name: 'salesmanNo', def: 'VARCHAR(50) NULL' },
    { name: 'section', def: 'VARCHAR(100) NULL' },
    { name: 'shiftName', def: 'VARCHAR(100) NULL' },
    { name: 'batch', def: 'VARCHAR(50) NULL' },
    { name: 'locationCode', def: 'VARCHAR(50) NULL' },
    { name: 'pfPay', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'fixedGrossSalary', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'perDaySalary', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'daysPayable', def: 'DECIMAL(5,2) DEFAULT 31.00' },
    { name: 'paidHolidays', def: 'DECIMAL(5,2) DEFAULT 0.00' },
    { name: 'paidLeaves', def: 'DECIMAL(5,2) DEFAULT 0.00' },
    { name: 'govtHolidayPay', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'otPay', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'specialAllowance', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'profTax', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'salaryAdvance', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'loanAdvance', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'employeePf', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'employeeEsi', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'employerPf', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'employerEsi', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'ctc', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'grossSalary', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'totalEarnings', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'totalDeductions', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'totalPayable', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'salaryMonth', def: 'VARCHAR(50) NULL' },
    { name: 'salaryYear', def: 'INT NULL' },
    { name: 'earningsConfig', def: 'JSON NULL' },
    { name: 'deductionsConfig', def: 'JSON NULL' },
  ];

  const [existingItemCols]: any = await pool.query(`SHOW COLUMNS FROM payrollitem`);
  const existingItemColSet = new Set(existingItemCols.map((c: any) => c.Field));

  for (const col of payrollItemCols) {
    if (!existingItemColSet.has(col.name)) {
      try {
        await pool.query(`ALTER TABLE payrollitem ADD COLUMN ${col.name} ${col.def}`);
        console.log(`+ Added payrollitem.${col.name}`);
      } catch (err: any) {
        console.warn(`Warning adding payrollitem.${col.name}:`, err.message);
      }
    }
  }

  // 3. Update / Ensure Davanagere address in payroll_settings
  await pool.query(`
    UPDATE payroll_settings SET
      companyName = 'BSC TEXTILES PVT LTD.,',
      companyAddress = 'DENTAL COLLEGE ROAD,, DAVANGERE - 577004'
    WHERE id = 'payroll-settings-default'
  `);

  // 4. Seed / Upsert the exact sample employee from the uploaded payslip
  // SADASHIVA LINGARAJAPPA HADIMANI (EMP.NO: 1372)
  const empCode = '1372';
  const [empExists]: any = await pool.query(`SELECT id FROM employee WHERE employeeCode = ?`, [empCode]);
  let empId: string;

  // Find or use Davanagere location
  const [davLoc]: any = await pool.query(`SELECT id FROM location WHERE code = 'DAV' OR name LIKE '%Davanagere%' LIMIT 1`);
  const locationId = davLoc.length ? davLoc[0].id : 'cmuwszr9500021vdtxscy3nsc';

  if (!empExists.length) {
    empId = `emp_bsc_1372_${Date.now()}`;
    await pool.query(`
      INSERT INTO employee (
        id, employeeCode, firstName, lastName, fullName, email, phone, gender,
        locationId, designation, role, status, joiningDate,
        pfNo, esiNo, uanNo, bankName, bankAccount, salesmanNo, batch,
        pfPay, hra, fixedGrossSalary, perDaySalary, daysPayable, basicSalary, createdAt, updatedAt
      ) VALUES (
        ?, ?, 'Sadashiva', 'Lingarajappa Hadimani', 'SADASHIVA LINGARAJAPPA HADIMANI', 'sadashiva.h@bsctextiles.in',
        '+91 9480111372', 'MALE', ?, 'Sales Executive', 'EMPLOYEE', 'ACTIVE', '2022-04-01 00:00:00',
        '10653', '5858975468', '101278107174', 'HDFC', '50100374312528', '1372', 'SHIFT II',
        12000.00, 4000.00, 16000.00, 516.13, 31.00, 12000.00, NOW(), NOW()
      )
    `, [empId, empCode, locationId]);
    console.log('+ Created employee SADASHIVA LINGARAJAPPA HADIMANI (EMP: 1372)');
  } else {
    empId = empExists[0].id;
    await pool.query(`
      UPDATE employee SET
        fullName = 'SADASHIVA LINGARAJAPPA HADIMANI',
        pfNo = '10653',
        esiNo = '5858975468',
        uanNo = '101278107174',
        bankName = 'HDFC',
        bankAccount = '50100374312528',
        salesmanNo = '1372',
        batch = 'SHIFT II',
        pfPay = 12000.00,
        hra = 4000.00,
        fixedGrossSalary = 16000.00,
        perDaySalary = 516.13,
        daysPayable = 31.00,
        basicSalary = 12000.00
      WHERE id = ?
    `, [empId]);
    console.log('✓ Updated employee SADASHIVA LINGARAJAPPA HADIMANI (EMP: 1372)');
  }

  // 5. Ensure Payroll Run for Aug-2026 exists
  const runId = 'pr_aug_2026_bsc';
  const [runExists]: any = await pool.query(`SELECT id FROM payrollrun WHERE id = ?`, [runId]);
  if (!runExists.length) {
    await pool.query(`
      INSERT INTO payrollrun (id, periodStart, periodEnd, status, processedBy, processedAt, createdAt, updatedAt)
      VALUES (?, '2026-08-01', '2026-08-31', 'APPROVED', 'HR Manager', NOW(), NOW(), NOW())
    `, [runId]);
    console.log('+ Created payroll run for Aug-2026');
  }

  // 6. Ensure exact payslip for Sadashiva for Aug-2026 matches the uploaded document
  const payslipId = 'pi_bsc_1372_aug2026';
  const earningsConfig = [
    { id: 'basic', label: 'BASIC PAY', amount: 12000.00, enabled: true },
    { id: 'hra', label: 'HRA', amount: 4000.00, enabled: true },
    { id: 'ot', label: 'OT', amount: 3859.50, enabled: true },
    { id: 'govt_holiday', label: 'GOVT.HOLIDAY', amount: 516.00, enabled: true },
  ];
  const deductionsConfig = [
    { id: 'pf', label: 'EMPLOYEE PF', amount: 1440.00, enabled: true },
    { id: 'esi', label: 'EMPLOYEE ESI', amount: 153.00, enabled: true },
    { id: 'pt', label: 'PROF TAX', amount: 0.00, enabled: true },
    { id: 'sal_adv', label: 'SALARY ADVANCE', amount: 0.00, enabled: true },
    { id: 'loan_adv', label: 'LOAN ADVANCE', amount: 0.00, enabled: true },
  ];

  const calcDetails = {
    pfNo: '10653',
    esiNo: '5858975468',
    uanNo: '101278107174',
    bankName: 'HDFC',
    bankAccount: '50100374312528',
    salesmanNo: '1372',
    section: 'KIDS',
    shift: 'SHIFT II',
    batch: 'SHIFT II',
    location: 'BSCTEX',
    pfPay: 12000.00,
    hra: 4000.00,
    grossSalary: 16000.00,
    perDaySalary: 516.13,
    daysPayable: 31.00,
    earningsTotal: 20375.50,
    deductionsTotal: 1593.00,
    totalPayable: 18782.50,
    netPayable: 18782.50,
    employerPf: 1440.00,
    employerEsi: 662.00,
    ctc: 22478.00,
  };

  const [itemExists]: any = await pool.query(`SELECT id FROM payrollitem WHERE id = ?`, [payslipId]);
  if (!itemExists.length) {
    await pool.query(`
      INSERT INTO payrollitem (
        id, payrollRunId, employeeId, basicSalary, hra, allowances, overtime,
        earlyIncentive, attendanceIncentive, performanceIncentive, salesIncentive, bonus,
        deductions, penalties, pfDeduction, taxDeduction, lopDeduction, netPay,
        pfNo, esiNo, uanNo, bankName, bankAccount, salesmanNo, section, shiftName, batch, locationCode,
        pfPay, fixedGrossSalary, perDaySalary, daysPayable, paidHolidays, govtHolidayPay, otPay,
        profTax, salaryAdvance, loanAdvance, employeePf, employeeEsi, employerPf, employerEsi, ctc,
        grossSalary, totalEarnings, totalDeductions, totalPayable, salaryMonth, salaryYear,
        earningsConfig, deductionsConfig, calculationDetails, status, finalizedBy, finalizedAt, createdAt, updatedAt
      ) VALUES (
        ?, ?, ?, 12000.00, 4000.00, 0.00, 3859.50,
        0.00, 0.00, 0.00, 0.00, 0.00,
        1593.00, 0.00, 1440.00, 0.00, 0.00, 18782.50,
        '10653', '5858975468', '101278107174', 'HDFC', '50100374312528', '1372', 'KIDS', 'SHIFT II', 'SHIFT II', 'BSCTEX',
        12000.00, 16000.00, 516.13, 31.00, 1.00, 516.00, 3859.50,
        0.00, 0.00, 0.00, 1440.00, 153.00, 1440.00, 662.00, 22478.00,
        20375.50, 20375.50, 1593.00, 18782.50, 'Aug', 2026,
        ?, ?, ?, 'APPROVED', 'HR Manager', NOW(), NOW(), NOW()
      )
    `, [payslipId, runId, empId, JSON.stringify(earningsConfig), JSON.stringify(deductionsConfig), JSON.stringify(calcDetails)]);
    console.log('+ Seeded exact reference payslip pi_bsc_1372_aug2026 matching the uploaded photo!');
  } else {
    await pool.query(`
      UPDATE payrollitem SET
        basicSalary = 12000.00,
        hra = 4000.00,
        overtime = 3859.50,
        deductions = 1593.00,
        netPay = 18782.50,
        pfNo = '10653',
        esiNo = '5858975468',
        uanNo = '101278107174',
        bankName = 'HDFC',
        bankAccount = '50100374312528',
        salesmanNo = '1372',
        section = 'KIDS',
        shiftName = 'SHIFT II',
        batch = 'SHIFT II',
        locationCode = 'BSCTEX',
        pfPay = 12000.00,
        fixedGrossSalary = 16000.00,
        perDaySalary = 516.13,
        daysPayable = 31.00,
        paidHolidays = 1.00,
        govtHolidayPay = 516.00,
        otPay = 3859.50,
        profTax = 0.00,
        salaryAdvance = 0.00,
        loanAdvance = 0.00,
        employeePf = 1440.00,
        employeeEsi = 153.00,
        employerPf = 1440.00,
        employerEsi = 662.00,
        ctc = 22478.00,
        grossSalary = 20375.50,
        totalEarnings = 20375.50,
        totalDeductions = 1593.00,
        totalPayable = 18782.50,
        salaryMonth = 'Aug',
        salaryYear = 2026,
        earningsConfig = ?,
        deductionsConfig = ?,
        calculationDetails = ?,
        status = 'APPROVED'
      WHERE id = ?
    `, [JSON.stringify(earningsConfig), JSON.stringify(deductionsConfig), JSON.stringify(calcDetails), payslipId]);
    console.log('✓ Updated exact reference payslip pi_bsc_1372_aug2026 matching the uploaded photo!');
  }

  console.log('--- Upgrade Schema Finished Successfully ---');
}

if (process.argv[1]?.includes('upgradePayrollAndEmployeeSchema')) {
  upgradePayrollAndEmployeeSchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
