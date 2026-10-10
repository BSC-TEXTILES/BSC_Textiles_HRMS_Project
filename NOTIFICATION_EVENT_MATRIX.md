# Notification Event Matrix - BSC Textiles HRMS

## Overview
This document defines all events that trigger notifications, their target recipients, severity levels, and delivery channels.

## Event Categories & Recipient Matrix

### A. User Management & Account Security

| Event ID | Event Name | Trigger | Severity | Recipients | Channels | Deduplication |
|----------|------------|---------|----------|------------|----------|---------------|
| AUTH.REGISTER | New Employee Registration | POST /api/auth/register | INFO | HR_MANAGER, HR_EXECUTIVE, SUPER_ADMIN, ADMIN (at location) | In-app, Email | Per user email |
| AUTH.EMAIL_VERIFIED | Email Verified | GET /api/auth/verify-email | INFO | HR_MANAGER, HR_EXECUTIVE (at location) | In-app | Per verification token |
| AUTH.PENDING_APPROVAL | Account Awaiting HR Approval | After email verification | WARNING | HR_MANAGER, HR_EXECUTIVE (at location) | In-app, Email | Per user |
| AUTH.APPROVED | Account Approved | POST /api/auth/approve/:userId | INFO | Requesting user | In-app, Email | N/A |
| AUTH.REJECTED | Account Rejected | POST /api/auth/reject/:userId | WARNING | Requesting user | In-app, Email | N/A |
| AUTH.ACTIVATED | Employee Account Activated | Status change to ACTIVE | INFO | Employee, HR_MANAGER (at location) | In-app | N/A |
| AUTH.SUSPENDED | Employee Account Suspended | Status change to SUSPENDED | CRITICAL | Employee, HR_MANAGER, SUPER_ADMIN | In-app, Email | N/A |
| AUTH.PROFILE_CHANGED | Profile Information Changed | PUT /api/users/:id | INFO | Employee, HR_MANAGER (at location) | In-app | 1 hour per field |
| AUTH.CONTACT_CHANGED | Contact Info Changed | Email/phone update | WARNING | Employee, HR_MANAGER, SECURITY | In-app, Email | N/A |
| AUTH.PASSWORD_CHANGED | Password Changed | PUT /api/auth/change-password | WARNING | Employee, SECURITY | In-app, Email | N/A |
| AUTH.PASSWORD_RESET | Password Reset Completed | POST /api/auth/reset-password | WARNING | Employee, SECURITY | In-app, Email | N/A |
| AUTH.ROLE_CHANGED | Role/Permission Changed | Role assignment | CRITICAL | Employee, HR_MANAGER, SUPER_ADMIN | In-app, Email | N/A |
| AUTH.LOCATION_CHANGED | Location Assignment Changed | Location transfer | WARNING | Employee, HR_MANAGER (old & new), SUPER_ADMIN | In-app | N/A |
| AUTH.FAILED_LOGIN | Repeated Failed Login Attempts | 5+ failures in 15 min | CRITICAL | SECURITY, HR_MANAGER (at location), SUPER_ADMIN | In-app, Email | 15 min window |
| AUTH.SUSPICIOUS_ACTIVITY | Suspicious Account Activity | MFA bypass, token reuse | CRITICAL | SECURITY, SUPER_ADMIN | In-app, Email | Per session |
| AUTH.UNAUTHORIZED_ATTEMPT | Unauthorized Protected Action | 403 responses | WARNING | SECURITY, HR_MANAGER | In-app | 5 min per user/action |

### B. Employee Management

