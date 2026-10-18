# BSC Textiles HRMS — Windows Installation & Setup Guide

## 1. System Requirements

* **Operating System:** Windows 10 (64-bit) or Windows 11 (64-bit).
* **Processor:** Intel Core i3 / AMD Ryzen 3 or higher.
* **RAM:** Minimum 4 GB (8 GB recommended).
* **Storage:** 500 MB free disk space for application files + storage for database & backups.
* **Network Requirement:** **None**. Zero internet, LAN, cloud, or external database connection required.

---

## 2. Installation via Standalone Installer (.exe)

1. Locate the standalone Windows installer executable:
   ```
   release/BSC-Textiles-Setup-1.0.0.exe
   ```
2. Double-click `BSC-Textiles-Setup-1.0.0.exe`.
3. Choose the target installation folder (default: `C:\Users\<User>\AppData\Local\Programs\BSC Textiles HRMS`).
4. Select shortcut options:
   * **Create Desktop Shortcut** (checked by default)
   * **Create Start Menu Shortcut** (checked by default)
5. Click **Install**. The NSIS installer will extract the prepackaged runtime, UI, and backend services.
6. Once installation completes, click **Finish** to launch **BSC Textiles HRMS**.

---

## 3. First Launch & Automatic Initialization

On first launch on any Windows machine:
1. The application automatically boots an isolated background micro-service on loopback (`127.0.0.1:5000`).
2. Checks for existing SQLite database in:
   ```
   %APPDATA%\BSCTextiles\data\bsc_textiles.db
   ```
3. If this is a fresh computer, the application automatically runs:
   * `schema.sql` (creates all 20 business tables, indexes, and foreign keys).
   * `seed.sql` (initializes Belagavi, Davanagere, Shivamogga showrooms, floors, departments, shifts, and statutory ₹1.0/min late fine rules).
4. Pre-configured Administrator credentials are immediately active:
   * **Super Admin:** `admin@bsctextiles.com` / `admin123`
   * **HR Manager:** `kavita.bhat@bsctextiles.com` / `hr123`
5. The native desktop window appears at 1400×900 with complete offline access to all HRMS, payroll, Davangere payslips, attendance, and CRM modules.

---

## 4. Upgrades and Data Safety Guarantee

* When a newer installer (`BSC-Textiles-Setup-x.x.x.exe`) is executed to upgrade the application, **no user data is modified or erased**.
* The persistent database resides in `%APPDATA%\BSCTextiles\data\bsc_textiles.db`, which is completely decoupled from the program installation directory.
* Even if the application is uninstalled via Windows Control Panel / Settings, `deleteAppDataOnUninstall: false` ensures your business database and document backups remain intact.

---

## 5. Development Mode (Running from Source in VS Code)

> **Read this first if you are on this branch.** The four commands below belong
> to the packaged desktop edition. `desktop/` is **not present** in
> `v2-production-clean`, and `npm run setup`, `build:desktop`, `dev:desktop` and
> `package:installer` are **not defined** in the root `package.json`. They will
> fail with "Missing script". Use section 6 for the source install. Nothing here
> has been verified against a desktop build because no desktop build exists in
> this repository.

If opening and developing in VS Code:
1. **Install Dependencies:**
   ```powershell
   npm run setup
   ```
2. **Compile TypeScript Backend & Desktop Shell:**
   ```powershell
   npm run build:backend
   npm run build:desktop
   ```
3. **Run Full Desktop App in Dev Mode:**
   ```powershell
   npm run dev:desktop
   ```
4. **Build Production Installer:**
   ```powershell
   npm run package:installer
   ```

---

## 6. Install from source (the path that is actually verified)

This is the Web + API + worker deployment used by local LAN mode and by the
server. Every command and result below was executed on 2026-10-18 from a copy of
the working tree with no `node_modules`, and the numbers are the real output.

### 6.1 Package manager and Node version

| Item | Value | Evidence |
|---|---|---|
| Package manager | **npm** only | One lockfile in the repo: `package-lock.json` (`lockfileVersion: 3`). There is no `yarn.lock`, `pnpm-lock.yaml` or `bun.lock` tracked in Git. |
| Workspaces | `frontend`, `backend`, `database` | Root `package.json → workspaces`. `connector/` has no manifest and is not a workspace. |
| Minimum Node | `>=20.0.0` | Root `package.json → engines.node`. |
| Recommended Node | **22 LTS** | `.nvmrc` pins `22`. Prebuilt native binaries (section 6.3) are published for LTS ABIs; odd-numbered and current-line releases (e.g. Node 25) have no `better-sqlite3` prebuild and must compile from source. |
| npm used for the run | 11.12.1 | `npm -v` |
| Node used for the run | v25.9.0 | `node -v` — deliberately the *hardest* version, to prove the install does not depend on a native build succeeding. |

