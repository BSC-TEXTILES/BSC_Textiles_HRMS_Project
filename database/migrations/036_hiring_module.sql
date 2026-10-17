-- ===========================================================================
-- 036_hiring_module.sql — Candidate Hiring: control-plane schema (control DB)
-- ===========================================================================
-- Design:
--   * Control DB (this database) owns the hiring STRUCTURE: folders, forms,
--     immutable form versions (schema JSON), reusable templates, shareable
--     links + link analytics, global settings and the cross-shard outbox.
--   * Candidate DATA (candidates, applications, answers, notes, timeline,
--     interviews, documents) lives in per-location shard databases:
--     database/shards/hiring_shard_schema.sql.
--   * HQ shard is this same database, so the shard schema is applied here too.
--   * IDs are VARCHAR(191) application-generated strings (cuid-style), matching
--     the rest of the schema. Analytics/outbox tables use BIGINT AUTO_INCREMENT
--     because they are append-only and high volume.
-- Idempotent: CREATE TABLE IF NOT EXISTS / INSERT ... ON DUPLICATE KEY UPDATE,
--   ADD COLUMN statements rely on the migration runner tolerating ER_DUP_FIELDNAME.
-- ===========================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 1. Folders — group forms (e.g. "Belagavi Store", "Warehouse", "Seasonal").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hiring_folder` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL,
  `description` VARCHAR(400) NULL,
  `color` VARCHAR(24) NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdById` VARCHAR(191) NULL,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `idx_hiring_folder_sort` (`sortOrder`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Forms — one form = one job opening + its public application page.
--    `publicToken` is the long opaque token used for the direct public URL.
--    Hiring-relevant location selection: `locationIds` (JSON array) lists the
--    locations the form targets; `allowOtherLocations` lets a candidate pick
--    any active location beyond that list.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hiring_form` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `publicToken` VARCHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `jobTitle` VARCHAR(200) NULL,
  `jobDescription` TEXT NULL,
  `employmentType` ENUM('FULL_TIME','PART_TIME','CONTRACT','INTERN','APPRENTICE') NOT NULL DEFAULT 'FULL_TIME',
  `experienceLevel` VARCHAR(64) NULL,
  `qualification` VARCHAR(200) NULL,
  `salaryMin` DECIMAL(12,2) NULL,
  `salaryMax` DECIMAL(12,2) NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'INR',
  `openings` INT NOT NULL DEFAULT 1,
  `locationIds` JSON NOT NULL,
  `allowOtherLocations` TINYINT(1) NOT NULL DEFAULT 0,
  `shiftDetails` VARCHAR(200) NULL,
  `openAt` DATETIME NULL,
  `closeAt` DATETIME NULL,
  `status` ENUM('DRAFT','PUBLISHED','CLOSED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `folderId` VARCHAR(191) NULL,
  `currentVersionId` VARCHAR(191) NULL,
  `templateKey` VARCHAR(96) NULL,
  `ownerId` VARCHAR(191) NULL,
  `settings` JSON NULL,
  `publishedAt` DATETIME(3) NULL,
  `closedAt` DATETIME(3) NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,
  UNIQUE KEY `uq_hiring_form_token` (`publicToken`),
  KEY `idx_hiring_form_status` (`status`, `closeAt`),
  KEY `idx_hiring_form_folder` (`folderId`),
  KEY `idx_hiring_form_owner` (`ownerId`),
  KEY `idx_hiring_form_template` (`templateKey`),
  CONSTRAINT `fk_hiring_form_folder` FOREIGN KEY (`folderId`) REFERENCES `hiring_folder` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Form versions — immutable schema snapshots. Every publish writes a new
--    version so already-submitted applications remain interpretable against
--    the exact schema the candidate saw. `schema` carries steps/fields:
--    {"steps":[{"key","title","description","fields":[{key,type,label,
--    required,width,placeholder,helpText,options,validation,conditional,
--    defaultValue}]}]}
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hiring_form_version` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `formId` VARCHAR(191) NOT NULL,
  `version` INT NOT NULL,
  `schema` JSON NOT NULL,
  `changelog` VARCHAR(500) NULL,
  `isDraft` TINYINT(1) NOT NULL DEFAULT 1,
  `publishedAt` DATETIME(3) NULL,
  `publishedById` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_hiring_form_version` (`formId`, `version`),
  CONSTRAINT `fk_hiring_version_form` FOREIGN KEY (`formId`) REFERENCES `hiring_form` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. Templates — reusable starting points. System templates are seeded below;
--    HR can save any form as a custom template (isSystem = 0).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hiring_template` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `slug` VARCHAR(120) NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` VARCHAR(400) NULL,
  `category` VARCHAR(80) NULL,
  `isSystem` TINYINT(1) NOT NULL DEFAULT 0,
  `schema` JSON NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdById` VARCHAR(191) NULL,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_hiring_template_slug` (`slug`),
  KEY `idx_hiring_template_category` (`category`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. Links — shareable short links per form. A link may be pinned to one
--    location (QR in that store) or location-agnostic (candidate picks).
--    Counters are denormalised; hiring_link_event holds the raw stream.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hiring_link` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `formId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(24) NOT NULL,
  `label` VARCHAR(160) NULL,
  `locationId` VARCHAR(191) NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `allowApplications` TINYINT(1) NOT NULL DEFAULT 1,
  `expiresAt` DATETIME NULL,
  `maxApplications` INT NULL,
  `viewCount` INT NOT NULL DEFAULT 0,
  `startCount` INT NOT NULL DEFAULT 0,
  `submissions` INT NOT NULL DEFAULT 0,
  `lastActivityAt` DATETIME(3) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_hiring_link_code` (`code`),
  KEY `idx_hiring_link_form` (`formId`),
  KEY `idx_hiring_link_location` (`locationId`, `enabled`),
  CONSTRAINT `fk_hiring_link_form` FOREIGN KEY (`formId`) REFERENCES `hiring_form` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. Link analytics events — append-only. Never stored: raw IP or PII; only
--    salted hashes for unique-visitor counting.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hiring_link_event` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `formId` VARCHAR(191) NOT NULL,
  `linkId` VARCHAR(191) NULL,
  `locationId` VARCHAR(191) NULL,
  `eventType` ENUM('VIEW','START','SUBMIT','WITHDRAW') NOT NULL,
  `sessionId` VARCHAR(64) NULL,
  `visitorHash` CHAR(64) NULL,
  `source` VARCHAR(64) NULL,
  `applicationId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_link_event_form` (`formId`, `eventType`, `createdAt`),
  KEY `idx_link_event_link` (`linkId`, `createdAt`),
  KEY `idx_link_event_daily` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. Hiring settings — singleton key/JSON rows (consent text, retention days,
--    captcha toggle, branding, notification defaults).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hiring_settings` (
  `key` VARCHAR(96) NOT NULL PRIMARY KEY,
  `value` JSON NOT NULL,
  `updatedById` VARCHAR(191) NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. Cross-shard outbox — guarantees at-least-once delivery of side effects
--    that cross the control/shard boundary (analytics rollups, notification
--    fan-out, denormalised counters). Workers poll PENDING/Failed-retry rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hiring_outbox` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `eventType` VARCHAR(64) NOT NULL,
  `aggregateType` VARCHAR(48) NULL,
  `aggregateId` VARCHAR(191) NULL,
  `targetShard` VARCHAR(64) NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING','PROCESSING','DONE','FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INT NOT NULL DEFAULT 0,
  `maxAttempts` INT NOT NULL DEFAULT 5,
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,
  `lastError` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `idx_hiring_outbox_ready` (`status`, `availableAt`),
  KEY `idx_hiring_outbox_aggregate` (`aggregateType`, `aggregateId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. Location hiring columns — enable/disable hiring per location, control the
--    order shown in the public location picker, and assign the HR team that
--    receives new-application notifications for that location.
-- ---------------------------------------------------------------------------
ALTER TABLE `location`
  ADD COLUMN `hiringEnabled` TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `hiringSortOrder` INT NOT NULL DEFAULT 0,
  ADD COLUMN `hiringTeamUserIds` JSON NULL;

-- ---------------------------------------------------------------------------
-- 10. Access control — RECRUITMENT module already exists (migration 014/030).
--     HR + SUPER_ADMIN already hold full grants; add the spec roles:
--       ADMIN          : full hiring administration
--       STORE_MANAGER  : Hiring Manager for their store (manage pipeline, no
--                        delete/edit of form structure)
--       FLOOR_MANAGER  : read-only visibility of hiring in their store
-- ---------------------------------------------------------------------------
INSERT INTO `rolepermission` (`id`, `roleId`, `module`, `accessLevel`, `enabled`,
  `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`) VALUES
  ('rp_admin_recruitment', 'role_admin',         'RECRUITMENT', 'edit', 1, 1, 1, 1, 1, 1, 1, 1),
  ('rp_sm_recruitment',    'role_store_manager', 'RECRUITMENT', 'edit', 1, 1, 1, 0, 1, 0, 1, 1),
  ('rp_fm_recruitment',    'role_floor_manager', 'RECRUITMENT', 'view', 1, 1, 0, 0, 0, 0, 0, 0)
ON DUPLICATE KEY UPDATE `accessLevel` = VALUES(`accessLevel`), `enabled` = VALUES(`enabled`),
  `can_view` = VALUES(`can_view`), `can_create` = VALUES(`can_create`), `can_edit` = VALUES(`can_edit`),
  `can_update` = VALUES(`can_update`), `can_delete` = VALUES(`can_delete`), `can_export` = VALUES(`can_export`),
  `can_approve` = VALUES(`can_approve`);

-- ---------------------------------------------------------------------------
-- 11. Default settings.
-- ---------------------------------------------------------------------------
INSERT INTO `hiring_settings` (`key`, `value`) VALUES
  ('hiring.general', JSON_OBJECT(
     'consentText', 'I agree to the collection and processing of my personal information for recruitment purposes.',
     'retentionDays', 365,
     'requireCaptcha', TRUE,
     'maxSubmissionsPerPhonePerDay', 5,
     'autoRejectDuplicateWindowDays', 30)),
  ('hiring.branding', JSON_OBJECT(
     'companyName', 'BSC Textiles',
     'primaryColor', '#0f766e',
     'supportEmail', 'hr@bsctextiles.com',
     'supportPhone', '',
     'privacyPolicyUrl', '')),
  ('hiring.notifications', JSON_OBJECT(
     'notifyOnNewApplication', TRUE,
     'notifyOnStageChange', FALSE,
     'notifyLocationTeam', TRUE))
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- ---------------------------------------------------------------------------
-- 12. System templates. Slugs are stable identifiers; schemas are the same
--     shape as hiring_form_version.schema. Apostrophes are avoided in seed
--     text on purpose (migration runner string handling).
-- ---------------------------------------------------------------------------
INSERT INTO `hiring_template` (`id`, `slug`, `name`, `description`, `category`, `isSystem`, `sortOrder`, `schema`) VALUES
  ('htpl_general_application', 'GENERAL_APPLICATION', 'General Application',
   'Baseline application for any role: contact details, experience, resume and consent.',
   'GENERAL', 1, 10,
   '{"steps":[{"key":"personal","title":"Personal Details","fields":[{"key":"fullName","type":"TEXT","label":"Full Name","required":true,"width":"half","validation":{"minLength":2,"maxLength":120}},{"key":"phone","type":"PHONE","label":"Mobile Number","required":true,"width":"half"},{"key":"email","type":"EMAIL","label":"Email","required":false,"width":"half"},{"key":"city","type":"TEXT","label":"Current City","required":true,"width":"half"},{"key":"positionApplied","type":"TEXT","label":"Position Applied For","required":true,"width":"half"},{"key":"experienceYears","type":"NUMBER","label":"Total Experience in years","required":true,"width":"half","validation":{"min":0,"max":50}},{"key":"resume","type":"FILE","label":"Resume","required":true,"width":"full","validation":{"accept":["pdf","doc","docx"],"maxSizeMB":5}},{"key":"consent","type":"CHECKBOX","label":"I agree to the processing of my personal data for recruitment","required":true,"width":"full"}]}]}'),
  ('htpl_retail_store_staff', 'RETAIL_STORE_STAFF', 'Retail Store Staff',
   'For sales associates and store floor roles: address, retail experience, shift preference, photo and resume.',
   'RETAIL', 1, 20,
   '{"steps":[{"key":"personal","title":"Personal Details","fields":[{"key":"fullName","type":"TEXT","label":"Full Name","required":true,"width":"half","validation":{"minLength":2,"maxLength":120}},{"key":"phone","type":"PHONE","label":"Mobile Number","required":true,"width":"half"},{"key":"email","type":"EMAIL","label":"Email","required":false,"width":"half"},{"key":"dob","type":"DATE","label":"Date of Birth","required":false,"width":"half","validation":{"maxDate":"today","minAge":16}},{"key":"gender","type":"SELECT","label":"Gender","required":false,"width":"half","options":[{"value":"MALE","label":"Male"},{"value":"FEMALE","label":"Female"},{"value":"OTHER","label":"Other"},{"value":"PREFER_NOT_TO_SAY","label":"Prefer not to say"}]},{"key":"city","type":"TEXT","label":"City or Town","required":true,"width":"half"},{"key":"pincode","type":"TEXT","label":"PIN Code","required":false,"width":"half","validation":{"pattern":"pincode"}}]},{"key":"experience","title":"Experience","fields":[{"key":"retailExperienceYears","type":"NUMBER","label":"Retail Experience in years","required":true,"width":"half","validation":{"min":0,"max":40}},{"key":"lastEmployer","type":"TEXT","label":"Last Employer","required":false,"width":"half"},{"key":"shiftPreference","type":"MULTISELECT","label":"Preferred Shifts","required":false,"width":"full","options":[{"value":"MORNING","label":"Morning"},{"value":"EVENING","label":"Evening"},{"value":"FULL_DAY","label":"Full Day"},{"value":"FLEXIBLE","label":"Flexible"}]},{"key":"expectedSalary","type":"CURRENCY","label":"Expected Monthly Salary","required":false,"width":"half"}]},{"key":"documents","title":"Documents","fields":[{"key":"photo","type":"PHOTO","label":"Passport Size Photo","required":true,"width":"half","validation":{"accept":["jpg","jpeg","png"],"maxSizeMB":2}},{"key":"resume","type":"FILE","label":"Resume","required":false,"width":"half","validation":{"accept":["pdf","doc","docx"],"maxSizeMB":5}},{"key":"consent","type":"CHECKBOX","label":"I agree to the processing of my personal data for recruitment","required":true,"width":"full"}]}]}'),
  ('htpl_production_tailor', 'PRODUCTION_TAILOR', 'Production / Tailoring',
   'For production and tailoring roles: machine skills, experience level, ID proof and documents.',
   'PRODUCTION', 1, 30,
   '{"steps":[{"key":"personal","title":"Personal Details","fields":[{"key":"fullName","type":"TEXT","label":"Full Name","required":true,"width":"half","validation":{"minLength":2,"maxLength":120}},{"key":"phone","type":"PHONE","label":"Mobile Number","required":true,"width":"half"},{"key":"dob","type":"DATE","label":"Date of Birth","required":false,"width":"half","validation":{"minAge":18}},{"key":"gender","type":"SELECT","label":"Gender","required":false,"width":"half","options":[{"value":"MALE","label":"Male"},{"value":"FEMALE","label":"Female"},{"value":"OTHER","label":"Other"},{"value":"PREFER_NOT_TO_SAY","label":"Prefer not to say"}]},{"key":"educationLevel","type":"SELECT","label":"Education Level","required":true,"width":"half","options":[{"value":"NONE","label":"No formal education"},{"value":"PRIMARY","label":"Primary school"},{"value":"SECONDARY","label":"Secondary school"},{"value":"PUC","label":"PUC or 12th"},{"value":"ITI","label":"ITI or Diploma"},{"value":"GRADUATE","label":"Graduate"}]}]},{"key":"skills","title":"Skills and Experience","fields":[{"key":"machineTypes","type":"MULTISELECT","label":"Machines Operated","required":true,"width":"full","options":[{"value":"SINGLE_NEEDLE","label":"Single Needle"},{"value":"OVERLOCK","label":"Overlock"},{"value":"FLATLOCK","label":"Flatlock"},{"value":"KANSAI","label":"Kansai"},{"value":"BUTTON_ATTACH","label":"Button Attach"},{"value":"BUTTONHOLE","label":"Buttonhole"}]},{"key":"experienceYears","type":"NUMBER","label":"Experience in years","required":true,"width":"half","validation":{"min":0,"max":50}},{"key":"fusingKnowledge","type":"YES_NO","label":"Do you know fusing and pressing","required":false,"width":"half"}]},{"key":"documents","title":"Documents","fields":[{"key":"photo","type":"PHOTO","label":"Passport Size Photo","required":false,"width":"half","validation":{"accept":["jpg","jpeg","png"],"maxSizeMB":2}},{"key":"aadhaarNumber","type":"AADHAAR","label":"Aadhaar Number","required":false,"width":"half"},{"key":"resume","type":"FILE","label":"Resume or Work Proof","required":false,"width":"full","validation":{"accept":["pdf","doc","docx","jpg","jpeg","png"],"maxSizeMB":5}},{"key":"consent","type":"CHECKBOX","label":"I agree to the processing of my personal data for recruitment","required":true,"width":"full"}]}]}')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `description` = VALUES(`description`), `category` = VALUES(`category`),
  `isSystem` = VALUES(`isSystem`), `schema` = VALUES(`schema`), `sortOrder` = VALUES(`sortOrder`);
