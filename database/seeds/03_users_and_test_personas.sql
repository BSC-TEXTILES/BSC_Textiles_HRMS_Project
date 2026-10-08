-- ==============================================================================
-- 03: EMPLOYEES & USERS SEED (AUTHENTICATION PERSONAS)
-- Password for all accounts: password123 (bcrypt hash)
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. EMPLOYEES
INSERT INTO employees (id, employee_code, full_name, gender, phone, email, location_id, floor_id, department_id, section_id, selling_point_id, shift_id, base_salary, status) VALUES
('emp_admin', 'EMP-CORP-001', 'Rajesh Sharma (Super Admin)', 'MALE', '+91 9880000001', 'admin@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 85000.00, 'ACTIVE'),
('emp_kavita', 'EMP-BEL-001', 'Kavita Bhat (HR Manager)', 'FEMALE', '+91 9880000002', 'kavita.bhat@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 65000.00, 'ACTIVE'),
('emp_vikram', 'EMP-SHI-001', 'Vikram Singh (Shivamogga HR)', 'MALE', '+91 9880000003', 'vikram.singh@bsctextiles.com', 'loc_shi', NULL, NULL, NULL, NULL, 'shift_retail_shi', 60000.00, 'ACTIVE'),
('emp_amit', 'EMP-BEL-002', 'Amit Patel (Floor Manager)', 'MALE', '+91 9880000004', 'amit.patel@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 48000.00, 'ACTIVE'),
('emp_ramesh', 'EMP-BEL-003', 'Ramesh Gowda (T-Shop Scanner)', 'MALE', '+91 9880000005', 'ramesh.gowda@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 28000.00, 'ACTIVE'),
('emp_rajesh', 'EMP-BEL-004', 'Rajesh Kumar (Sales Specialist)', 'MALE', '+91 9880000006', 'rajesh.kumar@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 32000.00, 'ACTIVE'),
('emp_priya', 'EMP-BEL-005', 'Priya Deshmukh (Sales Staff)', 'FEMALE', '+91 9880000007', 'priya.d@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_02', 'shift_retail_morning', 30000.00, 'ACTIVE')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- 2. SYSTEM USERS (Password: password123)
INSERT INTO users (id, email, password_hash, full_name, role, permissions, location_id, employee_id, is_active) VALUES
('usr_admin', 'admin@bsctextiles.com', '$2a$12$r3y7R6uN8Q7z9vQ8O0yQ1e5LzX9gL2kP3mQ4wR5tY6uI7oP8qa123', 'Rajesh Sharma', 'SUPER_ADMIN', '["VIEW", "ADD", "EDIT", "DELETE", "APPROVE", "REJECT", "ASSIGN", "EXPORT", "IMPORT", "CONFIGURE", "MANAGE", "RECORD", "UPLOAD", "PUBLISH", "SCAN", "VIEW_SENSITIVE_DATA"]', 'loc_bel', 'emp_admin', TRUE),
('usr_kavita', 'kavita.bhat@bsctextiles.com', '$2a$12$r3y7R6uN8Q7z9vQ8O0yQ1e5LzX9gL2kP3mQ4wR5tY6uI7oP8qa123', 'Kavita Bhat', 'HR_MANAGER', '["VIEW", "ADD", "EDIT", "APPROVE", "REJECT", "ASSIGN", "EXPORT", "MANAGE", "RECORD", "VIEW_SENSITIVE_DATA"]', 'loc_bel', 'emp_kavita', TRUE),
('usr_vikram', 'vikram.singh@bsctextiles.com', '$2a$12$r3y7R6uN8Q7z9vQ8O0yQ1e5LzX9gL2kP3mQ4wR5tY6uI7oP8qa123', 'Vikram Singh', 'HR_MANAGER', '["VIEW", "ADD", "EDIT", "APPROVE", "REJECT", "ASSIGN", "EXPORT", "MANAGE", "RECORD"]', 'loc_shi', 'emp_vikram', TRUE),
('usr_amit', 'amit.patel@bsctextiles.com', '$2a$12$r3y7R6uN8Q7z9vQ8O0yQ1e5LzX9gL2kP3mQ4wR5tY6uI7oP8qa123', 'Amit Patel', 'FLOOR_MANAGER', '["VIEW", "EDIT", "ASSIGN", "RECORD", "UPLOAD"]', 'loc_bel', 'emp_amit', TRUE),
('usr_ramesh', 'ramesh.gowda@bsctextiles.com', '$2a$12$r3y7R6uN8Q7z9vQ8O0yQ1e5LzX9gL2kP3mQ4wR5tY6uI7oP8qa123', 'Ramesh Gowda', 'T_SHOP_OWNER', '["VIEW", "SCAN", "RECORD"]', 'loc_bel', 'emp_ramesh', TRUE),
('usr_rajesh', 'rajesh.kumar@bsctextiles.com', '$2a$12$r3y7R6uN8Q7z9vQ8O0yQ1e5LzX9gL2kP3mQ4wR5tY6uI7oP8qa123', 'Rajesh Kumar', 'SALES_EMPLOYEE', '["VIEW", "RECORD"]', 'loc_bel', 'emp_rajesh', TRUE),
('usr_priya', 'priya.d@bsctextiles.com', '$2a$12$r3y7R6uN8Q7z9vQ8O0yQ1e5LzX9gL2kP3mQ4wR5tY6uI7oP8qa123', 'Priya Deshmukh', 'EMPLOYEE', '["VIEW", "RECORD"]', 'loc_bel', 'emp_priya', TRUE)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

SET FOREIGN_KEY_CHECKS = 1;
