import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

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

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, result, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (employeeId) where.employeeId = employeeId;
    if (result) where.result = result;
    if (startDate || endDate) {
      where.verifiedAt = {};
      if (startDate) where.verifiedAt.gte = new Date(String(startDate));
      if (endDate) where.verifiedAt.lte = new Date(String(endDate));
    }
    
    const [verifications, total] = await Promise.all([
      prisma.faceVerification.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { verifiedAt: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true } },
        },
      }),
      prisma.faceVerification.count({ where }),
    ]);
    
    const serialized = verifications.map((v) => ({
      ...v,
      matchPercentage: Number(v.matchPercentage),
      threshold: Number(v.threshold),
      status: v.result,
    }));

    res.json({ verifications: serialized, total, page: Number(page), limit: Number(limit) });
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
    
    // Update attendance if exists
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.attendance.updateMany({
      where: { employeeId, attendanceDate: today },
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

router.get('/stats', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationId = req.user!.role === 'SUPER_ADMIN'
      ? (typeof req.query.locationId === 'string' ? req.query.locationId : undefined)
      : req.user!.locationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [todayVerified, todayFailed, avgMatch, totalCount, allVerified] = await Promise.all([
      prisma.faceVerification.count({ where: { locationId, result: 'VERIFIED', verifiedAt: { gte: today, lt: tomorrow } } }),
      prisma.faceVerification.count({ where: { locationId, result: 'FAILED', verifiedAt: { gte: today, lt: tomorrow } } }),
      prisma.faceVerification.aggregate({ where: { locationId, result: 'VERIFIED' }, _avg: { matchPercentage: true } }),
      prisma.faceVerification.count({ where: { locationId } }),
      prisma.faceVerification.count({ where: { locationId, result: 'VERIFIED' } }),
    ]);

    const allFailed = totalCount - allVerified;
    
    res.json({
      total: totalCount,
      verified: allVerified,
      failed: allFailed,
      todayVerified,
      todayFailed,
      averageMatchPercentage: Number(avgMatch._avg?.matchPercentage ?? 0),
      totalVerified: allVerified,
      successRate: totalCount > 0 ? (allVerified / totalCount) * 100 : 0,
    });
  } catch (error) {
    console.error('Get face verification stats error:', error);
    res.status(500).json({ error: 'Failed to get face verification stats' });
  }
});

export default router;