import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import {
  listBiometricDevices,
  registerBiometricDevice,
  updateBiometricDevice,
  probeDeviceSocket,
  syncSingleDevice,
  syncAllDevices,
  getDeviceSyncLogs,
  getRawPunchesLedger,
  getEmployeeBiometricMappings,
  saveEmployeeBiometricMapping,
  ingestRawPunches,
} from '../services/biometricService.js';
import { pool } from '../nativeDb.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/devices
 * List all registered biometric hardware terminals with live TCP socket status
 */
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationCode = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN'
      ? (req.query.locationCode as string || 'ALL')
      : (req.user!.locationId || 'BEL');

    const devices = await listBiometricDevices(locationCode);
    res.json({ success: true, devices, total: devices.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve hardware devices: ' + error.message });
  }
});

/**
 * POST /api/devices
 * Register a new hardware biometric device
 */
router.post('/', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { serialNumber, name, model, firmwareVersion, ipAddress, port, locationCode } = req.body;
    if (!serialNumber || !name || !ipAddress || !locationCode) {
      return res.status(400).json({ error: 'Serial number, name, IP address, and location code are required' });
    }

    const device = await registerBiometricDevice({
      serialNumber,
      name,
      model,
      firmwareVersion,
      ipAddress,
      port: Number(port) || 4370,
      locationCode,
    });

    res.status(201).json({ success: true, message: 'Biometric device registered successfully', device });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to register biometric device: ' + error.message });
  }
});

/**
 * PUT /api/devices/:id
 * Update device configuration
 */
router.put('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, ipAddress, port, locationCode, isActive } = req.body;

    await updateBiometricDevice(id, {
      name,
      ipAddress,
      port: port ? Number(port) : undefined,
      locationCode,
      isActive,
    });

    res.json({ success: true, message: 'Device configuration updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update device configuration: ' + error.message });
  }
});

/**
 * POST /api/devices/:id/test-connection
 * Perform live TCP socket test on hardware device
 */
router.post('/:id/test-connection', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(`SELECT * FROM biometric_devices WHERE id = ? LIMIT 1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const dev = rows[0];
    const probe = await probeDeviceSocket(dev.ipAddress, dev.port);

    // Update DB status
    const newStatus = probe.online ? 'CONNECTED' : 'DISCONNECTED';
    await pool.query(`
      UPDATE biometric_devices
      SET status = ?, lastConnectionAt = ?, lastError = ?
      WHERE id = ?
    `, [newStatus, probe.online ? new Date() : dev.lastConnectionAt, probe.error || null, id]);

    res.json({
      success: true,
      deviceId: dev.id,
      name: dev.name,
      serialNumber: dev.serialNumber,
      ipAddress: dev.ipAddress,
      port: dev.port,
      status: newStatus,
      latencyMs: probe.latency,
      error: probe.error,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Connection test failed: ' + error.message });
  }
});

/**
 * POST /api/devices/:id/sync
 * Trigger attendance synchronization from specific device
 */
router.post('/:id/sync', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await syncSingleDevice(id, 'MANUAL_USER');
    res.json({ success: true, message: 'Device sync completed', result });
  } catch (error: any) {
    res.status(500).json({ error: 'Sync failed: ' + error.message });
  }
});

/**
 * POST /api/devices/sync-all
 * Trigger attendance synchronization across all showroom devices
 */
router.post('/sync-all', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const results = await syncAllDevices('MANUAL_USER');
    const successfulCount = results.filter(r => r.status === 'SUCCESS').length;
    res.json({
      success: true,
      message: `Sync completed across ${results.length} devices (${successfulCount} connected)`,
      results,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Mass sync failed: ' + error.message });
  }
});

/**
 * GET /api/devices/sync-logs
 * Retrieve synchronization history logs
 */
router.get('/sync-logs', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const deviceId = req.query.deviceId as string;
    const limit = Number(req.query.limit) || 50;
    const logs = await getDeviceSyncLogs(deviceId, limit);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve sync logs: ' + error.message });
  }
});

/**
 * GET /api/devices/mappings
 * Retrieve employee biometric enrollment mappings
 */
router.get('/mappings', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const showroom = req.query.showroom as string;
    const search = req.query.search as string;
    const mappings = await getEmployeeBiometricMappings(showroom, search);
    res.json({ success: true, mappings, total: mappings.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve biometric mappings: ' + error.message });
  }
});

/**
 * POST /api/devices/mappings
 * Create or update an employee biometric mapping
 */
router.post('/mappings', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, enrollmentNumber, showroomCode, serialNumber, status, notes } = req.body;
    if (!employeeId || !enrollmentNumber || !showroomCode) {
      return res.status(400).json({ error: 'Employee ID, enrollment number, and showroom code are required' });
    }

    await saveEmployeeBiometricMapping({
      employeeId,
      enrollmentNumber,
      showroomCode,
      serialNumber,
      status,
      notes,
    });

    res.json({ success: true, message: 'Employee biometric mapping saved successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save biometric mapping: ' + error.message });
  }
});

/**
 * GET /api/devices/raw-punches
 * Query immutable raw punches ledger
 */
router.get('/raw-punches', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const serialNumber = req.query.serialNumber as string;
    const enrollmentNumber = req.query.enrollmentNumber as string;
    const showroomCode = req.query.showroomCode as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const limit = Number(req.query.limit) || 100;

    const punches = await getRawPunchesLedger({
      serialNumber,
      enrollmentNumber,
      showroomCode,
      startDate,
      endDate,
      limit,
    });

    res.json({ success: true, punches, total: punches.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve raw punches: ' + error.message });
  }
});

/**
 * POST /api/devices/ingest-raw
 * Ingestion endpoint for local hardware connectors or eSSL ADMS/Push
 */
router.post('/ingest-raw', async (req: AuthRequest, res) => {
  try {
    const { punches } = req.body;
    if (!Array.isArray(punches) || punches.length === 0) {
      return res.status(400).json({ error: 'A non-empty array of punches is required' });
    }

    const result = await ingestRawPunches(punches);
    res.json({
      success: true,
      message: `Ingestion processed: ${result.inserted} inserted, ${result.processed} matched to attendance, ${result.duplicates} duplicate punches skipped, ${result.unmapped} unmapped.`,
      result,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Ingestion failed: ' + error.message });
  }
});

export default router;
