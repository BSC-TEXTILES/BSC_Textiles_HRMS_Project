import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { ReactionType } from '../db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const obsSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1),
    locationId: z.string().min(1),
    floorId: z.string().optional(),
    sectionId: z.string().optional(),
    sellingPointId: z.string().optional(),
    observationType: z.enum(['POSITIVE', 'IMPROVEMENT', 'CUSTOMER_SERVICE', 'SALES', 'GROOMING', 'PRODUCT_KNOWLEDGE', 'ATTENDANCE', 'DISCIPLINE', 'SELLING_SKILL', 'STORE_STANDARD', 'SAFETY']),
    level: z.enum(['EXCELLENT', 'VERY_GOOD', 'GOOD', 'NEEDS_IMPROVEMENT', 'CRITICAL']),
    score: z.number().int().min(1).max(5),
    description: z.string().min(10),
    actionRequired: z.string().optional(),
    assignedToId: z.string().optional(),
    dueDate: z.string().optional(),
    videoUrl: z.string().optional(),
    photoUrl: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, floorId, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (employeeId) where.employeeId = employeeId;
    if (floorId) where.floorId = floorId;
    if (status) where.status = status;
    
    const [observations, total] = await Promise.all([
      prisma.observation.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          floor: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          sellingPoint: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { reactions: true, comments: true, attachments: true } },
        },
      }),
      prisma.observation.count({ where }),
    ]);
    
    res.json({ observations, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get observations error:', error);
    res.status(500).json({ error: 'Failed to get observations' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const observation = await prisma.observation.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true } },
        floor: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        sellingPoint: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true } },
        reactions: { include: { user: { select: { id: true, fullName: true } } } },
        comments: { include: { user: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'asc' } },
        attachments: { include: { uploadedBy: { select: { id: true, fullName: true } } } },
      },
    });
    
    if (!observation) {
      return res.status(404).json({ error: 'Observation not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && observation.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(observation);
  } catch (error) {
    console.error('Get observation error:', error);
    res.status(500).json({ error: 'Failed to get observation' });
  }
});

router.post('/', authorize('ADD'), validate(obsSchema), async (req: AuthRequest, res) => {
  try {
    const { locationId, employeeId, floorId, sectionId, sellingPointId, ...rest } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const observation = await prisma.observation.create({
      data: {
        ...rest,
        locationId,
        employeeId,
        floorId,
        sectionId,
        sellingPointId,
        createdById: req.user!.id,
        dueDate: rest.dueDate ? new Date(rest.dueDate) : null,
      },
    });
    
    res.status(201).json(observation);
  } catch (error) {
    console.error('Create observation error:', error);
    res.status(500).json({ error: 'Failed to create observation' });
  }
});

router.get('/levels', authorize('VIEW'), async (req: AuthRequest, res) => {
  const levels = [
    { id: 'EXCELLENT', code: 'EXCELLENT', name: 'Excellent', score: 5, color: '#059669', requiresAction: false },
    { id: 'VERY_GOOD', code: 'VERY_GOOD', name: 'Very Good', score: 4, color: '#2563eb', requiresAction: false },
    { id: 'GOOD', code: 'GOOD', name: 'Good', score: 3, color: '#7c3aed', requiresAction: false },
    { id: 'NEEDS_IMPROVEMENT', code: 'NEEDS_IMPROVEMENT', name: 'Needs Improvement', score: 2, color: '#d97706', requiresAction: true },
    { id: 'CRITICAL', code: 'CRITICAL', name: 'Critical', score: 1, color: '#dc2626', requiresAction: true },
  ];
  res.json({ levels, total: levels.length });
});

router.patch('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.observation.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Observation not found' });
    }

    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const allowedFields = ['status', 'actionRequired', 'assignedToId', 'dueDate', 'level', 'observationType', 'description', 'score'];
    const updateData: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }
    if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);

    const observation = await prisma.observation.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: existing.locationId,
        action: 'UPDATE',
        entityType: 'Observation',
        entityId: existing.id,
        oldValue: { status: existing.status } as any,
        newValue: { status: updateData.status ?? existing.status } as any,
      },
    });

    res.json(observation);
  } catch (error) {
    console.error('Patch observation error:', error);
    res.status(500).json({ error: 'Failed to update observation' });
  }
});

router.put('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.observation.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Observation not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { status, locationId, actionRequired, assignedToId, dueDate, ...rest } = req.body;
    const updateData: any = { ...rest };
    if (status) updateData.status = status;
    if (actionRequired) updateData.actionRequired = actionRequired;
    if (assignedToId) updateData.assignedToId = assignedToId;
    if (dueDate) updateData.dueDate = new Date(dueDate);
    
    const observation = await prisma.observation.update({
      where: { id: req.params.id },
      data: updateData,
    });
    
    res.json(observation);
  } catch (error) {
    console.error('Update observation error:', error);
    res.status(500).json({ error: 'Failed to update observation' });
  }
});

router.post('/:id/reactions', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { reactionType } = req.body;
    
    const existing = await prisma.observation.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Observation not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const reaction = await prisma.observationReaction.upsert({
      where: { observationId_userId_reactionType: { observationId: req.params.id, userId: req.user!.id, reactionType } },
      update: {},
      create: { observationId: req.params.id, userId: req.user!.id, reactionType },
    });
    
    res.json(reaction);
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

router.delete('/:id/reactions/:reactionType', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.observation.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Observation not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await prisma.observationReaction.delete({
      where: { observationId_userId_reactionType: { observationId: req.params.id, userId: req.user!.id, reactionType: req.params.reactionType as ReactionType } },
    });
    
    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

router.post('/:id/comments', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { content, parentId, mentions, attachments } = req.body;
    
    const existing = await prisma.observation.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Observation not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const comment = await prisma.observationComment.create({
      data: {
        observationId: req.params.id,
        userId: req.user!.id,
        content,
        parentId,
        mentions: mentions || [],
        attachments: attachments || [],
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
    
    res.status(201).json(comment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

router.post('/:id/attachments', authorize('UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const { fileName, fileUrl, fileType, fileSize } = req.body;
    
    const existing = await prisma.observation.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Observation not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const attachment = await prisma.observationAttachment.create({
      data: {
        observationId: req.params.id,
        fileName,
        fileUrl,
        fileType,
        fileSize,
        uploadedById: req.user!.id,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    
    res.status(201).json(attachment);
  } catch (error) {
    console.error('Add attachment error:', error);
    res.status(500).json({ error: 'Failed to add attachment' });
  }
});

export default router;