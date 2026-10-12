-- ==============================================================================
-- BSC TEXTILES HRMS — LOCAL MASTER & SEED DATA (SQLITE)
-- ==============================================================================

-- 1. LOCATIONS
INSERT OR REPLACE INTO location (id, code, name, address, city, state, pin, phone, email, whatsapp, status) VALUES
('loc_belagavi', 'BEL', 'Belagavi Mega Showroom', 'College Road, Belagavi', 'Belagavi', 'Karnataka', '590001', '0831-2401122', 'belagavi@bsctextiles.com', '+919845011223', 'ACTIVE'),
('loc_davanagere', 'DAV', 'Davanagere Mega Store', 'PB Road, Davanagere', 'Davanagere', 'Karnataka', '577002', '08192-234567', 'davanagere@bsctextiles.com', '+919845022334', 'ACTIVE'),
('loc_shivamogga', 'SHI', 'Shivamogga City Center', 'Nehru Road, Shivamogga', 'Shivamogga', 'Karnataka', '577201', '08182-278901', 'shivamogga@bsctextiles.com', '+919845033445', 'ACTIVE');

-- 2. FLOORS (Davanagere)
INSERT OR REPLACE INTO floor (id, name, floorNumber, locationId, status) VALUES
('flr_dav_g', 'Ground Floor (Ethnic & Silks)', 0, 'loc_davanagere', 'ACTIVE'),
('flr_dav_1', '1st Floor (Men''s Suiting & Shirting)', 1, 'loc_davanagere', 'ACTIVE'),
('flr_dav_2', '2nd Floor (Kids & Western Wear)', 2, 'loc_davanagere', 'ACTIVE'),
('flr_bel_g', 'Ground Floor (Bridal Sarees)', 0, 'loc_belagavi', 'ACTIVE'),
('flr_bel_1', '1st Floor (Men''s Wear & Tailoring)', 1, 'loc_belagavi', 'ACTIVE'),
('flr_shi_g', 'Ground Floor (Retail & Sarees)', 0, 'loc_shivamogga', 'ACTIVE');

-- 3. DEPARTMENTS
INSERT OR REPLACE INTO department (id, name, code, locationId, floorId) VALUES
('dept_dav_sales', 'Retail Sales', 'SALES', 'loc_davanagere', 'flr_dav_2'),
('dept_dav_tailor', 'Atelier & Tailoring', 'ATELIER', 'loc_davanagere', 'flr_dav_1'),
('dept_dav_billing', 'Cashier & Billing', 'BILLING', 'loc_davanagere', 'flr_dav_g'),
('dept_bel_sales', 'Retail Sales', 'SALES', 'loc_belagavi', 'flr_bel_g'),
('dept_shi_sales', 'Retail Sales', 'SALES', 'loc_shivamogga', 'flr_shi_g');

-- 4. SECTIONS
INSERT OR REPLACE INTO section (id, name, code, locationId, floorId, departmentId) VALUES
('sec_dav_kids', 'Kids Wear', 'KIDS', 'loc_davanagere', 'flr_dav_2', 'dept_dav_sales'),
('sec_dav_mens', 'Men''s Ethnic', 'MENS', 'loc_davanagere', 'flr_dav_1', 'dept_dav_sales'),
('sec_dav_silks', 'Silk Sarees', 'SILK', 'loc_davanagere', 'flr_dav_g', 'dept_dav_sales'),
('sec_bel_silks', 'Wedding Silks', 'SILK', 'loc_belagavi', 'flr_bel_g', 'dept_bel_sales'),
('sec_shi_silks', 'Daily Silks', 'SILK', 'loc_shivamogga', 'flr_shi_g', 'dept_shi_sales');

