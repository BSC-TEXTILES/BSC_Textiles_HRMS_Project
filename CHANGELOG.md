# Changelog — BSC Textiles HRMS

All notable changes to the BSC Textiles HRMS codebase are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-11

### Added
- **Attendance & Shifts Board (full-stack, real-data)**:
  - New pure calculation service `AttendanceCalculationService` (shift windows incl. overnight rolls, duration maths, 12-state display status derivation, filter mapping, exception classification, tally aggregation) shared by the board API and future consumers.
  - New endpoints `GET /api/attendance/shift-board` and `GET /api/attendance/shift-board/export` driving all five UI filters (Hub, Department, Shift, Attendance Status, Date) against real database tables with server-side pagination, search, exceptions-only mode, sort, and RBAC location scoping.
  - CSV export with formula-injection guard, UTF-8 BOM, 20 columns, filename `BSC_Shift_Board_<date>.csv`.
  - Rewrote `/attendance/shifts` page to consume the board endpoint with loading/error/retry, admin-only All Hubs visibility, location-scoped dropdowns, date navigation, real KPI cards, per-shift staff-tally cards and an HH:MM create-shift modal.
  - `DetailDrillDownModal` gained a server-side mode for `shift-roster` / `shift-exceptions` (18/13-column layouts, debounced server search, server pagination, blob CSV export).
  - New test suite `attendanceBoard.test.ts` (41 tests: 21 pure unit + 20 live API) wired into Suite 14 of `runAllTests.ts`.
- **Centralized Enterprise Error Handling**:
  - Implemented `AppError` typed hierarchy (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`, `InternalServerError`).
  - Implemented `errorHandler` middleware with request correlation tracking (`X-Request-Id`), diagnostic error codes, and sensitive credential masking.
- **Decoupled Real-Time Socket Architecture**:
  - Extracted isolated `socket.ts` module with `setSocketIO`, `getSocketIO`, and safe `SocketEmitter`.
  - Enabled headless server-side service execution without triggering premature Express port binding.
- **Modular API Architecture & Versioning**:
  - Implemented versioned router `backend/src/api/v1/index.ts` consolidating 34 domain routers.
  - Mounted `/api/v1` for future-ready API consumer contracts while maintaining 100% backward compatibility via `/api` route alias.
  - Added interactive OpenAPI 3.0 documentation and HTML Swagger explorer at `/api/docs`.
  - Added deep health and readiness probes (`/ready`, `/api/ready`) with active MySQL pool validation and runtime telemetry.
- **Dead Code & Redundant File Cleanup**:
  - Removed unmounted duplicate router `backend/src/routes/staffOps.ts` (active logic cleanly maintained in `workerOps.ts`).
  - Cleaned redundant sub-workspace lockfiles and build caches.
- **Architectural & Technical Documentation**:
  - Added authoritative `ARCHITECTURE.md` with system design, 3-tier directory layouts, and data flows.
  - Added `TECHNICAL_REQUIREMENTS.md` detailing hardware specs, MySQL 8.0 configurations, and latency SLAs.
  - Added `API_DOCUMENTATION.md` covering RESTful endpoints, request/response contracts, and authentication schemes.
  - Added dated change tracking records under `docs/change-memory/`.

### Fixed
- **Attendance Date Filtering in `GET /api/attendance`**:
  - `date` / `startDate` / `endDate` are now normalized to strict `YYYY-MM-DD` string equality against `attendanceDate`, eliminating timezone drift from ISO-timestamp comparisons; invalid dates return 400 `INVALID_DATE`.
- **Compound-Unique Lookups in the Native ORM**:
  - `buildWhereClause` expands scalar plain objects whose keys match a compound-unique key (e.g. `{ a_b: { a, b } }`) into individual `col = ?` conditions, repairing all 13 broken `findUnique({ where: { a_b: {...} } })` call sites (shifts, departments, sections, floors, attendance, qrCodes, incentives, liveStreams, observations).
- **Shift Time Format Validation**:
  - `startTime` / `endTime` on shift create/update accept `HH:MM` / `HH:MM:SS` only; ISO datetime strings return 400 with a clear `HH:MM format (24-hour)` message.
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
