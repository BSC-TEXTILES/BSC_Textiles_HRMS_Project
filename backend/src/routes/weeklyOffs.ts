import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const weeklyOffSchema = z.object({
  body: z.object({
    locationId: z.string().min(1),
    floorId: z.string().optional(),
    departmentId: z.string().optional(),
    employeeId: z.string().optional(),
    shiftId: z.string().optional(),
    dayOfWeek: z.enum(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'ROTATIONAL']),
    isRotational: z.boolean().optional(),
    rotationPattern: z.string().optional(),
    effectiveFrom: z.string(),
    effectiveTo: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, employeeId, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const scopedLocId = getScopedLocationId(req.user, locationId);
    const where: any = {};
    if (scopedLocId) where.locationId = scopedLocId;
    if (employeeId) where.employeeId = employeeId;
    
    const [rules, total] = await Promise.all([
      prisma.weeklyOffRule.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          floor: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          shift: { select: { id: true, name: true } },
        },
      }),
      prisma.weeklyOffRule.count({ where }),
    ]);
    
    res.json({ rules, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get weekly off rules error:', error);
    res.status(500).json({ error: 'Failed to get weekly off rules' });
  }
});

router.post('/', authorize('ADD'), validate(weeklyOffSchema), async (req: AuthRequest, res) => {
  try {
    const { locationId, floorId, departmentId, employeeId, shiftId, dayOfWeek, isRotational, rotationPattern, effectiveFrom, effectiveTo } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const rule = await prisma.weeklyOffRule.create({
      data: {
        locationId,
        floorId,
        departmentId,
        employeeId,
        shiftId,
        dayOfWeek,
        isRotational: isRotational || false,
        rotationPattern,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      },
    });
    
    res.status(201).json(rule);
  } catch (error) {
    console.error('Create weekly off rule error:', error);
    res.status(500).json({ error: 'Failed to create weekly off rule' });
  }
});

router.put('/:id', authorize('EDIT'), validate(weeklyOffSchema), async (req: AuthRequest, res) => {
  try {
    const { locationId, floorId, departmentId, employeeId, shiftId, dayOfWeek, isRotational, rotationPattern, effectiveFrom, effectiveTo } = req.body;
    
    const existing = await prisma.weeklyOffRule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Weekly off rule not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const rule = await prisma.weeklyOffRule.update({
      where: { id: req.params.id },
      data: {
        floorId,
        departmentId,
        employeeId,
        shiftId,
        dayOfWeek,
        isRotational,
        rotationPattern,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      },
    });
    
    res.json(rule);
  } catch (error) {
    console.error('Update weekly off rule error:', error);
    res.status(500).json({ error: 'Failed to update weekly off rule' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.weeklyOffRule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Weekly off rule not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await prisma.weeklyOffRule.delete({ where: { id: req.params.id } });
    res.json({ message: 'Weekly off rule deleted successfully' });
  } catch (error) {
    console.error('Delete weekly off rule error:', error);
    res.status(500).json({ error: 'Failed to delete weekly off rule' });
  }
});

export default router;