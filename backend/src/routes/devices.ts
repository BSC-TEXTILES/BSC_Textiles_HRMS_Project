import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Mock in-memory device registry
const REGISTERED_DEVICES = [
  { id: 'DEV-BIO-001', name: 'ZKTeco Biometric Terminal 1', type: 'BIOMETRIC_PUNCH', locationCode: 'BEL', status: 'ONLINE', ip: '192.168.1.50', lastPing: new Date() },
  { id: 'DEV-BIO-002', name: 'ZKTeco Biometric Terminal 2', type: 'BIOMETRIC_PUNCH', locationCode: 'DAV', status: 'ONLINE', ip: '192.168.2.50', lastPing: new Date() },
  { id: 'DEV-QR-001', name: 'Canteen QR Stand 1', type: 'QR_SCANNER', locationCode: 'BEL', status: 'ONLINE', ip: '192.168.1.61', lastPing: new Date() },
  { id: 'DEV-QR-002', name: 'Tea Break QR Scanner Handheld', type: 'QR_SCANNER', locationCode: 'SHI', status: 'ONLINE', ip: '192.168.3.62', lastPing: new Date() },
  { id: 'DEV-CAM-001', name: 'HikVision Face Recognition Gateway', type: 'FACE_CAM', locationCode: 'HUB-TEST', status: 'ONLINE', ip: '192.168.4.10', lastPing: new Date() },
];

// List registered hardware devices
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const devices = req.user!.role === 'SUPER_ADMIN'
      ? REGISTERED_DEVICES
      : REGISTERED_DEVICES.filter(d => !req.user!.locationId || d.locationCode === 'BEL'); // fallback filter

    res.json({ devices });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve hardware devices' });
  }
});

// Simulate hardware event ingestion (e.g. punch event from biometric machine)
router.post('/ingest', async (req: AuthRequest, res) => {
  try {
    const { deviceId, employeeCode, punchType, timestamp } = req.body;
    if (!deviceId || !employeeCode) {
      return res.status(400).json({ error: 'Device ID and Employee Code are required' });
    }

    const employee = await prisma.employee.findFirst({
      where: { employeeCode },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found for device punch' });
    }

    // Log device event into audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: employee.locationId,
        action: 'RECORD',
        entityType: 'DevicePunch',
        entityId: deviceId,
        newValue: { deviceId, employeeCode, punchType, timestamp: timestamp || new Date() },
      },
    });

    res.json({
      success: true,
      message: 'Device event processed successfully',
      employee: { id: employee.id, name: employee.fullName },
    });
  } catch (error) {
    res.status(500).json({ error: 'Device event processing failed' });
  }
});

export default router;
