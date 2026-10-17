-- ===========================================================================
-- 031: DASHBOARD WIDGETS FOR THE EXECUTIVE DASHBOARD SECTIONS
--
-- Migration 030 registered the role/permission model's widgets but not the
-- sections that actually exist on /dashboard, so "control which dashboard
-- sections are visible per role" had nothing to control. This adds them and
-- seeds the defaults that match today's behaviour, so no existing user loses
-- a card they can see right now.
--
-- Additive only: no row is deleted, no column is dropped.
-- ===========================================================================

INSERT INTO `dashboard_widget` (`id`, `key`, `label`, `description`, `moduleKey`, `area`, `sortOrder`) VALUES
  ('dw_executive_kpi',   'EXECUTIVE_KPI',   'Executive KPI Strip',       'Headline attendance and workforce metrics',   'DASHBOARD',        'OVERVIEW', 5),
  ('dw_holiday_calendar','HOLIDAY_CALENDAR','Holiday & Statutory Calendar','Company holidays and weekly-off calendar',  'STATUTORY_MUSTER', 'OVERVIEW', 6),
  ('dw_store_hubs',      'STORE_HUBS',      'Karnataka Store Hubs',      'Per-hub live floor monitor and CRUD',         'STORES',           'OVERVIEW', 7),
  ('dw_punch_ledger',    'PUNCH_LEDGER',    'Live Biometric Punch Ledger','Recent terminal punches across the estate',   'ATTENDANCE',       'OVERVIEW', 8)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `description` = VALUES(`description`),
                        `moduleKey` = VALUES(`moduleKey`), `area` = VALUES(`area`), `sortOrder` = VALUES(`sortOrder`);

-- Everyone keeps the calendar: it is company-wide information.
INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`)
SELECT CONCAT('rw31_', r.`id`, '_cal'), r.`id`, 'dw_holiday_calendar', 1 FROM `role` r
ON DUPLICATE KEY UPDATE `visible` = VALUES(`visible`);

-- Workforce-visible sections: HR, Floor Manager and Admin. Employee self-service
-- keeps only its own cards (already seeded in 030), which is the point of the
-- per-role dashboard.
INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`)
SELECT CONCAT('rw31_', r.`id`, '_', w.`id`), r.`id`, w.`id`, 1
  FROM `role` r
  JOIN `dashboard_widget` w ON w.`id` IN ('dw_executive_kpi', 'dw_punch_ledger')
 WHERE r.`id` IN ('role_hr', 'role_floor_manager', 'role_admin');

INSERT INTO `role_widget` (`id`, `roleId`, `widgetId`, `visible`)
SELECT CONCAT('rw31_', r.`id`, '_hub'), r.`id`, 'dw_store_hubs', 1
  FROM `role` r WHERE r.`id` IN ('role_hr', 'role_admin');
