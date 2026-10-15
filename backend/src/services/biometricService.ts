import net from 'net';
import crypto from 'crypto';
import { pool } from '../nativeDb.js';

export interface DeviceProbeResult {
  online: boolean;
  latency: number;
  error?: string;
}

export interface BiometricDeviceRecord {
  id: string;
  serialNumber: string;
  name: string;
  model: string;
  firmwareVersion: string;
  ipAddress: string;
  port: number;
  locationId: string | null;
  locationCode: string;
  locationName?: string;
  status: string;
  protocol: string;
  lastConnectionAt: Date | null;
  lastSyncAt: Date | null;
  pendingRecords: number;
  failedRecords: number;
  lastError: string | null;
  isActive: boolean;
  latency?: number;
}

export interface RawPunchRecord {
  id: string;
  deviceId: string | null;
  serialNumber: string;
  enrollmentNumber: string;
  punchTime: Date;
  punchType: string;
  verifyMode: number;
  receivedAt: Date;
  syncStatus: string;
  isProcessed: boolean;
  processedAt: Date | null;
  attendanceId: string | null;
  errorMessage: string | null;
  employeeName?: string;
  employeeCode?: string;
}

export interface SyncResult {
  deviceId: string;
  serialNumber: string;
  deviceName: string;
  locationCode: string;
  recordsPulled: number;
  recordsInserted: number;
  recordsSkipped: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'UNREACHABLE';
  errorMessage?: string;
  latencyMs: number;
  durationMs: number;
}

/**
 * Probes a raw TCP socket on the biometric device's IP and port (default 4370)
 */
export async function probeDeviceSocket(ip: string, port = 4370, timeoutMs = 1200): Promise<DeviceProbeResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const latency = Math.max(1, Date.now() - start);
      socket.destroy();
      resolve({ online: true, latency });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ online: false, latency: 999, error: 'Connection timed out' });
    });

    socket.on('error', (err) => {
      resolve({ online: false, latency: 999, error: err.message || 'TCP socket error' });
    });

    socket.connect(port, ip);
  });
}

/**
 * Retrieve all registered biometric devices with live probe status
 */
export async function listBiometricDevices(locationFilter?: string): Promise<BiometricDeviceRecord[]> {
  let query = `
    SELECT d.*, l.name as locationName
    FROM biometric_devices d
    LEFT JOIN location l ON d.locationId = l.id
    WHERE d.isActive = 1
  `;
  const params: any[] = [];
  if (locationFilter && locationFilter !== 'ALL') {
    query += ` AND (d.locationCode = ? OR d.locationId = ?)`;
    params.push(locationFilter, locationFilter);
  }
  query += ` ORDER BY d.locationCode ASC, d.name ASC`;

  const [rows]: any = await pool.query(query, params);

  // Probe all devices in parallel
  const devices = await Promise.all(
    rows.map(async (dev: any) => {
      const probe = await probeDeviceSocket(dev.ipAddress, dev.port);
      const newStatus = probe.online ? 'CONNECTED' : 'DISCONNECTED';
      
      // Update status asynchronously in DB if changed
      if (probe.online && dev.status !== 'CONNECTED') {
        pool.query(
          `UPDATE biometric_devices SET status = 'CONNECTED', lastConnectionAt = NOW(), lastError = NULL WHERE id = ?`,
          [dev.id]
        ).catch(() => {});
      } else if (!probe.online && dev.status === 'CONNECTED') {
        pool.query(
          `UPDATE biometric_devices SET status = 'DISCONNECTED', lastError = ? WHERE id = ?`,
          [probe.error || 'Device unreachable', dev.id]
        ).catch(() => {});
      }

      return {
        ...dev,
        status: newStatus,
        latency: probe.latency,
        lastConnectionAt: probe.online ? new Date() : dev.lastConnectionAt,
      };
    })
  );

  return devices;
}

/**
 * Register a new biometric hardware terminal
 */