`D:\bun.lock` on the development machine sits **outside** this repository and is
not this project's lockfile; do not delete it and do not treat Turbopack's root
misdetection as a missing lockfile — the workspace root is pinned explicitly in
`frontend/next.config.ts`.

### 6.2 Verified sequence

Run from the repository root. All commands must exit `0`.

```bash
npm ci                      # install exactly what package-lock.json pins
npm run typecheck           # backend + database + frontend, --if-present
npm run build:backend       # tsc → backend/dist
npm run build:frontend      # next build
npm run db:migrate          # apply database/migrations/*.sql forward-only
npm run dev:backend         # API on :4000  (tests below call it over HTTP)
npm test                    # 239 assertions
npm run test:biometric      # 48
npm run test:rbac           # 25
npm run test:security       # 28
npm run test:live           # 12
npm run test:export         # 10
npm audit                   # 0 findings
```

Real results from the clean copy:

```
npm ci              → added 745 packages, and audited 750 packages in 2m
                      found 0 vulnerabilities                     (exit 0)
npm run typecheck   → exit 0
npm run build:backend  → tsc, exit 0
npm run build:frontend → Compiled successfully in 24.7s, 83/83 static pages, exit 0
npm test            → Total Tests Run: 239   Passed: 239 (100.0%)   Failed: 0
standalone suites   → 48 / 25 / 28 / 12 / 10, 0 failed each
                      362 assertions green in total
```

`npm ci` — not `npm install` — is the command a deployment must use: it refuses
to write to the lockfile, so the server gets exactly the resolved graph that was
audited.

### 6.3 Native (compiled) dependencies

There is **no vendor biometric SDK in this repository**. `git ls-files` finds no
`.dll`, `.so`, `.node`, `.exe` or `.jar`, and no code references `zkemkeeper` or
any ZKTeco/eSSL COM or shared library. The MB160 protocol is implemented in pure
Node over `node:net` (`backend/src/services/zkProtocolAdapter.ts`,
`backend/src/services/biometricService.ts`) and the device-push receiver is
ordinary HTTP (`backend/src/routes/adms.ts`). Nothing in the device path is
Windows-only, so the same code runs unchanged on Linux.

The genuine native packages, and what they mean for a Linux host:

| Package | Where | Linux x64 prebuilt? | If it is missing |
|---|---|---|---|
| `@node-rs/argon2` | backend **dependency** (password hashing) | yes — `@node-rs/argon2-linux-x64-gnu` and `-musl` are declared in its `optionalDependencies` | The backend crashes at module load: `PasswordService.ts` imports it statically. New hashes are Argon2id only — `bcryptjs` is present solely to verify legacy `$2…` hashes and upgrade them — so there is no fallback that keeps hashing working. The platform package **must** install. |
| `better-sqlite3` | backend **optionalDependency** (offline desktop SQLite engine only) | built from source on Linux (`python3`, `make`, `g++`) or skipped | `backend/src/sqliteDb.ts` requires it lazily inside `try/catch`. The MySQL/Postgres server never loads it. `/admin/local-database` reports `better-sqlite3 driver is unavailable in this environment` and the rest of the HRMS keeps working. |
| `sharp` | optional, pulled in by `next` for image optimisation | yes — `@img/sharp-linux-x64` (glibc) | Image `output` formats fall back; the app still builds and serves. |

`better-sqlite3` was moved out of `dependencies` because a fresh `npm ci` on
Node 25 aborted the whole install when node-gyp could not build it, leaving the
tree unusable. It is now `optionalDependencies`, and the verified install above
succeeds whether or not that native build works. On a Linux server that should
offer the offline-desktop mode, install the toolchain first:

```bash
sudo apt-get install -y python3 make g++    # Debian/Ubuntu, only for the SQLite mode
```

### 6.4 Operating-system prerequisites on the server

* Node.js 22 LTS (or any `>=20` you are prepared to rebuild native modules for).
* MySQL 8.0 reachable over TCP — local socket or a managed database. The web
  process, the worker and the device receiver all use the same `DATABASE_URL`.
* Outbound `npm`/registry access on the build machine only; the runtime needs
  none.
* Nothing else. No .NET, no Visual Studio, no vendor driver, no COM registration.
