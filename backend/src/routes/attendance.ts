import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { socketIO } from '../index.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const attendanceSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1),
    locationId: z.string().min(1),
    shiftId: z.string().optional(),
    attendanceDate: z.string(),
    scheduledLogin: z.string().optional(),
    actualLogin: z.string().optional(),
    scheduledLogout: z.string().optional(),
    actualLogout: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, employeeId, shiftId, startDate, endDate, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (employeeId) where.employeeId = employeeId;
    if (shiftId) where.shiftId = shiftId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.attendanceDate = {};
      if (startDate) where.attendanceDate.gte = new Date(String(startDate));
      if (endDate) where.attendanceDate.lte = new Date(String(endDate));
    }
    
    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { attendanceDate: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          shift: { select: { id: true, name: true } },
        },
      }),
      prisma.attendance.count({ where }),
    ]);
    
    res.json({ attendances, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get attendances error:', error);
    res.status(500).json({ error: 'Failed to get attendances' });
  }
});

router.get('/today', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const where: any = {
      locationId: req.user!.role === 'SUPER_ADMIN' ? req.query.locationId : req.user!.locationId,
      attendanceDate: { gte: today, lt: tomorrow },
    };
    
    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, floor: true, department: true, shift: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // Calculate summary stats
    const stats = {
      total: attendances.length,
      present: attendances.filter((a: any) => a.status === 'PRESENT').length,
      absent: attendances.filter((a: any) => a.status === 'ABSENT').length,
      late: attendances.filter((a: any) => a.status === 'LATE').length,
      early: attendances.filter((a: any) => a.status === 'EARLY').length,
      onLunch: attendances.filter((a: any) => a.status === 'ON_LUNCH').length,
      onTeaBreak: attendances.filter((a: any) => a.status === 'ON_TEA_BREAK').length,
      weeklyOff: attendances.filter((a: any) => a.status === 'WEEKLY_OFF').length,
      overtime: attendances.filter((a: any) => a.status === 'OVERTIME').length,
      faceVerified: attendances.filter((a: any) => a.faceVerified).length,
      faceFailed: attendances.filter((a: any) => a.status === 'FACE_VERIFICATION_FAILED').length,
    };
    
    res.json({ attendances, stats });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: 'Failed to get today attendance' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const attendance = await prisma.attendance.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, location: true, floor: true, department: true, shift: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    });
    
    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && attendance.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(attendance);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Failed to get attendance' });
  }
});

