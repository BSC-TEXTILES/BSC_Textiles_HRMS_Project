import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import QRCode from 'qrcode';
import { prisma } from '../index.js';
import { dbDate } from '../utils/dates.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { computeShiftWindow, windowFromScheduled } from '../core/services/AttendanceCalculationService.js';

const router = Router();

router.use(authenticate);

const qrScanSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    purpose: z.enum(['ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT', 'LUNCH_START', 'LUNCH_END', 'TEA_BREAK_START', 'TEA_BREAK_END', 'BREAK_START', 'BREAK_END', 'SELLING_POINT_CHECK_IN']),
    locationId: z.string().optional(),
    sellingPointId: z.string().optional(),
    deviceInfo: z.any().optional(),
    ipAddress: z.string().optional(),
  }),
});

router.get('/daily/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const rawId = req.params.employeeId;
    let employee = await prisma.employee.findUnique({
      where: { id: rawId },
      include: { location: true },
    });

    if (!employee) {
      employee = await prisma.employee.findFirst({
        where: { employeeCode: rawId },
        include: { location: true },
      });
    }

    if (!employee) {
      // If a numeric index like 1 or 2 was passed, find the nth employee
      const num = Number.parseInt(rawId, 10);
      if (!Number.isNaN(num) && num > 0) {
        employee = await prisma.employee.findFirst({
          skip: num - 1,
          take: 1,
          orderBy: { employeeCode: 'asc' },
          include: { location: true },
        });
      }
    }

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (req.user!.role !== 'SUPER_ADMIN' && employee.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let dailyQR = await prisma.qRCode.findFirst({
      where: {
        employeeId: employee.id,
        type: 'DAILY',
        validFrom: { lte: new Date() },
        validTo: { gte: new Date() },
        isConsumed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!dailyQR) {
      const randomHex = crypto.randomBytes(16).toString('hex');
      const token = `DAILY-${employee.employeeCode}-${today.toISOString().split('T')[0].replace(/-/g, '')}-${randomHex}`;
      dailyQR = await prisma.qRCode.create({
        data: {
          token,
          type: 'DAILY',
          employeeId: employee.id,
          locationId: employee.locationId,
          validFrom: today,
          validTo: tomorrow,
          isConsumed: false,
        },
      });

      await prisma.employee.update({
        where: { id: employee.id },
        data: { dailyQRCodeId: dailyQR.id },
      });
    }

    const dataUrl = await QRCode.toDataURL(dailyQR.token, { width: 300 });

    res.json({
      success: true,
      qrCode: dailyQR,
      dataUrl,
      employee: {
        id: employee.id,
        code: employee.employeeCode,
        name: employee.fullName,
        location: employee.location?.name,
      },
    });
  } catch (error) {
    console.error('Get daily QR error:', error);
    res.status(500).json({ error: 'Failed to get daily QR' });
  }
});

router.get('/employee/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
      include: {
        qrCode: true,
        dailyQRCode: true,
      },
    });
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && employee.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(employee);
  } catch (error) {
    console.error('Get employee QR error:', error);
    res.status(500).json({ error: 'Failed to get employee QR' });
  }
});

router.post('/generate-daily', authorize('CONFIGURE'), async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.body;
    
    const targetLocationId = req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId;
    
    const employees = await prisma.employee.findMany({
      where: { locationId: targetLocationId, status: 'ACTIVE' },
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setHours(23, 59, 59, 999);
    
    const results: any[] = [];
    for (const emp of employees) {
      // Invalidate old daily QR
      if (emp.dailyQRCodeId) {
        await prisma.qRCode.update({
          where: { id: emp.dailyQRCodeId },
          data: { isConsumed: true, consumedAt: new Date() },
        });
      }
      
      // Create new daily QR
      const dailyQR = await prisma.qRCode.create({
        data: {
          token: `DAILY-${emp.employeeCode}-${today.toISOString().split('T')[0].replace(/-/g, '')}`,
          type: 'DAILY',
          employeeId: emp.id,
          locationId: targetLocationId,
          validFrom: today,
          validTo: tomorrow,
        },
      });
      
      await prisma.employee.update({
        where: { id: emp.id },
        data: { dailyQRCodeId: dailyQR.id },
      });
      
      results.push({ employeeId: emp.id, token: dailyQR.token });
    }
    
    res.json({ generated: results.length, results });
  } catch (error) {
    console.error('Generate daily QR error:', error);
    res.status(500).json({ error: 'Failed to generate daily QR codes' });
  }
});

