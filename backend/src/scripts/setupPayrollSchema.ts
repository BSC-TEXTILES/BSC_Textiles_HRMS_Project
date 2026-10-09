import { pool } from '../nativeDb.js';

export async function setupPayrollSchema() {
  console.log('--- Setting up Enhanced Payroll Database Schema ---');

  // 1. Alter payrollitem table if columns are missing
  const colsToAdd = [
    { name: 'hra', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'allowances', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'bonus', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'pfDeduction', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'taxDeduction', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'lopDeduction', def: 'DECIMAL(15,2) DEFAULT 0.00' },
    { name: 'customSections', def: 'JSON NULL' },
    { name: 'remarks', def: 'TEXT NULL' },
    { name: 'emailStatus', def: "VARCHAR(50) DEFAULT 'NOT_SENT'" },
    { name: 'emailSentAt', def: 'DATETIME(3) NULL' },
    { name: 'emailError', def: 'TEXT NULL' },
    { name: 'finalizedBy', def: 'VARCHAR(191) NULL' },
    { name: 'finalizedAt', def: 'DATETIME(3) NULL' },
  ];

  const [existingCols]: any = await pool.query(`SHOW COLUMNS FROM payrollitem`);
  const existingColNames = new Set(existingCols.map((c: any) => c.Field));

  for (const col of colsToAdd) {
    if (!existingColNames.has(col.name)) {
      try {
        await pool.query(`ALTER TABLE payrollitem ADD COLUMN ${col.name} ${col.def}`);
        console.log(`+ Added column payrollitem.${col.name}`);
      } catch (e: any) {
        console.warn(`Warning adding column ${col.name}:`, e.message);
      }
    }
  }

  // 2. Create payroll_settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_settings (
      id VARCHAR(191) PRIMARY KEY,
      companyName VARCHAR(191) NOT NULL DEFAULT 'BSC Textiles Pvt Ltd',
      companyAddress TEXT NOT NULL,
      logoUrl VARCHAR(255) NULL,
      signatoryName VARCHAR(191) NOT NULL DEFAULT 'Sunita Deshmukh',
      signatoryDesignation VARCHAR(191) NOT NULL DEFAULT 'Head of Human Resources & Statutory Compliance',
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      currencySymbol VARCHAR(10) NOT NULL DEFAULT '₹',
      smtpHost VARCHAR(191) NULL,
      smtpPort INT DEFAULT 587,
      smtpUser VARCHAR(191) NULL,
      smtpPass VARCHAR(191) NULL,
      smtpFrom VARCHAR(191) DEFAULT 'payroll@bsctextiles.in',
      autoEmailOnFinalize BOOLEAN DEFAULT TRUE,
      createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ Verified payroll_settings table');

  // Seed default settings if empty
  const [settingsRows]: any = await pool.query(`SELECT id FROM payroll_settings LIMIT 1`);
  if (!settingsRows.length) {
    await pool.query(`
      INSERT INTO payroll_settings (
        id, companyName, companyAddress, logoUrl, signatoryName, signatoryDesignation,
        smtpHost, smtpPort, smtpUser, smtpFrom, autoEmailOnFinalize
      ) VALUES (
        'payroll-settings-default',
        'BSC Textiles Private Limited',
        '#104 Silk Mill Road, Industrial Area, Belagavi, Karnataka – 590014\\nGSTIN: 29AAACB1234F1Z5 | TAN: BLRB12345C',
        '/logo.png',
        'Sunita Deshmukh',
        'Lead HR Partner & Statutory Labor Compliance Officer',
        'smtp.ethereal.email',
        587,
        'bsc.payroll@ethereal.email',
        'BSC Textiles HRMS <payroll@bsctextiles.in>',
        TRUE
      )
    `);
    console.log('+ Seeded default payroll_settings');
  }

  // 3. Create salary_structure table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salary_structure (
      id VARCHAR(191) PRIMARY KEY,
      title VARCHAR(191) NOT NULL,
      cadreGrade VARCHAR(50) NOT NULL,
      departmentId VARCHAR(191) NULL,
      baseSalary DECIMAL(15,2) NOT NULL,
      hraPercent DECIMAL(5,2) NOT NULL DEFAULT 40.00,
      conveyance DECIMAL(15,2) NOT NULL DEFAULT 1600.00,
      medicalAllowance DECIMAL(15,2) NOT NULL DEFAULT 1250.00,
      specialAllowance DECIMAL(15,2) NOT NULL DEFAULT 2500.00,
      pfPercent DECIMAL(5,2) NOT NULL DEFAULT 12.00,
      esiPercent DECIMAL(5,2) NOT NULL DEFAULT 0.75,
      ptDeduction DECIMAL(15,2) NOT NULL DEFAULT 200.00,
      customFields JSON NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ Verified salary_structure table');

  // Seed initial salary structures if empty
  const [structRows]: any = await pool.query(`SELECT id FROM salary_structure LIMIT 1`);
  if (!structRows.length) {
    const structures = [
      {
        id: 'sal-struct-retail-exec',
        title: 'Retail Sales & Floor Associate Cadre I',
        cadreGrade: 'CADRE-A',
        baseSalary: 28000.00,
        hraPercent: 40.00,
        conveyance: 1600.00,
        medicalAllowance: 1250.00,
        specialAllowance: 1500.00,
      },
      {
        id: 'sal-struct-merchandiser',
        title: 'Senior Merchandising & Floor Lead Cadre II',
        cadreGrade: 'CADRE-B',
        baseSalary: 37000.00,
        hraPercent: 40.00,
        conveyance: 2000.00,
        medicalAllowance: 1500.00,
        specialAllowance: 3500.00,
      },
      {
        id: 'sal-struct-tailor-master',
        title: 'Master Craftsman & Atelier Tailor Cadre III',
        cadreGrade: 'CADRE-C',
        baseSalary: 32000.00,
        hraPercent: 40.00,
        conveyance: 1600.00,
        medicalAllowance: 1250.00,
        specialAllowance: 2200.00,
      },
      {
        id: 'sal-struct-store-manager',
        title: 'Showroom Store Manager & Flagship In-Charge',
        cadreGrade: 'CADRE-EXEC',
        baseSalary: 55000.00,
        hraPercent: 40.00,
        conveyance: 3500.00,
        medicalAllowance: 2500.00,
        specialAllowance: 6500.00,
      },
    ];

    for (const s of structures) {
      await pool.query(`
        INSERT INTO salary_structure (
          id, title, cadreGrade, baseSalary, hraPercent, conveyance, medicalAllowance, specialAllowance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [s.id, s.title, s.cadreGrade, s.baseSalary, s.hraPercent, s.conveyance, s.medicalAllowance, s.specialAllowance]);
    }
    console.log('+ Seeded 4 default salary structures');
  }

  // 4. Create payroll_email_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_email_log (
      id VARCHAR(191) PRIMARY KEY,
      payrollItemId VARCHAR(191) NOT NULL,
      employeeId VARCHAR(191) NOT NULL,
      recipientEmail VARCHAR(191) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'SENT',
      errorMessage TEXT NULL,
      sentAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      sentBy VARCHAR(191) NULL,
      INDEX idx_email_log_item (payrollItemId),
      INDEX idx_email_log_emp (employeeId),
      INDEX idx_email_log_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ Verified payroll_email_log table');

  console.log('--- Enhanced Payroll Schema Setup Complete ---');
}

// Execute directly if run via CLI
if (process.argv[1]?.includes('setupPayrollSchema')) {
  setupPayrollSchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