router.post('/', authorize('RECORD'), validate(attendanceSchema), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, shiftId, attendanceDate, scheduledLogin, actualLogin, scheduledLogout, actualLogout } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const shift = shiftId
      ? await prisma.shift.findUnique({ where: { id: shiftId } })
      : employee.shiftId
        ? await prisma.shift.findUnique({ where: { id: employee.shiftId } })
        : null;
    const rules = await prisma.attendanceRules.findUnique({ where: { locationId } });
    
    const date = new Date(attendanceDate);
    date.setHours(0, 0, 0, 0);
    
    // Check if attendance already exists
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_attendanceDate: { employeeId, attendanceDate: date } },
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Attendance record already exists for this date' });
    }
    
    // Calculate times
    const scheduledIn = scheduledLogin ? new Date(scheduledLogin) : shift?.startTime || rules?.loginTime;
    const scheduledOut = scheduledLogout ? new Date(scheduledLogout) : shift?.endTime || rules?.logoutTime;
    const actualIn = actualLogin ? new Date(actualLogin) : null;
    const actualOut = actualLogout ? new Date(actualLogout) : null;
    
    // Calculate early/late/overtime
    let earlyLoginSeconds = 0;
    let lateLoginSeconds = 0;
    let earlyLogoutSeconds = 0;
    let overtimeSeconds = 0;
    
    if (actualIn && scheduledIn) {
      const diff = scheduledIn.getTime() - actualIn.getTime();
      if (diff > 0) earlyLoginSeconds = Math.floor(diff / 1000);
      else if (diff < -(rules?.lateThresholdMinutes || 5) * 60 * 1000) lateLoginSeconds = Math.floor(Math.abs(diff) / 1000);
    }
    
    if (actualOut && scheduledOut) {
      const diff = actualOut.getTime() - scheduledOut.getTime();
      if (diff < 0) earlyLogoutSeconds = Math.floor(Math.abs(diff) / 1000);
      else overtimeSeconds = Math.floor(diff / 1000);
    }
    
    // Calculate incentives/penalties
    let earlyLoginIncentive = 0;
    let lateLoginPenalty = 0;
    let overtimeIncentive = 0;
    let earlyLogoutPenalty = 0;
    
    if (earlyLoginSeconds > 0 && rules?.earlyLoginIncentiveEnabled) {
      earlyLoginIncentive = earlyLoginSeconds * Number(rules.earlyLoginRatePerSecond || 1);
      if (rules.earlyLoginMaxDaily && earlyLoginIncentive > Number(rules.earlyLoginMaxDaily)) {
        earlyLoginIncentive = Number(rules.earlyLoginMaxDaily);
      }
    }
    
    if (lateLoginSeconds > 0 && rules?.latePenaltyEnabled) {
      lateLoginPenalty = lateLoginSeconds * Number(rules.latePenaltyRatePerSecond || 1);
      if (rules.latePenaltyMaxDaily && lateLoginPenalty > Number(rules.latePenaltyMaxDaily)) {
        lateLoginPenalty = Number(rules.latePenaltyMaxDaily);
      }
    }
    
    if (overtimeSeconds > 0 && rules?.overtimeIncentiveEnabled) {
      overtimeIncentive = overtimeSeconds * Number(rules.overtimeRatePerSecond || 1.5);
    }
    
    if (earlyLogoutSeconds > 0 && rules?.earlyLogoutPenaltyEnabled) {
      earlyLogoutPenalty = earlyLogoutSeconds * Number(rules.earlyLogoutRatePerSecond || 1);
    }
    
    // Calculate total working time
    let totalWorkingSeconds = 0;
    if (actualIn && actualOut) {
      totalWorkingSeconds = Math.floor((actualOut.getTime() - actualIn.getTime()) / 1000);
    }
    
    const status = !actualIn ? 'ABSENT' : 
      lateLoginSeconds > 0 ? 'LATE' : 
      earlyLoginSeconds > 0 ? 'EARLY' : 'PRESENT';
    
    const attendance = await prisma.attendance.create({
      data: {
        employeeId,
        locationId,
        shiftId,
        attendanceDate: date,
        scheduledLogin: scheduledIn,
        actualLogin: actualIn,
        scheduledLogout: scheduledOut,
        actualLogout: actualOut,
        earlyLoginSeconds,
        lateLoginSeconds,
        earlyLogoutSeconds,
        overtimeSeconds,
        totalWorkingSeconds,
        earlyLoginIncentive,
        lateLoginPenalty,
        overtimeIncentive,
        earlyLogoutPenalty,
        status,
      },
    });
    
    // Emit real-time update
    socketIO.to(`location:${locationId}`).emit('attendance:created', attendance);
    
    res.status(201).json(attendance);
  } catch (error) {
    console.error('Create attendance error:', error);
    res.status(500).json({ error: 'Failed to create attendance' });
  }
});