router.post('/scan', authorize('SCAN'), validate(qrScanSchema), async (req: AuthRequest, res) => {
  try {
    const { token, purpose, locationId, sellingPointId, deviceInfo, ipAddress } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN' && locationId && locationId !== req.user!.locationId) {
      return res.status(403).json({ success: false, error: 'Access denied', reason: 'Scanner location mismatch' });
    }
    
    // Find QR code
    let qrCode = await prisma.qRCode.findUnique({
      where: { token },
      include: { employee: { include: { shift: true, floor: true, department: true } } },
    });

    if (!qrCode) {
      const emp = await prisma.employee.findFirst({
        where: {
          OR: [
            { employeeCode: token },
            { id: token },
          ],
        },
        include: { shift: true, floor: true, department: true },
      });

      if (emp) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let activeQr = await prisma.qRCode.findFirst({
          where: {
            employeeId: emp.id,
            isConsumed: false,
            validTo: { gte: new Date() },
          },
          include: { employee: { include: { shift: true, floor: true, department: true } } },
          orderBy: { createdAt: 'desc' },
        });

        if (!activeQr) {
          const randomHex = crypto.randomBytes(16).toString('hex');
          const generatedToken = `DAILY-${emp.employeeCode}-${today.toISOString().split('T')[0].replace(/-/g, '')}-${randomHex}`;
          activeQr = await prisma.qRCode.create({
            data: {
              token: generatedToken,
              type: 'DAILY',
              employeeId: emp.id,
              locationId: emp.locationId,
              validFrom: today,
              validTo: tomorrow,
              isConsumed: false,
            },
            include: { employee: { include: { shift: true, floor: true, department: true } } },
          });
        }
        qrCode = activeQr;
      }
    }
    
    if (!qrCode) {
      return res.status(404).json({ success: false, error: 'Invalid QR code', reason: 'Invalid or unknown QR token or employee code', result: 'INVALID_TOKEN' });
    }
    
    // Check if QR is consumed (for daily QR)
    if (qrCode.type === 'DAILY' && qrCode.isConsumed) {
      return res.status(400).json({ 
        success: false,
        error: 'QR code already used for today', 
        reason: 'This QR code has already been scanned for today.',
        result: 'ALREADY_SCANNED',
        consumedAt: qrCode.consumedAt,
      });
    }
    
    // Check validity
    const now = new Date();
    if (now < qrCode.validFrom || now > qrCode.validTo) {
      return res.status(400).json({ 
        success: false,
        error: 'QR code expired', 
        reason: 'QR code has expired or is outside validity window',
        result: 'EXPIRED',
        validFrom: qrCode.validFrom,
        validTo: qrCode.validTo,
      });
    }
    
    // Check location match
    const effectiveLocationId = locationId || req.user!.locationId;
    if (effectiveLocationId && qrCode.locationId !== effectiveLocationId && req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN') {
      return res.status(400).json({ 
        success: false,
        error: 'Location mismatch', 
        reason: 'Employee is registered for another location',
        result: 'LOCATION_MISMATCH',
      });
    }
    
    // Check employee status
    if (qrCode.employee.status !== 'ACTIVE') {
      return res.status(400).json({ 
        error: 'Employee is not active', 
        result: 'EMPLOYEE_INACTIVE',
      });
    }
    
    // Check scanner permissions
    const ruleLocationId = effectiveLocationId || qrCode.locationId;
    const rules = ruleLocationId ? await prisma.attendanceRules.findUnique({ where: { locationId: ruleLocationId } }) : null;
    const allowedRoles: string[] = Array.isArray(rules?.scannerRoles)
      ? (rules?.scannerRoles as string[])
      : ['SUPER_ADMIN', 'ADMIN', 'T_SHOP_OWNER', 'TEA_BREAK_MANAGER', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'];
    
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN' && !allowedRoles.includes(req.user!.role)) {
      return res.status(403).json({ 
        error: 'Unauthorized scanner role', 
        result: 'UNAUTHORIZED_SCANNER',
      });
    }
    
    // Mark daily QR as consumed
    if (qrCode.type === 'DAILY') {
      await prisma.qRCode.update({
        where: { id: qrCode.id },
        data: { isConsumed: true, consumedAt: new Date(), consumedBy: req.user!.id },
      });
    }
    
    // Create scan record
    const scanRecord = await prisma.qRScanRecord.create({
      data: {
        qrCodeId: qrCode.id,
        employeeId: qrCode.employeeId,
        scannerId: req.user!.id,
        locationId: effectiveLocationId || qrCode.locationId,
        sellingPointId,
        purpose,
        result: 'SUCCESS',
        deviceInfo: typeof deviceInfo === 'object' ? JSON.stringify(deviceInfo) : (deviceInfo || null),
        ipAddress: ipAddress || null,
      },
    });
    
    // Handle specific purposes
    let breakRecord = null;
    if (purpose === 'LUNCH_START') {
      breakRecord = await prisma.employeeBreak.create({
        data: {
          employeeId: qrCode.employeeId,
          breakType: 'LUNCH',
          breakDate: dbDate(),
          startTime: new Date(),
          allowedDuration: qrCode.employee.gender === 'female' ? 40 : 100,
          status: 'ACTIVE',
          qrScanId: scanRecord.id,
        },
      });
    } else if (purpose === 'LUNCH_END') {
      const activeBreak = await prisma.employeeBreak.findFirst({
        where: { employeeId: qrCode.employeeId, breakType: 'LUNCH', status: 'ACTIVE' },
        orderBy: { startTime: 'desc' },
      });
      if (activeBreak) {
        const endTime = new Date();
        const actualDuration = Math.floor((endTime.getTime() - activeBreak.startTime!.getTime()) / (1000 * 60));
        const exceededDuration = Math.max(0, actualDuration - activeBreak.allowedDuration);
        breakRecord = await prisma.employeeBreak.update({
          where: { id: activeBreak.id },
          data: { endTime, actualDuration, excessDuration: exceededDuration, status: exceededDuration > 0 ? 'EXCEEDED' : 'COMPLETED', qrScanId: scanRecord.id },
        });
      }
    } else if (purpose === 'TEA_BREAK_START') {
      breakRecord = await prisma.employeeBreak.create({
        data: {
          employeeId: qrCode.employeeId,
          breakType: 'TEA',
          breakDate: dbDate(),
          startTime: new Date(),
          allowedDuration: qrCode.employee.gender === 'female' ? 15 : 20,
          status: 'ACTIVE',
          qrScanId: scanRecord.id,
        },
      });
    } else if (purpose === 'TEA_BREAK_END') {
      const activeBreak = await prisma.employeeBreak.findFirst({
        where: { employeeId: qrCode.employeeId, breakType: 'TEA', status: 'ACTIVE' },
        orderBy: { startTime: 'desc' },
      });
      if (activeBreak) {
        const endTime = new Date();
        const actualDuration = Math.floor((endTime.getTime() - activeBreak.startTime!.getTime()) / (1000 * 60));
        const exceededDuration = Math.max(0, actualDuration - activeBreak.allowedDuration);
        breakRecord = await prisma.employeeBreak.update({
          where: { id: activeBreak.id },
          data: { endTime, actualDuration, excessDuration: exceededDuration, status: exceededDuration > 0 ? 'EXCEEDED' : 'COMPLETED', qrScanId: scanRecord.id },
        });
      }
    } else if (purpose === 'ATTENDANCE_CHECK_IN') {
      // Create or update attendance
      const today = dbDate();
      
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_attendanceDate: { employeeId: qrCode.employeeId, attendanceDate: today } },
      });
      
      if (!existing) {
        const shift = qrCode.employee.shift;
        const attRules = ruleLocationId ? await prisma.attendanceRules.findUnique({ where: { locationId: ruleLocationId } }) : null;
        // Shift/rule times live on a dummy calendar day — re-anchor to today's
        // work date so the early-login maths is measured against today, not 2024.
        const window = computeShiftWindow(
          shift ?? (attRules ? { startTime: attRules.loginTime, endTime: attRules.logoutTime } : null),
          today.toISOString().slice(0, 10)
        );
        const scheduledIn = window?.start ?? null;
        
        const earlyLoginSeconds = scheduledIn ? Math.max(0, Math.floor((scheduledIn.getTime() - now.getTime()) / 1000)) : 0;
        
        let earlyLoginIncentive = 0;
        if (earlyLoginSeconds > 0 && attRules?.earlyLoginIncentiveEnabled) {
          earlyLoginIncentive = Math.round((earlyLoginSeconds / 60.0) * Number(attRules.earlyLoginRatePerMinute || attRules.earlyLoginRatePerSecond || 1));
          if (attRules.earlyLoginMaxDaily && earlyLoginIncentive > Number(attRules.earlyLoginMaxDaily)) {
            earlyLoginIncentive = Number(attRules.earlyLoginMaxDaily);
          }
        }
        
        await prisma.attendance.create({
          data: {
            employeeId: qrCode.employeeId,
            locationId: effectiveLocationId || qrCode.locationId,
            shiftId: shift?.id,
            attendanceDate: today,
            scheduledLogin: scheduledIn,
            scheduledLogout: window?.end ?? null,
            actualLogin: now,
            earlyLoginSeconds,
            earlyLoginIncentive,
            status: earlyLoginSeconds > 0 ? 'EARLY' : 'PRESENT',
          },
        });
      }
    } else if (purpose === 'ATTENDANCE_CHECK_OUT') {
      const today = dbDate();
      
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_attendanceDate: { employeeId: qrCode.employeeId, attendanceDate: today } },
      });
      
      if (existing) {
        // Resolve the rules row for the employee's own hub — not the raw body
        // locationId (which may be undefined and would match an arbitrary row).
        const attRules = ruleLocationId ? await prisma.attendanceRules.findUnique({ where: { locationId: ruleLocationId } }) : null;
        const shift = existing.shiftId ? await prisma.shift.findUnique({ where: { id: existing.shiftId } }) : null;
        // Prefer the record's own scheduled window; fall back to the shift /
        // rules times re-anchored to today (they are dummy-dated, and the
        // shift's end may roll over past midnight for night shifts).
        const window = windowFromScheduled(existing.scheduledLogin, existing.scheduledLogout)
          ?? computeShiftWindow(
            shift ?? (attRules ? { startTime: attRules.loginTime, endTime: attRules.logoutTime } : null),
            today.toISOString().slice(0, 10)
          );
        const scheduledOut = window?.end ?? null;
        
        const overtimeSeconds = scheduledOut ? Math.max(0, Math.floor((now.getTime() - scheduledOut.getTime()) / 1000)) : 0;
        
        let overtimeIncentive = 0;
        if (overtimeSeconds > 0 && attRules?.overtimeIncentiveEnabled) {
          overtimeIncentive = overtimeSeconds * Number(attRules.overtimeRatePerSecond || 1.5);
        }
        
        await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            actualLogout: now,
            overtimeSeconds,
            overtimeIncentive,
            totalWorkingSeconds: existing.actualLogin ? Math.floor((now.getTime() - existing.actualLogin.getTime()) / 1000) : 0,
            status: overtimeSeconds > 0 ? 'OVERTIME' : 'PRESENT',
          },
        });
      }
    }
    
    res.json({
      success: true,
      message: 'QR SCANNED SUCCESSFULLY',
      scanRecord,
      employee: {
        id: qrCode.employee.id,
        employeeCode: qrCode.employee.employeeCode,
        fullName: qrCode.employee.fullName,
        gender: qrCode.employee.gender,
        floor: qrCode.employee.floor,
        department: qrCode.employee.department,
        shift: qrCode.employee.shift,
      },
      breakRecord,
    });
  } catch (error) {
    console.error('QR scan error:', error);
    res.status(500).json({ error: 'Failed to process QR scan' });
  }
});

