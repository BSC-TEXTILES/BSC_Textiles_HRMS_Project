import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { FaceRecognitionService } from '../services/faceRecognitionService.js';

const router = Router();

// Kiosk device PIN authentication (runs without employee user session)
router.post('/kiosk/auth', async (req, res) => {
  try {
    const { deviceCode, pin } = req.body || {};
    if (!deviceCode || !pin) {
      return res.status(400).json({ error: 'deviceCode and pin are required' });
    }
    const result = await FaceRecognitionService.authenticateKiosk(String(deviceCode), String(pin));
    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }
    return res.json(result);
  } catch (error: any) {
    console.error('Kiosk auth error:', error);
    return res.status(500).json({ error: error?.message || 'Kiosk authentication failed' });
  }
});

router.use(authenticate);

const fvSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1),
    locationId: z.string().min(1),
    deviceId: z.string().optional(),
    matchPercentage: z.number().min(0).max(100),
    threshold: z.number().min(0).max(100).optional(),
    purpose: z.string().optional(),
  }),
});

router.get(['/', '/history', '/records'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, result, startDate, endDate, from, to, search, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    // Resolve location
    let targetLocId = getScopedLocationId(req.user, locationId as string);
    if (targetLocId === 'all') targetLocId = undefined;
    if (targetLocId && targetLocId.length < 10) {
      const locMatch = await prisma.location.findFirst({
        where: { OR: [{ code: targetLocId.toUpperCase() }, { id: targetLocId }] },
      });
      if (locMatch) targetLocId = locMatch.id;
    }

    const where: any = targetLocId ? { locationId: targetLocId } : {};
    if (employeeId) where.employeeId = employeeId;
    if (result && result !== 'all') {
      const upper = String(result).toUpperCase();
      where.result = upper === 'PASSED' ? 'VERIFIED' : upper;
    }
    
    const start = startDate || from;
    const end = endDate || to;
    if (start || end) {
      where.verifiedAt = {};
      if (start) where.verifiedAt.gte = new Date(String(start));
      if (end) where.verifiedAt.lte = new Date(String(end));
    }
    
    const [verifications, total] = await Promise.all([
      prisma.faceVerification.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { verifiedAt: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true, locationId: true } },
          location: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.faceVerification.count({ where }),
    ]);
    
    const serialized = verifications.map((v) => {
      const score = Number(v.matchPercentage);
      const thresholdVal = Number(v.threshold || 85);
      const isPassed = v.result === 'VERIFIED';
      return {
        ...v,
        employeeCode: v.employee?.employeeCode || '',
        employeeName: v.employee?.fullName || '',
        locationCode: v.location?.code || '',
        locationName: v.location?.name || '',
        attemptedAt: v.verifiedAt || v.createdAt,
        score,
        threshold: thresholdVal,
        result: isPassed ? 'passed' : 'failed',
        status: v.result,
        failureReason: isPassed ? null : 'Match confidence below security threshold (85%)',
        matchPercentage: score,
      };
    });

    res.json({
      verifications: serialized,
      rows: serialized,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error('Get face verifications error:', error);
    res.status(500).json({ error: 'Failed to get face verifications' });
  }
});

router.post('/', authorize('RECORD'), validate(fvSchema), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, deviceId, matchPercentage, threshold, purpose } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const rules = await prisma.attendanceRules.findUnique({ where: { locationId } });
    const effectiveThreshold = threshold || Number(rules?.faceVerificationThreshold || 85);
    const result = matchPercentage >= effectiveThreshold ? 'VERIFIED' : 'FAILED';
    
    const verification = await prisma.faceVerification.create({
      data: {
        employeeId,
        locationId,
        deviceId,
        matchPercentage,
        threshold: effectiveThreshold,
        result,
        purpose: purpose || 'attendance',
      },
    });
    
    // Update attendance if exists — DATE columns only match a YYYY-MM-DD string.
    const todayStr = new Date().toISOString().slice(0, 10);
    await prisma.attendance.updateMany({
      where: { employeeId, attendanceDate: todayStr },
      data: { faceVerified: result === 'VERIFIED', faceMatchPercentage: matchPercentage },
    });
    
    res.status(201).json({
      ...verification,
      matchPercentage: Number(verification.matchPercentage),
      threshold: Number(verification.threshold),
      status: verification.result,
    });
  } catch (error) {
    console.error('Create face verification error:', error);
    res.status(500).json({ error: 'Failed to create face verification' });
  }
});

