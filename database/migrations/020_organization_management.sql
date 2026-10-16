-- ===========================================================================
-- 020: ORGANIZATION MANAGEMENT MODULE
--
-- Introduces the pending-change / approval layer on top of the existing
-- organizational topology tables (location, floor, department, section,
-- sellingpoint) and the existing employee allocation columns.
--
-- Design rules enforced by this migration:
--   1. Approved operational records stay in the existing topology tables.
--   2. Proposed changes live ONLY in orgchangerequest (pending) until the
--      backend applies them after every mandatory approval stage completes.
--   3. Historical decisions live in orgapprovaldecision, applied allocation
--      history lives in employeeassignmenthistory. Both are append-only.
--   4. Routing / policy configuration lives in orgsettings (JSON values).
--
-- Existing employee, payroll, attendance and authentication data is untouched.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Organization change requests (pending proposed changes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orgchangerequest` (
  `id` varchar(191) NOT NULL,
  `requestCode` varchar(64) NOT NULL,
  `requestType` enum(
    'LOCATION','FLOOR','DEPARTMENT','SECTION','WORK_AREA',
    'EMPLOYEE_ALLOCATION','EMPLOYEE_TRANSFER','MANAGER_ASSIGNMENT','ADMIN_ACCOUNT'
  ) NOT NULL,
  `action` enum('CREATE','UPDATE','DEACTIVATE','ACTIVATE','ASSIGN','TRANSFER','REASSIGN','PROVISION') NOT NULL,
  `title` varchar(191) NOT NULL,
  `reason` text NOT NULL,
  `locationId` varchar(191) DEFAULT NULL,
  `floorId` varchar(191) DEFAULT NULL,
  `departmentId` varchar(191) DEFAULT NULL,
  `sectionId` varchar(191) DEFAULT NULL,
  `workAreaId` varchar(191) DEFAULT NULL,
  `employeeId` varchar(191) DEFAULT NULL,
  `effectiveDate` date DEFAULT NULL,
  `payload` json NOT NULL,
  `existingSnapshot` json DEFAULT NULL,
  `status` enum('DRAFT','PENDING','CHANGES_REQUESTED','REJECTED','APPLIED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `currentStage` enum('NONE','LOCATION_MANAGER','FLOOR_MANAGER','DEPARTMENT_MANAGER','HR','COMPLETED') NOT NULL DEFAULT 'NONE',
  `requestedById` varchar(191) NOT NULL,
  `submittedAt` datetime(3) DEFAULT NULL,
  `managerReviewerId` varchar(191) DEFAULT NULL,
  `managerReviewedAt` datetime(3) DEFAULT NULL,
  `managerRemarks` text,
  `hrReviewerId` varchar(191) DEFAULT NULL,
  `hrReviewedAt` datetime(3) DEFAULT NULL,
  `hrRemarks` text,
  `appliedAt` datetime(3) DEFAULT NULL,
  `appliedById` varchar(191) DEFAULT NULL,
  `applyError` text,
  `isEmergencyOverride` tinyint(1) NOT NULL DEFAULT '0',
  `overrideJustification` text,
  `overrideById` varchar(191) DEFAULT NULL,
  `overrideAt` datetime(3) DEFAULT NULL,
  `dedupKey` varchar(64) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `OrgChangeRequest_requestCode_key` (`requestCode`),
  UNIQUE KEY `OrgChangeRequest_dedupKey_key` (`dedupKey`),
  KEY `OrgChangeRequest_status_stage_idx` (`status`, `currentStage`),
  KEY `OrgChangeRequest_locationId_idx` (`locationId`),
  KEY `OrgChangeRequest_requestType_idx` (`requestType`),
  KEY `OrgChangeRequest_requestedById_idx` (`requestedById`),
  KEY `OrgChangeRequest_submittedAt_idx` (`submittedAt`),
  KEY `OrgChangeRequest_employeeId_fkey` (`employeeId`),
  KEY `OrgChangeRequest_floorId_fkey` (`floorId`),
  KEY `OrgChangeRequest_departmentId_fkey` (`departmentId`),
  KEY `OrgChangeRequest_sectionId_fkey` (`sectionId`),
  CONSTRAINT `OrgChangeRequest_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `OrgChangeRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `OrgChangeRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Approval stages & decisions (append-only audit of every review step)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orgapprovaldecision` (
  `id` varchar(191) NOT NULL,
  `changeRequestId` varchar(191) NOT NULL,
  `stageSequence` int NOT NULL DEFAULT '1',
  `stageName` enum('LOCATION_MANAGER','FLOOR_MANAGER','DEPARTMENT_MANAGER','HR','EMERGENCY_OVERRIDE') NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  `reviewerId` varchar(191) DEFAULT NULL,
  `reviewerRole` varchar(64) DEFAULT NULL,
  `remarks` text,
  `decidedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `OrgApprovalDecision_request_stage_key` (`changeRequestId`, `stageSequence`),
  KEY `OrgApprovalDecision_status_idx` (`status`),
  KEY `OrgApprovalDecision_reviewerId_idx` (`reviewerId`),
  CONSTRAINT `OrgApprovalDecision_changeRequestId_fkey` FOREIGN KEY (`changeRequestId`) REFERENCES `orgchangerequest` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `OrgApprovalDecision_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Employee allocation history (preserves every approved assignment/transfer)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employeeassignmenthistory` (
  `id` varchar(191) NOT NULL,
  `employeeId` varchar(191) NOT NULL,
  `changeRequestId` varchar(191) DEFAULT NULL,
  `changeType` enum('INITIAL','TRANSFER','REASSIGN','WORK_AREA_CHANGE','MANAGER_CHANGE') NOT NULL DEFAULT 'REASSIGN',
  `locationId` varchar(191) DEFAULT NULL,
  `floorId` varchar(191) DEFAULT NULL,
  `departmentId` varchar(191) DEFAULT NULL,
  `sectionId` varchar(191) DEFAULT NULL,
  `sellingPointId` varchar(191) DEFAULT NULL,
  `reportingManagerId` varchar(191) DEFAULT NULL,
  `previousLocationId` varchar(191) DEFAULT NULL,
  `previousFloorId` varchar(191) DEFAULT NULL,
  `previousDepartmentId` varchar(191) DEFAULT NULL,
  `previousSectionId` varchar(191) DEFAULT NULL,
  `previousSellingPointId` varchar(191) DEFAULT NULL,
  `previousReportingManagerId` varchar(191) DEFAULT NULL,
  `isCurrent` tinyint(1) NOT NULL DEFAULT '1',
  `effectiveFrom` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `effectiveTo` datetime(3) DEFAULT NULL,
  `remarks` text,
  `changedById` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `EmployeeAssignmentHistory_employee_current_idx` (`employeeId`, `isCurrent`),
  KEY `EmployeeAssignmentHistory_locationId_idx` (`locationId`),
  KEY `EmployeeAssignmentHistory_departmentId_idx` (`departmentId`),
  KEY `EmployeeAssignmentHistory_sectionId_idx` (`sectionId`),
  KEY `EmployeeAssignmentHistory_changeRequestId_idx` (`changeRequestId`),
  CONSTRAINT `EmployeeAssignmentHistory_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EmployeeAssignmentHistory_changeRequestId_fkey` FOREIGN KEY (`changeRequestId`) REFERENCES `orgchangerequest` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. Organization settings (approval routing policy, override switch, live sync)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orgsettings` (
  `key` varchar(191) NOT NULL,
  `value` json NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `updatedById` varchar(191) DEFAULT NULL,
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `orgsettings` (`key`, `value`, `description`) VALUES
  ('approvalPolicy', JSON_OBJECT(
     'requirePreliminary', JSON_OBJECT(
       'LOCATION', TRUE, 'FLOOR', TRUE, 'DEPARTMENT', TRUE, 'SECTION', TRUE,
       'WORK_AREA', TRUE, 'EMPLOYEE_ALLOCATION', TRUE, 'EMPLOYEE_TRANSFER', TRUE,
       'MANAGER_ASSIGNMENT', TRUE, 'ADMIN_ACCOUNT', FALSE),
     'preliminaryRoles', JSON_ARRAY('LOCATION_MANAGER','FLOOR_MANAGER','DEPARTMENT_MANAGER','HR_MANAGER','HR_EXECUTIVE','ADMIN'),
     'finalRoles', JSON_ARRAY('HR_MANAGER','HR_EXECUTIVE','HR'),
     'creatorRoles', JSON_ARRAY('SUPER_ADMIN','ADMIN','HR_MANAGER','HR_EXECUTIVE','LOCATION_MANAGER','FLOOR_MANAGER','DEPARTMENT_MANAGER'),
     'hrGlobalScope', TRUE),
     'Routing rules for organization change approvals. Enforced server-side.'),
  ('emergencyOverride', JSON_OBJECT(
     'enabled', FALSE,
     'roles', JSON_ARRAY('SUPER_ADMIN'),
     'minJustificationLength', 20),
     'Separately authorised emergency override. Requires justification and writes an immutable audit record.'),
  ('liveUpdates', JSON_OBJECT(
     'enabled', TRUE,
     'room', 'organization'),
     'Socket.IO room used by the organization dashboard live-update toggle.')
ON DUPLICATE KEY UPDATE `updatedAt` = CURRENT_TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 5. Active / inactive lifecycle for departments and sections
--        (deactivation instead of destructive deletes, per audit policy)
-- ---------------------------------------------------------------------------
ALTER TABLE `department` ADD COLUMN `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE `department` ADD KEY `Department_status_idx` (`status`);

ALTER TABLE `section` ADD COLUMN `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE `section` ADD KEY `Section_status_idx` (`status`);

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, run only when decommissioning this migration)
-- ---------------------------------------------------------------------------
-- DROP TABLE IF EXISTS `orgapprovaldecision`;
-- DROP TABLE IF EXISTS `employeeassignmenthistory`;
-- DROP TABLE IF EXISTS `orgchangerequest`;
-- DROP TABLE IF EXISTS `orgsettings`;
-- ALTER TABLE `department` DROP INDEX `Department_status_idx`, DROP COLUMN `status`;
-- ALTER TABLE `section` DROP INDEX `Section_status_idx`, DROP COLUMN `status`;
