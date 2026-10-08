import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const incentiveRuleSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    description: z.string().optional(),
    incentiveType: z.enum(['INDIVIDUAL', 'DEPARTMENT', 'LOCATION', 'FLOOR', 'SELLING_POINT', 'SALES', 'ATTENDANCE', 'PERFORMANCE', 'EARLY_LOGIN', 'TARGET', 'CUSTOM']),
    calculationType: z.enum(['FIXED_AMOUNT', 'PER_HOUR', 'PER_MINUTE', 'PER_SECOND', 'PERCENTAGE', 'TARGET_BASED', 'PERFORMANCE_BASED', 'ATTENDANCE_BASED', 'CUSTOM_RULE']),
    locationId: z.string().optional(),
    departmentId: z.string().optional(),
    floorId: z.string().optional(),
    sellingPointId: z.string().optional(),
    employeeId: z.string().optional(),
    amount: z.number().optional(),
    percentage: z.number().min(0).max(100).optional(),
    targetAmount: z.number().optional(),
    effectiveFrom: z.string(),
    effectiveTo: z.string().optional(),
    maxDailyAmount: z.number().optional(),
    maxMonthlyAmount: z.number().optional(),
  }),
});

const incentiveTransactionSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1),
    incentiveRuleId: z.string().min(1),
    transactionDate: z.string(),
    calculationBasis: z.string(),
    calculatedAmount: z.number(),
    calculationDetails: z.record(z.any()),
  }),
});

router.get('/rules', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId, floorId, sellingPointId, employeeId, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = {};
    if (req.user!.role !== 'SUPER_ADMIN') {
      where.locationId = req.user!.locationId;
    } else if (locationId) {
      where.locationId = locationId;
    }
    if (departmentId) where.departmentId = departmentId;
    if (floorId) where.floorId = floorId;
    if (sellingPointId) where.sellingPointId = sellingPointId;
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    
    const [rules, total] = await Promise.all([
      prisma.incentiveRule.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          floor: { select: { id: true, name: true } },
          sellingPoint: { select: { id: true, name: true } },
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      }),
      prisma.incentiveRule.count({ where }),
    ]);
    
    res.json({ rules, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get incentive rules error:', error);
    res.status(500).json({ error: 'Failed to get incentive rules' });
  }
});

router.post('/rules', authorize('ADD'), validate(incentiveRuleSchema), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId, floorId, sellingPointId, employeeId, effectiveFrom, effectiveTo, ...rest } = req.body;
    
    const targetLocationId = req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId;
    if (req.user!.role !== 'SUPER_ADMIN' && locationId && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const rule = await prisma.incentiveRule.create({
      data: {
        ...rest,
        locationId: targetLocationId,
        departmentId,
        floorId,
        sellingPointId,
        employeeId,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        createdById: req.user!.id,
        status: 'PENDING_APPROVAL',
      },
    });
    
    res.status(201).json(rule);
  } catch (error) {
    console.error('Create incentive rule error:', error);
    res.status(500).json({ error: 'Failed to create incentive rule' });
  }
});

router.put('/rules/:id', authorize('EDIT'), validate(incentiveRuleSchema), async (req: AuthRequest, res) => {
  try {
    const { effectiveFrom, effectiveTo, ...rest } = req.body;
    
    const existing = await prisma.incentiveRule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Incentive rule not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updateData: any = { ...rest };
    if (effectiveFrom) updateData.effectiveFrom = new Date(effectiveFrom);
    if (effectiveTo) updateData.effectiveTo = new Date(effectiveTo);
    
    const rule = await prisma.incentiveRule.update({
      where: { id: req.params.id },
      data: updateData,
    });
    
    res.json(rule);
  } catch (error) {
    console.error('Update incentive rule error:', error);
    res.status(500).json({ error: 'Failed to update incentive rule' });
  }
});

