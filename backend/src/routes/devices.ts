import { Router } from 'express';
import { authenticate, authorize, AuthRequest, isElevatedRole, resolveLocationCodeToId } from '../middleware/auth.js';
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
  getEmployeeBiometricSyncDetails,
  syncEmployeeBiometric,
} from '../services/biometricService.js';
import { pool } from '../nativeDb.js';

const router = Router();
const CONNECTOR_KEY = process.env.BIOMETRIC_CONNECTOR_KEY || 'bsc-biometric-connector-secret-key-2024';

// The three Davangere devices are permanently and exclusively bound to DAV
const DAVANGERE_PERMANENT_SERIALS = ['JNP2252300795', 'JNPJNP2252300802', 'JNP2252300802', 'JNP2252300797'];

/**
 * Validates whether the authenticated user has authorization to access or manage
 * a device belonging to the specified location.
 */
function checkDeviceLocationAccess(user?: AuthRequest['user'], deviceLocationId?: string, deviceLocationCode?: string): boolean {
  if (!user) return false;
  if (isElevatedRole(user.role)) return true;
  const userLocId = resolveLocationCodeToId(user.locationId);
  const devLocId = resolveLocationCodeToId(deviceLocationId || deviceLocationCode);
  return Boolean(userLocId && devLocId && userLocId === devLocId);
}

// Dual authentication: Accept either User JWT session or Edge Connector Secret Key
router.use((req: any, res, next) => {
  const headerKey = req.headers['x-connector-key'];
  const bearerKey = req.headers.authorization?.replace('Bearer ', '');
  if ((headerKey && headerKey === CONNECTOR_KEY) || (bearerKey && bearerKey === CONNECTOR_KEY)) {
    req.user = {
      id: 'connector-svc',
      email: 'connector@bsctextiles.internal',
      fullName: 'BSC Biometric Hardware Connector',
      role: 'SUPER_ADMIN',
      permissions: ['ALL'],
    };
    return next();
  }
  return authenticate(req, res, next);
});

/**
 * GET /api/devices/sdk-status
 * Report hardware model, firmware, protocol, and network compatibility
 */
router.get('/sdk-status', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const [devices]: any = await pool.query('SELECT serialNumber, name, model, firmwareVersion, ipAddress, port, locationCode, status FROM biometric_devices');
    res.json({
      success: true,
      protocol: 'ZKTeco / eSSL Standalone Protocol (Port 4370 TCP/UDP + ADMS Push)',
      sdkCompatibility: 'SUPPORTED',
      supportedFirmware: ['ZKFinger VX10.0', 'ZKFinger VX9.0', 'SilkBio-101TC v4.2.1-prod', 'eSSL MB160 Ver 8.0.4.7'],
      devices,
      networkEnvironment: {
        hostSubnet: '192.168.100.120/24',
        davangereSubnet: '192.168.100.0/24 (Davangere Terminals 1, 2, 3)',
        isolatedShowroomSubnets: ['192.168.0.0/24 (Belagavi)', '192.168.30.0/24 (Shivamogga)'],
        integrationMethods: [
          'Option A (Recommended): eSSL ADMS Cloud Server Push direct to /iclock/cdata',
          'Option B: Supervised Local Edge Connector on showroom LAN forwarding to /api/devices/ingest-raw',
          'Option C: Site-to-site IPsec/WireGuard VPN for direct TCP port 4370 polling'
        ],
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve SDK status: ' + error.message });
  }
});

/**
 * GET /api/devices
 * List biometric devices with location isolation
 */
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    let locationCode: string;
    if (isElevatedRole(req.user!.role)) {
      locationCode = (req.query.locationCode as string) || 'ALL';
    } else {
      const requestedLoc = req.query.locationCode as string;
      const userLocId = resolveLocationCodeToId(req.user!.locationId);
      if (requestedLoc && requestedLoc !== 'ALL') {
        const reqLocId = resolveLocationCodeToId(requestedLoc);
        if (reqLocId !== userLocId) {
          return res.status(403).json({
            error: 'Forbidden: Access denied to devices in other showroom locations',
          });
        }
      }
      locationCode = req.user!.locationId || 'DAV';
    }

    const devices = await listBiometricDevices(locationCode);
    res.json({ success: true, devices, total: devices.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve hardware devices: ' + error.message });
  }
});

/**
 * POST /api/devices
 * Register a new hardware biometric device with strict location rules
 */
