-- ==============================================================================
-- BSC TEXTILES HRMS — NATIVE MYSQL 8.0 SEED DATASET (ZERO PRISMA)
-- Company: BSC Textiles Pvt Ltd
-- Pre-configured Test Accounts Password: password123
-- Pre-hashed Bcrypt Hash (of "password123"): $2a$12$FM2IEz.uvN10roK2KrJiqOsn3cudHt3J21Gqa/IkZ6VTQnmyLznuq
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. LOCATIONS
INSERT INTO locations (id, name, code, city, address, phone, email, status, manager_name) VALUES
('loc_bel', 'Belagavi Head Store', 'BEL', 'Belagavi', 'Khade Bazar, Belagavi, Karnataka 590001', '+91 831 2420001', 'belagavi@bsctextiles.com', 'ACTIVE', 'Kavita Bhat'),
('loc_dav', 'Davanagere Mega Store', 'DAV', 'Davanagere', 'P.B. Road, Davanagere, Karnataka 577002', '+91 819 2230002', 'davanagere@bsctextiles.com', 'ACTIVE', 'Suresh Patil'),
('loc_shi', 'Shivamogga Flagship', 'SHI', 'Shivamogga', 'Nehru Road, Shivamogga, Karnataka 577201', '+91 818 2270003', 'shivamogga@bsctextiles.com', 'ACTIVE', 'Vikram Singh');

-- 2. FLOORS (Belagavi)
INSERT INTO floors (id, location_id, name, floor_number, status) VALUES
('floor_bel_g', 'loc_bel', 'Ground Floor (Sarees & Silk)', 0, 'ACTIVE'),
('floor_bel_1', 'loc_bel', 'First Floor (Men\'s & Suiting)', 1, 'ACTIVE'),
('floor_bel_2', 'loc_bel', 'Second Floor (Kids & Women\'s Ethnic)', 2, 'ACTIVE');

-- 3. DEPARTMENTS
INSERT INTO departments (id, location_id, floor_id, name, department_code, status) VALUES
('dept_sarees', 'loc_bel', 'floor_bel_g', 'Sarees & Silk Division', 'DEP-SAR', 'ACTIVE'),
('dept_mens', 'loc_bel', 'floor_bel_1', 'Men\'s Wear & Suiting', 'DEP-MEN', 'ACTIVE'),
('dept_womens', 'loc_bel', 'floor_bel_2', 'Women\'s Ready-to-Wear', 'DEP-WOM', 'ACTIVE');

-- 4. SECTIONS
INSERT INTO sections (id, department_id, name, section_code, status) VALUES
('sec_kanchi', 'dept_sarees', 'Kanjeevaram & Banarasi Silk', 'SEC-KAN', 'ACTIVE'),
('sec_casual_saree', 'dept_sarees', 'Cotton & Chiffon Sarees', 'SEC-COT', 'ACTIVE'),
('sec_shirting', 'dept_mens', 'Fabrics & Custom Tailoring', 'SEC-SHI', 'ACTIVE');

-- 5. SELLING POINTS (POS TERMINALS)
INSERT INTO selling_points (id, section_id, code, name, status) VALUES
('sp_bel_01', 'sec_kanchi', 'POS-BEL-G01', 'Silk Counter Terminal 1', 'ACTIVE'),
('sp_bel_02', 'sec_kanchi', 'POS-BEL-G02', 'Silk Counter Terminal 2', 'ACTIVE'),
('sp_bel_03', 'sec_shirting', 'POS-BEL-101', 'Men\'s Fabrics Terminal 1', 'ACTIVE');

-- 6. SHIFTS
INSERT INTO shifts (id, location_id, name, start_time, end_time, grace_period_minutes, early_login_rate_per_second, late_penalty_rate_per_second, status) VALUES
('shift_retail_morning', 'loc_bel', 'Showroom General Shift', '10:30:00', '20:30:00', 5, 1.0000, 1.0000, 'ACTIVE'),
('shift_retail_shi', 'loc_shi', 'Shivamogga General Shift', '10:30:00', '20:30:00', 5, 1.0000, 1.0000, 'ACTIVE');

