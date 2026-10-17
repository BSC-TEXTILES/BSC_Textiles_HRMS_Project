# BSC Textiles HRMS — Changelog

## [1.1.0] - Candidate Hiring Module (2026-10-17)

### Added
- **Candidate Hiring Module (Backend):**
  - Control-DB structures for forms, versions, folders, templates, share links and hiring settings (`database/migrations/036_hiring_module.sql`), with registry reconciliation (`037_hiring_shard_registry_reconcile.sql`).
  - Per-showroom shard schema for candidates, applications, documents, interviews, notes and outbox (`database/shards/hiring_shard_schema.sql`) with provisioning via `npm run provision:hiring-shards`.
  - Authenticated API (`/api/hiring/*`): dashboard, forms (draft/publish/version/archive/close/reopen/duplicate/template), links + analytics, applications (list/detail/stage/bulk-stage/notes/interviews), candidates profile, export CSV, shards, outbox stats/requeue.
  - Public API (`/api/hiring/public/*`): link/form resolution, captcha, start, apply — rate-limited with hardened 404/410 semantics.
- **Candidate Hiring Module (Frontend):**
  - Recruitment dashboard (`/hiring`), form builder (`/hiring/forms`), candidate directory and dossier (`/hiring/candidates`), hiring settings (`/hiring/settings`), plus the public mobile-friendly apply page (`/apply/[code]`).
- **Test Coverage:** Suite 19 (Hiring Validators, 17 tests) and Suite 20 (Candidate Hiring API, 24 tests) registered in the automated runner.
- **Devices:** `GET /api/devices/sdk-status` SDK/protocol and subnet-isolation reporting endpoint.

### Changed
- `AuditService` hash-chain writes are now serialized across processes with a MySQL advisory lock (`GET_LOCK('bsc_audit_hash_chain')`), preventing chain forks between the API server and script/test writers.
- Test personas modernized to seeded RBAC accounts (`rbac.hr@`, `rbac.employee@`) and a dedicated T-shop scanner persona (`ramesh.gowda@`).
- Attendance-board, QR, documents, late-fines, employee-import and permissions suites now resolve live employees at runtime instead of hardcoded fixture IDs.

### Fixed
- Payroll payslip ledger data repaired: orphaned `payrollitem` rows re-linked to current employees (HR location-scoped visibility restored).
- Employee `departmentId` backfill for all seeded employees (attendance-board department filter).
- Audit log hash chain repaired (90 rows re-chained) and `verifyIntegrity(50)` returns VALID.
- Incentive/penalty rule seed gaps filled for Belagavi, Davanagere and Shivamogga (12 incentive + 9 penalty rules).
- Security-suite expectations aligned with documented administered posture: forgot-password `410 PUBLIC_RESET_DISABLED`, self-registration `403 SELF_REGISTRATION_DISABLED`, `X-Frame-Options: SAMEORIGIN`.
- Full automated suite: **212/212 passing (100%)**.

## [1.0.0] - Standalone Windows Desktop Release (2026-10-12)

### Added
- **Electron Desktop Shell (`desktop/`):**
  - Integrated Electron 44.7.0 desktop wrapper with native window management (1400x900).
  - AppUserModelId: `com.bsctextiles.hrms`.
  - Native Start Menu & Desktop shortcuts via NSIS installer.
  - Context-isolated preload bridge (`window.electronAPI`) with zero Node integration in renderer for maximum security.
  - Native print triggers for A4 payslip generation.
- **Embedded SQLite 3 Engine (`backend/src/sqliteDb.ts`):**
  - High-performance `better-sqlite3` storage operating in WAL mode.
  - Automated database initialization upon first launch in `%APPDATA%\BSCTextiles\data\bsc_textiles.db`.
  - Non-blocking online hot backup (`sqliteEngine.backup()`) and automated restore engine.
- **Schema & Master Seed Data (`database/sqlite/`):**
  - 20 complete business tables: locations, floors, departments, sections, shifts, employees, users, attendance rules, attendance, late records, payroll runs, payroll items, customer CRM, wedding registrations, telecaller interactions, customer feedback, showroom footfall, visual merchandising, and audit logs.
  - Master seeds for Belagavi (`BEL`), Davanagere (`DAV`), and Shivamogga (`SHI`).
  - Pre-seeded statutory late fine rule: ₹1.0/minute late penalty.
- **Automated MySQL-to-SQLite Migration Tool (`scripts/migrateToSqlite.ts`):**
  - Schema-reflective data migrator supporting live migration of employees, punches, late records, payroll runs, and audit logs.
- **Admin Database & Backup UI (`frontend/src/app/admin/local-database/`):**
  - Live system diagnostics (database path, WAL mode, record counts).
  - One-click hot backup creation and restore ledger.
  - Offline eSSL biometric USB punch file importer.
- **Branded Application Assets:**
  - 256x256 high-resolution icon (`desktop/assets/icon.png`) and multi-resolution Windows icon (`desktop/assets/icon.ico`).
- **Packaging & Build System:**
  - Configured `electron-builder.yml` producing standalone `BSC-Textiles-Setup-1.0.0.exe`.
  - Decoupled application data directory preventing accidental data wipe on upgrade or uninstallation.

### Changed
- Universal database adapter (`backend/src/nativeDb.ts`): dynamically routes database queries to SQLite by default when running in offline desktop mode.
- Local backend server: strictly constrained to bind to loopback `127.0.0.1`, rejecting all external network calls.
- Upgraded root `package.json` with desktop lifecycle scripts (`npm run build:desktop`, `npm run dev:desktop`, `npm run package:installer`).
- **Security Vulnerability Remediation (`npm audit`):**
  - Resolved `sprintf-js` and `global-agent` vulnerabilities (`GHSA-hp3w-g68c-fv3c`) by overriding `@electron/get` to `^5.1.0` (which drops `global-agent`/`roarr`/`sprintf-js` entirely) and pinning `builder-util-runtime` to `^9.7.0`.
  - Achieved `0 vulnerabilities` across all 815 audited packages.
