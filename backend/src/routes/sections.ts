import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const sectionSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(20).toUpperCase(),
    locationId: z.string().min(1),
    floorId: z.string().min(1),
    departmentId: z.string().optional(),
    supervisorId: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, floorId, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const scopedLocId = getScopedLocationId(req.user, locationId);
    const where: any = {};
    if (scopedLocId) where.locationId = scopedLocId;
    if (floorId) where.floorId = floorId;
    
    const [sections, total] = await Promise.all([
      prisma.section.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { name: 'asc' },
        include: {
          floor: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          supervisor: { select: { id: true, fullName: true, email: true } },
          _count: { select: { sellingPoints: true, employees: true } },
        },
      }),
      prisma.section.count({ where }),
    ]);
    
    res.json({ sections, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get sections error:', error);
    res.status(500).json({ error: 'Failed to get sections' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const section = await prisma.section.findUnique({
      where: { id: req.params.id },
      include: {
        floor: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, code: true } },
        supervisor: { select: { id: true, fullName: true, email: true } },
        sellingPoints: { where: { status: true } },
        employees: { where: { status: 'ACTIVE' } },
      },
    });
    
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && section.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(section);
  } catch (error) {
    console.error('Get section error:', error);
    res.status(500).json({ error: 'Failed to get section' });
  }
});

router.post('/', authorize('ADD'), validate(sectionSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, locationId, floorId, departmentId, supervisorId } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const existing = await prisma.section.findUnique({
      where: { locationId_code: { locationId, code } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Section code already exists for this location' });
    }
    
    const section = await prisma.section.create({
      data: { name, code, locationId, floorId, departmentId, supervisorId },
    });
    
    res.status(201).json(section);
  } catch (error) {
    console.error('Create section error:', error);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

router.put('/:id', authorize('EDIT'), validate(sectionSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, floorId, departmentId, supervisorId } = req.body;
    
    const existing = await prisma.section.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Section not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const section = await prisma.section.update({
      where: { id: req.params.id },
      data: { name, code, floorId, departmentId, supervisorId },
    });
    
    res.json(section);
  } catch (error) {
    console.error('Update section error:', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.section.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Section not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const [spCount, empCount] = await Promise.all([
      prisma.sellingPoint.count({ where: { sectionId: req.params.id } }),
      prisma.employee.count({ where: { sectionId: req.params.id } }),
    ]);
    
    if (spCount > 0 || empCount > 0) {
      return res.status(400).json({ error: 'Cannot delete section with existing selling points or employees' });
    }
    
    await prisma.section.delete({ where: { id: req.params.id } });
    res.json({ message: 'Section deleted successfully' });
  } catch (error) {
    console.error('Delete section error:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

export default router;