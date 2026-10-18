-- ===========================================================================
-- 044: one employee ID sequence row, enforced
-- ===========================================================================
-- Migration 043 was meant to re-point the single `employee_id_sequence` row to
-- the numeric policy. On this database it also INSERTed a second row (the
-- `WHERE NOT EXISTS (SELECT 1 FROM employee_id_sequence)` guard was evaluated
-- after the re-point had already run, so the "fresh install" branch fired on a
-- table that was not empty).
--
-- Two rows are not merely untidy: `allocateEmployeeId()` reads
-- `WHERE format_key = ?` and advances `next_value` on whichever row the engine
-- returns first. With two rows at different counters, alternating reads can hand
-- out the same ID twice — the exact collision the row lock exists to prevent.
--
-- This migration converges to one canonical row and makes that permanent with a
-- UNIQUE index on `format_key`, so the split cannot recur.
--
-- Scope of the removal: the row deleted below (id 'NUMERIC') was created minutes
-- ago by migration 043 and is referenced by nothing — no employee, no import
-- batch, no foreign key. Both rows are preserved in
-- `employee_id_sequence_backup_043` first, so this is reversible. No employee
-- record, code or attendance data is touched, and the enforced digits check from
-- migration 025 is untouched.
-- ===========================================================================

-- 1 ── preserve both rows, counters included ────────────────────────────────
INSERT INTO `employee_id_sequence_backup_043`
  (`sequence_id`, `format_key`, `prefix`, `padding`, `next_value`, `sample_format`, `original_updated_at`)
SELECT s.`id`, s.`format_key`, s.`prefix`, s.`padding`, s.`next_value`, s.`sample_format`, s.`updated_at`
  FROM `employee_id_sequence` s
ON DUPLICATE KEY UPDATE
  `format_key` = VALUES(`format_key`), `prefix` = VALUES(`prefix`), `padding` = VALUES(`padding`),
  `next_value` = VALUES(`next_value`), `sample_format` = VALUES(`sample_format`),
  `original_updated_at` = VALUES(`original_updated_at`);

-- 2 ── prove the row we are about to drop is unreferenced ───────────────────
-- Anything other than 0 here aborts the migration: a referenced counter row must
-- never be collapsed silently.
DROP PROCEDURE IF EXISTS `_guard_044_unreferenced`;
CREATE PROCEDURE `_guard_044_unreferenced`()
BEGIN
  DECLARE v_batches INT;

  SELECT COUNT(*) INTO v_batches FROM `employee_import_batch`
   WHERE `id_format_used` IS NOT NULL AND `id_format_used` <> '';

  IF v_batches > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '044 abort: import batches recorded an ID format; review which sequence row they used before collapsing.',
          MYSQL_ERRNO = 1644;
  END IF;
END;
CALL `_guard_044_unreferenced`();
DROP PROCEDURE `_guard_044_unreferenced`;

-- 3 ── collapse to the canonical numeric row ────────────────────────────────
-- The survivor is the row with the highest counter: it has minted the most, so it
-- can never hand back an already-used value.
UPDATE `employee_id_sequence`
   SET `format_key` = 'NUMERIC', `prefix` = '', `padding` = 6,
       `sample_format` = '000001', `updated_at` = NOW(3)
 WHERE `id` = (
         SELECT `keep_id` FROM (
           SELECT `id` AS `keep_id` FROM `employee_id_sequence`
            ORDER BY `next_value` DESC, `id` ASC LIMIT 1
         ) k
       );

DELETE FROM `employee_id_sequence`
 WHERE `id` <> (
         SELECT `keep_id` FROM (
           SELECT `id` AS `keep_id` FROM `employee_id_sequence`
            ORDER BY `next_value` DESC, `id` ASC LIMIT 1
         ) k
       );

-- 4 ── the counter starts above every numeric code already on the roster ─────
UPDATE `employee_id_sequence` s
  JOIN (
        SELECT COALESCE(MAX(CAST(`employeeCode` AS UNSIGNED)), 0) + 1 AS `next_after_roster`
          FROM `employee`
         WHERE `employeeCode` REGEXP '^[0-9]+$'
       ) m
   SET s.`next_value` = GREATEST(s.`next_value`, m.`next_after_roster`),
       s.`updated_at` = NOW(3);

-- 5 ── make the single-row rule structural ──────────────────────────────────
DROP PROCEDURE IF EXISTS `_add_044_unique_format_key`;
CREATE PROCEDURE `_add_044_unique_format_key`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'employee_id_sequence'
                    AND INDEX_NAME = 'employee_id_sequence_format_key_uq') THEN
    ALTER TABLE `employee_id_sequence`
      ADD UNIQUE KEY `employee_id_sequence_format_key_uq` (`format_key`);
  END IF;
END;
CALL `_add_044_unique_format_key`();
DROP PROCEDURE `_add_044_unique_format_key`;

-- 6 ── integrity assertions ─────────────────────────────────────────────────
SELECT COUNT(*) AS `sequence_rows_expect_one` FROM `employee_id_sequence`;
SELECT `id`, `format_key`, `prefix`, `padding`, `next_value`, `sample_format` FROM `employee_id_sequence`;
SELECT COUNT(*) AS `codes_violating_digits_check_expect_zero` FROM `employee`
 WHERE NOT (`employeeCode` REGEXP '^[0-9]{1,30}$');

-- ===========================================================================
-- ROLLBACK
--   Restore the counters that step 1 preserved:
--     INSERT INTO `employee_id_sequence`
--       (`id`, `format_key`, `prefix`, `padding`, `next_value`, `sample_format`, `updated_at`)
--     SELECT `sequence_id`, `format_key`, `prefix`, `padding`, `next_value`, `sample_format`,
--            `original_updated_at`
--       FROM `employee_id_sequence_backup_043`
--     ON DUPLICATE KEY UPDATE `next_value` = VALUES(`next_value`);
--   And drop the structural guard:
--     ALTER TABLE `employee_id_sequence` DROP INDEX `employee_id_sequence_format_key_uq`;
-- ===========================================================================