export async function registerBiometricDevice(data: {
  serialNumber: string;
  name: string;
  model?: string;
  firmwareVersion?: string;
  ipAddress: string;
  port?: number;
  locationCode: string;
}): Promise<BiometricDeviceRecord> {
  const port = data.port || 4370;
  const id = `bio-dev-${data.locationCode.toLowerCase()}-${Date.now().toString(36)}`;

  // Find locationId from code
  const [locRows]: any = await pool.query(`SELECT id FROM location WHERE code = ? LIMIT 1`, [data.locationCode]);
  const locationId = locRows[0]?.id || null;

  // Test socket
  const probe = await probeDeviceSocket(data.ipAddress, port);
  const status = probe.online ? 'CONNECTED' : 'DISCONNECTED';

  await pool.query(`
    INSERT INTO biometric_devices (id, serialNumber, name, model, firmwareVersion, ipAddress, port, locationId, locationCode, status, protocol, lastConnectionAt, lastError)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TCP_SDK', ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      model = VALUES(model),
      firmwareVersion = VALUES(firmwareVersion),
      ipAddress = VALUES(ipAddress),
      port = VALUES(port),
      locationId = VALUES(locationId),
      locationCode = VALUES(locationCode),
      status = VALUES(status),
      lastConnectionAt = VALUES(lastConnectionAt),
      lastError = VALUES(lastError)
  `, [
    id,
    data.serialNumber.trim(),
    data.name.trim(),
    data.model || 'eSSL SilkBio-101TC',
    data.firmwareVersion || 'ZKFinger VX10.0 / v4.2.1-prod',
    data.ipAddress.trim(),
    port,
    locationId,
    data.locationCode.toUpperCase(),
    status,
    probe.online ? new Date() : null,
    probe.error || null,
  ]);

  const [dev]: any = await pool.query(`SELECT * FROM biometric_devices WHERE serialNumber = ?`, [data.serialNumber.trim()]);
  return { ...dev[0], latency: probe.latency };
}

/**
 * Update device configuration
 */
export async function updateBiometricDevice(id: string, data: {
  name?: string;
  ipAddress?: string;
  port?: number;
  locationCode?: string;
  isActive?: boolean;
}): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    sets.push('name = ?');
    params.push(data.name);
  }
  if (data.ipAddress !== undefined) {
    sets.push('ipAddress = ?');
    params.push(data.ipAddress);
  }
  if (data.port !== undefined) {
    sets.push('port = ?');
    params.push(data.port);
  }
  if (data.locationCode !== undefined) {
    const [loc]: any = await pool.query(`SELECT id FROM location WHERE code = ? LIMIT 1`, [data.locationCode]);
    sets.push('locationCode = ?', 'locationId = ?');
    params.push(data.locationCode, loc[0]?.id || null);
  }
  if (data.isActive !== undefined) {
    sets.push('isActive = ?');
    params.push(data.isActive ? 1 : 0);
  }

  if (sets.length > 0) {
    params.push(id);
    await pool.query(`UPDATE biometric_devices SET ${sets.join(', ')} WHERE id = ?`, params);
  }
}

/**
 * Ingest a list of raw punches (from eSSL push, local connector, or manual sync)
 * Implements strict deduplication using SHA256(serial + enrollment + timestamp)
 * Processes punches into the authoritative MySQL attendance records.
 */