router.get(['/stats', '/stats/:locationId'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    let locParam = req.params.locationId || (typeof req.query.locationId === 'string' ? req.query.locationId : undefined);
    let locationId = getScopedLocationId(req.user, locParam);
    if (locationId === 'all') locationId = undefined;

    if (locationId && locationId.length < 10) {
      const locMatch = await prisma.location.findFirst({
        where: { OR: [{ code: locationId.toUpperCase() }, { id: locationId }] },
      });
      if (locMatch) locationId = locMatch.id;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const whereBase: any = locationId ? { locationId } : {};

    const [todayVerified, todayFailed, avgMatch, totalCount, allVerified] = await Promise.all([
      prisma.faceVerification.count({ where: { ...whereBase, result: 'VERIFIED', verifiedAt: { gte: today, lt: tomorrow } } }),
      prisma.faceVerification.count({ where: { ...whereBase, result: 'FAILED', verifiedAt: { gte: today, lt: tomorrow } } }),
      prisma.faceVerification.aggregate({ where: { ...whereBase, result: 'VERIFIED' }, _avg: { matchPercentage: true } }),
      prisma.faceVerification.count({ where: whereBase }),
      prisma.faceVerification.count({ where: { ...whereBase, result: 'VERIFIED' } }),
    ]);

    const allFailed = totalCount - allVerified;
    const avgScore = Math.round(Number(avgMatch._avg?.matchPercentage ?? 94));
    const passRate = totalCount > 0 ? Math.round((allVerified / totalCount) * 100) : 100;

    // 7-day trend computed from actual verification timestamps
    const trendStart = new Date(today);
    trendStart.setDate(trendStart.getDate() - 6);

    const trend: Array<{ date: string; total: number; passed: number; failed: number; avgScore: number }> = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(trendStart);
      day.setDate(day.getDate() + d);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const [dayTotal, dayPassed] = await Promise.all([
        prisma.faceVerification.count({ where: { ...whereBase, verifiedAt: { gte: day, lt: next } } }),
        prisma.faceVerification.aggregate({
          where: { ...whereBase, result: 'VERIFIED', verifiedAt: { gte: day, lt: next } },
          _count: { _all: true },
          _avg: { matchPercentage: true },
        }),
      ]);
      const passed = Number(dayPassed._count?._all ?? 0);
      trend.push({
        date: day.toISOString().slice(0, 10),
        total: dayTotal,
        passed,
        failed: dayTotal - passed,
        avgScore: Math.round(Number(dayPassed._avg?.matchPercentage ?? 0) * 10) / 10,
      });
    }

    // Per-location breakdown from the real location registry
    const scopeLocations = locationId
      ? await prisma.location.findMany({ where: { id: locationId }, select: { id: true, code: true, name: true } })
      : await prisma.location.findMany({ select: { id: true, code: true, name: true } });
    const locationBreakdown = await Promise.all(
      scopeLocations.map(async (loc) => {
        const [locTotal, locAgg] = await Promise.all([
          prisma.faceVerification.count({ where: { locationId: loc.id } }),
          prisma.faceVerification.aggregate({
            where: { locationId: loc.id, result: 'VERIFIED' },
            _count: { _all: true },
            _avg: { matchPercentage: true },
          }),
        ]);
        const passed = Number(locAgg._count?._all ?? 0);
        return {
          code: loc.code,
          name: loc.name,
          total: locTotal,
          passed,
          failed: locTotal - passed,
          avgScore: Math.round(Number(locAgg._avg?.matchPercentage ?? 0) * 10) / 10,
        };
      })
    );

    // Per-device breakdown from recorded device ids (null -> 'Unregistered')
    const deviceGroups = await prisma.faceVerification.groupBy({
      by: ['deviceId'],
      where: whereBase,
      _count: { _all: true },
    });
    const deviceBreakdown = await Promise.all(
      deviceGroups.map(async (g) => {
        const whereDevice: any = { ...whereBase, deviceId: g.deviceId };
        const [devTotal, devAgg] = await Promise.all([
          prisma.faceVerification.count({ where: whereDevice }),
          prisma.faceVerification.aggregate({
            where: { ...whereDevice, result: 'VERIFIED' },
            _count: { _all: true },
            _avg: { matchPercentage: true },
          }),
        ]);
        const passed = Number(devAgg._count?._all ?? 0);
        return {
          device: g.deviceId || 'Unregistered',
          total: devTotal,
          passed,
          failed: devTotal - passed,
          avgScore: Math.round(Number(devAgg._avg?.matchPercentage ?? 0) * 10) / 10,
        };
      })
    );

    const stats = await prisma.faceVerification.aggregate({
      where: { ...whereBase, result: 'VERIFIED' },
      _max: { matchPercentage: true },
      _min: { matchPercentage: true },
    });
    
    res.json({
      // Flat properties for automated tests
      total: totalCount,
      verified: allVerified,
      failed: allFailed,
      todayVerified,
      todayFailed,
      averageMatchPercentage: Number(avgMatch._avg?.matchPercentage ?? 0),
      totalVerified: allVerified,
      // Nested structures for frontend FaceDashboardStats
      summary: {
        verifiedToday: todayVerified,
        failedToday: todayFailed,
        averageMatchPercent: Number(avgMatch._avg?.matchPercentage ?? 0),
        highestMatchPercent: Number(stats?._max?.matchPercentage ?? 0),
        lowestMatchPercent: Number(stats?._min?.matchPercentage ?? 0),
        belowThreshold: todayFailed,
        manualVerification: 0,
      },
      successRate: {
        total: totalCount,
        passed: allVerified,
        failed: allFailed,
        rate: passRate,
      },
      trend,
      locationBreakdown,
      deviceBreakdown,
    });
  } catch (error) {
    console.error('Get face verification stats error:', error);
    res.status(500).json({ error: 'Failed to get face verification stats' });
  }
});