router.post('/', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { serialNumber, name, model, firmwareVersion, ipAddress, port, locationCode } = req.body;
    if (!serialNumber || !name || !ipAddress || !locationCode) {
      return res.status(400).json({ error: 'Serial number, name, IP address, and location code are required' });
    }

    // Critical location rule: DAV serial numbers belong exclusively to DAV
    const snUpper = serialNumber.trim().toUpperCase();
    if (DAVANGERE_PERMANENT_SERIALS.includes(snUpper)) {
      if (locationCode.toUpperCase() !== 'DAV') {
        return res.status(400).json({
          error: `Biometric device with serial number ${serialNumber} belongs exclusively to Davangere (DAV) and cannot be assigned to any other location.`,
        });
      }
    }

    // Server-side location validation: Non-elevated users can only register devices in their assigned location
    if (!isElevatedRole(req.user?.role)) {
      const userLocId = resolveLocationCodeToId(req.user?.locationId);
      const regLocId = resolveLocationCodeToId(locationCode);
      if (userLocId !== regLocId) {
        return res.status(403).json({
          error: 'Forbidden: You cannot register biometric devices for other showroom locations',
        });
      }
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
 * Update device configuration with location checks
 */
router.put('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, ipAddress, port, locationCode, isActive } = req.body;

    const [rows]: any = await pool.query(`SELECT * FROM biometric_devices WHERE id = ? LIMIT 1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const dev = rows[0];

    // Location access check
    if (!checkDeviceLocationAccess(req.user, dev.locationId, dev.locationCode)) {
      return res.status(403).json({
        error: 'Forbidden: Access denied to modify device from another showroom location',
      });
    }

    // Critical location rule: DAV serial numbers cannot be moved to BEL, SHI, or any other location
    if (DAVANGERE_PERMANENT_SERIALS.includes(dev.serialNumber.toUpperCase())) {
      if (locationCode && locationCode.toUpperCase() !== 'DAV') {
        return res.status(400).json({
          error: `Biometric device with serial number ${dev.serialNumber} is permanently bound to Davangere (DAV) and cannot be reassigned to ${locationCode}.`,
        });
      }
    }

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

    // Server-side location validation
    if (!checkDeviceLocationAccess(req.user, dev.locationId, dev.locationCode)) {
      return res.status(403).json({
        error: 'Forbidden: Access denied to test connection for a device from another showroom location',
      });
    }

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
    const [rows]: any = await pool.query(`SELECT * FROM biometric_devices WHERE id = ? LIMIT 1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const dev = rows[0];

    // Server-side location validation
    if (!checkDeviceLocationAccess(req.user, dev.locationId, dev.locationCode)) {
      return res.status(403).json({
        error: 'Forbidden: Access denied to sync device from another showroom location',
      });
    }

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
    // If non-elevated user, they should only trigger sync for their location
    let locationScope = 'ALL';
    if (!isElevatedRole(req.user?.role)) {
      const userLocId = resolveLocationCodeToId(req.user?.locationId);
      const [loc]: any = await pool.query(`SELECT code FROM location WHERE id = ? LIMIT 1`, [userLocId]);
      locationScope = loc[0]?.code || 'DAV';
    }

    const results = await syncAllDevices('MANUAL_USER');
    const filteredResults = locationScope === 'ALL'
      ? results
      : results.filter(r => r.locationCode === locationScope);

    const successfulCount = filteredResults.filter(r => r.status === 'SUCCESS').length;
    res.json({
      success: true,
      message: `Sync completed across ${filteredResults.length} devices (${successfulCount} connected)`,
      results: filteredResults,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Mass sync failed: ' + error.message });
  }
});

/**
 * GET /api/devices/employee-status/:employeeId
 * Retrieve real biometric synchronization telemetry and mapping for a specific employee
 */
router.get('/employee-status/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;
    const details = await getEmployeeBiometricSyncDetails(employeeId);
    res.json({ success: true, ...details });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve employee biometric status: ' + error.message });
  }
});

/**
 * POST /api/devices/sync-employee/:employeeId
 * Trigger on-demand hardware biometric sync for a specific employee across Davanagere devices
 */
router.post('/sync-employee/:employeeId', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;
    const result = await syncEmployeeBiometric(employeeId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Employee biometric sync failed: ' + error.message });
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

    if (deviceId) {
      const [rows]: any = await pool.query(`SELECT * FROM biometric_devices WHERE id = ? LIMIT 1`, [deviceId]);
      if (rows.length > 0 && !checkDeviceLocationAccess(req.user, rows[0].locationId, rows[0].locationCode)) {
        return res.status(403).json({
          error: 'Forbidden: Access denied to sync logs for device from another showroom location',
        });
      }
    }

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
    let showroom = req.query.showroom as string;
    const search = req.query.search as string;

    if (!isElevatedRole(req.user?.role)) {
      const userLocId = resolveLocationCodeToId(req.user?.locationId);
      if (showroom) {
        const reqLocId = resolveLocationCodeToId(showroom);
        if (reqLocId !== userLocId) {
          return res.status(403).json({
            error: 'Forbidden: Access denied to biometric mappings for another showroom location',
          });
        }
      } else {
        const [loc]: any = await pool.query(`SELECT code FROM location WHERE id = ? LIMIT 1`, [userLocId]);
        showroom = loc[0]?.code || 'DAV';
      }
    }

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

    if (!isElevatedRole(req.user?.role)) {
      const userLocId = resolveLocationCodeToId(req.user?.locationId);
      const reqLocId = resolveLocationCodeToId(showroomCode);
      if (userLocId !== reqLocId) {
        return res.status(403).json({
          error: 'Forbidden: Access denied to save biometric mapping for another showroom location',
        });
      }
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
    let showroomCode = req.query.showroomCode as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const limit = Number(req.query.limit) || 100;

    if (!isElevatedRole(req.user?.role)) {
      const userLocId = resolveLocationCodeToId(req.user?.locationId);
      if (showroomCode) {
        const reqLocId = resolveLocationCodeToId(showroomCode);
        if (reqLocId !== userLocId) {
          return res.status(403).json({
            error: 'Forbidden: Access denied to raw punches from another showroom location',
          });
        }
      } else {
        const [loc]: any = await pool.query(`SELECT code FROM location WHERE id = ? LIMIT 1`, [userLocId]);
        showroomCode = loc[0]?.code || 'DAV';
      }
    }

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

/**
 * GET /api/devices/unmapped
 * Retrieve raw punches that could not be matched to an employee
 */
router.get('/unmapped', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    let whereClause = `WHERE r.syncStatus = 'UNMAPPED'`;
    const params: any[] = [];

    if (!isElevatedRole(req.user?.role)) {
      const userLocId = resolveLocationCodeToId(req.user?.locationId);
      whereClause += ` AND (d.locationId = ? OR d.locationCode = ?)`;
      params.push(userLocId, req.user?.locationId);
    }

    params.push(limit);
    const [rows]: any = await pool.query(`
      SELECT r.*, d.name as deviceName, d.locationCode
      FROM biometric_raw_punches r
      LEFT JOIN biometric_devices d ON r.deviceId = d.id
      ${whereClause}
      ORDER BY r.punchTime DESC
      LIMIT ?
    `, params);

    res.json({ success: true, unmapped: rows, total: rows.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve unmapped punches: ' + error.message });
  }
});

/**
 * POST /api/devices/retry-failed
 * Retry processing of UNMAPPED punches after new employee mappings are saved
 */
router.post('/retry-failed', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const [unmappedRows]: any = await pool.query(`
      SELECT serialNumber, enrollmentNumber, punchTime, punchType, verifyMode
      FROM biometric_raw_punches
      WHERE syncStatus = 'UNMAPPED'
      ORDER BY punchTime ASC
      LIMIT 200
    `);

    if (unmappedRows.length === 0) {
      return res.json({ success: true, message: 'No unmapped punches pending reconciliation', reprocessed: 0 });
    }

    // Re-run through ingestion
    const punchesToRetry = unmappedRows.map((r: any) => ({
      serialNumber: r.serialNumber,
      enrollmentNumber: r.enrollmentNumber,
      punchTime: r.punchTime,
      punchType: r.punchType,
      verifyMode: r.verifyMode,
    }));

    // Reset status to QUEUED temporarily for reprocessing
    await pool.query(`UPDATE biometric_raw_punches SET syncStatus = 'QUEUED' WHERE syncStatus = 'UNMAPPED' LIMIT 200`);
    const result = await ingestRawPunches(punchesToRetry);

    res.json({
      success: true,
      message: `Reconciliation complete: ${result.processed} matched to employee attendance, ${result.unmapped} remain unmapped.`,
      result,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Reprocessing failed: ' + error.message });
  }
});

export default router;
