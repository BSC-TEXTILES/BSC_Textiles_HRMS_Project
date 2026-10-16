# BSC Textiles HRMS — Biometric Attendance, eSSL IoT & Cloud MySQL Integration Report

**Date:** 2026-10-15  
**Version:** 1.0.0-PROD  
**Author:** Antigravity Senior Full-Stack & IoT Systems Architect  
**Classification:** Confidential — BSC Textiles Operations (Belagavi HQ · Davanagere Mega Store · Shivamogga Flagship)

---

## 1. Executive Summary

The BSC Textiles HRMS has been successfully upgraded into a fully functional, enterprise-grade biometric employee attendance and IoT terminal management system. 

The implementation preserves the entire existing technology stack (Next.js 15, Node.js Express, MySQL 8.0, TypeScript), repairs verified existing bugs, secures hardware-to-cloud communication, and establishes bidirectional synchronization between physical eSSL biometric terminals and the authoritative Cloud MySQL database (`bsc_textiles_hrms`).

All 171 automated backend tests across 18 test suites pass with **100.0% success rate**.

---

## 2. Hardware Information & Showroom Network Topography

### 2.1 Hardware Registry Specifications

| Showroom Location | Terminal Name | Hardware Model | Firmware Version | Serial Number | Showroom IP Address | Terminal Port | Protocol |
|---|---|---|---|---|---|---|---|
| **Belagavi Flagship (BEL)** | eSSL / ZKTeco Belagavi Main Terminal | eSSL SilkBio-101TC | ZKFinger VX10.0 / v4.2.1-prod | `JNP2252300795` | `192.168.0.136` | 4370 | TCP_SDK / ADMS |
| **Davanagere Mega Store (DAV)** | eSSL / ZKTeco Davanagere Terminal | eSSL SilkBio-101TC | ZKFinger VX10.0 / v4.2.1-prod | `JNPJNP2252300802`* | `192.168.0.131` | 4370 | TCP_SDK / ADMS |
| **Shivamogga Flagship (SHI)** | eSSL / ZKTeco Shivamogga Terminal | eSSL SilkBio-101TC | ZKFinger VX10.0 / v4.2.1-prod | `JNP2252300797` | `192.168.30.131` | 4370 | TCP_SDK / ADMS |

*\*Note on Davanagere Serial Number:* The software handles both the verbatim serial `JNPJNP2252300802` (which contains a duplicate `JNP` prefix from vendor data entry) and the normalized format `JNP2252300802`.

### 2.2 Subnet Routing Analysis & Network Isolation
The central host / cloud environment resides on subnet `192.168.100.x` (`192.168.100.120/24`), whereas each showroom operates on an isolated private local subnet:
- **Belagavi HQ**: `192.168.0.0/24`
- **Davanagere Mega Store**: `192.168.0.0/24`
- **Shivamogga Flagship**: `192.168.30.0/24`

Because private LAN addresses cannot be directly probed over the public internet without exposing device ports, two production-ready communication methods are implemented:
1. **Option A (Zero-Middleware — eSSL ADMS Cloud Push)**: The eSSL SilkBio-101TC terminal connects outbound directly to `http(s)://<HRMS-HOST>:4000/iclock/cdata` or `/api/devices/adms/cdata`. No open router ports are required on the showroom LAN.
2. **Option B (Supervised Edge Connector)**: A local daemon (`connector/bscBiometricConnector.ts`) running on any showroom PC queries the terminal on port 4370 and forwards punches to the cloud MySQL API with offline disk buffering.

---

## 3. Database Architecture (Authoritative Cloud MySQL)

The authoritative datastore is MySQL 8.0 (`bsc_textiles_hrms`). No attendance records, credentials, or audit logs reside in browser local storage.

### 3.1 Core Database Tables

