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
