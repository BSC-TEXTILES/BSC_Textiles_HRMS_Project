/**
 * BSC Textiles HRMS — Local Database, Offline System & Desktop Integration Routes
 * Provides authenticated endpoints for SQLite inspection, backup, restore,
 * and offline biometric data import.
 */

import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { sqliteEngine, sqlitePool } from '../sqliteDb.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const router = Router();
router.use(authenticate);

/**
 * 1. GET /api/system/database-info
 * Returns database status, storage location, integrity, and row counts
 */
router.get('/database-info', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const dbPath = sqliteEngine.getDatabasePath();
    const dataDir = sqliteEngine.getDataDirectory();
    const integrity = sqliteEngine.checkIntegrity();

    let fileSize = 0;
    let lastModified: Date | null = null;
    if (fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      fileSize = stat.size;
      lastModified = stat.mtime;
    }

    // Table record summaries
    const [[{ empCount }]]: any = await sqlitePool.query('SELECT count(*) as empCount FROM employee');
    const [[{ userCount }]]: any = await sqlitePool.query('SELECT count(*) as userCount FROM user');
    const [[{ attCount }]]: any = await sqlitePool.query('SELECT count(*) as attCount FROM attendance');
    const [[{ payCount }]]: any = await sqlitePool.query('SELECT count(*) as payCount FROM payrollitem');
    const [[{ locCount }]]: any = await sqlitePool.query('SELECT count(*) as locCount FROM location');

    res.json({
      success: true,
      databaseType: 'SQLite (Standalone Local Engine)',
      databasePath: dbPath,
      dataDirectory: dataDir,
      fileSizeBytes: fileSize,
      fileSizeFormatted: `${(fileSize / (1024 * 1024)).toFixed(2)} MB`,
      lastModified,
      integrityCheck: integrity,
      offlineReady: true,
      records: {
        locations: locCount,
        employees: empCount,
        users: userCount,
        attendancePunches: attCount,
        payslips: payCount,
      },
    });
  } catch (err: any) {
    console.error('Error in /system/database-info:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. POST /api/system/backup
 * Creates an immediate hot backup of the SQLite database
 */
router.post('/backup', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { destinationPath } = req.body;
    let targetPath = destinationPath;

    if (!targetPath) {
      const backupDir = path.join(sqliteEngine.getDataDirectory(), '..', 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      targetPath = path.join(backupDir, `bsc_textiles_backup_${timestamp}.db`);
    }

    const result = await sqliteEngine.backup(targetPath);

    res.json({
      success: true,
      message: 'Hot database backup created successfully',
      backupPath: result.path,
      sizeBytes: result.sizeBytes,
      sizeFormatted: `${(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error in /system/backup:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. GET /api/system/backups
 * Lists all existing local backups
 */
router.get('/backups', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const backupDir = path.join(sqliteEngine.getDataDirectory(), '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      return res.json({ success: true, backups: [] });
    }

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db') || f.endsWith('.bak'));
    const backups = files.map((file) => {
      const fullPath = path.join(backupDir, file);
      const stat = fs.statSync(fullPath);
      return {
        fileName: file,
        fullPath,
        sizeBytes: stat.size,
        sizeFormatted: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
        createdAt: stat.birthtime,
      };
    });

    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json({ success: true, backups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. POST /api/system/restore
 * Restores database from a local backup file
 */
router.post('/restore', authorize('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { backupPath } = req.body;
    if (!backupPath || !fs.existsSync(backupPath)) {
      return res.status(400).json({ success: false, error: 'Valid backup file path is required' });
    }

    const result = await sqliteEngine.restore(backupPath);
    res.json(result);
  } catch (err: any) {
    console.error('Error in /system/restore:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. POST /api/system/biometric-import
 * Imports eSSL biometric device logs offline from CSV or DAT format
 */
router.post('/biometric-import', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { logContent, locationCode = 'DAV' } = req.body;
    if (!logContent || typeof logContent !== 'string') {
      return res.status(400).json({ success: false, error: 'Biometric file content is required' });
    }

    // Find location
    const [locRows]: any = await sqlitePool.query('SELECT id FROM location WHERE code = ? LIMIT 1', [locationCode]);
    const locationId = locRows[0]?.id || 'loc_davanagere';

    const lines = logContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    let importedCount = 0;
    let skippedCount = 0;

    for (const line of lines) {
      // Supports tab-separated or comma-separated: <EmpCode> <Date> <Time> or <EmpCode>,<DateTime>
      const parts = line.split(/[\t, ]+/);
      if (parts.length < 2) continue;

      const empCode = parts[0].trim();
      const datePart = parts[1]?.trim();
      const timePart = parts[2]?.trim() || '10:30:00';

      // Match employee
      const [empRows]: any = await sqlitePool.query('SELECT id, shiftId FROM employee WHERE employeeCode = ? LIMIT 1', [empCode]);
      if (!empRows.length) {
        skippedCount++;
        continue;
      }

      const empId = empRows[0].id;
      const shiftId = empRows[0].shiftId;
      const punchDate = datePart.includes('-') ? datePart : new Date().toISOString().split('T')[0];
      const punchInTime = `${punchDate} ${timePart}`;

      // Insert or update attendance
      const punchId = `att_${empId}_${punchDate.replace(/-/g, '')}`;
      await sqlitePool.query(`
        INSERT INTO attendance (id, employeeId, locationId, shiftId, attendanceDate, punchIn, status, source)
        VALUES (?, ?, ?, ?, ?, ?, 'PRESENT', 'ESSL_USB_IMPORT')
        ON CONFLICT(id) DO UPDATE SET punchIn = excluded.punchIn
      `, [punchId, empId, locationId, shiftId, punchDate, punchInTime]);

      importedCount++;
    }

    res.json({
      success: true,
      message: `Processed biometric logs offline. Imported: ${importedCount}, Skipped: ${skippedCount}`,
      importedCount,
      skippedCount,
    });
  } catch (err: any) {
    console.error('Error in /system/biometric-import:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