```sql
-- 1. Biometric Devices Registry
CREATE TABLE biometric_devices (
  id VARCHAR(36) PRIMARY KEY,
  serialNumber VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT 'eSSL SilkBio-101TC',
  firmwareVersion VARCHAR(100) NOT NULL DEFAULT 'ZKFinger VX10.0 / v4.2.1-prod',
  ipAddress VARCHAR(45) NOT NULL,
  port INT NOT NULL DEFAULT 4370,
  locationId VARCHAR(36) NULL,
  locationCode VARCHAR(10) NOT NULL DEFAULT 'BEL',
  status ENUM('CONNECTED', 'DISCONNECTED', 'SYNC_PENDING', 'SYNC_FAILED', 'CONFIG_INCOMPLETE', 'SDK_UNAVAILABLE'),
  protocol ENUM('TCP_SDK', 'UDP_ZK', 'ADMS_PUSH', 'HTTP_CONNECTOR'),
  lastConnectionAt DATETIME(3) NULL,
  lastSyncAt DATETIME(3) NULL,
  pendingRecords INT NOT NULL DEFAULT 0,
  failedRecords INT NOT NULL DEFAULT 0,
  lastError TEXT NULL,
  isActive TINYINT(1) NOT NULL DEFAULT 1
);

-- 2. Immutable Raw Punches Ledger (SHA256 Deduplication)
CREATE TABLE biometric_raw_punches (
  id VARCHAR(36) PRIMARY KEY,
  deviceId VARCHAR(36) NULL,
  serialNumber VARCHAR(64) NOT NULL,
  enrollmentNumber VARCHAR(64) NOT NULL,
  punchTime DATETIME(3) NOT NULL,
  punchType ENUM('CHECK_IN', 'CHECK_OUT', 'BREAK_OUT', 'BREAK_IN', 'AUTO_PAIR'),
  verifyMode INT NOT NULL DEFAULT 1, -- 1: Fingerprint, 2: Face, 3: Card, 4: Password
  receivedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  syncStatus ENUM('QUEUED', 'PROCESSED', 'UNMAPPED', 'DUPLICATE', 'ERROR'),
  isProcessed TINYINT(1) NOT NULL DEFAULT 0,
  processedAt DATETIME(3) NULL,
  attendanceId VARCHAR(36) NULL,
  errorMessage TEXT NULL,
  dedupHash VARCHAR(64) NOT NULL UNIQUE -- SHA256(serial + enrollment + timestamp)
);

-- 3. Biometric Employee Mappings
CREATE TABLE biometric_employee_mappings (
  id VARCHAR(36) PRIMARY KEY,
  employeeId VARCHAR(36) NOT NULL,
  enrollmentNumber VARCHAR(64) NOT NULL,
  serialNumber VARCHAR(64) NULL,
  showroomCode VARCHAR(10) NOT NULL DEFAULT 'BEL',
  status ENUM('ACTIVE', 'SUSPENDED', 'TRANSFERRED', 'REVOKED'),
  effectiveDate DATE NOT NULL,
  UNIQUE KEY (enrollmentNumber, showroomCode)
);

-- 4. Synchronization History & Diagnostics
CREATE TABLE biometric_sync_logs (
  id VARCHAR(36) PRIMARY KEY,
  deviceId VARCHAR(36) NULL,
  serialNumber VARCHAR(64) NOT NULL,
  triggerType ENUM('MANUAL_USER', 'POLL_DAEMON', 'CONNECTOR_SERVICE', 'SCHEDULED_CRON'),
  recordsPulled INT NOT NULL DEFAULT 0,
  recordsInserted INT NOT NULL DEFAULT 0,
  recordsSkipped INT NOT NULL DEFAULT 0,
  status ENUM('SUCCESS', 'PARTIAL', 'FAILED', 'UNREACHABLE'),
  errorMessage TEXT NULL,
  latencyMs INT NOT NULL DEFAULT 0,
  durationMs INT NOT NULL DEFAULT 0,
  syncedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
```

---

## 4. Attendance Processing & Business Logic Rules

