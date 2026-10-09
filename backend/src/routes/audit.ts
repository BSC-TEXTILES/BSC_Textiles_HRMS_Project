import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get(['/', '/logs'], authorize('VIEW_SENSITIVE_DATA'), async (req: AuthRequest, res) => {
  try {
    const { locationId, userId, action, entityType, startDate, endDate, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const scopedLocId = getScopedLocationId(req.user, locationId);
    const where: any = {};
    if (scopedLocId) where.locationId = scopedLocId;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(String(startDate));
      if (endDate) where.createdAt.lte = new Date(String(endDate));
    }
    
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          location: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);
    
    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

router.get('/stats', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationId = req.user!.role === 'SUPER_ADMIN'
      ? (typeof req.query.locationId === 'string' ? req.query.locationId : undefined)
      : req.user!.locationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [todayCount, thisWeek, byAction, byEntity] = await Promise.all([
      prisma.auditLog.count({ where: { locationId, createdAt: { gte: today, lt: tomorrow } } }),
      prisma.auditLog.count({ where: { locationId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
      prisma.auditLog.groupBy({ by: ['action'], where: { locationId }, _count: true }),
      prisma.auditLog.groupBy({ by: ['entityType'], where: { locationId }, _count: true }),
    ]);
    
    res.json({ todayCount, thisWeek, byAction, byEntity });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({ error: 'Failed to get audit stats' });
  }
});

export default router;