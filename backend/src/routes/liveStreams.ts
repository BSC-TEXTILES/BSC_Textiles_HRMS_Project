import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const streamSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(100),
    description: z.string().optional(),
    locationId: z.string().min(1),
    floorId: z.string().optional(),
    sectionId: z.string().optional(),
    sellingPointId: z.string().optional(),
    streamUrl: z.string().url(),
    scheduledAt: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = { locationId: req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId };
    if (status) where.status = status;
    
    const [streams, total] = await Promise.all([
      prisma.liveStream.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          floor: { select: { id: true, name: true } },
          host: { select: { id: true, fullName: true } },
          _count: { select: { viewers: true, messages: true, observations: true } },
        },
      }),
      prisma.liveStream.count({ where }),
    ]);
    
    res.json({ streams, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get live streams error:', error);
    res.status(500).json({ error: 'Failed to get live streams' });
  }
});

router.get('/active', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationId = req.user!.role === 'SUPER_ADMIN'
      ? (typeof req.query.locationId === 'string' ? req.query.locationId : undefined)
      : req.user!.locationId;
    
    const streams = await prisma.liveStream.findMany({
      where: { locationId, status: { in: ['LIVE', 'PAUSED'] } },
      include: {
        location: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true } },
        host: { select: { id: true, fullName: true } },
        _count: { select: { viewers: true, messages: true } },
      },
    });
    
    res.json(streams);
  } catch (error) {
    console.error('Get active streams error:', error);
    res.status(500).json({ error: 'Failed to get active streams' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id },
      include: {
        location: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        sellingPoint: { select: { id: true, name: true } },
        host: { select: { id: true, fullName: true } },
        viewers: { include: { user: { select: { id: true, fullName: true } } } },
        messages: { take: 50, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, fullName: true } } } },
        reactions: { include: { user: { select: { id: true, fullName: true } } } },
        observations: { include: { observation: { include: { employee: { select: { id: true, employeeCode: true, fullName: true } } } } } },
        timestamps: { orderBy: { timestampSeconds: 'asc' } },
      },
    });
    
    if (!stream) {
      return res.status(404).json({ error: 'Live stream not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && stream.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(stream);
  } catch (error) {
    console.error('Get live stream error:', error);
    res.status(500).json({ error: 'Failed to get live stream' });
  }
});

router.post('/', authorize('ADD'), validate(streamSchema), async (req: AuthRequest, res) => {
  try {
    const { locationId, floorId, sectionId, sellingPointId, streamUrl, scheduledAt, ...rest } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const streamKey = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const stream = await prisma.liveStream.create({
      data: {
        ...rest,
        locationId,
        floorId,
        sectionId,
        sellingPointId,
        streamUrl,
        streamKey,
        hostId: req.user!.id,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: 'SCHEDULED',
      },
    });
    
    res.status(201).json(stream);
  } catch (error) {
    console.error('Create live stream error:', error);
    res.status(500).json({ error: 'Failed to create live stream' });
  }
});

router.patch('/:id/status', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    
    const existing = await prisma.liveStream.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Live stream not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updateData: any = { status };
    if (status === 'LIVE') updateData.startedAt = new Date();
    if (status === 'ENDED') updateData.endedAt = new Date();
    
    const stream = await prisma.liveStream.update({
      where: { id: req.params.id },
      data: updateData,
    });
    
    res.json(stream);
  } catch (error) {
    console.error('Update stream status error:', error);
    res.status(500).json({ error: 'Failed to update stream status' });
  }
});

router.post('/:id/join', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.liveStream.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Live stream not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const viewer = await prisma.liveStreamViewer.upsert({
      where: { streamId_userId: { streamId: req.params.id, userId: req.user!.id } },
      update: { isActive: true, leftAt: null },
      create: { streamId: req.params.id, userId: req.user!.id },
    });
    
    // Update viewer count
    await prisma.liveStream.update({
      where: { id: req.params.id },
      data: { viewerCount: { increment: 1 } },
    });
    
    res.json(viewer);
  } catch (error) {
    console.error('Join stream error:', error);
    res.status(500).json({ error: 'Failed to join stream' });
  }
});

router.post('/:id/leave', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const viewer = await prisma.liveStreamViewer.findUnique({
      where: { streamId_userId: { streamId: req.params.id, userId: req.user!.id } },
    });
    
    if (!viewer || !viewer.isActive) {
      return res.status(404).json({ error: 'Not currently viewing this stream' });
    }
    
    await prisma.liveStreamViewer.update({
      where: { id: viewer.id },
      data: { isActive: false, leftAt: new Date() },
    });
    
    await prisma.liveStream.update({
      where: { id: req.params.id },
      data: { viewerCount: { decrement: 1 } },
    });
    
    res.json({ message: 'Left stream' });
  } catch (error) {
    console.error('Leave stream error:', error);
    res.status(500).json({ error: 'Failed to leave stream' });
  }
});

router.post('/:id/messages', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    
    const existing = await prisma.liveStream.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Live stream not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const message = await prisma.liveStreamMessage.create({
      data: {
        streamId: req.params.id,
        userId: req.user!.id,
        content,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
    
    res.status(201).json(message);
  } catch (error) {
    console.error('Add stream message error:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

router.post('/:id/reactions', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { reactionType } = req.body;
    
    const existing = await prisma.liveStream.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Live stream not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const existingReaction = await prisma.liveStreamReaction.findFirst({
      where: { streamId: req.params.id, userId: req.user!.id, reactionType },
    });
    
    const reaction = existingReaction
      ? await prisma.liveStreamReaction.update({ where: { id: existingReaction.id }, data: {} })
      : await prisma.liveStreamReaction.create({
          data: { streamId: req.params.id, userId: req.user!.id, reactionType },
        });
    
    res.json(reaction);
  } catch (error) {
    console.error('Add stream reaction error:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

router.post('/:id/timestamps', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { timestampSeconds, label, notes } = req.body;
    
    const existing = await prisma.liveStream.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Live stream not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const timestamp = await prisma.streamTimestamp.create({
      data: {
        streamId: req.params.id,
        timestampSeconds,
        label,
        notes,
        createdById: req.user!.id,
      },
    });
    
    res.status(201).json(timestamp);
  } catch (error) {
    console.error('Add stream timestamp error:', error);
    res.status(500).json({ error: 'Failed to add timestamp' });
  }
});

router.post('/:id/observations', authorize('ADD'), async (req: AuthRequest, res) => {
  try {
    const { observationId, timestampSeconds } = req.body;
    
    const existing = await prisma.liveStream.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Live stream not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const streamObs = await prisma.streamObservation.create({
      data: {
        streamId: req.params.id,
        observationId,
        timestampSeconds,
        createdById: req.user!.id,
      },
      include: { observation: { include: { employee: { select: { id: true, employeeCode: true, fullName: true } } } } },
    });
    
    res.status(201).json(streamObs);
  } catch (error) {
    console.error('Add stream observation error:', error);
    res.status(500).json({ error: 'Failed to add stream observation' });
  }
});

export default router;