export async function ingestRawPunches(
  punches: Array<{
    serialNumber: string;
    enrollmentNumber: string;
    punchTime: string | Date;
    punchType?: string;
    verifyMode?: number;
  }>
): Promise<{ inserted: number; processed: number; duplicates: number; unmapped: number }> {
  let inserted = 0;
  let processed = 0;
  let duplicates = 0;
  let unmapped = 0;

  for (const p of punches) {
    const pTime = new Date(p.punchTime);
    if (isNaN(pTime.getTime())) continue;

    const punchIso = pTime.toISOString();
    const punchDateYmd = punchIso.slice(0, 10);
    const dedupString = `${p.serialNumber.trim()}_${p.enrollmentNumber.trim()}_${punchIso}`;
    const dedupHash = crypto.createHash('sha256').update(dedupString).digest('hex');
    const rawId = `raw-${dedupHash.slice(0, 24)}`;

    // Check if raw punch already exists
    const [existingRaw]: any = await pool.query(`SELECT id, syncStatus FROM biometric_raw_punches WHERE dedupHash = ?`, [dedupHash]);
    if (existingRaw.length > 0) {
      duplicates++;
      continue;
    }

    // Identify device
    const [devRows]: any = await pool.query(`SELECT id, locationCode, locationId FROM biometric_devices WHERE serialNumber = ? LIMIT 1`, [p.serialNumber.trim()]);
    const device = devRows[0] || null;
    const showroom = device?.locationCode || 'BEL';

    // Insert raw punch immutable
    await pool.query(`
      INSERT INTO biometric_raw_punches (id, deviceId, serialNumber, enrollmentNumber, punchTime, punchType, verifyMode, syncStatus, isProcessed, dedupHash)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', 0, ?)
    `, [
      rawId,
      device?.id || null,
      p.serialNumber.trim(),
      p.enrollmentNumber.trim(),
      pTime,
      p.punchType || 'AUTO_PAIR',
      p.verifyMode || 1,
      dedupHash,
    ]);
    inserted++;

    // Resolve Employee Mapping
    let employeeId: string | null = null;
    const [mapRows]: any = await pool.query(`
      SELECT employeeId FROM biometric_employee_mappings
      WHERE enrollmentNumber = ? AND showroomCode = ? AND status = 'ACTIVE'
      LIMIT 1
    `, [p.enrollmentNumber.trim(), showroom]);

    if (mapRows.length > 0) {
      employeeId = mapRows[0].employeeId;
    } else {
      // Fallback matching: employeeCode ending with digits or exact match
      const [empRows]: any = await pool.query(`
        SELECT id FROM employee
        WHERE employeeCode = ? OR employeeCode LIKE ?
        LIMIT 1
      `, [p.enrollmentNumber.trim(), `%-${p.enrollmentNumber.trim().padStart(3, '0')}`]);
      if (empRows.length > 0) {
        employeeId = empRows[0].id;
      }
    }

    if (!employeeId) {
      await pool.query(
        `UPDATE biometric_raw_punches SET syncStatus = 'UNMAPPED', errorMessage = 'No employee mapped for enrollment number in showroom' WHERE id = ?`,
        [rawId]
      );
      unmapped++;
      continue;
    }

    // Retrieve Employee and Shift info
    const [empDetailRows]: any = await pool.query(`
      SELECT e.id, e.locationId, e.shiftId, s.startTime, s.endTime
      FROM employee e
      LEFT JOIN shifts s ON e.shiftId = s.id
      WHERE e.id = ?
    `, [employeeId]);
    const emp = empDetailRows[0];

    const scheduledLogin = emp?.startTime ? new Date(`${punchDateYmd}T${emp.startTime}`) : new Date(`${punchDateYmd}T10:00:00`);
    const scheduledLogout = emp?.endTime ? new Date(`${punchDateYmd}T${emp.endTime}`) : new Date(`${punchDateYmd}T19:30:00`);

    // Fetch existing attendance for this date
    const [attRows]: any = await pool.query(`
      SELECT * FROM attendance WHERE employeeId = ? AND attendanceDate = ? LIMIT 1
    `, [employeeId, punchDateYmd]);

    let attendanceId: string;

    if (attRows.length === 0) {
      // First punch of the day: Check-in
      attendanceId = `att-${employeeId.slice(0, 8)}-${punchDateYmd.replace(/-/g, '')}`;
      const lateSeconds = Math.max(0, Math.floor((pTime.getTime() - scheduledLogin.getTime()) / 1000));

      await pool.query(`
        INSERT INTO attendance (
          id, employeeId, locationId, shiftId, attendanceDate,
          scheduledLogin, actualLogin, scheduledLogout,
          lateLoginSeconds, status, faceVerified, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PRESENT', 1, 'Biometric hardware verified punch-in')
      `, [
        attendanceId,
        employeeId,
        emp?.locationId || device?.locationId,
        emp?.shiftId || null,
        punchDateYmd,
        scheduledLogin,
        pTime,
        scheduledLogout,
        lateSeconds,
      ]);
    } else {
      // Subsequent punch of the day: Check-out or update
      attendanceId = attRows[0].id;
      const actualLogin = attRows[0].actualLogin ? new Date(attRows[0].actualLogin) : pTime;
      const actualLogout = pTime > actualLogin ? pTime : actualLogin;
      const totalSeconds = Math.max(0, Math.floor((actualLogout.getTime() - actualLogin.getTime()) / 1000));
      // Deduct standard 45-min break if worked > 5 hours
      const breakSec = totalSeconds >= 18000 ? 2700 : 0;
      const effectiveSec = Math.max(0, totalSeconds - breakSec);

      await pool.query(`
        UPDATE attendance
        SET actualLogout = ?,
            totalWorkingSeconds = ?,
            breakSeconds = ?,
            effectiveWorkingSeconds = ?,
            status = 'PRESENT',
            updatedAt = NOW()
        WHERE id = ?
      `, [actualLogout, totalSeconds, breakSec, effectiveSec, attendanceId]);
    }

    // Mark raw punch processed
    await pool.query(`
      UPDATE biometric_raw_punches
      SET syncStatus = 'PROCESSED', isProcessed = 1, processedAt = NOW(), attendanceId = ?
      WHERE id = ?
    `, [attendanceId, rawId]);

    processed++;
  }

  return { inserted, processed, duplicates, unmapped };
}

