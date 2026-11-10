const { pool } = require('./src/nativeDb.ts');

async function seedData() {
  // Disable foreign key checks
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  
  // Insert locations
  await pool.query(`
    INSERT IGNORE INTO location (id, code, name, address, city, state, pin, phone, email, whatsapp, managerId, hrManagerId, openingTime, closingTime, status, createdAt, updatedAt) VALUES
    ('loc_bel', 'BEL', 'Belagavi Head Store', 'Khade Bazar, Belagavi, Karnataka 590001', 'Belagavi', 'Karnataka', '590001', '+91 831 2420001', 'belagavi@bsctextiles.com', '+91 831 2420001', NULL, NULL, '2024-01-01 10:30:00.000', '2024-01-01 20:30:00.000', 'ACTIVE', NOW(3), NOW(3)),
    ('loc_dav', 'DAV', 'Davanagere Mega Store', 'P.B. Road, Davanagere, Karnataka 577002', 'Davanagere', 'Karnataka', '577002', '+91 819 2230002', 'davanagere@bsctextiles.com', '+91 819 2230002', NULL, NULL, '2024-01-01 10:30:00.000', '2024-01-01 20:30:00.000', 'ACTIVE', NOW(3), NOW(3)),
    ('loc_shi', 'SHI', 'Shivamogga Flagship', 'Nehru Road, Shivamogga, Karnataka 577201', 'Shivamogga', 'Karnataka', '577201', '+91 818 2270003', 'shivamogga@bsctextiles.com', '+91 818 2270003', NULL, NULL, '2024-01-01 10:30:00.000', '2024-01-01 20:30:00.000', 'ACTIVE', NOW(3), NOW(3))
  `);
  console.log('Locations inserted');
  
  // Insert floors
  await pool.query(`
    INSERT IGNORE INTO floor (id, name, floorNumber, locationId, floorManagerId, assistantManagerId, status, createdAt, updatedAt) VALUES
    ('floor_bel_g', 'Ground Floor (Sarees & Silk)', 0, 'loc_bel', NULL, NULL, 'ACTIVE', NOW(3), NOW(3)),
    ('floor_bel_1', "First Floor (Men's & Suiting)", 1, 'loc_bel', NULL, NULL, 'ACTIVE', NOW(3), NOW(3)),
    ('floor_bel_2', "Second Floor (Kids & Women's Ethnic)", 2, 'loc_bel', NULL, NULL, 'ACTIVE', NOW(3), NOW(3))
  `);
  console.log('Floors inserted');
  
  // Insert departments
  await pool.query(`
    INSERT IGNORE INTO department (id, name, code, locationId, floorId, managerId, createdAt, updatedAt) VALUES
    ('dept_sarees', 'Sarees & Silk Division', 'DEP-SAR', 'loc_bel', 'floor_bel_g', NULL, NOW(3), NOW(3)),
    ('dept_mens', "Men's Wear & Suiting", 'DEP-MEN', 'loc_bel', 'floor_bel_1', NULL, NOW(3), NOW(3)),
    ('dept_womens', "Women's Ready-to-Wear", 'DEP-WOM', 'loc_bel', 'floor_bel_2', NULL, NOW(3), NOW(3))
  `);
  console.log('Departments inserted');
  
  // Insert sections
  await pool.query(`
    INSERT IGNORE INTO section (id, name, code, departmentId, status, createdAt, updatedAt) VALUES
    ('sec_kanchi', 'Kanjeevaram & Banarasi Silk', 'SEC-KAN', 'dept_sarees', 'ACTIVE', NOW(3), NOW(3)),
    ('sec_casual_saree', 'Cotton & Chiffon Sarees', 'SEC-COT', 'dept_sarees', 'ACTIVE', NOW(3), NOW(3)),
    ('sec_shirting', 'Fabrics & Custom Tailoring', 'SEC-SHI', 'dept_mens', 'ACTIVE', NOW(3), NOW(3))
  `);
  console.log('Sections inserted');
  
  // Insert selling points
  await pool.query(`
    INSERT IGNORE INTO sellingpoint (id, name, code, sectionId, status, createdAt, updatedAt) VALUES
    ('sp_bel_01', 'Silk Counter Terminal 1', 'POS-BEL-G01', 'sec_kanchi', 'ACTIVE', NOW(3), NOW(3)),
    ('sp_bel_02', 'Silk Counter Terminal 2', 'POS-BEL-G02', 'sec_kanchi', 'ACTIVE', NOW(3), NOW(3)),
    ('sp_bel_03', "Men's Fabrics Terminal 1", 'POS-BEL-101', 'sec_shirting', 'ACTIVE', NOW(3), NOW(3))
  `);
  console.log('Selling points inserted');
  
  // Insert shifts
  await pool.query(`
    INSERT IGNORE INTO shift (id, name, code, locationId, startTime, endTime, gracePeriod, lateThreshold, status, createdAt, updatedAt) VALUES
    ('shift_retail_morning', 'Showroom General Shift', 'MORNING', 'loc_bel', '2024-01-01 10:30:00.000', '2024-01-01 20:30:00.000', 5, 15, 'ACTIVE', NOW(3), NOW(3)),
    ('shift_retail_shi', 'Shivamogga General Shift', 'MORNING', 'loc_shi', '2024-01-01 10:30:00.000', '2024-01-01 20:30:00.000', 5, 15, 'ACTIVE', NOW(3), NOW(3))
  `);
  console.log('Shifts inserted');
  
  // Insert employees
  await pool.query(`
    INSERT IGNORE INTO employee (id, employeeCode, fullName, gender, phone, email, locationId, floorId, departmentId, sectionId, sellingPointId, shiftId, baseSalary, status) VALUES
    ('emp_admin', 'EMP-CORP-001', 'Rajesh Sharma (Super Admin)', 'MALE', '+91 9880000001', 'admin@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 85000.00, 'ACTIVE'),
    ('emp_kavita', 'EMP-BEL-001', 'Kavita Bhat (HR Manager)', 'FEMALE', '+91 9880000002', 'kavita.bhat@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 65000.00, 'ACTIVE'),
    ('emp_vikram', 'EMP-SHI-001', 'Vikram Singh (Shivamogga HR)', 'MALE', '+91 9880000003', 'vikram.singh@bsctextiles.com', 'loc_shi', NULL, NULL, NULL, NULL, 'shift_retail_shi', 60000.00, 'ACTIVE'),
    ('emp_amit', 'EMP-BEL-002', 'Amit Patel (Floor Manager)', 'MALE', '+91 9880000004', 'amit.patel@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 48000.00, 'ACTIVE'),
    ('emp_ramesh', 'EMP-BEL-003', 'Ramesh Gowda (T-Shop Scanner)', 'MALE', '+91 9880000005', 'ramesh.gowda@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 28000.00, 'ACTIVE'),
    ('emp_rajesh', 'EMP-BEL-004', 'Rajesh Kumar (Sales Specialist)', 'MALE', '+91 9880000006', 'rajesh.kumar@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 32000.00, 'ACTIVE'),
    ('emp_priya', 'EMP-BEL-005', 'Priya Deshmukh (Sales Staff)', 'FEMALE', '+91 9880000007', 'priya.d@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_02', 'shift_retail_morning', 30000.00, 'ACTIVE')
  `);
  console.log('Employees inserted');
  
  // Re-enable foreign key checks
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  
  console.log('All seed data inserted successfully');
  await pool.end();
  process.exit(0);
}

seedData().catch(e => { console.error(e); process.exit(1); });