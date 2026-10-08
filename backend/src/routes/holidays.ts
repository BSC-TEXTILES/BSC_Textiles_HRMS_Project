import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const holidaySchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    date: z.string(),
    locationId: z.string().optional(),
    departmentId: z.string().optional(),
    isRecurring: z.boolean().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(String(startDate));
      if (endDate) where.date.lte = new Date(String(endDate));
    }
    
    const [holidays, total] = await Promise.all([
      prisma.holiday.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { date: 'asc' },
        include: {
          location: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      }),
      prisma.holiday.count({ where }),
    ]);
    
    res.json({ holidays, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({ error: 'Failed to get holidays' });
  }
});

router.post('/', authorize('ADD'), validate(holidaySchema), async (req: AuthRequest, res) => {
  try {
    const { name, date, locationId, departmentId, isRecurring } = req.body;
    
    const targetLocationId = req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId;
    if (req.user!.role !== 'SUPER_ADMIN' && locationId && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const holiday = await prisma.holiday.create({
      data: {
        name,
        date: new Date(date),
        locationId: targetLocationId,
        departmentId,
        isRecurring: isRecurring || false,
      },
    });
    
    res.status(201).json(holiday);
  } catch (error) {
    console.error('Create holiday error:', error);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

router.put('/:id', authorize('EDIT'), validate(holidaySchema), async (req: AuthRequest, res) => {
  try {
    const { name, date, locationId, departmentId, isRecurring } = req.body;
    
    const existing = await prisma.holiday.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const holiday = await prisma.holiday.update({
      where: { id: req.params.id },
      data: {
        name,
        date: new Date(date),
        departmentId,
        isRecurring,
      },
    });
    
    res.json(holiday);
  } catch (error) {
    console.error('Update holiday error:', error);
    res.status(500).json({ error: 'Failed to update holiday' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.holiday.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await prisma.holiday.delete({ where: { id: req.params.id } });
    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error('Delete holiday error:', error);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

export default router;