import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { cacheService } from '../services/cacheService.js';

const router = Router();

router.use(authenticate);

const shiftSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(50),
    code: z.string().min(2).max(20).toUpperCase(),
    locationId: z.string().min(1),
    departmentId: z.string().optional(),
    startTime: z.string(),
    endTime: z.string(),
    gracePeriod: z.number().int().min(0).max(60).optional(),
    lateThreshold: z.number().int().min(0).max(120).optional(),
    earlyLoginIncentive: z.boolean().optional(),
    earlyLoginRatePerSecond: z.number().optional(),
    latePenaltyEnabled: z.boolean().optional(),
    latePenaltyRatePerSecond: z.number().optional(),
    overtimeEnabled: z.boolean().optional(),
    overtimeRatePerSecond: z.number().optional(),
    earlyLogoutPenaltyEnabled: z.boolean().optional(),
    earlyLogoutRatePerSecond: z.number().optional(),
    lunchDurationMinutes: z.number().int().min(0).max(480).optional(),
    teaDurationMinutes: z.number().int().min(0).max(120).optional(),
    maleLunchMinutes: z.number().int().min(0).max(480).optional(),
    femaleLunchMinutes: z.number().int().min(0).max(480).optional(),
    maleTeaMinutes: z.number().int().min(0).max(120).optional(),
    femaleTeaMinutes: z.number().int().min(0).max(120).optional(),
    faceVerificationThreshold: z.number().min(0).max(100).optional(),
    qrDailyTokenEnabled: z.boolean().optional(),
    qrOneTimeScan: z.boolean().optional(),
    scannerRoles: z.array(z.string()).optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId, status, page = 1, limit = 20 } = req.query;
    const scopedLocId = getScopedLocationId(req.user, locationId);

    const cacheKey = `shifts:${scopedLocId || 'all'}:${departmentId || 'all'}:${status || 'all'}:${page}:${limit}`;
    const cached = cacheService.get<any>(cacheKey);
    if (cached) {
      if (req.headers['if-none-match'] === cached.etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
      return res.json(cached.data);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (scopedLocId) where.locationId = scopedLocId;
    if (departmentId) where.departmentId = departmentId;
    if (status) where.status = status;
    
    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { startTime: 'asc' },
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { employees: true } },
        },
      }),
      prisma.shift.count({ where }),
    ]);
    
    const result = { shifts, total, page: Number(page), limit: Number(limit) };
    const etag = cacheService.set(cacheKey, result, 60_000);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.json(result);
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ error: 'Failed to get shifts' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: {
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, code: true } },
        employees: { where: { status: 'ACTIVE' }, select: { id: true, employeeCode: true, fullName: true } },
      },
    });
    
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && shift.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(shift);
  } catch (error) {
    console.error('Get shift error:', error);
    res.status(500).json({ error: 'Failed to get shift' });
  }
});

router.post('/', authorize('ADD'), validate(shiftSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, locationId, departmentId, startTime, endTime, ...rest } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const existing = await prisma.shift.findUnique({
      where: { locationId_code: { locationId, code } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Shift code already exists for this location' });
    }
    
    const shift = await prisma.shift.create({
      data: {
        name,
        code,
        locationId,
        departmentId,
        startTime: new Date(`2024-01-01T${startTime}:00`),
        endTime: new Date(`2024-01-01T${endTime}:00`),
        ...rest,
      },
    });
    
    cacheService.invalidateShifts();
    res.status(201).json(shift);
  } catch (error) {
    console.error('Create shift error:', error);
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

router.put('/:id', authorize('EDIT'), validate(shiftSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, startTime, endTime, ...rest } = req.body;
    
    const existing = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updateData: any = { ...rest, name, code };
    if (startTime) updateData.startTime = new Date(`2024-01-01T${startTime}:00`);
    if (endTime) updateData.endTime = new Date(`2024-01-01T${endTime}:00`);
    
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      data: updateData,
    });
    
    cacheService.invalidateShifts();
    res.json(shift);
  } catch (error) {
    console.error('Update shift error:', error);
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

router.patch('/:id/status', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    
    const existing = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      data: { status },
    });
    
    cacheService.invalidateShifts();
    res.json(shift);
  } catch (error) {
    console.error('Update shift status error:', error);
    res.status(500).json({ error: 'Failed to update shift status' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const empCount = await prisma.employee.count({ where: { shiftId: req.params.id } });
    if (empCount > 0) {
      return res.status(400).json({ error: 'Cannot delete shift with assigned employees' });
    }
    
    await prisma.shift.delete({ where: { id: req.params.id } });
    cacheService.invalidateShifts();
    res.json({ message: 'Shift deleted successfully' });
  } catch (error) {
    console.error('Delete shift error:', error);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

export default router;