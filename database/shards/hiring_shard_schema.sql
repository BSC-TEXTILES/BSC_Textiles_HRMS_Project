-- ===========================================================================
-- hiring_shard_schema.sql — Candidate Hiring: data-plane schema (per shard DB)
-- ===========================================================================
-- Applied to every shard database: bsc_shard_<code> for each location and the
-- control database itself (the HQ shard). No foreign keys cross databases:
-- `formId`, `linkId`, `locationId`, `ownerId` are soft references to control
-- DB rows, resolved by the application layer.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS only. Re-applying after future
-- releases is safe. New columns in later releases must be added with
-- ALTER TABLE ... ADD COLUMN and are tolerated by the provisioning service.
--
-- PII rules enforced by the application layer (see hiringValidators.ts):
--   * Aadhaar / PAN are stored ONLY as AES-256-GCM ciphertext + last-4 +
--     HMAC-SHA256 hash (for duplicate detection). Plaintext never hits disk.
--   * ipHash / visitorHash are salted SHA-256. Raw IP is never stored.
--   * Uploaded files live outside the DB; rows keep opaque storage keys.
-- ===========================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 1. Candidates — one row per person per shard (location cluster). Reapplying
--    for another form in the same location reuses the row and increments
--    application counters. Cross-shard identity is matched by phoneHash/email
--    at the service layer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `candidate` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `fullName` VARCHAR(160) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `phoneDigits` VARCHAR(15) NOT NULL,
  `phoneHash` CHAR(64) NOT NULL,
  `alternatePhone` VARCHAR(20) NULL,
  `email` VARCHAR(190) NULL,
  `emailNormalized` VARCHAR(190) NULL,
  `dob` DATE NULL,
  `gender` ENUM('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY') NULL,
  `addressLine1` VARCHAR(255) NULL,
  `addressLine2` VARCHAR(255) NULL,
  `city` VARCHAR(120) NULL,
  `state` VARCHAR(120) NULL,
  `pincode` VARCHAR(10) NULL,
  `aadhaarEncrypted` TEXT NULL,
  `aadhaarLast4` VARCHAR(4) NULL,
  `aadhaarHash` CHAR(64) NULL,
  `panEncrypted` TEXT NULL,
  `panLast4` VARCHAR(4) NULL,
  `panHash` CHAR(64) NULL,
  `photoKey` VARCHAR(255) NULL,
  `resumeKey` VARCHAR(255) NULL,
  `resumeName` VARCHAR(255) NULL,
  `source` VARCHAR(64) NULL,
  `tags` JSON NULL,
  `applicationCount` INT NOT NULL DEFAULT 0,
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastAppliedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_candidate_phone_digits` (`phoneDigits`),
  KEY `idx_candidate_phone_hash` (`phoneHash`),
  KEY `idx_candidate_email` (`emailNormalized`),
  KEY `idx_candidate_aadhaar` (`aadhaarHash`),
  KEY `idx_candidate_pan` (`panHash`),
  KEY `idx_candidate_name` (`fullName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Applications — one row per form submission. Carries the denormalised
--    pipeline fields (stage, rating, starred) so the Kanban and table views
--    never need to join answers. `summary` JSON mirrors the key answers for
--    list rendering without reading application_answer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `application` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `candidateId` VARCHAR(191) NOT NULL,
  `formId` VARCHAR(191) NOT NULL,
  `formVersionId` VARCHAR(191) NOT NULL,
  `formVersion` INT NOT NULL,
  `linkId` VARCHAR(191) NULL,
  `locationId` VARCHAR(191) NOT NULL,
  `locationCode` VARCHAR(16) NULL,
  `jobTitle` VARCHAR(200) NULL,
  `stage` ENUM('NEW','SCREENING','SHORTLISTED','INTERVIEW_SCHEDULED','INTERVIEWED','SELECTED','OFFERED','OFFER_ACCEPTED','HIRED','ON_HOLD','REJECTED','WITHDRAWN') NOT NULL DEFAULT 'NEW',
  `stageChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `previousStage` VARCHAR(32) NULL,
  `rejectionReason` VARCHAR(255) NULL,
  `rating` TINYINT NULL,
  `starred` TINYINT(1) NOT NULL DEFAULT 0,
  `expectedSalary` DECIMAL(12,2) NULL,
  `availableFrom` DATE NULL,
  `consentGiven` TINYINT(1) NOT NULL DEFAULT 0,
  `consentAt` DATETIME(3) NULL,
  `consentTextVersion` VARCHAR(32) NULL,
  `source` VARCHAR(64) NULL,
  `visitorHash` CHAR(64) NULL,
  `ipHash` CHAR(64) NULL,
  `userAgent` VARCHAR(255) NULL,
  `duplicateOfApplicationId` VARCHAR(191) NULL,
  `summary` JSON NULL,
  `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,
  KEY `idx_application_candidate` (`candidateId`),
  KEY `idx_application_form` (`formId`, `stage`),
  KEY `idx_application_location` (`locationId`, `appliedAt`),
  KEY `idx_application_stage` (`stage`, `appliedAt`),
  KEY `idx_application_applied` (`appliedAt`),
  KEY `idx_application_starred` (`starred`, `appliedAt`),
  CONSTRAINT `fk_application_candidate` FOREIGN KEY (`candidateId`) REFERENCES `candidate` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Answers — typed key/value store for every submitted field. Values are
