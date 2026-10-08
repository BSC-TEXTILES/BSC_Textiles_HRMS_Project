import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const floorSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(50),
    floorNumber: z.number().int().min(-5).max(100),
    locationId: z.string().min(1),
    floorManagerId: z.string().optional(),
    assistantManagerId: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, page = 1, limit = 20, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (status) where.status = status;
    
    const [floors, total] = await Promise.all([
      prisma.floor.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { floorNumber: 'asc' },
        include: {
          floorManager: { select: { id: true, fullName: true, email: true } },
          assistantManager: { select: { id: true, fullName: true, email: true } },
          _count: { select: { sections: true, sellingPoints: true, employees: true } },
        },
      }),
      prisma.floor.count({ where }),
    ]);
    
    res.json({ floors, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get floors error:', error);
    res.status(500).json({ error: 'Failed to get floors' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const floor = await prisma.floor.findUnique({
      where: { id: req.params.id },
      include: {
        floorManager: { select: { id: true, fullName: true, email: true } },
        assistantManager: { select: { id: true, fullName: true, email: true } },
        location: { select: { id: true, name: true, code: true } },
        sections: {},
        sellingPoints: { where: { status: true } },
        employees: { where: { status: 'ACTIVE' }, select: { id: true, employeeCode: true, fullName: true } },
      },
    });
    
    if (!floor) {
      return res.status(404).json({ error: 'Floor not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && floor.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(floor);
  } catch (error) {
    console.error('Get floor error:', error);
    res.status(500).json({ error: 'Failed to get floor' });
  }
});

router.post('/', authorize('ADD'), validate(floorSchema), async (req: AuthRequest, res) => {
  try {
    const { name, floorNumber, locationId, floorManagerId, assistantManagerId } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const existing = await prisma.floor.findUnique({
      where: { locationId_floorNumber: { locationId, floorNumber } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Floor number already exists for this location' });
    }
    
    const floor = await prisma.floor.create({
      data: { name, floorNumber, locationId, floorManagerId, assistantManagerId },
    });
    
    res.status(201).json(floor);
  } catch (error) {
    console.error('Create floor error:', error);
    res.status(500).json({ error: 'Failed to create floor' });
  }
});

router.put('/:id', authorize('EDIT'), validate(floorSchema), async (req: AuthRequest, res) => {
  try {
    const { name, floorNumber, floorManagerId, assistantManagerId } = req.body;
    
    const existing = await prisma.floor.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Floor not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const floor = await prisma.floor.update({
      where: { id: req.params.id },
      data: { name, floorNumber, floorManagerId, assistantManagerId },
    });
    
    res.json(floor);
  } catch (error) {
    console.error('Update floor error:', error);
    res.status(500).json({ error: 'Failed to update floor' });
  }
});

router.patch('/:id/status', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    
    const existing = await prisma.floor.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Floor not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const floor = await prisma.floor.update({
      where: { id: req.params.id },
      data: { status },
    });
    
    res.json(floor);
  } catch (error) {
    console.error('Update floor status error:', error);
    res.status(500).json({ error: 'Failed to update floor status' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.floor.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Floor not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const [sectionCount, spCount, empCount] = await Promise.all([
      prisma.section.count({ where: { floorId: req.params.id } }),
      prisma.sellingPoint.count({ where: { floorId: req.params.id } }),
      prisma.employee.count({ where: { floorId: req.params.id } }),
    ]);
    
    if (sectionCount > 0 || spCount > 0 || empCount > 0) {
      return res.status(400).json({ error: 'Cannot delete floor with existing sections, selling points, or employees' });
    }
    
    await prisma.floor.delete({ where: { id: req.params.id } });
    res.json({ message: 'Floor deleted successfully' });
  } catch (error) {
    console.error('Delete floor error:', error);
    res.status(500).json({ error: 'Failed to delete floor' });
  }
});

export default router;