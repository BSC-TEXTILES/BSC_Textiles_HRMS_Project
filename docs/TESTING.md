# BSC Textiles HRMS — Verification & QA Testing Report

> **Scope warning, added 2026-10-18.** Sections 1–4 below describe the packaged
> **Windows/Electron + SQLite desktop edition**. None of it is reproducible on the
> `v2-production-clean` branch: `desktop/`, `release/`,
> `scripts/migrateToSqlite.ts` and `sample_essl_punches.dat` do not exist in the
> repository or on disk, and `npm run build:desktop` / `dev:desktop` /
> `package:installer` are not defined in any manifest. Treat every **PASSED** in
> those sections as *not verified here* — they are retained as another
> contributor's record of a different tree, not as evidence about this one.
> Section 5 is what was actually executed against this branch, with the real
> numbers.

---

## 5. Verification record for `v2-production-clean` (2026-10-18)

Environment: Windows 11 x64, Node v25.9.0 (deliberately newer than the supported
LTS, to prove the install does not depend on a native build succeeding), npm
11.12.1, MySQL 8.0 on localhost, Redis absent (in-memory fallback).

### 5.1 Clean install from a fresh checkout

Copied the tree without `node_modules`/`.next`/`dist` into an empty directory:

| Command | Result |
|---|---|
| `npm ci` | exit 0 — `added 745 packages, and audited 750 packages`, `found 0 vulnerabilities` |
| `npm run typecheck` | exit 0 (backend, database, frontend) |
| `npm run build:backend` | exit 0 (`tsc`) |
| `npm run build:frontend` | exit 0 — `Compiled successfully in 24.7s`, 83/83 static pages, no workspace-root warnings |
| `npm ci --os=linux --cpu=x64` | exit 0 — selects `@node-rs/argon2-linux-x64-gnu` / `-musl`; no Windows-only binary is required by the server |

### 5.2 Automated suites, run against the live API on `:4000`

| Suite | Command | Result |
|---|---|---|
| Full PRD suite | `npm test` | **240 / 240 passed**, 0 failed |
| Biometric correctness | `npm run test:biometric` | **48 / 48** |
| RBAC | `npm run test:rbac` | **25 / 25** |
| Security controls | `npm run test:security` | **29 / 29** |
| Live activities | `npm run test:live` | **12 / 12** |
| Attendance export | `npm run test:export` | **10 / 10** |
| Dependency audit | `npm audit`, `npm audit --omit=dev` | `found 0 vulnerabilities` (registry `registry.npmjs.org`) |
| Secret scan | `npm run secret-scan` | zero findings across tracked files |

### 5.3 Live HTTP evidence (not mocked)

`GET /api/attendance/exports/monthly?year=2026&month=10` → HTTP 200,
`20504` bytes starting `PK`, `content-type: application/vnd.openxmlformats-…sheet`,
`content-disposition: …attendance-monthly-2026-10-01-to-2026-10-31.xlsx`.
`month=13` → 400 `month must be between 1 and 12.` · anonymous → 401.
`GET /api/employees` → 200, `total=14`; `GET /api/exits` → 200.

### 5.4 Browser verification

Signed in at `/login` as `SUPER_ADMIN` and opened `/attendance/devices`. The
three Davanagere terminals render `Disconnected · Last seen: never · Device time:
not read yet · Drift: not measured` with their real `CONNECT_TIMEOUT` text, and
the loopback simulator carries the amber *"Not a shop-floor terminal —
development fixture…"* banner. No field renders a fabricated time.

### 5.5 What has **not** been verified

* **No physical eSSL MB160 has ever been connected to this codebase.** Every
  device-path result above comes from the loopback simulator or unit tests, which
  is why the device console distinguishes fixtures at all. Real-terminal
  acceptance — identity, verification-mode reporting, photo push, pull
  completeness, dashboard latency — remains outstanding and cannot be closed from
  this workstation, because the terminals sit on isolated `192.168.100.x`
  shop-floor VLANs.
* Cloud push (`DEVICE_SYNC_MODE=cloud_push`) has been exercised only against a
  simulated terminal posting to `/iclock` on localhost, never against device
  firmware, so whether your specific MB160 build offers ADMS at all is still a
  vendor/on-site question.
* The Hostinger deployment has not been executed from this branch.

### 5.6 Rule for new device tests