--    split by type so filters and exports stay fast (e.g. numeric range on
--    expected salary, date windows). `sectionIndex` supports repeating groups.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `application_answer` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `applicationId` VARCHAR(191) NOT NULL,
  `fieldKey` VARCHAR(96) NOT NULL,
  `fieldLabel` VARCHAR(200) NULL,
  `fieldType` VARCHAR(32) NOT NULL,
  `sectionIndex` INT NOT NULL DEFAULT 0,
  `valueText` TEXT NULL,
  `valueNumber` DECIMAL(18,4) NULL,
  `valueDate` DATE NULL,
  `valueBool` TINYINT(1) NULL,
  `valueJson` JSON NULL,
  `fileKey` VARCHAR(255) NULL,
  `fileName` VARCHAR(255) NULL,
  `fileMime` VARCHAR(120) NULL,
  `fileSize` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_answer_field` (`applicationId`, `fieldKey`, `sectionIndex`),
  KEY `idx_answer_field_text` (`fieldKey`, `valueText`(64)),
  KEY `idx_answer_field_number` (`fieldKey`, `valueNumber`),
  KEY `idx_answer_field_date` (`fieldKey`, `valueDate`),
  CONSTRAINT `fk_answer_application` FOREIGN KEY (`applicationId`) REFERENCES `application` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. HR notes / comments on an application.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `application_note` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `applicationId` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NULL,
  `authorName` VARCHAR(160) NULL,
  `body` TEXT NOT NULL,
  `isInternal` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,
  KEY `idx_note_application` (`applicationId`, `createdAt`),
  CONSTRAINT `fk_note_application` FOREIGN KEY (`applicationId`) REFERENCES `application` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. Timeline — immutable event log per application (applied, stage moves,
--    notes, interviews, offers). Powers the candidate activity drawer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `application_timeline` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `applicationId` VARCHAR(191) NOT NULL,
  `type` ENUM('APPLIED','STAGE_CHANGED','STATUS_CHANGED','RATING_CHANGED','STAR_CHANGED','NOTE_ADDED','INTERVIEW_SCHEDULED','INTERVIEW_RESCHEDULED','INTERVIEW_CANCELLED','INTERVIEW_COMPLETED','OFFER_SENT','OFFER_ACCEPTED','OFFER_DECLINED','HIRED','REJECTED','DOCUMENT_UPLOADED','DUPLICATE_FLAGGED','EXPORTED') NOT NULL,
  `fromStage` VARCHAR(32) NULL,
  `toStage` VARCHAR(32) NULL,
  `title` VARCHAR(200) NULL,
  `body` TEXT NULL,
  `metadata` JSON NULL,
  `actorId` VARCHAR(191) NULL,
  `actorName` VARCHAR(160) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_timeline_application` (`applicationId`, `createdAt`),
  CONSTRAINT `fk_timeline_application` FOREIGN KEY (`applicationId`) REFERENCES `application` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. Interviews — scheduling, interviewers, feedback and outcome.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `interview` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `applicationId` VARCHAR(191) NOT NULL,
  `round` VARCHAR(64) NOT NULL DEFAULT 'INTERVIEW_1',
  `scheduledAt` DATETIME NOT NULL,
  `durationMins` INT NOT NULL DEFAULT 30,
  `mode` ENUM('IN_PERSON','PHONE','VIDEO') NOT NULL DEFAULT 'IN_PERSON',
  `locationId` VARCHAR(191) NULL,
  `venue` VARCHAR(255) NULL,
  `meetingLink` VARCHAR(500) NULL,
  `interviewerIds` JSON NULL,
  `interviewerNames` JSON NULL,
  `status` ENUM('SCHEDULED','RESCHEDULED','COMPLETED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
  `feedback` TEXT NULL,
  `rating` TINYINT NULL,
  `recommendation` ENUM('STRONG_YES','YES','MAYBE','NO','STRONG_NO') NULL,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `idx_interview_application` (`applicationId`, `scheduledAt`),
  KEY `idx_interview_schedule` (`scheduledAt`, `status`),
  KEY `idx_interview_location` (`locationId`, `scheduledAt`),
  CONSTRAINT `fk_interview_application` FOREIGN KEY (`applicationId`) REFERENCES `application` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. Documents — uploaded files attached to an application (resume copy from
--    form fields, Aadhaar/PAN proof, certificates). Storage key is opaque.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `application_document` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `applicationId` VARCHAR(191) NOT NULL,
  `candidateId` VARCHAR(191) NULL,
  `docType` ENUM('RESUME','AADHAAR','PAN','PHOTO','CERTIFICATE','OTHER') NOT NULL DEFAULT 'OTHER',
  `storageKey` VARCHAR(255) NOT NULL,
  `fileName` VARCHAR(255) NULL,
  `mimeType` VARCHAR(120) NULL,
  `sizeBytes` INT NULL,
  `checksum` CHAR(64) NULL,
  `verified` TINYINT(1) NOT NULL DEFAULT 0,
  `verifiedById` VARCHAR(191) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_document_application` (`applicationId`, `docType`),
  KEY `idx_document_candidate` (`candidateId`),
  CONSTRAINT `fk_document_application` FOREIGN KEY (`applicationId`) REFERENCES `application` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