router.post('/rules/:id/approve', authorize('APPROVE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.incentiveRule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Incentive rule not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const rule = await prisma.incentiveRule.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: new Date() },
    });
    
    // Assign to employees if rule is for location/department/floor
    if (existing.incentiveType !== 'INDIVIDUAL' && existing.employeeId === null) {
      const where: any = { locationId: existing.locationId, status: 'ACTIVE' };
      if (existing.departmentId) where.departmentId = existing.departmentId;
      if (existing.floorId) where.floorId = existing.floorId;
      if (existing.sellingPointId) where.sellingPoints = { some: { sellingPointId: existing.sellingPointId } };
      
      const employees = await prisma.employee.findMany({ where });
      
      for (const emp of employees) {
        await prisma.employeeIncentive.upsert({
          where: { employeeId_incentiveRuleId: { employeeId: emp.id, incentiveRuleId: existing.id } },
          update: { status: 'ACTIVE', effectiveTo: existing.effectiveTo },
          create: { employeeId: emp.id, incentiveRuleId: existing.id, effectiveFrom: existing.effectiveFrom, effectiveTo: existing.effectiveTo, status: 'ACTIVE' },
        });
      }
    }
    
    res.json(rule);
  } catch (error) {
    console.error('Approve incentive rule error:', error);
    res.status(500).json({ error: 'Failed to approve incentive rule' });
  }
});

router.get('/transactions', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, incentiveRuleId, status, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = {};
    if (req.user!.role !== 'SUPER_ADMIN') {
      where.employee = { locationId: req.user!.locationId };
    }
    if (employeeId) where.employeeId = employeeId;
    if (incentiveRuleId) where.incentiveRuleId = incentiveRuleId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = new Date(String(startDate));
      if (endDate) where.transactionDate.lte = new Date(String(endDate));
    }
    
    const [transactions, total] = await Promise.all([
      prisma.incentiveTransaction.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { transactionDate: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          incentiveRule: { select: { id: true, name: true, incentiveType: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      }),
      prisma.incentiveTransaction.count({ where }),
    ]);
    
    res.json({ transactions, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get incentive transactions error:', error);
    res.status(500).json({ error: 'Failed to get incentive transactions' });
  }
});

router.post('/transactions', authorize('RECORD'), validate(incentiveTransactionSchema), async (req: AuthRequest, res) => {
  try {
    const { employeeId, incentiveRuleId, transactionDate, calculationBasis, calculatedAmount, calculationDetails } = req.body;
    
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && employee.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const rule = await prisma.incentiveRule.findUnique({ where: { id: incentiveRuleId } });
    if (!rule) {
      return res.status(404).json({ error: 'Incentive rule not found' });
    }
    
    if (rule.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Incentive rule is not approved' });
    }
    
    // Check if employee is eligible
    const eligible = await prisma.employeeIncentive.findUnique({
      where: { employeeId_incentiveRuleId: { employeeId, incentiveRuleId } },
    });
    
    if (!eligible || eligible.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Employee is not eligible for this incentive' });
    }
    
    const transaction = await prisma.incentiveTransaction.create({
      data: {
        employeeId,
        incentiveRuleId,
        transactionDate: new Date(transactionDate),
        calculationBasis,
        calculatedAmount,
        calculationDetails,
        status: 'PENDING_APPROVAL',
      },
    });
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Create incentive transaction error:', error);
    res.status(500).json({ error: 'Failed to create incentive transaction' });
  }
});

router.post('/transactions/:id/approve', authorize('APPROVE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.incentiveTransaction.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const employee = await prisma.employee.findUnique({ where: { id: existing.employeeId } });
    if (req.user!.role !== 'SUPER_ADMIN' && employee?.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const transaction = await prisma.incentiveTransaction.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: new Date() },
    });
    
    res.json(transaction);
  } catch (error) {
    console.error('Approve transaction error:', error);
    res.status(500).json({ error: 'Failed to approve transaction' });
  }
});

router.get('/employee/:employeeId/summary', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && employee.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { startDate, endDate } = req.query;
    
    const where: any = { employeeId: employee.id };
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = new Date(String(startDate));
      if (endDate) where.transactionDate.lte = new Date(String(endDate));
    }
    
    const [transactions, byRule, byStatus] = await Promise.all([
      prisma.incentiveTransaction.findMany({ where, orderBy: { transactionDate: 'desc' } }),
      prisma.incentiveTransaction.groupBy({ by: ['incentiveRuleId'], where, _sum: { calculatedAmount: true }, _count: true }),
      prisma.incentiveTransaction.groupBy({ by: ['status'], where, _sum: { calculatedAmount: true }, _count: true }),
    ]);
    
    res.json({ transactions, byRule, byStatus });
  } catch (error) {
    console.error('Get employee incentive summary error:', error);
    res.status(500).json({ error: 'Failed to get employee incentive summary' });
  }
});

export default router;