A test must never ingest punches or record a heartbeat under a registered
production serial. Ingest and heartbeat are production code: they stamp
`status`, `lastConnectionAt`, `lastHeartbeatAt`, `lastSeenAt` and `lastSyncAt` on
whichever row the serial resolves to, so a borrowed serial makes a real terminal
look synchronized. Create a fixture with
`registerDeviceConfig({ …, isFixture: true })`, use its serial, delete it at the
end — see `biometricIntegration.test.ts` and `dualModeBiometricSync.test.ts`.
Migration `046_quarantine_test_injected_device_state.sql` is what cleaned up
before that rule existed.

## 1. Test Suite Summary

This document reports all automated and manual validation procedures conducted to verify that BSC Textiles HRMS functions as a 100% offline, standalone Windows desktop application.

---

## 2. Test Execution Log

| Test ID | Test Category | Target Component | Description / Method | Result | Details |
|---|---|---|---|---|---|
| **TEST-01** | Database Engine | `sqliteDb.ts` | WAL Mode & Foreign Key activation | **PASSED** | Executed `PRAGMA journal_mode` (returns `wal`) and `PRAGMA foreign_keys` (returns `1`). |
| **TEST-02** | Database Query | `sqliteDb.ts` | Compatibility with `pool.query()` & `pool.getConnection()` | **PASSED** | SELECT, INSERT, UPDATE, parameter binding executed cleanly. |
| **TEST-03** | Hot Backup | `sqliteDb.ts` | Online `.backup()` snapshot generation | **PASSED** | Created `test_backup.db` (295 KB). Executed `PRAGMA integrity_check` -> `ok`. |
| **TEST-04** | Hot Restore | `sqliteDb.ts` | Database restoration from snapshot | **PASSED** | Restored test database, validated record count integrity, verified zero data corruption. |
| **TEST-05** | Data Migration | `scripts/migrateToSqlite.ts` | Schema-reflective transfer from MySQL | **PASSED** | Successfully migrated 4 locations, 13 floors, 24 depts, 57 sections, 12 shifts, 36 employees, 36 users, 318 punches, 341 late records, 5 payroll runs, 72 payroll items, 1,238 audit logs. |
| **TEST-06** | Statutory Calculation | `backend/src/` | ₹1.0/min late fine deduction rules | **PASSED** | Verified late seconds calculation and precise rupee penalty calculation for Sadashiva (1372) and retail staff. |
| **TEST-07** | Davanagere Payslip | Frontend UI | Multi-showroom payslip selector & search | **PASSED** | Employee search bar loads records dynamically. Selecting employee renders exact Davanagere Payslip layout with earnings/deductions breakdown. |
| **TEST-08** | Floor-Wise Overview | Frontend UI | Floor-wise salary roll-up | **PASSED** | Grouped metrics by floor (Ground Floor, First Floor, etc.) with gross, deductions, and net payable summaries. |
| **TEST-09** | Electron Compilation | Desktop Shell | `desktop/src/main.ts` & `preload.ts` TypeScript compilation | **PASSED** | `tsc -p desktop` generated clean JavaScript bundles in `desktop/dist/`. |
| **TEST-10** | Unpacked Executable | Electron Builder | `BSC Textiles HRMS.exe` creation | **PASSED** | Built executable in `release/win-unpacked/BSC Textiles HRMS.exe` with bundled Chromium, Node.js, and app resources. |
| **TEST-11** | NSIS Installer | Electron Builder | `BSC-Textiles-Setup-1.0.0.exe` creation | **IN-PROGRESS / PASSED** | NSIS installer script generated targeting Windows x64 with desktop & start menu shortcuts. |
| **TEST-12** | Offline Independence | Network Isolation | Execution without internet connectivity | **PASSED** | App relies on 127.0.0.1, bundled Lucide icons, and persistent local SQLite database. |

---

## 3. Offline Biometric USB Import Test
* **Test Case:** Simulated import of eSSL biometric punch log (`sample_essl_punches.dat`).
* **Format Tested:** Standard comma/tab-separated device exports (`<DeviceUserId>\t<Timestamp>\t<PunchType>`).
* **Result:** Successfully parsed 15 employee punch records without network connectivity, resolving to local employee records and persisting to `attendance` table.

---

## 4. Disaster Recovery & Persistence Validation
* **Test Scenario:** Force termination of backend process during idle WAL state.
* **Result:** On restart, SQLite WAL replay automatically ensured 100% data integrity with zero partial commits or database locks.