/**
 * Multi-Angle Face Registration (Straight, Right, Left, Up/Down)
 */
router.post('/register-multi', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, samples } = req.body || {};
    if (!employeeId || !Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: 'employeeId and at least one pose sample are required' });
    }

    const result = await FaceRecognitionService.registerMultiAngle(String(employeeId), samples);
    return res.json(result);
  } catch (error: any) {
    console.error('Multi-angle face registration error:', error);
    return res.status(500).json({ error: error?.message || 'Face registration failed' });
  }
});

/**
 * Get Enrolled Samples for an Employee
 */
router.get('/samples/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;
    const profile = await prisma.faceProfile.findUnique({
      where: { employeeId },
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, locationId: true } },
      },
    });

    res.json({
      enrolled: Boolean(profile?.isActive),
      multiAngleEnrolled: Boolean((profile as any)?.multiAngleEnrolled),
      threshold: Number((profile as any)?.threshold || 70.0),
      enrolledAt: profile?.enrolledAt || null,
      employee: profile?.employee || null,
    });
  } catch (error: any) {
    console.error('Get face samples error:', error);
    res.status(500).json({ error: 'Failed to get face registration samples' });
  }
});

/**
 * Execute Face Recognition Attendance Punch with Liveness, 70% threshold, and 5-min cooldown
 */
router.post('/punch', async (req: AuthRequest, res) => {
  try {
    const { employeeId, queryEmbedding, locationId, deviceId, sourceChannel, livenessData, forcedPunchType } = req.body || {};

    const targetEmpId = employeeId || req.user?.employeeId;
    const targetLocId = locationId || req.user?.locationId || 'loc_dav';

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      return res.status(400).json({ error: 'queryEmbedding vector is required for biometric face recognition' });
    }

    const result = await FaceRecognitionService.verifyAndPunch({
      employeeId: targetEmpId,
      queryEmbedding,
      locationId: targetLocId,
      deviceId,
      sourceChannel: sourceChannel || 'WEB',
      livenessData,
      forcedPunchType,
    });

    if (!result.success) {
      return res.status(result.isCooldownBlocked ? 429 : 400).json(result);
    }

    return res.json(result);
  } catch (error: any) {
    console.error('Face verification punch error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to process face attendance punch' });
  }
});

/**
 * Synchronize offline punches from Kiosk terminal
 */
router.post('/kiosk/sync', async (req: AuthRequest, res) => {
  try {
    const { deviceCode, punches } = req.body || {};
    if (!deviceCode || !Array.isArray(punches)) {
      return res.status(400).json({ error: 'deviceCode and punches array are required' });
    }

    const result = await FaceRecognitionService.syncOfflinePunches(String(deviceCode), punches);
    return res.json({
      success: true,
      message: `Synchronized ${result.syncedCount} punches (${result.duplicateCount} duplicates skipped).`,
      ...result,
    });
  } catch (error: any) {
    console.error('Kiosk offline sync error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to sync offline punches' });
  }
});

export default router;