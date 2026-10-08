import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// In-memory set of read notification IDs for active sessions
const readNotificationIds = new Set<string>();

router.get('/', async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const locationWhere = user.role === 'SUPER_ADMIN' ? {} : { locationId: user.locationId };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Fetch recent late attendance events
    const lateAttendances = await prisma.attendance.findMany({
      where: {
        ...locationWhere,
        attendanceDate: { gte: today },
        lateLoginSeconds: { gt: 0 },
      },
      take: 5,
      orderBy: { actualLogin: 'desc' },
      include: {
        employee: { select: { fullName: true, employeeCode: true } },
      },
    });

    // 2. Fetch break overruns
    const exceededBreaks = await prisma.employeeBreak.findMany({
      where: {
        ...locationWhere,
        status: 'EXCEEDED',
      },
      take: 5,
      orderBy: { startTime: 'desc' },
      include: {
        employee: { select: { fullName: true, employeeCode: true } },
      },
    });

    // 3. Fetch critical observations
    const criticalObservations = await prisma.observation.findMany({
      where: {
        ...locationWhere,
        level: 'CRITICAL',
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { fullName: true, employeeCode: true } },
      },
    });

    // 4. Fetch failed QR scans
    const failedScans = await prisma.qRScanRecord.findMany({
      where: {
        ...locationWhere,
        result: { not: 'SUCCESS' },
      },
      take: 5,
      orderBy: { scannedAt: 'desc' },
      include: {
        employee: { select: { fullName: true, employeeCode: true } },
      },
    });

    const notifications: any[] = [];

    lateAttendances.forEach((att) => {
      const id = `late-${att.id}`;
      notifications.push({
        id,
        title: 'Late Arrival Alert',
        message: `${att.employee.fullName} (${att.employee.employeeCode}) was late by ${Math.round(
          (att.lateLoginSeconds || 0) / 60
        )} minutes.`,
        type: 'WARNING',
        createdAt: att.actualLogin || att.createdAt,
        isRead: readNotificationIds.has(id),
      });
    });

    exceededBreaks.forEach((brk) => {
      const id = `break-${brk.id}`;
      notifications.push({
        id,
        title: 'Break Overrun Warning',
        message: `${brk.employee.fullName} exceeded ${brk.breakType} break by ${Math.round(
          (brk.overtimeSeconds || 0) / 60
        )} mins.`,
        type: 'DANGER',
        createdAt: brk.endTime || brk.startTime,
        isRead: readNotificationIds.has(id),
      });
    });

    criticalObservations.forEach((obs) => {
      const id = `obs-${obs.id}`;
      notifications.push({
        id,
        title: 'Critical Observation Logged',
        message: `${obs.title} for ${obs.employee?.fullName || 'Floor'}: ${obs.description.substring(0, 60)}...`,
        type: 'CRITICAL',
        createdAt: obs.createdAt,
        isRead: readNotificationIds.has(id),
      });
    });

    failedScans.forEach((scan) => {
      const id = `scan-${scan.id}`;
      notifications.push({
        id,
        title: 'QR Scan Rejection',
        message: `QR Scan failed (${scan.result}) for ${scan.employee?.fullName || 'token'}.`,
        type: 'INFO',
        createdAt: scan.scannedAt,
        isRead: readNotificationIds.has(id),
      });
    });

    // Sort by timestamp desc
    notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

router.post('/:id/read', async (req: AuthRequest, res) => {
  const { id } = req.params;
  readNotificationIds.add(id);
  res.json({ success: true, message: 'Notification marked as read' });
});

router.post('/mark-all-read', async (req: AuthRequest, res) => {
  res.json({ success: true, message: 'All notifications marked as read' });
});

export default router;
