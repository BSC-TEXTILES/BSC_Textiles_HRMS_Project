# Changelog — BSC Textiles HRMS

All notable changes to the BSC Textiles HRMS codebase are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-11

### Added
- **Centralized Enterprise Error Handling**:
  - Implemented `AppError` typed hierarchy (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`, `InternalServerError`).
  - Implemented `errorHandler` middleware with request correlation tracking (`X-Request-Id`), diagnostic error codes, and sensitive credential masking.
- **Decoupled Real-Time Socket Architecture**:
  - Extracted isolated `socket.ts` module with `setSocketIO`, `getSocketIO`, and safe `SocketEmitter`.
  - Enabled headless server-side service execution without triggering premature Express port binding.
- **Architectural & Technical Documentation**:
  - Added authoritative `ARCHITECTURE.md` with system design, 3-tier directory layouts, and data flows.
  - Added `TECHNICAL_REQUIREMENTS.md` detailing hardware specs, MySQL 8.0 configurations, and latency SLAs.
  - Added `API_DOCUMENTATION.md` covering RESTful endpoints, request/response contracts, and authentication schemes.
  - Added dated change tracking records under `docs/change-memory/`.

### Fixed
- **Circular Dependency & `EADDRINUSE` Port Collision**:
  - Resolved circular import between `NotificationService.ts` and `index.ts`.
- **Database Schema Alignment in `AuditLogRepository`**:
  - Aligned table fields to native MySQL `audit_logs` schema (`user_id`, `location_id`, `entity_type`, `entity_id`, `old_value`, `new_value`, `ip_address`, `user_agent`, `created_at`).
  - Added `normalizeAction(...)` to map custom event triggers to MySQL action enum without truncation.
  - Fixed sorting syntax from non-existent `createdAt` to `created_at`.
- **Payroll Cycle Dates in PDF Payslips**:
  - Fixed `PayrollRepository.getItemsForRun` by adding `JOIN payroll_runs pr` to supply actual cycle dates (`period_start`, `period_end`) to Form T payslips.
- **Payslip Version Incentive Aggregation**:
  - Fixed `PayrollService.finalizeAndGeneratePdfs` to incorporate `attendance_incentive` in the total versioned incentive sum.
- **Workforce Profile Dual-Table Resolution**:
  - Added dual-table lookups in `EmployeeRepository` (`employees` and `employee`) ensuring seamless employee profile and mobile API resolution.

### Security
- **Sensitive Credential Log Scrubbing**:
  - Automated redaction of passwords, tokens, secrets, cookies, and Aadhaar numbers in error logs.
- **Enforced Multi-Store Location Scoping**:
  - Verified server-side tenant isolation across Belagavi (`BEL`), Davanagere (`DAV`), Shivamogga (`SHI`), and Bellary (`BLY`).