| Event ID | Event Name | Trigger | Severity | Recipients | Channels | Deduplication |
|----------|------------|---------|----------|------------|----------|---------------|
| EMP.CREATED | New Employee Created | POST /api/employees | INFO | HR_MANAGER, HR_EXECUTIVE, LOCATION_MANAGER (at location) | In-app | N/A |
| EMP.PROFILE_UPDATED | Employee Profile Updated | PUT /api/employees/:id | INFO | HR_MANAGER, Employee, LOCATION_MANAGER | In-app | 1 hour |
| EMP.JOINING | Employee Joining/Onboarding | Joining date reached | INFO | HR_MANAGER, LOCATION_MANAGER, FLOOR_MANAGER, DEPARTMENT_MANAGER | In-app, Email | N/A |
| EMP.DEPT_CHANGED | Department/Floor/Location Changed | Profile update with location/dept change | WARNING | HR_MANAGER, Employee, Old & New Managers | In-app, Email | N/A |
| EMP.DOCUMENT_UPLOADED | Document Uploaded | KYC/document upload | INFO | HR_EXECUTIVE, HR_MANAGER (at location) | In-app | Per document |
| EMP.DOCUMENT_VERIFIED | Document Verified | KYC verification complete | INFO | Employee, HR_EXECUTIVE | In-app | N/A |
| EMP.STATUS_CHANGED | Employment Status Changed | Status: ACTIVE/INACTIVE/ON_LEAVE/TERMINATED | CRITICAL | HR_MANAGER, Employee, LOCATION_MANAGER, PAYROLL_MANAGER | In-app, Email | N/A |
| EMP.RESIGNATION | Resignation Submitted | Exit workflow initiated | WARNING | HR_MANAGER, LOCATION_MANAGER, SUPER_ADMIN | In-app, Email | N/A |
| EMP.EXIT_WORKFLOW | Exit Workflow Update | F&F, clearance steps | INFO | HR_MANAGER, Employee, Relevant approvers | In-app | Per step |
| EMP.REVIEW_PENDING | Request Awaiting HR Review | Any HR-approval workflow | WARNING | HR_MANAGER, HR_EXECUTIVE (at location) | In-app | Per request |

### C. Attendance & Shifts

| Event ID | Event Name | Trigger | Severity | Recipients | Channels | Deduplication |
|----------|------------|---------|----------|------------|----------|---------------|
| ATT.EXCEPTION | Attendance Exception | Missing punch, invalid sequence | WARNING | HR_MANAGER, FLOOR_MANAGER (at location) | In-app | Per employee/date |
| ATT.MISSING_CHECKIN | Missing Check-in | No IN punch by shift start + grace | WARNING | HR_MANAGER, FLOOR_MANAGER | In-app | Per employee/date |
| ATT.MISSING_CHECKOUT | Missing Check-out | No OUT punch by shift end | WARNING | HR_MANAGER, FLOOR_MANAGER | In-app | Per employee/date |
| ATT.LATE_ARRIVAL | Late Arrival Requiring Review | Late > threshold, not auto-approved | WARNING | HR_MANAGER, FLOOR_MANAGER | In-app | Per employee/date |
| ATT.EARLY_DEPARTURE | Early Departure Requiring Review | Early > threshold | WARNING | HR_MANAGER, FLOOR_MANAGER | In-app | Per employee/date |
| ATT.CORRECTION_REQUESTED | Attendance Correction Requested | POST /api/attendance/corrections | WARNING | HR_MANAGER, FLOOR_MANAGER | In-app | Per request |
| ATT.CORRECTION_APPROVED | Attendance Correction Approved | Approval action | INFO | Employee, Requester | In-app | N/A |
| ATT.CORRECTION_REJECTED | Attendance Correction Rejected | Rejection action | WARNING | Employee, Requester | In-app | N/A |
| ATT.MANUAL_CHANGE | Manual Attendance Change | Admin manual entry/edit | INFO | HR_MANAGER, Employee | In-app | Per change |
| ATT.SHIFT_CHANGED | Shift/Roster Changed | Shift assignment update | INFO | Employee, FLOOR_MANAGER, HR_MANAGER | In-app | Per employee |
| ATT.WEEKOFF_CHANGED | Week-off/Leave Update | Weekly off rule change | INFO | Employee, FLOOR_MANAGER | In-app | Per change |
| ATT.FACE_VERIFY_FAILED | Face Verification Failure | Face match < threshold | WARNING | HR_MANAGER, FLOOR_MANAGER | In-app | 30 min per employee |
| ATT.BIOMETRIC_IMPORT_FAILED | Biometric Import Failed | Scheduled import job failure | CRITICAL | HR_MANAGER, IT_ADMIN, SUPER_ADMIN | In-app, Email | Per job run |

