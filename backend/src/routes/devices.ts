import { Router } from 'express';
import net from 'net';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Helper to probe live TCP socket on port 4370
async function probeDeviceSocket(ip: string, port = 4370, timeoutMs = 800): Promise<{ online: boolean; latency: number }> {
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
      resolve({ online: false, latency: 999 });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ online: false, latency: 999 });
    });

    socket.connect(port, ip);
  });
}

// Live hardware biometric terminals & peripheral devices (Configured on 192.168.100.135, .136, .137 : 4370)
const REGISTERED_DEVICES = [
  { id: 'DEV-BIO-001', name: 'ZKTeco Biometric Terminal 1 (Flagship Belagavi)', type: 'BIOMETRIC_PUNCH', locationCode: 'BEL', port: 4370, ip: '192.168.100.135' },
  { id: 'DEV-BIO-002', name: 'ZKTeco Biometric Terminal 2 (Mega Store Davanagere)', type: 'BIOMETRIC_PUNCH', locationCode: 'DAV', port: 4370, ip: '192.168.100.136' },
  { id: 'DEV-BIO-003', name: 'ZKTeco Biometric Terminal 3 (Flagship Shivamogga)', type: 'BIOMETRIC_PUNCH', locationCode: 'SHI', port: 4370, ip: '192.168.100.137' },
  { id: 'DEV-QR-001', name: 'Canteen QR Stand 1 (Belagavi)', type: 'QR_SCANNER', locationCode: 'BEL', port: 4370, ip: '192.168.100.135' },
  { id: 'DEV-QR-002', name: 'Tea Break QR Scanner Handheld (Shivamogga)', type: 'QR_SCANNER', locationCode: 'SHI', port: 4370, ip: '192.168.100.137' },
  { id: 'DEV-CAM-001', name: 'HikVision Face Recognition Gateway (Davanagere)', type: 'FACE_CAM', locationCode: 'DAV', port: 4370, ip: '192.168.100.136' },
];

// List registered hardware devices with live TCP socket status
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const rawDevices = req.user!.role === 'SUPER_ADMIN'
      ? REGISTERED_DEVICES
      : REGISTERED_DEVICES.filter(d => !req.user!.locationId || d.locationCode === 'BEL');

    // Probe live devices in parallel
    const devices = await Promise.all(
      rawDevices.map(async (device) => {
        const probe = await probeDeviceSocket(device.ip, device.port);
        return {
          ...device,
          status: probe.online ? 'ONLINE' : 'OFFLINE',
          latency: probe.latency,
          lastPing: new Date(),
        };
      })
    );

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
        action: 'CREATE',
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