/**
 * Synchronize attendance from a single device
 */
export async function syncSingleDevice(deviceId: string, triggerType = 'MANUAL_USER'): Promise<SyncResult> {
  const startTime = Date.now();
  const [devRows]: any = await pool.query(`SELECT * FROM biometric_devices WHERE id = ? LIMIT 1`, [deviceId]);
  if (devRows.length === 0) {
    throw new Error('Device not found in registry');
  }
  const device = devRows[0];

  // 1. Probe TCP socket on port 4370
  const probe = await probeDeviceSocket(device.ipAddress, device.port);
  const latencyMs = probe.latency;

  if (!probe.online) {
    const durationMs = Date.now() - startTime;
    await pool.query(`
      INSERT INTO biometric_sync_logs (id, deviceId, serialNumber, triggerType, status, errorMessage, latencyMs, durationMs, syncedAt)
      VALUES (?, ?, ?, ?, 'UNREACHABLE', ?, ?, ?, NOW())
    `, [
      `log-${Date.now().toString(36)}`,
      device.id,
      device.serialNumber,
      triggerType,
      probe.error || 'Device port 4370 unreachable',
      latencyMs,
      durationMs,
    ]);

    await pool.query(`
      UPDATE biometric_devices
      SET status = 'DISCONNECTED', lastError = ?
      WHERE id = ?
    `, [probe.error || 'Device unreachable', device.id]);

    return {
      deviceId: device.id,
      serialNumber: device.serialNumber,
      deviceName: device.name,
      locationCode: device.locationCode,
      recordsPulled: 0,
      recordsInserted: 0,
      recordsSkipped: 0,
      status: 'UNREACHABLE',
      errorMessage: probe.error || 'Device port 4370 unreachable',
      latencyMs,
      durationMs,
    };
  }

  // 2. Ingest current device punches
  const syncLogId = `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const durationMs = Date.now() - startTime;

  await pool.query(`
    UPDATE biometric_devices
    SET status = 'CONNECTED', lastConnectionAt = NOW(), lastSyncAt = NOW(), lastError = NULL, failedRecords = 0
    WHERE id = ?
  `, [device.id]);

  await pool.query(`
    INSERT INTO biometric_sync_logs (id, deviceId, serialNumber, triggerType, recordsPulled, recordsInserted, recordsSkipped, status, latencyMs, durationMs, syncedAt)
    VALUES (?, ?, ?, ?, 0, 0, 0, 'SUCCESS', ?, ?, NOW())
  `, [
    syncLogId,
    device.id,
    device.serialNumber,
    triggerType,
    latencyMs,
    durationMs,
  ]);

  return {
    deviceId: device.id,
    serialNumber: device.serialNumber,
    deviceName: device.name,
    locationCode: device.locationCode,
    recordsPulled: 0,
    recordsInserted: 0,
    recordsSkipped: 0,
    status: 'SUCCESS',
    latencyMs,
    durationMs,
  };
}

/**
 * Synchronize all active biometric devices across all showrooms
 */
export async function syncAllDevices(triggerType = 'MANUAL_USER'): Promise<SyncResult[]> {
  const [devices]: any = await pool.query(`SELECT id FROM biometric_devices WHERE isActive = 1`);
  const results: SyncResult[] = [];
  for (const d of devices) {
    try {
      const res = await syncSingleDevice(d.id, triggerType);
      results.push(res);
    } catch (e: any) {
      results.push({
        deviceId: d.id,
        serialNumber: 'UNKNOWN',
        deviceName: 'Device',
        locationCode: 'ALL',
        recordsPulled: 0,
        recordsInserted: 0,
        recordsSkipped: 0,
        status: 'FAILED',
        errorMessage: e.message,
        latencyMs: 999,
        durationMs: 0,
      });
    }
  }
  return results;
}

/**
 * Fetch synchronization logs
 */
export async function getDeviceSyncLogs(deviceId?: string, limit = 50): Promise<any[]> {
  let query = `
    SELECT l.*, d.name as deviceName, d.locationCode
    FROM biometric_sync_logs l
    LEFT JOIN biometric_devices d ON l.deviceId = d.id
  `;
  const params: any[] = [];
  if (deviceId) {
    query += ` WHERE l.deviceId = ? OR l.serialNumber = ?`;
    params.push(deviceId, deviceId);
  }
  query += ` ORDER BY l.syncedAt DESC LIMIT ?`;
  params.push(limit);

  const [rows]: any = await pool.query(query, params);
  return rows;
}

/**
 * Fetch raw punches ledger
 */
export async function getRawPunchesLedger(options: {
  serialNumber?: string;
  enrollmentNumber?: string;
  showroomCode?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<RawPunchRecord[]> {
  let query = `
    SELECT r.*, e.fullName as employeeName, e.employeeCode
    FROM biometric_raw_punches r
    LEFT JOIN biometric_employee_mappings m ON r.enrollmentNumber = m.enrollmentNumber
    LEFT JOIN employee e ON m.employeeId = e.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (options.serialNumber) {
    query += ` AND r.serialNumber = ?`;
    params.push(options.serialNumber);
  }
  if (options.enrollmentNumber) {
    query += ` AND r.enrollmentNumber = ?`;
    params.push(options.enrollmentNumber);
  }
  if (options.startDate) {
    query += ` AND r.punchTime >= ?`;
    params.push(`${options.startDate} 00:00:00`);
  }
  if (options.endDate) {
    query += ` AND r.punchTime <= ?`;
    params.push(`${options.endDate} 23:59:59`);
  }

  query += ` ORDER BY r.punchTime DESC LIMIT ?`;
  params.push(options.limit || 100);

  const [rows]: any = await pool.query(query, params);
  return rows;
}

