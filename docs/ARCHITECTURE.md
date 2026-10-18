# BSC Textiles HRMS — Standalone Desktop Architecture

## 1. Overview
BSC Textiles HRMS is an installable, standalone Windows desktop application designed to run on a **single computer or laptop** without internet connectivity, cloud servers, or external database dependencies.

```
┌────────────────────────────────────────────────────────────────────────┐
│               Windows 10 / 11 Host Computer                            │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Electron Desktop Shell                        │  │
│  │  - Native window frame & branding (BSC Textiles HRMS)             │  │
│  │  - Context isolation enabled, Node integration disabled          │  │
│  │  - Preload IPC Bridge (window.electronAPI)                        │  │
│  │  - Native Printing, Backup & Restore File Dialogs                │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ IPC / Localhost                  │
│  ┌──────────────────────────────────┴───────────────────────────────┐  │
│  │                     React.js User Interface                      │  │
│  │  - Bundled local assets, Lucide icons, responsive layout         │  │
│  │  - HRMS, Payroll, Payslip Manager, Biometric & Operations        │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ Local HTTP / REST (127.0.0.1)    │
│  ┌──────────────────────────────────┴───────────────────────────────┐  │
│  │                    Embedded Node.js Backend                      │  │
│  │  - Bound strictly to 127.0.0.1 (No external network exposure)    │  │
│  │  - Express.js micro-service with enterprise JWT auth             │  │
│  │  - Statutory payroll calculation engine (₹1.0/min late fine)      │  │
│  │  - Biometric eSSL USB log importer                               │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ SQLite WAL Engine                │
│  ┌──────────────────────────────────┴───────────────────────────────┐  │
│  │              Persistent Local Storage (%APPDATA%)                │  │
│  │  - Database: %APPDATA%\BSCTextiles\data\bsc_textiles.db           │  │
│  │  - Attachments: %APPDATA%\BSCTextiles\uploads                     │  │
│  │  - Backups: %APPDATA%\BSCTextiles\backups                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Architecture Decisions

### 2.1 Single-Computer Constraint
* **No Network Listeners Exposed:** The local backend binds exclusively to `127.0.0.1` (loopback). No other computers on the LAN can reach the database or local API.
* **No Cloud Dependency:** Authentication, biometric validation, attendance calculations, and payslip rendering execute 100% locally on the host CPU.

### 2.2 Local Database (SQLite 3 with WAL Mode)
* **Storage Location:** `%APPDATA%\BSCTextiles\data\bsc_textiles.db`.
* **Zero MySQL Dependency for Production:** Eliminates the need to install or run MySQL Server on the target computer.
* **Write-Ahead Logging (WAL):** High concurrency, atomic commits, zero corruption on sudden system shutdown or power loss.
* **Online Hot Backups:** SQLite native `.backup()` API copies the entire database safely in background without blocking transactions.

### 2.3 Electron Security Model
* `contextIsolation: true`
* `nodeIntegration: false`
* `webSecurity: true`
* `sandbox: false` (to allow preload bridge)
* Preload IPC bridge exposes only typed methods: `triggerBackup`, `triggerRestore`, `getSystemInfo`, `printA4Document`, `openDataDirectory`.

---

## 3. Supported Multi-Showroom Locations on One System
The application manages all 3 BSC Textiles showroom units in the single database:
1. **Belagavi (`BEL`):** Belagavi Mega Showroom
2. **Davanagere (`DAV`):** Davanagere Mega Store
3. **Shivamogga (`SHI`):** Shivamogga City Center
---

## 4. The web monorepo (what `npm run dev` actually starts)

Sections 1-3 describe the packaged desktop variant (SQLite, loopback only). The
repository is primarily the client/server monorepo below, and both variants share
the frontend code and the attendance rules.

    frontend/   Next.js 15 App Router  — screens, gates, no business decisions
    backend/    Express + TypeScript   — every authority check, every calculation
    database/   native SQL             — migrations, seeds, views, migrate runner
    connector/  shop-floor relay PC    — polls terminals, forwards verified batches
    infra/      nginx, redis, Docker   — TLS, headers, shared store, containers

### 4.1 Backend module map

| Area | Files | Responsibility |
|---|---|---|
| Auth session | `routes/authSession.ts`, `services/authentication.ts` | lockout, captcha, Argon2id + pepper, single-use ticket exchange, constant-time response floor |
| Tokens | `services/tokenService.ts`, `services/signingKeys.ts` | ES256 access tokens with `kid` + JWKS, hashed refresh-token families, `ptv` claim for instant invalidation |
| RBAC | `services/accessControl.ts`, `middleware/rbac.ts` | `rolepermission` action grants (view/create/edit/update/delete/export/approve), `requireAction` |
| Device ingest | `routes/adms.ts` (`/iclock`), `routes/devices.ts`, `services/biometric/ingest.ts` | dedupe by `dedupHash`, exact identity resolution, verify-code resolution, projection onto `attendance` |
| Verify methods | `services/biometric/verifyMode.ts`, table `verify_mode_mapping` | raw code → label + family; unmapped reads `Unknown (n)`, absent reads `Not reported by device` |
| Time | `services/biometric/timeCodec.ts` | device wall time ↔ UTC wall string, store-timezone business date |
| Attendance rules | `core/services/AttendanceCalculationService.ts` | shift window, durations, late/early, overtime, status derivation |
| Live feed | `services/workforceEvents.ts`, `routes/liveActivities.ts` | `workforce_event` journal, idempotent sweep, socket publish, HR decisions |
| Exports | `services/attendance/attendanceWorkbook.ts`, `services/biometric/exportWorkbook.ts`, `routes/attendanceExports.ts` | streamed `.xlsx`: monthly register, annual breakdown, raw punch ledger |
| Security ops | `services/securityMonitoringService.ts`, `services/auditService.ts` | hash-chained audit log, `MASS_EXPORT` / `IMPOSSIBLE_TRAVEL` events |

### 4.2 Two sources of truth, deliberately separated

* `biometric_raw_punches` — immutable device events: original time, normalised
  time, verify code and label, mapping status, dedupe hash, photo path.
* `attendance` — one calculated row per employee per business date. Derived data:
  recomputed from the ledger when source events change, never hand-patched.

Screens read the ledger for "what the terminal saw" and `attendance` for "what HR
pays". A value that exists in neither is displayed as unavailable rather than
invented — this is why face-match percentages, demo employees and fallback punch
rows were removed from the dashboard, reports and self-service screens.

### 4.3 Permission model, in one paragraph

The browser hides what you cannot use; the server decides what you may do. Every
attendance, device and export route re-checks `authorize(...)` or
`requireAction(module, action)` against `rolepermission`, non-elevated users are
pinned to their own showroom by `getScopedLocationId` / `scopedLocation`, and
registry writes plus mismatch resolutions additionally require a role from
`MISMATCH_RESOLVER_ROLES`. Exports require `ATTENDANCE` + `export` and are audited
with the filters and the row count.

### 4.4 Where to read more

* [ATTENDANCE_FLOW.md](ATTENDANCE_FLOW.md) — a punch from terminal to screen
* [DEVICE_SETUP.md](DEVICE_SETUP.md) — MB160 registration, transports, diagnostics
* [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — the failures that actually happen
* [../SECURITY.md](../SECURITY.md) — threat model, enforcement map, known gaps