router.put('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { scheduledLogin, actualLogin, scheduledLogout, actualLogout, status, notes } = req.body;
    
    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updateData: any = { notes };
    if (scheduledLogin) updateData.scheduledLogin = new Date(scheduledLogin);
    if (actualLogin) updateData.actualLogin = new Date(actualLogin);
    if (scheduledLogout) updateData.scheduledLogout = new Date(scheduledLogout);
    if (actualLogout) updateData.actualLogout = new Date(actualLogout);
    if (status) updateData.status = status;
    
    // Recalculate if times changed
    if (actualLogin || actualLogout) {
      const rules = await prisma.attendanceRules.findUnique({ where: { locationId: existing.locationId } });
      const shift = existing.shiftId ? await prisma.shift.findUnique({ where: { id: existing.shiftId } }) : null;
      
      const scheduledIn = updateData.scheduledLogin || existing.scheduledLogin;
      const scheduledOut = updateData.scheduledLogout || existing.scheduledLogout;
      const actualIn = updateData.actualLogin || existing.actualLogin;
      const actualOut = updateData.actualLogout || existing.actualLogout;
      
      if (actualIn && scheduledIn) {
        const diff = scheduledIn.getTime() - actualIn.getTime();
        updateData.earlyLoginSeconds = diff > 0 ? Math.floor(diff / 1000) : 0;
        updateData.lateLoginSeconds = diff < -(rules?.lateThresholdMinutes || 5) * 60 * 1000 ? Math.floor(Math.abs(diff) / 1000) : 0;
      }
      
      if (actualOut && scheduledOut) {
        const diff = actualOut.getTime() - scheduledOut.getTime();
        updateData.earlyLogoutSeconds = diff < 0 ? Math.floor(Math.abs(diff) / 1000) : 0;
        updateData.overtimeSeconds = diff > 0 ? Math.floor(diff / 1000) : 0;
      }
      
      // Recalculate incentives
      if (updateData.earlyLoginSeconds > 0 && rules?.earlyLoginIncentiveEnabled) {
        updateData.earlyLoginIncentive = updateData.earlyLoginSeconds * Number(rules.earlyLoginRatePerSecond || 1);
      }
      if (updateData.lateLoginSeconds > 0 && rules?.latePenaltyEnabled) {
        updateData.lateLoginPenalty = updateData.lateLoginSeconds * Number(rules.latePenaltyRatePerSecond || 1);
      }
      if (updateData.overtimeSeconds > 0 && rules?.overtimeIncentiveEnabled) {
        updateData.overtimeIncentive = updateData.overtimeSeconds * Number(rules.overtimeRatePerSecond || 1.5);
      }
      if (updateData.earlyLogoutSeconds > 0 && rules?.earlyLogoutPenaltyEnabled) {
        updateData.earlyLogoutPenalty = updateData.earlyLogoutSeconds * Number(rules.earlyLogoutRatePerSecond || 1);
      }
      
      if (actualIn && actualOut) {
        updateData.totalWorkingSeconds = Math.floor((actualOut.getTime() - actualIn.getTime()) / 1000);
      }
    }
    
    if (status) updateData.status = status;
    
    const attendance = await prisma.attendance.update({
      where: { id: req.params.id },
      data: updateData,
    });
    
    socketIO.to(`location:${existing.locationId}`).emit('attendance:updated', attendance);
    
    res.json(attendance);
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

router.post('/bulk', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { records } = req.body;
    
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Records array is required' });
    }
    
    const results = [];
    for (const record of records) {
      try {
        // Process each record similar to single create
        // This is a simplified version
        const attendance = await prisma.attendance.create({
          data: {
            ...record,
            attendanceDate: new Date(record.attendanceDate),
            scheduledLogin: record.scheduledLogin ? new Date(record.scheduledLogin) : null,
            actualLogin: record.actualLogin ? new Date(record.actualLogin) : null,
            scheduledLogout: record.scheduledLogout ? new Date(record.scheduledLogout) : null,
            actualLogout: record.actualLogout ? new Date(record.actualLogout) : null,
          },
        });
        results.push({ success: true, data: attendance });
      } catch (e: any) {
        results.push({ success: false, error: e.message, record });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Bulk attendance error:', error);
    res.status(500).json({ error: 'Failed to process bulk attendance' });
  }
});

export default router;