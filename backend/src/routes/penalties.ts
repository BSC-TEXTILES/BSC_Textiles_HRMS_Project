import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

router.use(authenticate);

// Get all penalty rules
router.get('/rules', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId, isActive, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (req.user!.role !== 'SUPER_ADMIN') {
      where.locationId = req.user!.locationId;
    } else if (locationId) {
      where.locationId = String(locationId);
    }

    if (departmentId) where.departmentId = String(departmentId);
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [rules, total] = await Promise.all([
      prisma.penaltyRule.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true } },
          employee: { select: { id: true, fullName: true, employeeCode: true } },
        },
      }),
      prisma.penaltyRule.count({ where }),
    ]);

    res.json({ rules, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get penalty rules error:', error);
    res.status(500).json({ error: 'Failed to get penalty rules' });
  }
});

// Create penalty rule
router.post('/rules', authorize('CONFIGURE'), async (req: AuthRequest, res) => {
  try {
    const {
      name,
      description,
      locationId,
      departmentId,
      employeeId,
      penaltyType,
      calculationType,
      amount,
      percentage,
      maxDailyAmount,
      maxMonthlyAmount,
      effectiveFrom,
      effectiveTo,
    } = req.body;

    if (!name || !penaltyType || !calculationType || !effectiveFrom) {
      return res.status(400).json({ error: 'Missing required penalty rule parameters' });
    }

    const rule = await prisma.penaltyRule.create({
      data: {
        name,
        description,
        locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId,
        departmentId,
        employeeId,
        penaltyType,
        calculationType,
        amount: amount !== undefined ? new Decimal(amount) : null,
        percentage: percentage !== undefined ? new Decimal(percentage) : null,
        maxDailyAmount: maxDailyAmount !== undefined ? new Decimal(maxDailyAmount) : null,
        maxMonthlyAmount: maxMonthlyAmount !== undefined ? new Decimal(maxMonthlyAmount) : null,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: rule.locationId,
        action: 'CREATE',
        entityType: 'PenaltyRule',
        entityId: rule.id,
        newValue: req.body,
      },
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error('Create penalty rule error:', error);
    res.status(500).json({ error: 'Failed to create penalty rule' });
  }
});

// Get penalty transactions
router.get('/transactions', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, status, locationId, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (employeeId) where.employeeId = String(employeeId);
    if (status) where.status = String(status);

    if (req.user!.role !== 'SUPER_ADMIN') {
      where.employee = { locationId: req.user!.locationId };
    } else if (locationId) {
      where.employee = { locationId: String(locationId) };
    }

    const [transactions, total] = await Promise.all([
      prisma.penaltyTransaction.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { transactionDate: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              location: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true } },
            },
          },
          penaltyRule: {
            select: { id: true, name: true, penaltyType: true, calculationType: true },
          },
          approvedBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      prisma.penaltyTransaction.count({ where }),
    ]);

    res.json({ transactions, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get penalty transactions error:', error);
    res.status(500).json({ error: 'Failed to get penalty transactions' });
  }
});

// Record penalty transaction
router.post('/transactions', authorize('MANAGE'), async (req: AuthRequest, res) => {
  try {
    const {
      employeeId,
      penaltyRuleId,
      transactionDate,
      calculationBasis,
      calculatedAmount,
      calculationDetails,
    } = req.body;

    if (!employeeId || !penaltyRuleId || !transactionDate || calculatedAmount === undefined) {
      return res.status(400).json({ error: 'Missing required fields for penalty transaction' });
    }

    const transaction = await prisma.penaltyTransaction.create({
      data: {
        employeeId,
        penaltyRuleId,
        transactionDate: new Date(transactionDate),
        calculationBasis: String(calculationBasis || 'Manual adjustment'),
        calculatedAmount: new Decimal(calculatedAmount),
        calculationDetails: calculationDetails || {},
        status: 'PENDING',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'CREATE',
        entityType: 'PenaltyTransaction',
        entityId: transaction.id,
        newValue: req.body,
      },
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error('Create penalty transaction error:', error);
    res.status(500).json({ error: 'Failed to create penalty transaction' });
  }
});

// Approve penalty transaction
router.post('/transactions/:id/approve', authorize('APPROVE'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const transaction = await prisma.penaltyTransaction.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'APPROVE',
        entityType: 'PenaltyTransaction',
        entityId: id,
        newValue: { status: 'APPROVED' },
      },
    });

    res.json({ message: 'Penalty transaction approved', transaction });
  } catch (error) {
    console.error('Approve penalty transaction error:', error);
    res.status(500).json({ error: 'Failed to approve penalty transaction' });
  }
});

// Waive penalty transaction
router.post('/transactions/:id/waive', authorize('APPROVE'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const transaction = await prisma.penaltyTransaction.update({
      where: { id },
      data: {
        status: 'WAIVED',
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'UPDATE',
        entityType: 'PenaltyTransaction',
        entityId: id,
        newValue: { status: 'WAIVED' },
      },
    });

    res.json({ message: 'Penalty transaction waived', transaction });
  } catch (error) {
    console.error('Waive penalty transaction error:', error);
    res.status(500).json({ error: 'Failed to waive penalty transaction' });
  }
});

export default router;
