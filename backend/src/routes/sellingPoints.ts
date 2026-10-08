import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const spSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(20).toUpperCase(),
    locationId: z.string().min(1),
    floorId: z.string().min(1),
    sectionId: z.string().min(1),
    category: z.string().optional(),
    managerId: z.string().optional(),
    targetAmount: z.number().optional(),
    incentiveRuleId: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, floorId, sectionId, page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (floorId) where.floorId = floorId;
    if (sectionId) where.sectionId = sectionId;
    if (search) where.OR = [{ name: { contains: String(search), mode: 'insensitive' } }, { code: { contains: String(search), mode: 'insensitive' } }];
    
    const [sellingPoints, total] = await Promise.all([
      prisma.sellingPoint.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { name: 'asc' },
        include: {
          floor: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          manager: { select: { id: true, fullName: true, email: true } },
          incentiveRule: { select: { id: true, name: true } },
          _count: { select: { employees: true, qrScanRecords: true } },
        },
      }),
      prisma.sellingPoint.count({ where }),
    ]);
    
    res.json({ sellingPoints, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get selling points error:', error);
    res.status(500).json({ error: 'Failed to get selling points' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const sellingPoint = await prisma.sellingPoint.findUnique({
      where: { id: req.params.id },
      include: {
        floor: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, fullName: true, email: true } },
        incentiveRule: true,
        employees: { where: { isPrimary: true }, include: { employee: { select: { id: true, employeeCode: true, fullName: true } } } },
        qrScanRecords: { take: 10, orderBy: { scannedAt: 'desc' } },
      },
    });
    
    if (!sellingPoint) {
      return res.status(404).json({ error: 'Selling point not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && sellingPoint.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(sellingPoint);
  } catch (error) {
    console.error('Get selling point error:', error);
    res.status(500).json({ error: 'Failed to get selling point' });
  }
});

router.post('/', authorize('ADD'), validate(spSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, locationId, floorId, sectionId, category, managerId, targetAmount, incentiveRuleId } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const existing = await prisma.sellingPoint.findUnique({
      where: { locationId_code: { locationId, code } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Selling point code already exists for this location' });
    }
    
    const sellingPoint = await prisma.sellingPoint.create({
      data: { name, code, locationId, floorId, sectionId, category, managerId, targetAmount, incentiveRuleId },
    });
    
    res.status(201).json(sellingPoint);
  } catch (error) {
    console.error('Create selling point error:', error);
    res.status(500).json({ error: 'Failed to create selling point' });
  }
});

router.put('/:id', authorize('EDIT'), validate(spSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, floorId, sectionId, category, managerId, targetAmount, incentiveRuleId, status } = req.body;
    
    const existing = await prisma.sellingPoint.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Selling point not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const sellingPoint = await prisma.sellingPoint.update({
      where: { id: req.params.id },
      data: { name, code, floorId, sectionId, category, managerId, targetAmount, incentiveRuleId, status },
    });
    
    res.json(sellingPoint);
  } catch (error) {
    console.error('Update selling point error:', error);
    res.status(500).json({ error: 'Failed to update selling point' });
  }
});

router.post('/:id/assign-employee', authorize('ASSIGN'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, isPrimary } = req.body;
    
    const existing = await prisma.sellingPoint.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Selling point not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (isPrimary) {
      await prisma.employeeSellingPoint.updateMany({
        where: { employeeId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    
    const assignment = await prisma.employeeSellingPoint.upsert({
      where: { employeeId_sellingPointId: { employeeId, sellingPointId: req.params.id } },
      update: { isPrimary: isPrimary ?? false },
      create: { employeeId, sellingPointId: req.params.id, isPrimary: isPrimary ?? false },
    });
    
    res.json(assignment);
  } catch (error) {
    console.error('Assign employee to selling point error:', error);
    res.status(500).json({ error: 'Failed to assign employee' });
  }
});

router.delete('/:id/assign-employee/:employeeId', authorize('ASSIGN'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.sellingPoint.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Selling point not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await prisma.employeeSellingPoint.delete({
      where: { employeeId_sellingPointId: { employeeId: req.params.employeeId, sellingPointId: req.params.id } },
    });
    
    res.json({ message: 'Employee unassigned from selling point' });
  } catch (error) {
    console.error('Unassign employee error:', error);
    res.status(500).json({ error: 'Failed to unassign employee' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.sellingPoint.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Selling point not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const [empCount, qrCount] = await Promise.all([
      prisma.employeeSellingPoint.count({ where: { sellingPointId: req.params.id } }),
      prisma.qRScanRecord.count({ where: { sellingPointId: req.params.id } }),
    ]);
    
    if (empCount > 0 || qrCount > 0) {
      return res.status(400).json({ error: 'Cannot delete selling point with assigned employees or scan records' });
    }
    
    await prisma.sellingPoint.delete({ where: { id: req.params.id } });
    res.json({ message: 'Selling point deleted successfully' });
  } catch (error) {
    console.error('Delete selling point error:', error);
    res.status(500).json({ error: 'Failed to delete selling point' });
  }
});

export default router;