-- 5. SHIFTS
INSERT OR REPLACE INTO shift (id, name, locationId, startTime, endTime, gracePeriod) VALUES
('shf_dav_shift2', 'Shift II (General)', 'loc_davanagere', '10:30:00', '20:30:00', 5),
('shf_bel_shift1', 'Shift I (General)', 'loc_belagavi', '10:30:00', '20:30:00', 5),
('shf_shi_shift1', 'Shift I (General)', 'loc_shivamogga', '10:30:00', '20:30:00', 5);

-- 6. ATTENDANCE RULES (₹1.0/sec permanent statutory rate)
INSERT OR REPLACE INTO attendancerules (id, locationId, loginTime, logoutTime, gracePeriodMinutes, lateThresholdMinutes, earlyLoginIncentiveEnabled, earlyLoginRatePerSecond, latePenaltyEnabled, latePenaltyRatePerSecond, overtimeIncentiveEnabled, overtimeRatePerSecond, earlyLogoutPenaltyEnabled, earlyLogoutRatePerSecond) VALUES
('rule_dav', 'loc_davanagere', '10:30:00', '20:30:00', 5, 5, 1, 1.0000, 1, 1.0000, 1, 1.5000, 1, 1.0000),
('rule_bel', 'loc_belagavi', '10:30:00', '20:30:00', 5, 5, 1, 1.0000, 1, 1.0000, 1, 1.5000, 1, 1.0000),
('rule_shi', 'loc_shivamogga', '10:30:00', '20:30:00', 5, 5, 1, 1.0000, 1, 1.0000, 1, 1.5000, 1, 1.0000);

-- 7. USERS (Bcrypt hash for password123: $2a$10$o6v9t7t29L/wz6M4g4z7v.Y9h0y7J8t7p9v3j7k5m1n8q4r7s8t9u)
-- Using universal hash compatible with bcryptjs: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy -> 'password123'
INSERT OR REPLACE INTO user (id, email, passwordHash, fullName, role, locationId, isActive) VALUES
('usr_superadmin', 'admin@bsctextiles.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Super Admin BSC', 'SUPER_ADMIN', 'loc_davanagere', 1),
('usr_hr_kavita', 'kavita.bhat@bsctextiles.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Kavita Bhat', 'HR_EXECUTIVE', 'loc_davanagere', 1),
('usr_floor_dav2', 'fm.kids@bsctextiles.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Ramesh Patil', 'FLOOR_MANAGER', 'loc_davanagere', 1);

-- 8. EMPLOYEES (Including Reference Employee 1372 Sadashiva Lingarajappa Hadimani)
INSERT OR REPLACE INTO employee (
  id, employeeCode, fullName, email, phone, gender, dateOfBirth, joiningDate, status,
  designation, locationId, floorId, departmentId, sectionId, shiftId,
  basicSalary, fixedGrossSalary, perDaySalary, daysPayable, pfPay, hra,
  pfNo, esiNo, uanNo, bankName, bankAccount, salesmanNo, batch
) VALUES
(
  'emp_sadashiva_1372', '1372', 'SADASHIVA LINGARAJAPPA HADIMANI', 'sadashiva.1372@bsctextiles.com', '9845113720', 'MALE', '1992-05-14', '2021-08-01', 'ACTIVE',
  'Sales Executive', 'loc_davanagere', 'flr_dav_2', 'dept_dav_sales', 'sec_dav_kids', 'shf_dav_shift2',
  12000.00, 16000.00, 516.13, 31.00, 12000.00, 4000.00,
  '10653', '5858975468', '101278107174', 'HDFC Bank', '50100374312528', '1372', 'SHIFT II'
),
(
  'emp_manjunath_1024', '1024', 'MANJUNATHA B K', 'manjunath.1024@bsctextiles.com', '9845110240', 'MALE', '1988-11-20', '2019-04-15', 'ACTIVE',
  'Senior Sales Executive', 'loc_davanagere', 'flr_dav_1', 'dept_dav_sales', 'sec_dav_mens', 'shf_dav_shift2',
  14000.00, 18500.00, 596.77, 31.00, 14000.00, 4500.00,
  '10240', '5858971024', '101278101024', 'SBI Bank', '30248891234', '1024', 'SHIFT II'
),
(
  'emp_priya_1055', '1055', 'PRIYA SHARMA', 'priya.1055@bsctextiles.com', '9845110550', 'FEMALE', '1995-02-18', '2022-01-10', 'ACTIVE',
  'Sales Associate', 'loc_belagavi', 'flr_bel_g', 'dept_bel_sales', 'sec_bel_silks', 'shf_bel_shift1',
  11000.00, 15000.00, 483.87, 31.00, 11000.00, 4000.00,
  '10550', '5858971055', '101278101055', 'Canara Bank', '10558872341', '1055', 'SHIFT I'
),
(
  'emp_anand_1088', '1088', 'ANAND KUMAR HEGDE', 'anand.1088@bsctextiles.com', '9845110880', 'MALE', '1990-09-09', '2020-06-01', 'ACTIVE',
  'Section Lead', 'loc_shivamogga', 'flr_shi_g', 'dept_shi_sales', 'sec_shi_silks', 'shf_shi_shift1',
  15000.00, 20000.00, 645.16, 31.00, 15000.00, 5000.00,
  '10880', '5858971088', '101278101088', 'ICICI Bank', '008812345678', '1088', 'SHIFT I'
);

