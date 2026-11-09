# BSC Textiles HRMS — Desktop Application Security Model

## 1. Local-Only Threat Model

BSC Textiles HRMS is strictly designed as a single-computer desktop system. The security architecture guarantees that neither the application nor its data is exposed to local networks or the internet.

---

## 2. Electron Hardening Guidelines

The desktop shell (`desktop/src/main.ts`) adheres to the official Electron Security Best Practices:

1. **Context Isolation:**
   ```typescript
   webPreferences: {
     preload: path.join(__dirname, 'preload.js'),
     contextIsolation: true,
     nodeIntegration: false,
     webSecurity: true
   }
   ```
   * The renderer (React UI) cannot access Node.js globals (`require`, `process`, `fs`, `child_process`).
   * Only explicitly declared APIs are bridged via `window.electronAPI` in `preload.ts`.

2. **Secure IPC Surface:**
   * Preload exports only high-level, strictly validated IPC channels (`desktop:backup-db`, `desktop:restore-db`, `desktop:get-system-info`, `desktop:print-document`, `desktop:open-data-dir`).
   * No raw database queries or command executions are permitted through IPC.

3. **External Navigation Restrictions:**
   ```typescript
   mainWindow.webContents.setWindowOpenHandler(({ url }) => {
     if (url.startsWith('http:') || url.startsWith('https:')) {
       shell.openExternal(url);
     }
     return { action: 'deny' };
   });
   ```
   * External links open exclusively in the user's default system web browser, never inside the Electron application window.
   * `will-navigate` prevents renderer redirects to remote unauthorized web endpoints.

---

## 3. Local Loopback Isolation

1. **No External Network Binding:**
   * The local Node.js microservice binds exclusively to `127.0.0.1` (`localhost`).
   * It **never** listens on `0.0.0.0` or local network interfaces (`192.168.x.x`, `10.x.x.x`).
   * Other devices on the same Wi-Fi or LAN cannot access the backend port.

2. **Token Session Security:**
   * All REST endpoints require standard Bearer JWT tokens.
   * Authentication secrets and salts are managed locally in the persistent configuration.

---

## 4. Database Security & Storage Integrity

1. **Parameterized Queries:**
   * All SQL queries executed through `better-sqlite3` and `sqliteDb.ts` use parameterized statements (`?` placeholders).
   * Strict protection against SQL injection.

2. **Access Protection:**
   * The database is stored in `%APPDATA%\BSCTextiles\data\bsc_textiles.db` within the authenticated Windows user's profile directory.
   * Windows User Profile ACLs protect this directory from unauthorized local user accounts.

3. **Password Hashing:**
   * All passwords are encrypted with industry-standard bcrypt hashing (`10` salt rounds).
   * Passwords are never logged or stored in plaintext.
