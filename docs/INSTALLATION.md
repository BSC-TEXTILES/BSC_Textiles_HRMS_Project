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
   * `seed.sql` (initializes Belagavi, Davanagere, Shivamogga showrooms, floors, departments, shifts, and statutory ₹1.0/sec late fine rules).
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
