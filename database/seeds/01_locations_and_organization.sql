-- ==============================================================================
-- 01: LOCATIONS & ORGANIZATIONAL TOPOLOGY SEED
-- Belagavi, Davanagere, Shivamogga, Hubballi
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. LOCATIONS
INSERT INTO locations (id, name, code, city, address, phone, email, status, manager_name) VALUES
('loc_bel', 'BSC Textiles Belagavi Flagship', 'BEL', 'Belagavi', 'Khade Bazar, Raviwar Peth, Belagavi, KA 590001', '+91 831 2420001', 'belagavi@bsctextiles.com', 'ACTIVE', 'Rajesh Sharma'),
('loc_dav', 'BSC Textiles Davanagere Showroom', 'DAV', 'Davanagere', 'PB Road, Near Clock Tower, Davanagere, KA 577002', '+91 819 2230002', 'davanagere@bsctextiles.com', 'ACTIVE', 'Suresh Patil'),
('loc_shi', 'BSC Textiles Shivamogga Megastore', 'SHI', 'Shivamogga', 'Nehru Road, Durgigudi, Shivamogga, KA 577201', '+91 818 2270003', 'shivamogga@bsctextiles.com', 'ACTIVE', 'Vikram Singh'),
('loc_hub', 'BSC Textiles Hubballi Test Lab', 'HUB-TEST', 'Hubballi', 'Station Road, Hubballi, KA 580020', '+91 836 2350004', 'hubballi@bsctextiles.com', 'ACTIVE', 'Prakash Kulkarni')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 2. FLOORS
INSERT INTO floors (id, location_id, name, floor_number, status) VALUES
('floor_bel_g', 'loc_bel', 'Ground Floor - Sarees & Silks', 0, 'ACTIVE'),
('floor_bel_1', 'loc_bel', 'First Floor - Menswear & Suiting', 1, 'ACTIVE'),
('floor_bel_2', 'loc_bel', 'Second Floor - Kidswear & Ready-made', 2, 'ACTIVE'),
('floor_dav_g', 'loc_dav', 'Ground Floor - Central Retail', 0, 'ACTIVE'),
('floor_shi_g', 'loc_shi', 'Ground Floor - Grand Showroom', 0, 'ACTIVE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 3. DEPARTMENTS
INSERT INTO departments (id, location_id, floor_id, name, department_code, status) VALUES
('dept_sarees', 'loc_bel', 'floor_bel_g', 'Sarees & Bridal Silks', 'DEPT-BEL-SAR', 'ACTIVE'),
('dept_mens', 'loc_bel', 'floor_bel_1', 'Menswear & Ethnic', 'DEPT-BEL-MEN', 'ACTIVE'),
('dept_kids', 'loc_bel', 'floor_bel_2', 'Kids & Casual Wear', 'DEPT-BEL-KID', 'ACTIVE'),
('dept_dav_ret', 'loc_dav', 'floor_dav_g', 'General Retail', 'DEPT-DAV-RET', 'ACTIVE'),
('dept_shi_ret', 'loc_shi', 'floor_shi_g', 'Silk Sarees & Mens', 'DEPT-SHI-RET', 'ACTIVE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 4. SECTIONS
INSERT INTO sections (id, department_id, name, section_code, status) VALUES
('sec_kanchi', 'dept_sarees', 'Kanchipuram & Banarasi Silks', 'SEC-SAR-KAN', 'ACTIVE'),
('sec_cotton', 'dept_sarees', 'Dailywear Cotton Sarees', 'SEC-SAR-COT', 'ACTIVE'),
('sec_suits', 'dept_mens', 'Formal Suits & Sherwanis', 'SEC-MEN-SUI', 'ACTIVE'),
('sec_shirts', 'dept_mens', 'Shirts & Trousers', 'SEC-MEN-SHI', 'ACTIVE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 5. SELLING POINTS
INSERT INTO selling_points (id, section_id, code, name, status) VALUES
('sp_bel_01', 'sec_kanchi', 'SP-BEL-KCH-01', 'Bridal Kanchi Display Counter', 'ACTIVE'),
('sp_bel_02', 'sec_cotton', 'SP-BEL-COT-01', 'Cotton Sarees Display Table 1', 'ACTIVE'),
('sp_bel_03', 'sec_suits', 'SP-BEL-SUI-01', 'Suiting & Shirting Rack A', 'ACTIVE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

SET FOREIGN_KEY_CHECKS = 1;
