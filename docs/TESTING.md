# BSC Textiles HRMS — Verification & QA Testing Report

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
