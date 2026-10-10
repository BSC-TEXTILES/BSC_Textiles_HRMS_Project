-- ==============================================================================
-- 012: HIGH-PERFORMANCE QUERY INDEXES & COMPOSITE COVERING INDEXES
-- Optimizes P95 API Latencies for Dashboard Summaries, Attendance, and KYC
-- ==============================================================================

-- 1. Attendance composite indexes for location, date range, and status aggregations
CREATE INDEX idx_att_loc_date_status ON attendance (locationId, attendanceDate, status);
CREATE INDEX idx_att_date_status ON attendance (attendanceDate, status);
CREATE INDEX idx_att_shift_date ON attendance (shiftId, attendanceDate);

-- 2. Face Verification composite indexes for daily metrics & status filtering
CREATE INDEX idx_face_loc_time_res ON faceverification (locationId, verifiedAt, result);
CREATE INDEX idx_face_time_res ON faceverification (verifiedAt, result);

-- 3. QR Scan Records composite indexes for scanner metrics & replay verification
CREATE INDEX idx_qr_loc_time_res ON qrscanrecord (locationId, scannedAt, result);
CREATE INDEX idx_qr_time_res ON qrscanrecord (scannedAt, result);

-- 4. Employee Break composite indexes for floor break counts & overrun detection
CREATE INDEX idx_eb_emp_date ON employeebreak (employeeId, breakDate);
CREATE INDEX idx_eb_status_date ON employeebreak (status, breakDate);

-- 5. Incentive and Penalty Transaction composite indexes for daily payroll & incentives
CREATE INDEX idx_it_tx_date ON incentivetransaction (transactionDate);
CREATE INDEX idx_it_emp_date ON incentivetransaction (employeeId, transactionDate);

CREATE INDEX idx_pt_tx_date ON penaltytransaction (transactionDate);
CREATE INDEX idx_pt_emp_date ON penaltytransaction (employeeId, transactionDate);

-- 6. Employee filtering indexes for active headcount by location & department
CREATE INDEX idx_emp_status_loc ON employee (status, locationId);
CREATE INDEX idx_emp_status_dept ON employee (status, departmentId);

-- 7. Observation composite indexes for floor management & safety metrics
CREATE INDEX idx_obs_loc_status_level ON observation (locationId, status, level);
CREATE INDEX idx_obs_status_level ON observation (status, level);