-- 9. HISTORICAL & CERTIFIED PAYSLIP (Sadashiva 1372 for Aug-2026 Reference Document)
INSERT OR REPLACE INTO payrollrun (id, locationId, periodStart, periodEnd, status, processedBy, processedAt) VALUES
('prun_aug_2026_dav', 'loc_davanagere', '2026-08-01', '2026-08-31', 'COMPLETED', 'usr_hr_kavita', '2026-09-01 10:00:00');

INSERT OR REPLACE INTO payrollitem (
  id, payrollRunId, employeeId, employeeCode, fullName, designation, salaryMonth, salaryYear,
  daysPayable, perDaySalary, pfPay, fixedGrossSalary, basicSalary, hra,
  grossSalary, totalEarnings, totalDeductions, totalPayable, netPay,
  employeePf, employeeEsi, profTax, salaryAdvance, loanAdvance, penalties, employerPf, employerEsi, ctc,
  earningsConfig, deductionsConfig, remarks, status, section, batch, shiftName, locationCode,
  pfNo, esiNo, uanNo, bankName, bankAccount, salesmanNo
) VALUES
(
  'pitem_sada_aug_2026', 'prun_aug_2026_dav', 'emp_sadashiva_1372', '1372', 'SADASHIVA LINGARAJAPPA HADIMANI', 'Sales Executive', 'Aug', 2026,
  31.00, 516.13, 12000.00, 16000.00, 12000.00, 4000.00,
  20375.50, 20375.50, 1593.00, 18782.50, 18782.50,
  1440.00, 153.00, 0.00, 0.00, 0.00, 0.00, 1440.00, 662.00, 22477.50,
  '[{"id":"basic","label":"BASIC PAY","amount":12000,"enabled":true},{"id":"hra","label":"HRA","amount":4000,"enabled":true},{"id":"ot","label":"OT","amount":3355,"enabled":true},{"id":"govt_holiday","label":"GOVT.HOLIDAY","amount":1020.50,"enabled":true}]',
  '[{"id":"pf","label":"EMPLOYEE PF","amount":1440,"enabled":true},{"id":"esi","label":"EMPLOYEE ESI","amount":153,"enabled":true},{"id":"pt","label":"PROF TAX","amount":0,"enabled":true},{"id":"sal_adv","label":"SALARY ADVANCE","amount":0,"enabled":true},{"id":"loan_adv","label":"LOAN ADVANCE","amount":0,"enabled":true}]',
  'Audited & Disbursed via Bank Transfer HDFC', 'APPROVED', 'KIDS', 'SHIFT II', 'SHIFT II', 'BSCTEX',
  '10653', '5858975468', '101278107174', 'HDFC Bank', '50100374312528', '1372'
);

