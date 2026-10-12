/**
 * BSC Textiles HRMS — Electron Main Process
 * Standalone Single-Computer Windows Desktop Shell (100% Offline)
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fork, ChildProcess } from 'child_process';
import os from 'os';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_PORT = 4000;
const FRONTEND_PORT = 3000;

// Set Application Identity for Windows Taskbar & Start Menu
app.setAppUserModelId('com.bsctextiles.hrms');

// 1. Single Instance Lock (Only one instance per computer)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 2. Determine Persistent App Storage (%APPDATA%\BSCTextiles\data)
function getAppDataPaths() {
  const baseAppData =
    process.env.APPDATA ||
    (process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Roaming')
      : path.join(os.homedir(), '.bsc_textiles'));

  const dataDir = path.join(baseAppData, 'BSCTextiles', 'data');
  const uploadsDir = path.join(baseAppData, 'BSCTextiles', 'uploads');
  const backupsDir = path.join(baseAppData, 'BSCTextiles', 'backups');
  const dbPath = path.join(dataDir, 'bsc_textiles.db');

  for (const d of [dataDir, uploadsDir, backupsDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  return { dataDir, uploadsDir, backupsDir, dbPath };
}

// 3. Start Local Node.js Backend Service (Restricted strictly to 127.0.0.1)
async function startLocalBackend(): Promise<void> {
  const { dataDir, uploadsDir, dbPath } = getAppDataPaths();

  console.log('[Desktop Main] Initializing local backend service on 127.0.0.1...');
  process.env.DB_TYPE = 'sqlite';
  process.env.SQLITE_PATH = dbPath;
  process.env.PORT = String(BACKEND_PORT);
  process.env.UPLOAD_DIR = uploadsDir;
  process.env.NODE_ENV = isDev ? 'development' : 'production';

  // In packaged production, spawn backend server script quietly without CMD window
  if (!isDev) {
    const backendScript = path.join(process.resourcesPath, 'app', 'backend', 'dist', 'index.js');
    if (fs.existsSync(backendScript)) {
      backendProcess = fork(backendScript, [], {
        env: {
          ...process.env,
          DB_TYPE: 'sqlite',
          SQLITE_PATH: dbPath,
          PORT: String(BACKEND_PORT),
          UPLOAD_DIR: uploadsDir,
        },
        silent: true,
      });

      backendProcess.on('error', (err) => {
        console.error('[Desktop Backend Process Error]:', err);
      });
    }
  }
}

// 4. Create Main Native Desktop Window
function createMainWindow(): void {
  const assetsDir = path.join(__dirname, '../assets');
  let iconPath = path.join(assetsDir, 'icon.png');
  if (process.platform === 'win32' && fs.existsSync(path.join(assetsDir, 'icon.ico'))) {
    iconPath = path.join(assetsDir, 'icon.ico');
  }

  mainWindow = new BrowserWindow({
    title: 'BSC Textiles HRMS — Enterprise Suite (Standalone Local Edition)',
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#F8F9FA',
    autoHideMenuBar: !isDev,
    show: false, // Show gracefully when ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Navigate to application
  const appUrl = isDev
    ? `http://127.0.0.1:${FRONTEND_PORT}`
    : `http://127.0.0.1:${FRONTEND_PORT}`;

  console.log(`[Desktop Main] Loading frontend UI at: ${appUrl}`);
  mainWindow.loadURL(appUrl).catch((err) => {
    console.warn('[Desktop Main] Error loading app URL:', err.message);
    // Retry once in 2 seconds
    setTimeout(() => {
      mainWindow?.loadURL(appUrl).catch(console.error);
    }, 2000);
  });

  // Handle external link clicks safely in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 5. IPC Handlers
function setupIpcHandlers(): void {
  const { dataDir, dbPath } = getAppDataPaths();

  // Get System & Offline Info
  ipcMain.handle('desktop:get-system-info', async () => {
    let dbSize = 0;
    if (fs.existsSync(dbPath)) {
      dbSize = fs.statSync(dbPath).size;
    }

    return {
      appName: 'BSC Textiles HRMS',
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      dataDirectory: dataDir,
      databasePath: dbPath,
      databaseSizeBytes: dbSize,
      isOffline: true, // Always works offline
      singleComputerMode: true,
    };
  });

  // Trigger Database Backup with File Save Dialog
  ipcMain.handle('desktop:trigger-backup', async () => {
    if (!mainWindow) return { success: false };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export BSC Textiles Database Backup',
      defaultPath: `bsc_textiles_backup_${timestamp}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
    });

    if (canceled || !filePath) return { success: false, message: 'Canceled by user' };

    try {
      // Perform copy of local SQLite database
      fs.copyFileSync(dbPath, filePath);
      const stat = fs.statSync(filePath);
      return {
        success: true,
        message: `Database backup exported successfully (${(stat.size / 1024).toFixed(1)} KB)`,
        filePath,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Trigger Database Restore with File Open Dialog
  ipcMain.handle('desktop:trigger-restore', async () => {
    if (!mainWindow) return { success: false };

    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select BSC Textiles Backup File to Restore',
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'bak'] }],
      properties: ['openFile'],
    });

    if (canceled || !filePaths.length) return { success: false, message: 'Canceled by user' };

    const backupFile = filePaths[0];

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Yes, Restore Database', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Confirm Database Restoration',
      message: 'Restoring a backup will overwrite the current database with the selected backup.',
      detail: 'A safety copy of your current database will be preserved automatically.',
    });

    if (response !== 0) return { success: false, message: 'Restoration canceled by user' };

    try {
      // Create safety snapshot
      const safetySnapshot = `${dbPath}.pre-restore-${Date.now()}`;
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, safetySnapshot);

      // Copy backup file
      fs.copyFileSync(backupFile, dbPath);

      // Reload window
      mainWindow.reload();

      return {
        success: true,
        message: `Database restored successfully. Safety snapshot saved at ${path.basename(safetySnapshot)}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Open Data Folder in Windows Explorer
  ipcMain.handle('desktop:open-data-directory', async () => {
    shell.openPath(dataDir);
    return { success: true };
  });

  // A4 Document Printing
  ipcMain.handle('desktop:print-document', async () => {
    if (!mainWindow) return { success: false };
    mainWindow.webContents.print({ silent: false, printBackground: true });
    return { success: true };
  });

  // Safe External URL
  ipcMain.handle('desktop:open-external', async (_event, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
      shell.openExternal(url);
    }
    return { success: true };
  });
}

// 6. App Lifecycle Events
app.whenReady().then(async () => {
  setupIpcHandlers();
  await startLocalBackend();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {}
    backendProcess = null;
  }
});
