# BSC Textiles HRMS — Project Memory & Architectural Ledger

## 1. System Identity
* **Application:** BSC Textiles HRMS — Desktop Enterprise Edition
* **App Identifier:** `com.bsctextiles.hrms`
* **Target OS:** Windows 10 & Windows 11 (64-bit)
* **Packaging Target:** NSIS Installer (`BSC-Textiles-Setup-1.0.0.exe`) and unpacked binaries (`release/win-unpacked/`)

---

## 2. Architectural Decisions & Constraints

### 2.1 Single-Computer / Zero-Internet Constraint
* The client required a standalone system that executes on a single PC or laptop without external servers, internet access, or remote MySQL.
* **Solution:** Replaced MySQL runtime dependency with an embedded SQLite 3 engine running in WAL mode, persisting to `%APPDATA%\BSCTextiles\data\bsc_textiles.db`.
* **Binding:** Local backend strictly binds to `127.0.0.1`. No port is published to external LAN interfaces.

### 2.2 Electron Security
* Enabled `contextIsolation: true` and disabled `nodeIntegration: false`.
* Preload bridge (`desktop/src/preload.ts`) provides clean, type-safe IPC communication without exposing sensitive Node APIs to the React renderer.
* External web URLs are intercepted and opened in the default OS browser.

### 2.3 Statutory Payroll & Payslip Rules
* Fixed statutory late fine: **₹1.0 per minute** late (`₹1.0/min`).
* Authentic Davanagere Payslip design recreated and preserved with multi-showroom switcher (`BEL`, `DAV`, `SHI`).
* Dynamic employee search and selection with validation for matching employee name and ID.
* Floor-wise salary overview displaying gross salary, deductions, net payable, and employer contributions per floor.

### 2.4 Offline Biometric Integration
* Biometric data import is decoupled from cloud connectivity.
* Biometric punches can be imported directly from USB flash drive logs via the offline log importer in the desktop interface.

---

## 3. Directory Layout

```
BSC Textiles HRMS/
├── backend/                  # Local Node.js Express service
│   ├── src/
│   │   ├── sqliteDb.ts       # better-sqlite3 engine with WAL & backup
│   │   ├── nativeDb.ts       # Universal query router (SQLite default)
│   │   ├── routes/
│   │   │   └── localDatabase.ts # Backup, restore, and biometric API
│   │   └── server.ts         # Loopback HTTP server (127.0.0.1:5000)
├── database/
│   └── sqlite/
│       ├── schema.sql        # 20 SQLite business tables
│       └── seed.sql          # Seed data for BEL, DAV, SHI & admin
├── desktop/                  # Electron desktop application shell
│   ├── assets/               # Branded icons (icon.ico, icon.png)
│   ├── src/
│   │   ├── main.ts           # Electron main process & backend supervisor
│   │   └── preload.ts        # Context-isolated IPC bridge
│   ├── electron-builder.yml  # NSIS packaging specification
│   └── package.json
├── frontend/                 # React / Next.js user interface
│   └── src/app/
│       ├── admin/local-database/ # Backup & diagnostic control center
│       ├── payroll/payslips/     # Payslip generator with Davanagere layout
│       └── payroll/floor-overview/ # Floor-wise salary roll-up
├── release/                  # Packaged Windows desktop binaries
│   ├── win-unpacked/         # Unpacked portable executable
│   └── BSC-Textiles-Setup-1.0.0.exe # Final NSIS Windows Installer
└── docs/                     # Architectural & operational documentation
```
