import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const breakSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1),
    breakType: z.enum(['LUNCH', 'TEA', 'OTHER']),
    breakDate: z.string(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    allowedDuration: z.number().int().min(1).max(480),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, breakType, breakDate, startDate, endDate, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? undefined : req.user!.locationId };
    if (employeeId) where.employeeId = employeeId;
    if (breakType) where.breakType = breakType;
    if (status) where.status = status;
    if (breakDate) where.breakDate = new Date(String(breakDate));
    else if (startDate || endDate) {
      where.breakDate = {};
      if (startDate) where.breakDate.gte = new Date(String(startDate));
      if (endDate) where.breakDate.lte = new Date(String(endDate));
    }
    
    const [breaks, total] = await Promise.all([
      prisma.employeeBreak.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { breakDate: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          qrScan: { select: { id: true, purpose: true, result: true, scannedAt: true } },
        },
      }),
      prisma.employeeBreak.count({ where }),
    ]);
    
    res.json({ breaks, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get breaks error:', error);
    res.status(500).json({ error: 'Failed to get breaks' });
  }
});

router.get('/active', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationId = req.user!.role === 'SUPER_ADMIN' ? (req.query.locationId as string | undefined) : req.user!.locationId;
    const where: any = { status: 'ACTIVE' };
    if (locationId) {
      where.employee = { locationId };
    }

    const breaks = await prisma.employeeBreak.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            locationId: true,
            floorId: true,
            gender: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    res.json({ breaks, count: breaks.length });
  } catch (error) {
    console.error('Get active breaks error:', error);
    res.status(500).json({ error: 'Failed to get active breaks' });
  }
});

router.get('/rules', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationId = req.user!.role === 'SUPER_ADMIN' ? (req.query.locationId as string | undefined) : req.user!.locationId;
    const where: any = {};
    if (locationId) where.locationId = locationId;

    const rules = await prisma.breakRule.findMany({
      where,
      include: {
        location: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ locationId: 'asc' }, { breakType: 'asc' }],
    });

    res.json({ rules, count: rules.length });
  } catch (error) {
    console.error('Get break rules error:', error);
    res.status(500).json({ error: 'Failed to get break rules' });
  }
});

router.get('/today', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const locationId = req.user!.role === 'SUPER_ADMIN' ? req.query.locationId : req.user!.locationId;
    
    const breaks = await prisma.employeeBreak.findMany({
      where: {
        ...(locationId ? { employee: { locationId: String(locationId) } } : {}),
        breakDate: { gte: today, lt: tomorrow },
      },
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true } },
        qrScan: { select: { purpose: true, result: true, scannedAt: true } },
      },
      orderBy: { startTime: 'asc' },
    });
    
    const stats = {
      total: breaks.length,
      active: breaks.filter((b: any) => b.status === 'ACTIVE').length,
      completed: breaks.filter((b: any) => b.status === 'COMPLETED').length,
      exceeded: breaks.filter((b: any) => b.status === 'EXCEEDED').length,
      lunch: breaks.filter((b: any) => b.breakType === 'LUNCH').length,
      tea: breaks.filter((b: any) => b.breakType === 'TEA').length,
    };
    
    res.json({ breaks, stats });
  } catch (error) {
    console.error('Get today breaks error:', error);
    res.status(500).json({ error: 'Failed to get today breaks' });
  }
});

router.post('/', authorize('RECORD'), validate(breakSchema), async (req: AuthRequest, res) => {
  try {
    const { employeeId, breakType, breakDate, startTime, endTime, allowedDuration } = req.body;
    
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && employee.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const date = new Date(breakDate);
    date.setHours(0, 0, 0, 0);
    
    const breakRecord = await prisma.employeeBreak.create({
      data: {
        employeeId,
        breakType,
        breakDate: date,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        allowedDuration,
        status: startTime ? 'ACTIVE' : 'NOT_STARTED',
      },
    });
    
    res.status(201).json(breakRecord);
  } catch (error) {
    console.error('Create break error:', error);
    res.status(500).json({ error: 'Failed to create break' });
  }
});

router.put('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { startTime, endTime, status, actualDuration, exceededDuration } = req.body;
    
    const existing = await prisma.employeeBreak.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { id: true, employeeCode: true, fullName: true, locationId: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Break record not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.employee.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updateData: any = {};
    if (startTime) updateData.startTime = new Date(startTime);
    if (endTime) updateData.endTime = new Date(endTime);
    if (status) updateData.status = status;
    if (actualDuration !== undefined) updateData.actualDuration = actualDuration;
    if (exceededDuration !== undefined) updateData.excessDuration = exceededDuration;
    
    // Auto-calculate durations
    if (updateData.startTime && updateData.endTime) {
      updateData.actualDuration = Math.floor((updateData.endTime.getTime() - updateData.startTime.getTime()) / (1000 * 60));
      updateData.excessDuration = Math.max(0, updateData.actualDuration - existing.allowedDuration);
    }
    
    if (updateData.status === 'COMPLETED' && !updateData.endTime) {
      updateData.endTime = new Date();
      updateData.actualDuration = Math.floor((updateData.endTime.getTime() - updateData.startTime.getTime()) / (1000 * 60));
      updateData.excessDuration = Math.max(0, updateData.actualDuration - existing.allowedDuration);
    }
    
    const breakRecord = await prisma.employeeBreak.update({
      where: { id: req.params.id },
      data: updateData,
    });
    
    res.json(breakRecord);
  } catch (error) {
    console.error('Update break error:', error);
    res.status(500).json({ error: 'Failed to update break' });
  }
});

router.post('/start', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, breakType = 'TEA' } = req.body;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allowedDuration = breakType === 'LUNCH' ? 45 : 20;

    const breakRecord = await prisma.employeeBreak.create({
      data: {
        employeeId,
        breakType,
        breakDate: today,
        startTime: new Date(),
        allowedDuration,
        status: 'ACTIVE',
      },
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, locationId: true } },
      },
    });

    res.status(201).json({ employeeBreak: breakRecord, ...breakRecord });
  } catch (error) {
    console.error('Start new break error:', error);
    res.status(500).json({ error: 'Failed to start break' });
  }
});

router.post('/:id/start', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.employeeBreak.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { id: true, employeeCode: true, fullName: true, locationId: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Break record not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.employee.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const breakRecord = await prisma.employeeBreak.update({
      where: { id: req.params.id },
      data: { startTime: new Date(), status: 'ACTIVE' },
    });
    
    res.json(breakRecord);
  } catch (error) {
    console.error('Start break error:', error);
    res.status(500).json({ error: 'Failed to start break' });
  }
});

router.post('/:id/end', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.employeeBreak.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { id: true, employeeCode: true, fullName: true, locationId: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Break record not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.employee.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const endTime = new Date();
    const actualDuration = existing.startTime ? Math.floor((endTime.getTime() - existing.startTime.getTime()) / (1000 * 60)) : 0;
    const exceededDuration = Math.max(0, actualDuration - existing.allowedDuration);
    
    const breakRecord = await prisma.employeeBreak.update({
      where: { id: req.params.id },
      data: {
        endTime,
        actualDuration,
        excessDuration: exceededDuration,
        status: exceededDuration > 0 ? 'EXCEEDED' : 'COMPLETED',
      },
    });
    
    res.json(breakRecord);
  } catch (error) {
    console.error('End break error:', error);
    res.status(500).json({ error: 'Failed to end break' });
  }
});

export default router;