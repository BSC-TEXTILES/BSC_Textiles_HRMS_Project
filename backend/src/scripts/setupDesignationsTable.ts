import { pool } from '../nativeDb.js';

export async function setupDesignationsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS designations (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(128) NOT NULL UNIQUE,
      code VARCHAR(32) NULL,
      grade VARCHAR(64) NOT NULL,
      band VARCHAR(128) NOT NULL,
      minSalary INT NOT NULL DEFAULT 25000,
      maxSalary INT NOT NULL DEFAULT 40000,
      description TEXT NULL,
      icon VARCHAR(64) DEFAULT 'badge',
      department VARCHAR(128) NULL,
      aliases TEXT NULL,
      isActive TINYINT(1) DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const initial = [
    {
      id: 'desig_gm',
      title: 'Store General Manager',
      code: 'SGM',
      grade: 'L5 - Executive',
      band: '₹75,000 – ₹1,20,000',
      minSalary: 75000,
      maxSalary: 120000,
      description: 'Overall store P&L and workforce administrative leadership across retail enterprise hubs.',
      icon: 'military_tech',
      department: 'Executive Leadership',
      aliases: 'Store General Manager,General Manager,Store Director',
    },
    {
      id: 'desig_fm',
      title: 'Floor Manager',
      code: 'FM',
      grade: 'L4 - Senior Supervisory',
      band: '₹45,000 – ₹65,000',
      minSalary: 45000,
      maxSalary: 65000,
      description: 'Floor shift operations, discipline, customer escalation, and break schedule governance.',
      icon: 'supervisor_account',
      department: 'Floor Operations',
      aliases: 'Floor Manager,FLOOR MANAGER',
    },
    {
      id: 'desig_tl',
      title: 'Department Team Lead',
      code: 'DTL',
      grade: 'L3 - Supervisory',
      band: '₹35,000 – ₹45,000',
      minSalary: 35000,
      maxSalary: 45000,
      description: 'Section sales targets, saree presentations, premium bridal consulting, and floor mentoring.',
      icon: 'groups',
      department: 'Retail Sales',
      aliases: 'Department Team Lead,SECTION SUPERVISOR,SENIOR EXECUTIVE',
    },
    {
      id: 'desig_sales',
      title: 'Senior Sales Consultant',
      code: 'SSC',
      grade: 'L2 - Operational',
      band: '₹28,000 – ₹38,000',
      minSalary: 28000,
      maxSalary: 38000,
      description: 'Customer engagement, textile draping consultations, cross-selling, and transaction closing.',
      icon: 'styler',
      department: 'Showroom Sales',
      aliases: 'Senior Sales Consultant,SALESMAN,SALEMAN UNDER GARMENTS',
    },
    {
      id: 'desig_cashier',
      title: 'Cashier & Billing Executive',
      code: 'CBE',
      grade: 'L2 - Operational',
      band: '₹25,000 – ₹32,000',
      minSalary: 25000,
      maxSalary: 32000,
      description: 'POS checkout terminal operations, payment reconciliation, invoice generation, and cash audit.',
      icon: 'point_of_sale',
      department: 'Accounts & Billing',
      aliases: 'Cashier & Billing Executive,CASHIER,BILLER,Former Lead Cashier',
    },
    {
      id: 'desig_accounts',
      title: 'Accounts & Finance Officer',
      code: 'AFO',
      grade: 'L3 - Supervisory',
      band: '₹32,000 – ₹45,000',
      minSalary: 32000,
      maxSalary: 45000,
      description: 'Daily showroom cash reconciliation, vendor billing verification, bank deposits, and audit.',
      icon: 'account_balance',
      department: 'Finance & Accounts',
      aliases: 'Accounts & Finance Officer,ACCOUNTS',
    },
    {
      id: 'desig_hr',
      title: 'HR & People Operations',
      code: 'HRO',
      grade: 'L3 - Supervisory',
      band: '₹35,000 – ₹48,000',
      minSalary: 35000,
      maxSalary: 48000,
      description: 'Staff onboarding, biometric adherence monitoring, leave management, and statutory filings.',
      icon: 'badge',
      department: 'Human Resources',
      aliases: 'HR & People Operations,HR',
    },
    {
      id: 'desig_logistics',
      title: 'Logistics, Packer & Helper',
      code: 'LPH',
      grade: 'L1 - Support Operator',
      band: '₹18,000 – ₹24,000',
      minSalary: 18000,
      maxSalary: 24000,
      description: 'Stock inwarding, textile bundle packing, warehouse transport, and section distribution.',
      icon: 'inventory_2',
      department: 'Supply Chain & Inventory',
      aliases: 'Logistics, Packer & Helper,PACKER,HELPER',
    },
    {
      id: 'desig_housekeeping',
      title: 'Housekeeping & Facility Support',
      code: 'HFS',
      grade: 'L1 - Support Operator',
      band: '₹16,000 – ₹20,000',
      minSalary: 16000,
      maxSalary: 20000,
      description: 'Showroom sanitization, hygiene standards maintenance, and customer lounge upkeep.',
      icon: 'cleaning_services',
      department: 'Facility & Maintenance',
      aliases: 'Housekeeping & Facility Support,HOUSE KEEPING',
    },
    {
      id: 'desig_canteen',
      title: 'Tea Break & Canteen Owner',
      code: 'TCO',
      grade: 'L1 - Support Operator',
      band: 'Special Operator',
      minSalary: 20000,
      maxSalary: 28000,
      description: 'Authorized canteen QR token validation, meal passes distribution, and refreshment service.',
      icon: 'coffee',
      department: 'Employee Welfare',
      aliases: 'Tea Break & Canteen Owner,Canteen Lead',
    },
  ];

  for (const item of initial) {
    await pool.query(
      `INSERT INTO designations (id, title, code, grade, band, minSalary, maxSalary, description, icon, department, aliases, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         code = VALUES(code),
         grade = VALUES(grade),
         band = VALUES(band),
         minSalary = VALUES(minSalary),
         maxSalary = VALUES(maxSalary),
         description = VALUES(description),
         icon = VALUES(icon),
         department = VALUES(department),
         aliases = VALUES(aliases),
         isActive = 1`,
      [
        item.id,
        item.title,
        item.code,
        item.grade,
        item.band,
        item.minSalary,
        item.maxSalary,
        item.description,
        item.icon,
        item.department,
        item.aliases,
      ]
    );
  }

  console.log('✅ Designations schema setup complete with initial retail band hierarchy.');
}

if (process.argv[1]?.endsWith('setupDesignationsTable.ts')) {
  setupDesignationsSchema()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