-- 7. INCENTIVE RULES
INSERT INTO incentive_rules (id, location_id, name, type, rate_type, rate_value, min_threshold, max_cap, is_active) VALUES
('rule_early_bel', 'loc_bel', 'Early Login Incentive (₹1/sec)', 'EARLY_LOGIN', 'PER_SECOND', 1.0000, 0, 1500.00, TRUE),
('rule_ot_bel', 'loc_bel', 'Showroom Overtime Incentive', 'OVERTIME', 'PER_MINUTE', 5.0000, 15, 2000.00, TRUE),
('rule_streak_bel', 'loc_bel', 'Monthly Perfect Attendance Bonus', 'PERFECT_ATTENDANCE', 'FIXED', 2500.0000, 26, 2500.00, TRUE);

-- 8. PENALTY POLICIES
INSERT INTO penalty_policies (id, location_id, name, violation_type, rate_type, rate_value, grace_window_seconds, is_active) VALUES
('pol_late_bel', 'loc_bel', 'Late Arrival Policy (5m Grace)', 'LATE_LOGIN', 'PER_SECOND', 1.0000, 300, TRUE),
('pol_overrun_bel', 'loc_bel', 'Break Overrun Policy', 'BREAK_OVERRUN', 'PER_SECOND', 1.0000, 0, TRUE);