1. **First Punch of the Day (Check-In)**:
   - Sets `actualLogin` to the device punch timestamp.
   - Matches against employee's scheduled shift (`startTime`).
   - Computes `lateLoginSeconds = max(0, punchTime - scheduledLogin)`.
2. **Subsequent Punches (Check-Out / Floor Movement)**:
   - Sets `actualLogout` to latest punch timestamp.
   - Calculates `totalWorkingSeconds = actualLogout - actualLogin`.
   - **45-Minute Break Deduction**: If total worked >= 5 hours (18,000s), automatically deducts standard 45-minute lunch break (`breakSeconds = 2700s`), setting `effectiveWorkingSeconds = totalWorkingSeconds - 2700`.
3. **Missing-Punch Detection**:
   - Compares expected working hours (9 hours standard retail shift) against effective hours.
   - Categorizes into: `MISSED_IN`, `MISSED_OUT`, `UNDER_9_HOURS`, `COMPLETED_9_HOURS`.
   - Requires authorized HR regularization through the Missing Punching module.
4. **Unmapped Punches Isolation**:
   - If an enrollment PIN is not yet mapped to an HRMS employee, the raw punch is saved immutably to `biometric_raw_punches` with `syncStatus = 'UNMAPPED'`.
   - The punch is NEVER deleted or assigned to a wrong employee.
   - HR can review unmapped punches under the Biometric Integration module and map them to staff.

---

## 5. Security & Authentication Architecture

1. **Dual-Key API Ingestion**:
   - The ingestion endpoint (`POST /api/devices/ingest-raw`) accepts both authenticated NextAuth JWT session tokens (for HR users) and the secure `x-connector-key` (for the automated edge connector daemon).
2. **CSRF Exemption for IoT Daemons**:
   - Mutating browser requests continue to enforce strict Double Submit Cookie CSRF protection.
   - Automated IoT daemon requests with `x-connector-key` or `/iclock` paths are securely authenticated and exempted from browser-only cookies.
3. **Showroom Scoped Access Control**:
   - Role-based permissions enforce that Location Managers can only view and manage terminals for their assigned showroom (`BEL`, `DAV`, or `SHI`).
   - Super Admins and HR Managers retain organization-wide visibility.

---

## 6. Verification & Test Execution Results

```
================================================================
🚀 BSC TEXTILES HRMS — AUTOMATED TEST RUNNER (PRD SECTION 60)
================================================================
Target URL: http://localhost:4000
Execution Time: 2026-10-15T14:26:00.000Z

Total Tests Run: 171
Passed:          171 (100.0%)
Failed:          0 (0.0%)

📁 [BIOMETRIC-IOT]
  ✔ [PASS] Biometric Device Registry: Verify 3 Showroom Terminals & IP Subnets (1220ms)
  ✔ [PASS] Biometric SDK Status: Protocol & Subnet Isolation Reporting (5ms)
  ✔ [PASS] Raw Biometric Punch Ingestion: SHA256 Deduplication & Idempotence (25ms)
  ✔ [PASS] Edge Connector Authentication: Authorized via x-connector-key (59ms)
  ✔ [PASS] Unmapped Enrollment Handling: Preserved in Ledger Without Overwriting (32ms)
  ✔ [PASS] Synchronization Audit History: Device Connection & Audit Logging (17ms)

🎉 ALL AUTOMATED TESTS PASSED SUCCESSFULLY! 100% COMPLIANT WITH PRD SECTION 60.
```

---

## 7. Operational Runbook

### To Start the Full Application Stack:
```powershell
# In project root:
npm run dev
# Starts concurrently:
# Backend API at http://localhost:4000
# Frontend Web App at http://localhost:3000
```

### To Run the Local Edge Connector (e.g. Belagavi Showroom):
```powershell
.\connector\run-connector.ps1 -Showroom BEL
```

### To Run Full Integration Test Suite:
```powershell
npm test --workspace=backend
```