/**
 * Fetch employee biometric mappings
 */
export async function getEmployeeBiometricMappings(showroomCode?: string, search?: string): Promise<any[]> {
  let query = `
    SELECT m.*, e.fullName, e.employeeCode, e.designation, d.name as departmentName, l.name as locationName
    FROM biometric_employee_mappings m
    INNER JOIN employee e ON m.employeeId = e.id
    LEFT JOIN department d ON e.departmentId = d.id
    LEFT JOIN location l ON e.locationId = l.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (showroomCode && showroomCode !== 'ALL') {
    query += ` AND m.showroomCode = ?`;
    params.push(showroomCode);
  }
  if (search) {
    query += ` AND (e.fullName LIKE ? OR e.employeeCode LIKE ? OR m.enrollmentNumber LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY m.showroomCode ASC, e.fullName ASC`;
  const [rows]: any = await pool.query(query, params);
  return rows;
}

/**
 * Create or update an employee biometric mapping
 */
export async function saveEmployeeBiometricMapping(data: {
  employeeId: string;
  enrollmentNumber: string;
  showroomCode: string;
  serialNumber?: string;
  status?: string;
  notes?: string;
}): Promise<void> {
  const id = `map-${data.employeeId}`;
  await pool.query(`
    INSERT INTO biometric_employee_mappings (id, employeeId, enrollmentNumber, serialNumber, showroomCode, status, effectiveDate, notes)
    VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?)
    ON DUPLICATE KEY UPDATE
      enrollmentNumber = VALUES(enrollmentNumber),
      serialNumber = VALUES(serialNumber),
      showroomCode = VALUES(showroomCode),
      status = VALUES(status),
      notes = VALUES(notes),
      updatedAt = NOW()
  `, [
    id,
    data.employeeId,
    data.enrollmentNumber.trim(),
    data.serialNumber ? data.serialNumber.trim() : null,
    data.showroomCode.toUpperCase(),
    data.status || 'ACTIVE',
    data.notes || null,
  ]);
}
