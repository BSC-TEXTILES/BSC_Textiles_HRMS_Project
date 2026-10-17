-- ===========================================================================
-- 029: MIDDLE PUNCH TYPE
--
-- A shift day can hold more than an in and an out punch (breaks, re-entries).
-- The engine classifies any punch that is neither the first nor the latest of
-- the day as MIDDLE, but `punchType` was an enum with no value for it, so those
-- punches died with "Data truncated for column 'punchType'".
-- ===========================================================================

ALTER TABLE `biometric_raw_punches`
  MODIFY COLUMN `punchType` ENUM('CHECK_IN','CHECK_OUT','BREAK_OUT','BREAK_IN','MIDDLE','AUTO_PAIR') NOT NULL DEFAULT 'AUTO_PAIR';
