-- ===========================================================================
-- 013: ENHANCE NOTIFICATION TABLE FOR CENTRALIZED NOTIFICATION SYSTEM
-- Add severity, eventId, actionUrl, correlationId, metadata, deliveryStatus, dedupKey, expiresAt
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Add new columns to notification table
ALTER TABLE `notification` 
ADD COLUMN `eventId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Event type identifier (e.g., AUTH.REGISTER)' AFTER `type`,
ADD COLUMN `severity` enum('LOW','MEDIUM','HIGH','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM' AFTER `eventId`,
ADD COLUMN `actionUrl` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Deep link to relevant record' AFTER `entityId`,
ADD COLUMN `correlationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'For tracing related events' AFTER `actionUrl`,
ADD COLUMN `metadata` json DEFAULT NULL COMMENT 'Additional event data for rendering' AFTER `correlationId`,
ADD COLUMN `deliveryStatus` json DEFAULT NULL COMMENT 'Delivery status per channel' AFTER `metadata`,
ADD COLUMN `dedupKey` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'For deduplication' AFTER `deliveryStatus`,
ADD COLUMN `expiresAt` datetime(3) DEFAULT NULL COMMENT 'Auto-archive after expiry' AFTER `dedupKey`;

-- Add indexes for new columns
CREATE INDEX `Notification_eventId_idx` ON `notification`(`eventId`);
CREATE INDEX `Notification_severity_idx` ON `notification`(`severity`);
CREATE INDEX `Notification_dedupKey_idx` ON `notification`(`dedupKey`);
CREATE INDEX `Notification_expiresAt_idx` ON `notification`(`expiresAt`);
CREATE INDEX `Notification_correlationId_idx` ON `notification`(`correlationId`);

-- Create notification_preferences table
CREATE TABLE `notification_preferences` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channels` json NOT NULL COMMENT '{"inApp":true,"email":true,"browserPush":false,"realtime":true}',
  `categories` json NOT NULL COMMENT 'Per-category channel preferences',
  `quietHours` json DEFAULT NULL COMMENT '{"enabled":true,"start":"22:00","end":"07:00","timezone":"Asia/Kolkata"}',
  `digestMode` json DEFAULT NULL COMMENT '{"enabled":false,"frequency":"daily","time":"08:00"}',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `NotificationPreferences_userId_key` (`userId`),
  CONSTRAINT `NotificationPreferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create notification_delivery_log table
CREATE TABLE `notification_delivery_log` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notificationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel` enum('IN_APP','EMAIL','PUSH','REALTIME') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','SENT','DELIVERED','FAILED','BOUNCED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `attempt` int NOT NULL DEFAULT '1',
  `error` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAt` datetime(3) DEFAULT NULL,
  `deliveredAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `NotificationDeliveryLog_notificationId_idx` (`notificationId`),
  KEY `NotificationDeliveryLog_channel_status_idx` (`channel`,`status`),
  CONSTRAINT `NotificationDeliveryLog_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `notification` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create notification_policy table (admin-configurable)
CREATE TABLE `notification_policy` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `eventId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `defaultSeverity` enum('LOW','MEDIUM','HIGH','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `defaultChannels` json NOT NULL COMMENT '["inApp","realtime"]',
  `mandatoryChannels` json NOT NULL COMMENT '["inApp"]',
  `recipientRoles` json NOT NULL COMMENT '["HR_MANAGER","SUPER_ADMIN"]',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `deduplicationWindowMinutes` int NOT NULL DEFAULT '60',
  `aggregationRule` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `NotificationPolicy_eventId_key` (`eventId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default notification policies
