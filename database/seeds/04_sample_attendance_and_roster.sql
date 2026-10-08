-- ==============================================================================
-- 04: BASELINE ATTENDANCE & DYNAMIC DAILY QR BADGES SEED
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. BASELINE ATTENDANCE (Today)
INSERT INTO attendance (id, employeeId, locationId, shiftId, attendanceDate, actualLogin, status, earlyLoginIncentive, faceVerified) VALUES
('att_sample_01', 'emp_rajesh', 'loc_bel', 'shift_retail_morning', CURDATE(), CONCAT(CURDATE(), ' 10:20:00'), 'PRESENT', 600.00, TRUE),
('att_sample_02', 'emp_priya', 'loc_bel', 'shift_retail_morning', CURDATE(), CONCAT(CURDATE(), ' 10:25:00'), 'PRESENT', 300.00, TRUE)
ON DUPLICATE KEY UPDATE actualLogin = VALUES(actualLogin);

-- Also populate for any existing employee IDs in current deployment
INSERT INTO attendance (id, employeeId, locationId, shiftId, attendanceDate, actualLogin, status, earlyLoginIncentive, faceVerified)
SELECT 
  CONCAT('att_', SUBSTRING(id, 1, 20)), 
  id, 
  locationId, 
  shiftId, 
  CURDATE(), 
  CONCAT(CURDATE(), ' 10:20:00'), 
  'PRESENT', 
  600.00, 
  TRUE
FROM employee
WHERE id NOT IN (SELECT employeeId FROM attendance WHERE attendanceDate = CURDATE())
LIMIT 10;

-- 2. DYNAMIC DAILY QR BADGES
INSERT INTO qr_codes (id, employee_id, token, valid_date, is_active, expires_at) VALUES
('qr_rajesh_today', 'emp_rajesh', 'BSC-QR-BEL-004-20261008-SECURETOKEN99', CURDATE(), TRUE, CONCAT(CURDATE(), ' 23:59:59')),
('qr_priya_today', 'emp_priya', 'BSC-QR-BEL-005-20261008-SECURETOKEN88', CURDATE(), TRUE, CONCAT(CURDATE(), ' 23:59:59'))
ON DUPLICATE KEY UPDATE is_active = VALUES(is_active);

SET FOREIGN_KEY_CHECKS = 1;