### D. Leave, Breaks, Payroll & Incentives

| Event ID | Event Name | Trigger | Severity | Recipients | Channels | Deduplication |
|----------|------------|---------|----------|------------|----------|---------------|
| LEAVE.REQUESTED | Leave Request Submitted | POST /api/leaves/apply | INFO | HR_MANAGER, FLOOR_MANAGER, DEPARTMENT_MANAGER (at location) | In-app | Per request |
| LEAVE.APPROVED | Leave Approved | POST /api/leaves/applications/:id/approve | INFO | Employee, Requester | In-app, Email | N/A |
| LEAVE.REJECTED | Leave Rejected | POST /api/leaves/applications/:id/reject | WARNING | Employee, Requester | In-app, Email | N/A |
| LEAVE.CANCELLED | Leave Cancelled | POST /api/leaves/applications/:id/cancel | INFO | HR_MANAGER, FLOOR_MANAGER | In-app | N/A |
| LEAVE.BALANCE_LOW | Leave Balance Low | Balance < 2 days | INFO | Employee, HR_MANAGER | In-app | Monthly |
| BRK.POLICY_VIOLATION | Break Policy Violation | Exceeded break duration | WARNING | HR_MANAGER, FLOOR_MANAGER | In-app | Per occurrence |
| BRK.MISSING_BREAK | Missing Break Record | Expected break not recorded | INFO | FLOOR_MANAGER | In-app | Per employee/date |
| PAY.EXCEPTION | Payroll Attendance Exception | Missing data for payroll | CRITICAL | PAYROLL_MANAGER, HR_MANAGER | In-app, Email | Per payroll run |
| PAY.CALC_ERROR | Salary Calculation Problem | Calculation failure | CRITICAL | PAYROLL_MANAGER, SUPER_ADMIN | In-app, Email | Per employee/run |
| PAY.PROCESSING_FAILED | Payroll Processing Failed | Batch job failure | CRITICAL | PAYROLL_MANAGER, SUPER_ADMIN, FINANCE | In-app, Email | Per run |
| INC.CHANGE_REQUESTED | Incentive Change Requested | New incentive rule/assignment | WARNING | PAYROLL_MANAGER, HR_MANAGER | In-app | Per rule |
| INC.APPROVAL_REQUESTED | Incentive Approval Needed | Incentive transaction pending | INFO | PAYROLL_MANAGER, HR_MANAGER | In-app | Per transaction |
| INC.RULE_CHANGED | HR Attendance/Incentive Rule Changed | PUT /api/attendance/rules | WARNING | HR_MANAGER, PAYROLL_MANAGER, SUPER_ADMIN | In-app | Per change |

### E. Wedding CRM & Telecaller Operations

| Event ID | Event Name | Trigger | Severity | Recipients | Channels | Deduplication |
|----------|------------|---------|----------|------------|----------|---------------|
| CRM.CUSTOMER_REGISTERED | New Customer Registration | Customer created | INFO | SALES_MANAGER, TEAM_LEAD | In-app | N/A |
| CRM.ASSIGNED | Customer Assigned/Reassigned | Assignment change | INFO | Assigned telecaller, SALES_MANAGER | In-app | N/A |
| CRM.FOLLOWUP_DUE | Follow-up Task Due | Scheduled follow-up time | INFO | Assigned telecaller | In-app, Browser | Per task |
| CRM.FOLLOWUP_OVERDUE | Overdue Follow-up | Past due date | WARNING | Telecaller, SALES_MANAGER, TEAM_LEAD | In-app, Email | Daily summary |
| CRM.STATUS_CHANGED | Important Status Change | Hot/Warm/Cold, Won/Lost | INFO | Telecaller, SALES_MANAGER | In-app | Per change |
| CRM.IMPORT_FAILED | Customer Import Failed | Bulk import job failure | CRITICAL | SALES_MANAGER, IT_ADMIN | In-app, Email | Per job |
| CRM.WORKFLOW_ERROR | Workflow Error Requiring HR | Escalation to HR | WARNING | HR_MANAGER, SALES_MANAGER | In-app | Per error |

