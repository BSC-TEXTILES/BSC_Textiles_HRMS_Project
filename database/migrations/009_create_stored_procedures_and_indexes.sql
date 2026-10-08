-- ==============================================================================
-- 009: STORED PROCEDURES & OPTIMIZATIONS
-- Native MySQL procedures for sub-second early login & late arrival calculations
-- ==============================================================================

DROP PROCEDURE IF EXISTS sp_calculate_early_incentive;

CREATE PROCEDURE sp_calculate_early_incentive(
    IN p_punch_in DATETIME(3),
    IN p_scheduled_start TIME,
    IN p_rate_per_sec DECIMAL(10, 4),
    OUT p_early_seconds INT,
    OUT p_incentive_amount DECIMAL(12, 2)
)
BEGIN
    DECLARE scheduled_dt DATETIME(3);
    SET scheduled_dt = TIMESTAMP(DATE(p_punch_in), p_scheduled_start);

    IF p_punch_in < scheduled_dt THEN
        SET p_early_seconds = TIMESTAMPDIFF(SECOND, p_punch_in, scheduled_dt);
        SET p_incentive_amount = ROUND(p_early_seconds * p_rate_per_sec, 2);
    ELSE
        SET p_early_seconds = 0;
        SET p_incentive_amount = 0.00;
    END IF;
END;