-- 9. EMPLOYEES
INSERT INTO employees (id, employee_code, full_name, gender, phone, email, location_id, floor_id, department_id, section_id, selling_point_id, shift_id, base_salary, status) VALUES
('emp_admin', 'EMP-CORP-001', 'Rajesh Sharma (Super Admin)', 'MALE', '+91 9880000001', 'admin@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 85000.00, 'ACTIVE'),
('emp_kavita', 'EMP-BEL-001', 'Kavita Bhat (HR Manager)', 'FEMALE', '+91 9880000002', 'kavita.bhat@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 65000.00, 'ACTIVE'),
('emp_vikram', 'EMP-SHI-001', 'Vikram Singh (Shivamogga HR)', 'MALE', '+91 9880000003', 'vikram.singh@bsctextiles.com', 'loc_shi', NULL, NULL, NULL, NULL, 'shift_retail_shi', 60000.00, 'ACTIVE'),
('emp_amit', 'EMP-BEL-002', 'Amit Patel (Floor Manager)', 'MALE', '+91 9880000004', 'amit.patel@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 48000.00, 'ACTIVE'),
('emp_ramesh', 'EMP-BEL-003', 'Ramesh Gowda (T-Shop Scanner)', 'MALE', '+91 9880000005', 'ramesh.gowda@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 28000.00, 'ACTIVE'),
('emp_rajesh', 'EMP-BEL-004', 'Rajesh Kumar (Sales Specialist)', 'MALE', '+91 9880000006', 'rajesh.kumar@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 32000.00, 'ACTIVE'),
('emp_priya', 'EMP-BEL-005', 'Priya Deshmukh (Sales Staff)', 'FEMALE', '+91 9880000007', 'priya.d@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_02', 'shift_retail_morning', 30000.00, 'ACTIVE');

-- 10. SYSTEM USERS (Password: password123 hashed via bcrypt)
-- Using universal hash for password123: $2a$12$hTf9Vq4M77mPzU6mJg.8o.cE3wQzS2D0qW4LwG7y1l5v6b5y3z1e2
INSERT INTO users (id, email, password_hash, full_name, role, permissions, location_id, employee_id, is_active) VALUES
('usr_admin', 'admin@bsctextiles.com', '$2a$12$FM2IEz.uvN10roK2KrJiqOsn3cudHt3J21Gqa/IkZ6VTQnmyLznuq', 'Rajesh Sharma', 'SUPER_ADMIN', '["VIEW", "ADD", "EDIT", "DELETE", "APPROVE", "REJECT", "ASSIGN", "EXPORT", "IMPORT", "CONFIGURE", "MANAGE", "RECORD", "UPLOAD", "PUBLISH", "SCAN", "VIEW_SENSITIVE_DATA"]', 'loc_bel', 'emp_admin', TRUE),
('usr_kavita', 'kavita.bhat@bsctextiles.com', '$2a$12$FM2IEz.uvN10roK2KrJiqOsn3cudHt3J21Gqa/IkZ6VTQnmyLznuq', 'Kavita Bhat', 'HR_MANAGER', '["VIEW", "ADD", "EDIT", "APPROVE", "REJECT", "ASSIGN", "EXPORT", "MANAGE", "RECORD", "VIEW_SENSITIVE_DATA"]', 'loc_bel', 'emp_kavita', TRUE),
('usr_vikram', 'vikram.singh@bsctextiles.com', '$2a$12$FM2IEz.uvN10roK2KrJiqOsn3cudHt3J21Gqa/IkZ6VTQnmyLznuq', 'Vikram Singh', 'HR_MANAGER', '["VIEW", "ADD", "EDIT", "APPROVE", "REJECT", "ASSIGN", "EXPORT", "MANAGE", "RECORD"]', 'loc_shi', 'emp_vikram', TRUE),
('usr_amit', 'amit.patel@bsctextiles.com', '$2a$12$FM2IEz.uvN10roK2KrJiqOsn3cudHt3J21Gqa/IkZ6VTQnmyLznuq', 'Amit Patel', 'FLOOR_MANAGER', '["VIEW", "EDIT", "ASSIGN", "RECORD", "UPLOAD"]', 'loc_bel', 'emp_amit', TRUE),
('usr_ramesh', 'ramesh.gowda@bsctextiles.com', '$2a$12$FM2IEz.uvN10roK2KrJiqOsn3cudHt3J21Gqa/IkZ6VTQnmyLznuq', 'Ramesh Gowda', 'T_SHOP_OWNER', '["VIEW", "SCAN", "RECORD"]', 'loc_bel', 'emp_ramesh', TRUE),
('usr_rajesh', 'rajesh.kumar@bsctextiles.com', '$2a$12$FM2IEz.uvN10roK2KrJiqOsn3cudHt3J21Gqa/IkZ6VTQnmyLznuq', 'Rajesh Kumar', 'SALES_EMPLOYEE', '["VIEW", "RECORD"]', 'loc_bel', 'emp_rajesh', TRUE),
('usr_priya', 'priya.d@bsctextiles.com', '$2a$12$FM2IEz.uvN10roK2KrJiqOsn3cudHt3J21Gqa/IkZ6VTQnmyLznuq', 'Priya Deshmukh', 'EMPLOYEE', '["VIEW", "RECORD"]', 'loc_bel', 'emp_priya', TRUE);

-- Update floor manager reference
UPDATE floors SET floor_manager_id = 'usr_amit' WHERE id = 'floor_bel_g';

-- 11. BASELINE ATTENDANCE (Today)
INSERT INTO attendance (id, employeeId, locationId, shiftId, attendanceDate, actualLogin, status, earlyLoginIncentive, faceVerified) VALUES
('att_sample_01', 'emp_rajesh', 'loc_bel', 'shift_retail_morning', CURDATE(), CONCAT(CURDATE(), ' 10:20:00'), 'PRESENT', 600.00, TRUE),
('att_sample_02', 'emp_priya', 'loc_bel', 'shift_retail_morning', CURDATE(), CONCAT(CURDATE(), ' 10:25:00'), 'PRESENT', 300.00, TRUE);

-- 12. DYNAMIC DAILY QR BADGES
INSERT INTO qr_codes (id, employee_id, token, valid_date, is_active, expires_at) VALUES
('qr_rajesh_today', 'emp_rajesh', 'BSC-QR-BEL-004-20261008-SECURETOKEN99', CURDATE(), TRUE, CONCAT(CURDATE(), ' 23:59:59')),
('qr_priya_today', 'emp_priya', 'BSC-QR-BEL-005-20261008-SECURETOKEN88', CURDATE(), TRUE, CONCAT(CURDATE(), ' 23:59:59'));

SET FOREIGN_KEY_CHECKS = 1;