-- 10. CUSTOMERS & CRM
INSERT OR REPLACE INTO customer (id, fullName, phone, email, address, city, locationId, notes) VALUES
('cust_001', 'Dr. Rajeshwari Kulkarni', '9845012345', 'dr.rajeshwari@gmail.com', 'Kuvempu Nagar', 'Davanagere', 'loc_davanagere', 'VIP Customer - Bridal Silks buyer'),
('cust_002', 'Suresh G. Patil', '9845067890', 'suresh.patil@yahoo.com', 'Tilakwadi', 'Belagavi', 'loc_belagavi', 'Wedding Purchase Groom Side'),
('cust_003', 'Anita Venkatesh', '9845089012', 'anita.v@gmail.com', 'Gopala Gowda Extension', 'Shivamogga', 'loc_shivamogga', 'Frequent Festival Shopper');

-- 11. WEDDING REGISTRATIONS
INSERT OR REPLACE INTO wedding_registration (id, brideName, groomName, weddingDate, phone, alternatePhone, locationId, budget, status, assignedTelecallerId, notes) VALUES
('wed_001', 'Deepa Gowda', 'Vijay Kumar', '2026-11-25', '9845012345', '9845099887', 'loc_davanagere', 250000.00, 'CONFIRMED', 'usr_hr_kavita', 'Selected 12 Kanjivaram Sarees, Shirting for groom side pending'),
('wed_002', 'Pooja Hegde', 'Abhishek Deshmukh', '2026-12-14', '9845067890', '9845033441', 'loc_belagavi', 350000.00, 'FOLLOW_UP', 'usr_superadmin', 'First showroom visit completed, high interest in Royal Paithani');

-- 12. CUSTOMER FEEDBACK
INSERT OR REPLACE INTO customer_feedback (id, customerName, phone, rating, comments, isNegative, alertSent, showroomLocation) VALUES
('fb_001', 'Dr. Rajeshwari Kulkarni', '9845012345', 5, 'Superb assistance by Sadashiva in Kids section. Excellent collection!', 0, 0, 'Davanagere Mega Store'),
('fb_002', 'Maheshwari S', '9845077123', 4, 'Very good silk varieties, billing counter was slightly crowded.', 0, 0, 'Davanagere Mega Store'),
('fb_003', 'Rameshwaram', '9845044321', 2, 'Trial room wait time was more than 15 minutes during Sunday evening rush.', 1, 1, 'Belagavi Mega Showroom');

-- 13. SHOWROOM FOOTFALL
INSERT OR REPLACE INTO showroom_footfall (id, locationId, countDate, hourSlot, count, remarks) VALUES
('ff_001', 'loc_davanagere', '2026-10-11', '10:30-12:30', 48, 'Morning steady walk-ins'),
('ff_002', 'loc_davanagere', '2026-10-11', '12:30-15:30', 82, 'Afternoon wedding party visits'),
('ff_003', 'loc_davanagere', '2026-10-11', '15:30-18:30', 145, 'Evening peak retail rush'),
('ff_004', 'loc_davanagere', '2026-10-11', '18:30-20:30', 110, 'Festival pre-booking rush');

-- 14. VISUAL MERCHANDISING
INSERT OR REPLACE INTO visual_merchandising (id, locationId, floorId, auditDate, auditorName, score, observations, status) VALUES
('vm_001', 'loc_davanagere', 'flr_dav_g', '2026-10-10', 'Visual Team Hub', 96.5, 'Saree displays lighting calibrated, entrance mannequin styled in wedding silk', 'APPROVED'),
('vm_002', 'loc_davanagere', 'flr_dav_2', '2026-10-10', 'Visual Team Hub', 94.0, 'Kids wear section color coordinated and promotional banners mounted cleanly', 'APPROVED');
