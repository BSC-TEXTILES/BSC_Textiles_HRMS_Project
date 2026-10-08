-- ==============================================================================
-- 02: SHIFTS, INCENTIVE RULES & PENALTY POLICIES SEED
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. SHIFTS
INSERT INTO shifts (id, location_id, name, start_time, end_time, grace_period_minutes, early_login_rate_per_second, late_penalty_rate_per_second, status) VALUES
('shift_retail_morning', 'loc_bel', 'Retail Morning Shift (10:30 AM - 8:30 PM)', '10:30:00', '20:30:00', 5, 1.0000, 1.0000, 'ACTIVE'),
('shift_retail_dav', 'loc_dav', 'Davanagere General Shift', '10:00:00', '20:00:00', 5, 1.0000, 1.0000, 'ACTIVE'),
('shift_retail_shi', 'loc_shi', 'Shivamogga Showroom Shift', '10:30:00', '20:30:00', 5, 1.0000, 1.0000, 'ACTIVE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 2. INCENTIVE RULES
INSERT INTO incentive_rules (id, location_id, name, type, rate_type, rate_value, min_threshold, max_cap, is_active) VALUES
('rule_early_bel', 'loc_bel', 'Early Morning Login Incentive (₹1/sec)', 'EARLY_LOGIN', 'PER_SECOND', 1.0000, 0, 1200.00, TRUE),
('rule_ot_bel', 'loc_bel', 'Overtime Extended Shift (₹10/min)', 'OVERTIME', 'PER_MINUTE', 10.0000, 30, 2000.00, TRUE),
('rule_sales_bel', 'loc_bel', 'Bridal Sarees Commission', 'SALES_MILESTONE', 'PERCENTAGE', 0.0350, 500000, 50000.00, TRUE),
('rule_streak_bel', 'loc_bel', 'Monthly Perfect Attendance Bonus', 'PERFECT_ATTENDANCE', 'FIXED', 2500.0000, 26, 2500.00, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 3. PENALTY POLICIES
INSERT INTO penalty_policies (id, location_id, name, violation_type, rate_type, rate_value, grace_window_seconds, is_active) VALUES
('pol_late_bel', 'loc_bel', 'Late Arrival Policy (5m Grace)', 'LATE_LOGIN', 'PER_SECOND', 1.0000, 300, TRUE),
('pol_overrun_bel', 'loc_bel', 'Break Overrun Policy', 'BREAK_OVERRUN', 'PER_SECOND', 1.0000, 0, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name);

SET FOREIGN_KEY_CHECKS = 1;
