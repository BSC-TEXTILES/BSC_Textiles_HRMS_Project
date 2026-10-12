# BSC Textiles HRMS — Local Backup, Restore & Data Migration Guide

## 1. Local Database Architecture

All application data is consolidated within a single, persistent SQLite database:
* **Production Path:** `%APPDATA%\BSCTextiles\data\bsc_textiles.db`
* **Mode:** SQLite Write-Ahead Logging (WAL) with strict foreign key constraints.
* **Separation of Concerns:** The database file is located outside the installation directory to prevent data loss during application updates or reinstallation.

---

## 2. Creating a Hot Online Backup

### Method A: Through the Desktop User Interface
1. Log in as an Administrator.
2. In the sidebar, navigate to **Settings → Local Database**.
3. Under the **Database Operations** card, click **Create Backup Now**.
4. The application executes a non-blocking SQLite hot backup via `sqliteEngine.backup()`.
5. Backups are timestamped and saved into:
   ```
   %APPDATA%\BSCTextiles\backups\bsc_backup_YYYYMMDD_HHMMSS.db
   ```
6. The UI updates immediately, displaying the new backup in the ledger with its exact file size and verification status.

### Method B: Via CLI Script (For IT Staff / Batch Automation)
Run the automated backup script from PowerShell:
```powershell
npx ts-node backend/src/scripts/backupDatabase.ts
```

---

## 3. Restoring from a Backup

### Method A: Through the Desktop UI
1. Navigate to **Settings → Local Database**.
2. Scroll to the **Existing Backups** table.
3. Locate the desired backup file and click **Restore**.
4. A confirmation dialog will prompt you to confirm the action.
5. Upon confirmation:
   * The current database is flushed and safely closed.
   * A safety snapshot of the existing database is created automatically (`bsc_pre_restore_snapshot.db`).
   * The target backup file is copied over `%APPDATA%\BSCTextiles\data\bsc_textiles.db`.
   * Integrity checks (`PRAGMA integrity_check`) are executed to verify consistency.
   * The database engine reconnects in WAL mode.

### Method B: Manual File System Replacement
If the computer cannot open the desktop shell:
1. Ensure the desktop application is closed.
2. Navigate to:
   ```
   C:\Users\<YourUsername>\AppData\Roaming\BSCTextiles\data
   ```
3. Rename the damaged `bsc_textiles.db` to `bsc_textiles_corrupted.db`.
4. Copy your chosen backup file (e.g., `bsc_backup_20261012_183000.db`) into this folder and rename it to `bsc_textiles.db`.
5. Remove any leftover temporary journal files (`bsc_textiles.db-wal` or `bsc_textiles.db-shm`).
6. Launch BSC Textiles HRMS. The application will resume with the restored dataset.

---

## 4. Transferring Data to a New Computer / Laptop

To migrate BSC Textiles HRMS to a new laptop:
1. Run the installer `BSC-Textiles-Setup-1.0.0.exe` on the new laptop.
2. Launch the application once on the new laptop to let it initialize the directory structure, then close it.
3. On the original computer, copy the folder:
   ```
   C:\Users\<Username>\AppData\Roaming\BSCTextiles
   ```
4. Paste this folder into the corresponding AppData Roaming directory on the new computer:
   ```
   C:\Users\<NewUsername>\AppData\Roaming\BSCTextiles
   ```
5. Launch BSC Textiles HRMS on the new computer. All showrooms, employees, attendance punches, and historical payroll records will be immediately accessible.