INSERT INTO `notification_policy` (`id`, `eventId`, `name`, `description`, `defaultSeverity`, `defaultChannels`, `mandatoryChannels`, `recipientRoles`, `enabled`, `deduplicationWindowMinutes`) VALUES
('pol_auth_register', 'AUTH.REGISTER', 'New Employee Registration', 'New employee account registered', 'MEDIUM', '["inApp","realtime","email"]', '["inApp"]', '["HR_MANAGER","HR_EXECUTIVE","SUPER_ADMIN","ADMIN"]', 1, 60),
('pol_auth_pending', 'AUTH.PENDING_APPROVAL', 'Account Awaiting HR Approval', 'Email verified account waiting for HR approval', 'HIGH', '["inApp","realtime","email"]', '["inApp","email"]', '["HR_MANAGER","HR_EXECUTIVE","SUPER_ADMIN","ADMIN"]', 1, 1440),
('pol_auth_approved', 'AUTH.APPROVED', 'Account Approved', 'User account approved by HR', 'MEDIUM', '["inApp","realtime","email"]', '["inApp"]', '[]', 1, 60),
('pol_auth_rejected', 'AUTH.REJECTED', 'Account Rejected', 'User account rejected by HR', 'HIGH', '["inApp","realtime","email"]', '["inApp","email"]', '[]', 1, 60),
('pol_auth_suspended', 'AUTH.SUSPENDED', 'Account Suspended', 'Employee account suspended', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["HR_MANAGER","SUPER_ADMIN","ADMIN"]', 1, 0),
('pol_auth_failed_login', 'AUTH.FAILED_LOGIN', 'Repeated Failed Login Attempts', 'Security alert for multiple failed logins', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["SUPER_ADMIN","ADMIN","HR_AUDITOR","HR_MANAGER"]', 1, 15),
('pol_emp_created', 'EMP.CREATED', 'New Employee Created', 'New employee record created', 'MEDIUM', '["inApp","realtime"]', '["inApp"]', '["HR_MANAGER","HR_EXECUTIVE","LOCATION_MANAGER"]', 1, 60),
('pol_emp_status', 'EMP.STATUS_CHANGED', 'Employment Status Changed', 'Employee status changed (active/inactive/terminated)', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["HR_MANAGER","LOCATION_MANAGER","PAYROLL_MANAGER","SUPER_ADMIN"]', 1, 0),
('pol_emp_resignation', 'EMP.RESIGNATION', 'Resignation Submitted', 'Employee submitted resignation', 'HIGH', '["inApp","realtime","email"]', '["inApp","email"]', '["HR_MANAGER","LOCATION_MANAGER","SUPER_ADMIN","ADMIN"]', 1, 0),
('pol_att_exception', 'ATT.EXCEPTION', 'Attendance Exception', 'Missing or invalid attendance record', 'HIGH', '["inApp","realtime"]', '["inApp"]', '["HR_MANAGER","FLOOR_MANAGER"]', 1, 1440),
('pol_att_late', 'ATT.LATE_ARRIVAL', 'Late Arrival', 'Employee late arrival requiring review', 'MEDIUM', '["inApp","realtime"]', '["inApp"]', '["HR_MANAGER","FLOOR_MANAGER"]', 1, 1440),
('pol_att_correction', 'ATT.CORRECTION_REQUESTED', 'Attendance Correction Requested', 'Correction request submitted for approval', 'HIGH', '["inApp","realtime"]', '["inApp"]', '["HR_MANAGER","FLOOR_MANAGER"]', 1, 60),
('pol_att_face_failed', 'ATT.FACE_VERIFY_FAILED', 'Face Verification Failed', 'Biometric face verification failure', 'HIGH', '["inApp","realtime"]', '["inApp"]', '["HR_MANAGER","FLOOR_MANAGER"]', 1, 30),
('pol_att_import_failed', 'ATT.BIOMETRIC_IMPORT_FAILED', 'Biometric Import Failed', 'Scheduled biometric data import failure', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["HR_MANAGER","SUPER_ADMIN","ADMIN"]', 1, 0),
('pol_leave_requested', 'LEAVE.REQUESTED', 'Leave Request Submitted', 'Employee submitted leave request', 'MEDIUM', '["inApp","realtime"]', '["inApp"]', '["HR_MANAGER","FLOOR_MANAGER","DEPARTMENT_MANAGER"]', 1, 60),
('pol_leave_approved', 'LEAVE.APPROVED', 'Leave Approved', 'Leave request approved', 'MEDIUM', '["inApp","realtime","email"]', '["inApp"]', '[]', 1, 60),
('pol_leave_rejected', 'LEAVE.REJECTED', 'Leave Rejected', 'Leave request rejected', 'HIGH', '["inApp","realtime","email"]', '["inApp","email"]', '[]', 1, 60),
('pol_brk_violation', 'BRK.POLICY_VIOLATION', 'Break Policy Violation', 'Employee exceeded allowed break duration', 'MEDIUM', '["inApp","realtime"]', '["inApp"]', '["HR_MANAGER","FLOOR_MANAGER"]', 1, 1440),
('pol_pay_exception', 'PAY.EXCEPTION', 'Payroll Attendance Exception', 'Missing attendance data for payroll processing', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["PAYROLL_MANAGER","HR_MANAGER"]', 1, 0),
('pol_pay_calc_error', 'PAY.CALC_ERROR', 'Salary Calculation Error', 'Error in salary calculation', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["PAYROLL_MANAGER","SUPER_ADMIN","ADMIN"]', 1, 0),
('pol_pay_failed', 'PAY.PROCESSING_FAILED', 'Payroll Processing Failed', 'Payroll batch processing failure', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["PAYROLL_MANAGER","SUPER_ADMIN","ADMIN"]', 1, 0),
('pol_crm_overdue', 'CRM.FOLLOWUP_OVERDUE', 'Overdue Follow-up', 'Customer follow-up past due date', 'HIGH', '["inApp","realtime","email"]', '["inApp"]', '["TEAM_LEAD","DEPARTMENT_MANAGER","HR_MANAGER"]', 1, 1440),
('pol_sys_db', 'SYS.DB_CONNECTIVITY', 'Database Connectivity Failure', 'Database connection pool exhausted', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["SUPER_ADMIN","ADMIN"]', 1, 5),
('pol_sys_api', 'SYS.API_FAILURES', 'Repeated API Failures', 'High API error rate detected', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["SUPER_ADMIN","ADMIN"]', 1, 5),
('pol_sys_job', 'SYS.JOB_FAILED', 'Scheduled Job Failure', 'Cron job execution failure', 'HIGH', '["inApp","realtime","email"]', '["inApp","email"]', '["SUPER_ADMIN","ADMIN"]', 1, 0),
('pol_sys_security', 'SYS.SECURITY_ALERT', 'Security Alert', 'Security monitoring alert', 'CRITICAL', '["inApp","realtime","email"]', '["inApp","email"]', '["SUPER_ADMIN","ADMIN","HR_AUDITOR"]', 1, 0)
ON DUPLICATE KEY UPDATE `updatedAt` = CURRENT_TIMESTAMP(3);

SET FOREIGN_KEY_CHECKS = 1;