router.get('/scan-history', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, purpose, result, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (employeeId) where.employeeId = employeeId;
    if (purpose) where.purpose = purpose;
    if (result) where.result = result;
    if (startDate || endDate) {
      where.scannedAt = {};
      if (startDate) where.scannedAt.gte = new Date(String(startDate));
      if (endDate) where.scannedAt.lte = new Date(String(endDate));
    }
    
    const [scans, total] = await Promise.all([
      prisma.qRScanRecord.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { scannedAt: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          scanner: { select: { id: true, fullName: true } },
          sellingPoint: { select: { id: true, name: true } },
        },
      }),
      prisma.qRScanRecord.count({ where }),
    ]);
    
    res.json({ scans, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get scan history error:', error);
    res.status(500).json({ error: 'Failed to get scan history' });
  }
});

// Alias for PRD QR audit logs endpoint
router.get('/scans', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, purpose, result, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (employeeId) where.employeeId = employeeId;
    if (purpose) where.purpose = purpose;
    if (result) where.result = result;
    if (startDate || endDate) {
      where.scannedAt = {};
      if (startDate) where.scannedAt.gte = new Date(String(startDate));
      if (endDate) where.scannedAt.lte = new Date(String(endDate));
    }
    
    const [scans, total] = await Promise.all([
      prisma.qRScanRecord.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { scannedAt: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          scanner: { select: { id: true, fullName: true } },
          sellingPoint: { select: { id: true, name: true } },
        },
      }),
      prisma.qRScanRecord.count({ where }),
    ]);
    
    res.json({ scans, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get scans error:', error);
    res.status(500).json({ error: 'Failed to get scans' });
  }
});

export default router;