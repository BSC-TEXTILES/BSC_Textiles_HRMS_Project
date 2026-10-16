import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { cacheService } from '../services/cacheService.js';

const router = Router();

router.use(authenticate);

/** 24-hour wall-clock time, e.g. "09:30" or "16:30:00". */
const timeOfDay = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be in HH:MM format (24-hour)');

const shiftSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(50),
    code: z.string().min(2).max(50).toUpperCase().optional(),
    locationId: z.string().optional(),
    departmentId: z.string().optional(),
    startTime: timeOfDay,
    endTime: timeOfDay,
    gracePeriod: z.number().int().min(0).max(60).optional(),
    lateThreshold: z.number().int().min(0).max(120).optional(),
    earlyLoginIncentive: z.boolean().optional(),
    earlyLoginRatePerMinute: z.number().optional(),
    earlyLoginRatePerSecond: z.number().optional(),
    latePenaltyEnabled: z.boolean().optional(),
    latePenaltyRatePerMinute: z.number().optional(),
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
    scannerRoles: z.any().optional(),
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

    let resolvedLocId = scopedLocId;
    if (resolvedLocId && resolvedLocId !== 'all') {
      const locMatch = await prisma.location.findFirst({
        where: {
          OR: [
            { id: resolvedLocId },
            { code: String(locationId || '').toUpperCase() },
            { code: resolvedLocId.toUpperCase() },
          ],
        },
        select: { id: true },
      });
      if (locMatch) resolvedLocId = locMatch.id;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (resolvedLocId && resolvedLocId !== 'all') where.locationId = resolvedLocId;
    if (departmentId && departmentId !== 'all') where.departmentId = departmentId;
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

router.post('/custom-batch', authorize('ADD'), async (req: AuthRequest, res) => {
  try {
    const { name, locationId, startTime, endTime, capacity, employeeIds = [], isOvernight = false } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || trimmedName.length < 3 || trimmedName.length > 50) {
      return res.status(400).json({ error: 'Batch name is required and must be between 3 and 50 characters' });
    }

    if (!locationId) {
      return res.status(400).json({ error: 'Hub / branch is required' });
    }

    if (!startTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) {
      return res.status(400).json({ error: 'Valid shift start time is required (HH:MM)' });
    }

    if (!endTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime)) {
      return res.status(400).json({ error: 'Valid shift end time is required (HH:MM)' });
    }

    // Resolve location ID if passed as code (e.g. 'BEL') or UUID
    const locMatch = await prisma.location.findFirst({
      where: {
        OR: [
          { id: locationId },
          { code: String(locationId).toUpperCase() },
        ],
      },
      select: { id: true, code: true, name: true },
    });
    if (!locMatch) {
      return res.status(400).json({ error: 'Specified hub / location not found' });
    }
    const realLocId = locMatch.id;

    if (req.user!.role !== 'SUPER_ADMIN' && realLocId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    // Check unique batch name within the selected hub
    const existingName = await prisma.shift.findFirst({
      where: {
        locationId: realLocId,
        name: trimmedName,
      },
    });
    if (existingName) {
      return res.status(400).json({ error: `A shift or batch named "${trimmedName}" already exists for this hub` });
    }

    const parsedCapacity = Number(capacity);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
      return res.status(400).json({ error: 'Batch capacity must be a positive integer (minimum 1)' });
    }

    const empIdList: string[] = Array.isArray(employeeIds) ? employeeIds : [];
    if (empIdList.length === 0) {
      return res.status(400).json({ error: 'Please select at least 1 employee for this shift batch' });
    }

    if (empIdList.length > parsedCapacity) {
      return res.status(400).json({
        error: `Selected employees (${empIdList.length}) exceed batch capacity (${parsedCapacity})`,
      });
    }

    // Validate that overnight shifts or regular end > start
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    const actualOvernight = Boolean(isOvernight) || endMins <= startMins;

    const cleanCode =
      'BATCH_' +
      trimmedName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() +
      '_' +
      Date.now().toString(36).toUpperCase();

    const startD = new Date(`2024-01-01T${startTime.slice(0, 5)}:00`);
    const endD = new Date(`${actualOvernight ? '2024-01-02' : '2024-01-01'}T${endTime.slice(0, 5)}:00`);

    const shift = await prisma.shift.create({
      data: {
        name: trimmedName,
        code: cleanCode,
        locationId: realLocId,
        startTime: startD,
        endTime: endD,
        scannerRoles: {
          isCustomBatch: true,
          capacity: parsedCapacity,
          overnight: actualOvernight,
        },
        status: 'ACTIVE',
      },
    });

    // Reassign selected employees to this newly created batch
    for (const empId of empIdList) {
      await prisma.employee.update({
        where: { id: empId },
        data: { shiftId: shift.id },
      });
    }

    cacheService.invalidateShifts();

    res.status(201).json({
      shift: {
        ...shift,
        _count: { employees: empIdList.length },
      },
      assignedCount: empIdList.length,
      capacity: parsedCapacity,
      message: `Custom shift batch "${trimmedName}" created with ${empIdList.length} employees assigned`,
    });
  } catch (error) {
    console.error('Create custom shift batch error:', error);
    res.status(500).json({ error: 'Failed to create custom shift batch' });
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
    
    let resolvedLocId = locationId;
    if (!resolvedLocId || resolvedLocId === 'all') {
      resolvedLocId = req.user?.locationId || 'cmuzam5fe00014n4pq25hkcww';
    } else {
      const locMatch = await prisma.location.findFirst({
        where: {
          OR: [
            { id: resolvedLocId },
            { code: String(resolvedLocId).toUpperCase() },
          ],
        },
        select: { id: true },
      });
      if (locMatch) resolvedLocId = locMatch.id;
    }

    if (req.user!.role !== 'SUPER_ADMIN' && resolvedLocId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const allShifts = await prisma.shift.findMany({ select: { name: true } });
    if (allShifts.some((s: any) => s.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).json({ error: 'This shift name already exists' });
    }

    const finalCode = (
      code ||
      'S_' +
        trimmedName.replace(/[^A-Z0-9]/gi, '').slice(0, 8) +
        '_' +
        Date.now().toString(36).slice(-4)
    ).toUpperCase();

    const existing = await prisma.shift.findUnique({
      where: { locationId_code: { locationId: resolvedLocId, code: finalCode } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Shift code already exists for this location' });
    }

    const shift = await prisma.shift.create({
      data: {
        name: trimmedName,
        code: finalCode,
        locationId: resolvedLocId,
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