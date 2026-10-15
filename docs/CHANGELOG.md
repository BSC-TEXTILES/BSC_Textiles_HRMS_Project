# BSC Textiles HRMS — Changelog

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
