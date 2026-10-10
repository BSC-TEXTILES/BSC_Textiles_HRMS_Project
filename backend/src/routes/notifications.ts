import { Router } from 'express';
import { container } from '../core/container/ServiceContainer.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const notificationFilterSchema = z.object({
  query: z.object({
    isRead: z.enum(['true', 'false']).optional(),
    type: z.enum(['INFO', 'WARNING', 'DANGER', 'CRITICAL']).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    eventId: z.string().optional(),
    entityType: z.string().optional(),
    locationId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.enum(['createdAt', 'readAt']).default('createdAt'),
    sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
  }),
});

const markReadSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

router.get('/', validate(notificationFilterSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query as any;

    const filter: any = { userId };
    if (query.isRead !== undefined) filter.isRead = query.isRead === 'true';
    if (query.type) filter.type = query.type;
    if (query.severity) filter.severity = query.severity;
    if (query.eventId) filter.eventId = query.eventId;
    if (query.entityType) filter.entityType = query.entityType;
    if (query.locationId) filter.locationId = query.locationId;
    if (query.startDate) filter.startDate = new Date(query.startDate);
    if (query.endDate) filter.endDate = new Date(query.endDate);
    filter.page = query.page;
    filter.limit = query.limit;
    filter.sortBy = query.sortBy;
    filter.sortOrder = query.sortOrder;

    const result = await container.notificationService.getUserNotifications(userId, filter);

    res.json({
      notifications: result.notifications,
      unreadCount: result.unreadCount,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error: any) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

router.get('/unread-count', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const count = await container.notificationService.getUnreadCount(userId);
    res.json({ unreadCount: count });
  } catch (error: any) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const notification = await container.notificationService.getNotificationById(req.params.id, userId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json(notification);
  } catch (error: any) {
    console.error('Get notification error:', error);
    res.status(500).json({ error: 'Failed to get notification' });
  }
});

router.post('/:id/read', validate(markReadSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const success = await container.notificationService.markAsRead(req.params.id, userId);
    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error: any) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.post('/:id/unread', validate(markReadSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const success = await container.notificationService.markAsUnread(req.params.id, userId);
    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification marked as unread' });
  } catch (error: any) {
    console.error('Mark as unread error:', error);
    res.status(500).json({ error: 'Failed to mark notification as unread' });
  }
});

router.post('/mark-all-read', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const count = await container.notificationService.markAllAsRead(userId);
    res.json({ success: true, message: `${count} notifications marked as read` });
  } catch (error: any) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

router.delete('/:id', validate(markReadSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const success = await container.notificationService.deleteNotification(req.params.id, userId);
    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error: any) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
