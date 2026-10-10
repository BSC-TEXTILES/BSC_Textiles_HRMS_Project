import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { cacheService } from '../services/cacheService.js';

const router = Router();

router.use(authenticate);

const deptSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(20).toUpperCase(),
    locationId: z.string().min(1),
    floorId: z.string().optional(),
    managerId: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, page = 1, limit = 20, search } = req.query;
    const scopedLocId = getScopedLocationId(req.user, locationId);

    const cacheKey = `departments:${scopedLocId || 'all'}:${page}:${limit}:${search || ''}`;
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
    if (search) where.OR = [{ name: { contains: String(search), mode: 'insensitive' } }, { code: { contains: String(search), mode: 'insensitive' } }];
    
    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { name: 'asc' },
        include: {
          manager: { select: { id: true, fullName: true, email: true } },
          floor: { select: { id: true, name: true } },
          _count: { select: { sections: true, employees: true, sellingPoints: true } },
        },
      }),
      prisma.department.count({ where }),
    ]);
    
    const result = { departments, total, page: Number(page), limit: Number(limit) };
    const etag = cacheService.set(cacheKey, result, 60_000);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.json(result);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to get departments' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const department = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: {
        manager: { select: { id: true, fullName: true, email: true } },
        floor: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, code: true } },
        sections: {},
        employees: { where: { status: 'ACTIVE' } },
        sellingPoints: { where: { status: true } },
      },
    });
    
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && department.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(department);
  } catch (error) {
    console.error('Get department error:', error);
    res.status(500).json({ error: 'Failed to get department' });
  }
});

router.post('/', authorize('ADD'), validate(deptSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, locationId, floorId, managerId } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const existing = await prisma.department.findUnique({
      where: { locationId_code: { locationId, code } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Department code already exists for this location' });
    }
    
    const department = await prisma.department.create({
      data: { name, code, locationId, floorId, managerId },
    });
    
    cacheService.invalidateDepartments();
    res.status(201).json(department);
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/:id', authorize('EDIT'), validate(deptSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, floorId, managerId } = req.body;
    
    const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: { name, code, floorId, managerId },
    });
    
    cacheService.invalidateDepartments();
    res.json(department);
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const [sectionCount, empCount, spCount] = await Promise.all([
      prisma.section.count({ where: { departmentId: req.params.id } }),
      prisma.employee.count({ where: { departmentId: req.params.id } }),
      prisma.sellingPoint.count({ where: { departmentId: req.params.id } }),
    ]);
    
    if (sectionCount > 0 || empCount > 0 || spCount > 0) {
      return res.status(400).json({ error: 'Cannot delete department with existing sections, employees, or selling points' });
    }
    
    await prisma.department.delete({ where: { id: req.params.id } });
    cacheService.invalidateDepartments();
    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

export default router;