### F. System & Integration Events

| Event ID | Event Name | Trigger | Severity | Recipients | Channels | Deduplication |
|----------|------------|---------|----------|------------|----------|---------------|
| SYS.DB_CONNECTIVITY | Database Connectivity Failure | Connection pool exhausted | CRITICAL | SUPER_ADMIN, IT_ADMIN | In-app, Email | 5 min |
| SYS.API_FAILURES | Repeated API Failures | >10% error rate in 5 min | CRITICAL | SUPER_ADMIN, IT_ADMIN | In-app, Email | 5 min |
| SYS.EMAIL_DELIVERY_FAILED | Email Delivery Failure | SMTP failures > 5 in 10 min | WARNING | SUPER_ADMIN, IT_ADMIN | In-app | 10 min |
| SYS.WS_CONNECTION_FAILED | WebSocket Delivery Failure | Client reconnect storms | INFO | IT_ADMIN | In-app | 15 min |
| SYS.JOB_FAILED | Scheduled Job Failure | Cron job exception | WARNING | SUPER_ADMIN, IT_ADMIN, Relevant module owner | In-app, Email | Per job |
| SYS.FILE_SCAN_FAILED | File Scanning Failure | Virus/malware scan fail | CRITICAL | SECURITY, SUPER_ADMIN | In-app, Email | Per file |
| SYS.SECURITY_ALERT | Security Alert | Audit log anomalies | CRITICAL | SECURITY, SUPER_ADMIN | In-app, Email | Per alert |
| SYS.IMPORT_EXPORT_FAILED | Import/Export Failure | Data migration errors | WARNING | Module owner, SUPER_ADMIN | In-app | Per operation |
| SYS.MIGRATION_FAILED | Migration/Deployment Issue | DB migration failure | CRITICAL | SUPER_ADMIN, IT_ADMIN | In-app, Email | Per deployment |

## Delivery Channel Configuration

| Channel | Enabled | Configuration |
|---------|---------|---------------|
| In-app | Always | Real-time via Socket.IO + REST fallback |
| Real-time (WebSocket) | Always | Socket.IO rooms by location + user |
| Email | Configurable | SMTP settings, per-event opt-in |
| Browser Push | Opt-in | Service Worker, user permission required |

## Recipient Resolution Rules

### HR Roles (receive notifications for their location scope)
- **SUPER_ADMIN**: All locations, all events
- **ADMIN**: All locations, all events
- **HR_MANAGER**: Assigned location(s), all HR-relevant events
- **HR_EXECUTIVE**: Assigned location(s), operational HR events
- **HR_AUDITOR**: All locations, audit/security events only

### Location-based Roles
- **LOCATION_MANAGER**: Their location, operational events
- **FLOOR_MANAGER**: Their floor, attendance/break/observation events
- **DEPARTMENT_MANAGER**: Their department, leave/attendance events
- **TEAM_LEAD**: Their team, CRM/leave events

### Event-to-Recipient Resolution Algorithm
1. Determine event location(s) from entity (employee.locationId, customer.locationId, etc.)
2. Find all users with HR roles at those locations
3. Filter by event category permissions
4. Apply user notification preferences (opt-out for non-mandatory)
5. Deduplicate by user (single notification per user per event)

