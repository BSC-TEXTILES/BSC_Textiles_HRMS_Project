import mysql from 'mysql2/promise';
import crypto from 'crypto';

function genId(prefix = 'c') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

async function run() {
  const conn = await mysql.createConnection('mysql://root@localhost:3306/bsc_textiles_hrms');
  console.log('Connected to MySQL...');

  // 1. Create tables
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`retail_billing_session\` (
      \`id\` VARCHAR(191) PRIMARY KEY,
      \`counterId\` VARCHAR(191) NOT NULL,
      \`locationId\` VARCHAR(191) NOT NULL,
      \`cashierId\` VARCHAR(191) NOT NULL,
      \`status\` ENUM('ACTIVE', 'CLOSED') DEFAULT 'ACTIVE',
      \`openedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`closedAt\` DATETIME(3) NULL,
      \`openingFloat\` DECIMAL(12,2) DEFAULT 5000.00,
      \`closingCash\` DECIMAL(12,2) DEFAULT 0.00,
      \`notes\` VARCHAR(255) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`idx_rbs_counter\` (\`counterId\`),
      INDEX \`idx_rbs_cashier\` (\`cashierId\`),
      INDEX \`idx_rbs_loc\` (\`locationId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('retail_billing_session table ready.');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`retail_sales_transaction\` (
      \`id\` VARCHAR(191) PRIMARY KEY,
      \`billNumber\` VARCHAR(64) NOT NULL UNIQUE,
      \`counterId\` VARCHAR(191) NOT NULL,
      \`floorId\` VARCHAR(191) NOT NULL,
      \`locationId\` VARCHAR(191) NOT NULL,
      \`salespersonId\` VARCHAR(191) NULL,
      \`cashierId\` VARCHAR(191) NULL,
      \`customerName\` VARCHAR(191) DEFAULT 'Walk-in Customer',
      \`customerPhone\` VARCHAR(32) NULL,
      \`grossAmount\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`discountAmount\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`taxAmount\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`netAmount\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`paymentMethod\` ENUM('CASH', 'CARD', 'UPI', 'SPLIT') NOT NULL DEFAULT 'UPI',
      \`status\` ENUM('COMPLETED', 'PENDING', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'COMPLETED',
      \`itemsJson\` TEXT NULL,
      \`sessionId\` VARCHAR(191) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX \`idx_rst_counter\` (\`counterId\`),
      INDEX \`idx_rst_floor\` (\`floorId\`),
      INDEX \`idx_rst_location\` (\`locationId\`),
      INDEX \`idx_rst_salesperson\` (\`salespersonId\`),
      INDEX \`idx_rst_status\` (\`status\`),
      INDEX \`idx_rst_created\` (\`createdAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('retail_sales_transaction table ready.');

  // 2. Fetch all employees and counters
  const [employees]: any = await conn.query(`SELECT id, employeeCode, fullName, designation, locationId FROM employee ORDER BY employeeCode ASC`);
  console.log(`Found ${employees.length} employees.`);

  // Update employee designations if empty
  const defaultDesignations = [
    'Senior Silk Saree Specialist',
    'Ethnic Wear Consultant',
    'Cotton & Handloom Specialist',
    'Master Draper & Consultant',
    'Retail Sales Executive',
    'Bridal Styling Advisor',
    'Billing Executive & Cashier',
    'Customer Relations Specialist',
    'Apparel Sales Associate'
  ];

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    if (!emp.designation || emp.designation.includes('TEST') || emp.designation.includes('T SHOP')) {
      const desig = defaultDesignations[i % defaultDesignations.length];
      await conn.query(`UPDATE employee SET designation = ? WHERE id = ?`, [desig, emp.id]);
    }
  }

  const [sellingPoints]: any = await conn.query(`SELECT id, name, code, category, locationId, floorId, sectionId FROM sellingpoint ORDER BY code ASC`);
  console.log(`Found ${sellingPoints.length} selling points.`);

  // Ensure sections are linked properly to floors if missing
  const [sections]: any = await conn.query(`SELECT id, name, floorId, locationId FROM section`);
  for (const sp of sellingPoints) {
    if (!sp.sectionId && sections.length > 0) {
      const match = sections.find((s: any) => s.locationId === sp.locationId && s.floorId === sp.floorId);
      if (match) {
        await conn.query(`UPDATE sellingpoint SET sectionId = ? WHERE id = ?`, [match.id, sp.id]);
      }
    }
  }

  // 3. Assign at least 3 salesmen to each selling point
  for (let sIdx = 0; sIdx < sellingPoints.length; sIdx++) {
    const sp = sellingPoints[sIdx];
    const locEmployees = employees.filter((e: any) => e.locationId === sp.locationId);
    const poolEmployees = locEmployees.length >= 3 ? locEmployees : employees;

    const emp1 = poolEmployees[(sIdx * 3) % poolEmployees.length];
    const emp2 = poolEmployees[(sIdx * 3 + 1) % poolEmployees.length];
    const emp3 = poolEmployees[(sIdx * 3 + 2) % poolEmployees.length];

    const toAssign = [
      { emp: emp1, isPrimary: 1 },
      { emp: emp2, isPrimary: 0 },
      { emp: emp3, isPrimary: 0 },
    ];

    for (const item of toAssign) {
      await conn.query(`
        INSERT INTO employeesellingpoint (id, employeeId, sellingPointId, isPrimary, assignedDate, createdAt)
        VALUES (?, ?, ?, ?, NOW(3), NOW(3))
        ON DUPLICATE KEY UPDATE isPrimary = VALUES(isPrimary)
      `, [genId('esp'), item.emp.id, sp.id, item.isPrimary]);
    }
  }
  console.log('Successfully assigned 3 salesmen to every selling point.');

  // 4. Ensure attendance records exist for employees for today
  const todayStr = new Date().toISOString().slice(0, 10);
  const [shifts]: any = await conn.query(`SELECT id, name FROM shift LIMIT 2`);
  const shiftId = shifts[0]?.id || null;

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    let attStatus = 'PRESENT';
    if (i % 7 === 0) attStatus = 'WEEKLY_OFF';
    else if (i % 5 === 0) attStatus = 'ABSENT';
    else if (i % 4 === 0) attStatus = 'ON_LUNCH';

    const [exist]: any = await conn.query(`SELECT id FROM attendance WHERE employeeId = ? AND DATE(attendanceDate) = ?`, [emp.id, todayStr]);
    if (exist.length === 0) {
      await conn.query(`
        INSERT INTO attendance (
          id, employeeId, locationId, shiftId, attendanceDate,
          scheduledLogin, actualLogin, scheduledLogout, actualLogout,
          status, faceVerified, createdAt, updatedAt
        ) VALUES (
          ?, ?, ?, ?, CURDATE(),
          NULL, ${attStatus === 'PRESENT' ? 'NOW(3)' : 'NULL'}, NULL, NULL,
          ?, 1, NOW(3), NOW(3)
        )
      `, [genId('att'), emp.id, emp.locationId, shiftId, attStatus]);
    }
  }
  console.log('Attendance records synchronized for today.');

  // 5. Seed billing sessions & transactions
  const [existingTx]: any = await conn.query(`SELECT count(*) as cnt FROM retail_sales_transaction`);
  if (existingTx[0].cnt === 0) {
    console.log('Seeding retail sales transactions...');

    const sampleItems = [
      [
        { name: 'Kanjeevaram Bridal Silk Saree (Gold Brocade)', qty: 1, rate: 32500, total: 32500 },
        { name: 'Pure Silk Blouse Fabric (1.2m)', qty: 1, rate: 2500, total: 2500 }
      ],
      [
        { name: 'Mysore Traditional Silk Saree', qty: 1, rate: 14800, total: 14800 },
        { name: 'Banarasi Silk Dupatta', qty: 1, rate: 4200, total: 4200 }
      ],
      [
        { name: 'Chanderi Pure Cotton Handloom Saree', qty: 2, rate: 3500, total: 7000 },
        { name: 'Organic Cotton Stole', qty: 1, rate: 1200, total: 1200 }
      ],
      [
        { name: 'Pure Linen Designer Kurta & Trousers', qty: 1, rate: 6800, total: 6800 },
        { name: 'Cotton Silk Waistcoat', qty: 1, rate: 3200, total: 3200 }
      ],
      [
        { name: 'Kids Royal Silk Sherwani Set', qty: 1, rate: 4500, total: 4500 }
      ],
      [
        { name: 'Handcrafted Antique Zari Saree Pin', qty: 2, rate: 950, total: 1900 },
        { name: 'Traditional Silk Potli Bag', qty: 1, rate: 1600, total: 1600 }
      ]
    ];

    const paymentMethods = ['UPI', 'CARD', 'CASH', 'UPI', 'CARD'];
    let billSeq = 1001;

    for (const sp of sellingPoints) {
      const [espRows]: any = await conn.query(`
        SELECT esp.employeeId FROM employeesellingpoint esp WHERE esp.sellingPointId = ?
      `, [sp.id]);

      const salesmen = espRows.map((r: any) => r.employeeId);
      const cashierId = salesmen[0] || employees[0].id;

      let sessionId: string | null = null;
      if (sp.category === 'Billing') {
        sessionId = genId('rbs');
        await conn.query(`
          INSERT INTO retail_billing_session (id, counterId, locationId, cashierId, status, openedAt, openingFloat, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'ACTIVE', DATE_SUB(NOW(3), INTERVAL 4 HOUR), 5000.00, NOW(3), NOW(3))
        `, [sessionId, sp.id, sp.locationId, cashierId]);
      }

      const numTx = 5 + (sp.code.charCodeAt(sp.code.length - 1) % 4);
      for (let t = 0; t < numTx; t++) {
        const items = sampleItems[(billSeq + t) % sampleItems.length];
        const gross = items.reduce((sum: number, it: any) => sum + it.total, 0);
        const discount = (t % 3 === 0) ? Math.round(gross * 0.05) : 0;
        const taxable = gross - discount;
        const tax = Math.round(taxable * 0.05); // 5% GST
        const net = taxable + tax;
        const payMethod = paymentMethods[(t + billSeq) % paymentMethods.length];
        const spEmpId = salesmen[t % salesmen.length] || employees[0].id;

        let status = 'COMPLETED';
        if (t === numTx - 1 && sp.category === 'Billing') status = 'PENDING';
        else if (t === 2 && sp.category === 'Billing') status = 'RETURNED';

        const billNo = `BSC-${sp.code.split('-')[0]}-${billSeq++}`;

        await conn.query(`
          INSERT INTO retail_sales_transaction (
            id, billNumber, counterId, floorId, locationId,
            salespersonId, cashierId, customerName, customerPhone,
            grossAmount, discountAmount, taxAmount, netAmount,
            paymentMethod, status, itemsJson, sessionId, createdAt, updatedAt
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, DATE_SUB(NOW(3), INTERVAL ${(t * 35) + 10} MINUTE), NOW(3)
          )
        `, [
          genId('rst'),
          billNo,
          sp.id,
          sp.floorId,
          sp.locationId,
          spEmpId,
          cashierId,
          `Customer ${billSeq % 100}`,
          `98450${10000 + (billSeq % 90000)}`,
          gross,
          discount,
          tax,
          net,
          payMethod,
          status,
          JSON.stringify(items),
          sessionId
        ]);
      }
    }
    console.log(`Seeded authentic retail sales transactions successfully.`);
  }

  await conn.end();
  console.log('Setup finished successfully!');
}

run().catch(console.error);