## Notification Preferences (Per User)
```json
{
  "userId": "user_123",
  "channels": {
    "inApp": true,
    "email": true,
    "browserPush": false,
    "realtime": true
  },
  "categories": {
    "security": { "inApp": true, "email": true, "mandatory": true },
    "approvals": { "inApp": true, "email": true, "mandatory": true },
    "attendance": { "inApp": true, "email": false },
    "leave": { "inApp": true, "email": true },
    "payroll": { "inApp": true, "email": true },
    "crm": { "inApp": true, "email": false },
    "system": { "inApp": true, "email": true, "mandatory": true }
  },
  "quietHours": { "enabled": true, "start": "22:00", "end": "07:00", "timezone": "Asia/Kolkata" },
  "digestMode": { "enabled": false, "frequency": "daily", "time": "08:00" }
}
```

## Data Model Extensions

### Notification Table (existing + new fields)
```sql
-- Existing fields: id, userId, locationId, title, message, type, entityType, entityId, isRead, readAt, createdAt

-- New fields to add via migration:
ALTER TABLE `notification` ADD COLUMN `eventId` VARCHAR(191) NULL COMMENT 'Event type identifier (e.g., AUTH.REGISTER)';
ALTER TABLE `notification` ADD COLUMN `severity` ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM';
ALTER TABLE `notification` ADD COLUMN `actionUrl` VARCHAR(500) NULL COMMENT 'Deep link to relevant record';
ALTER TABLE `notification` ADD COLUMN `correlationId` VARCHAR(191) NULL COMMENT 'For tracing related events';
ALTER TABLE `notification` ADD COLUMN `deliveryStatus` JSON NULL COMMENT '{"inApp":"sent","email":"pending","push":"failed","realtime":"delivered"}';
ALTER TABLE `notification` ADD COLUMN `metadata` JSON NULL COMMENT 'Additional event data for rendering';
ALTER TABLE `notification` ADD COLUMN `dedupKey` VARCHAR(191) NULL COMMENT 'For deduplication';
ALTER TABLE `notification` ADD COLUMN `expiresAt` DATETIME(3) NULL COMMENT 'Auto-archive after expiry';

-- Indexes
CREATE INDEX `Notification_eventId_idx` ON `notification`(`eventId`);
CREATE INDEX `Notification_severity_idx` ON `notification`(`severity`);
CREATE INDEX `Notification_dedupKey_idx` ON `notification`(`dedupKey`);
CREATE INDEX `Notification_expiresAt_idx` ON `notification`(`expiresAt`);
```

### Notification Preferences Table
```sql
CREATE TABLE `notification_preferences` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL UNIQUE,
  `channels` JSON NOT NULL,
  `categories` JSON NOT NULL,
  `quietHours` JSON NULL,
  `digestMode` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `NotificationPreferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
```

### Notification Delivery Log Table
```sql
CREATE TABLE `notification_delivery_log` (
  `id` VARCHAR(191) NOT NULL,
  `notificationId` VARCHAR(191) NOT NULL,
  `channel` ENUM('IN_APP','EMAIL','PUSH','REALTIME') NOT NULL,
  `status` ENUM('PENDING','SENT','DELIVERED','FAILED','BOUNCED') NOT NULL DEFAULT 'PENDING',
  `attempt` INT NOT NULL DEFAULT 1,
  `error` TEXT NULL,
  `sentAt` DATETIME(3) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `NotificationDeliveryLog_notificationId_idx` (`notificationId`),
  KEY `NotificationDeliveryLog_channel_status_idx` (`channel`,`status`),
  CONSTRAINT `NotificationDeliveryLog_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `notification`(`id`) ON DELETE CASCADE
);
```

### Notification Policy Table (Admin-configurable)
```sql
CREATE TABLE `notification_policy` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL UNIQUE,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT,
  `defaultSeverity` ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  `defaultChannels` JSON NOT NULL,
  `mandatoryChannels` JSON NOT NULL,
  `recipientRoles` JSON NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `deduplicationWindowMinutes` INT NOT NULL DEFAULT 60,
  `aggregationRule` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
);
```