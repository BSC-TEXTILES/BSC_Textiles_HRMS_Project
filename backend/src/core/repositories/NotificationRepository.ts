import { BaseRepository } from './BaseRepository.js';
import crypto from 'node:crypto';

export interface NotificationEntity {
  id: string;
  userId: string;
  locationId: string | null;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  eventId: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  correlationId: string | null;
  metadata: any;
  deliveryStatus: any;
  dedupKey: string | null;
  expiresAt: Date | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationFilter {
  userId: string;
  isRead?: boolean;
  type?: string;
  severity?: string;
  eventId?: string;
  entityType?: string;
  locationId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'readAt';
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedNotifications {
  notifications: NotificationEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unreadCount: number;
}

export class NotificationRepository extends BaseRepository<NotificationEntity> {
  protected readonly tableName = 'notification';

  public async createNotification(data: {
    id: string;
    userId: string;
    locationId?: string | null;
    title: string;
    message: string;
    type?: 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    eventId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    actionUrl?: string | null;
    correlationId?: string | null;
    metadata?: any;
    dedupKey?: string | null;
    expiresAt?: Date | null;
  }): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO \`notification\` 
         (id, userId, locationId, title, message, type, severity, eventId, entityType, entityId, actionUrl, correlationId, metadata, dedupKey, expiresAt, isRead, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
        [
          data.id,
          data.userId,
          data.locationId || null,
          data.title,
          data.message,
          data.type || 'INFO',
          data.severity || 'MEDIUM',
          data.eventId || null,
          data.entityType || null,
          data.entityId || null,
          data.actionUrl || null,
          data.correlationId || null,
          data.metadata ? JSON.stringify(data.metadata) : null,
          data.dedupKey || null,
          data.expiresAt || null,
        ]
      );
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' && err.message.includes('dedupKey')) {
        return;
      }
      console.warn('[NotificationRepository] Create notification error:', err.message);
      throw err;
    }
  }

  public async createNotificationBatch(notifications: Array<{
    id: string;
    userId: string;
    locationId?: string | null;
    title: string;
    message: string;
    type?: 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    eventId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    actionUrl?: string | null;
    correlationId?: string | null;
    metadata?: any;
    dedupKey?: string | null;
    expiresAt?: Date | null;
  }>): Promise<number> {
    if (notifications.length === 0) return 0;

    const placeholders = notifications.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())').join(', ');
    const values = notifications.flatMap(n => [
      n.id,
      n.userId,
      n.locationId || null,
      n.title,
      n.message,
      n.type || 'INFO',
      n.severity || 'MEDIUM',
      n.eventId || null,
      n.entityType || null,
      n.entityId || null,
      n.actionUrl || null,
      n.correlationId || null,
      n.metadata ? JSON.stringify(n.metadata) : null,
      n.dedupKey || null,
      n.expiresAt || null,
    ]);

    try {
      const result = await this.execute(
        `INSERT INTO \`notification\` 
         (id, userId, locationId, title, message, type, severity, eventId, entityType, entityId, actionUrl, correlationId, metadata, dedupKey, expiresAt, isRead, createdAt)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE id=id`,
        values
      );
      return result.affectedRows || 0;
    } catch (err: any) {
      console.warn('[NotificationRepository] Batch create error:', err.message);
      throw err;
    }
  }

  public async findByDedupKey(dedupKey: string): Promise<NotificationEntity | null> {
    return this.queryOne<NotificationEntity>(
      `SELECT * FROM \`notification\` WHERE dedupKey = ? LIMIT 1`,
      [dedupKey]
    );
  }

  public async listForUser(userId: string, limit = 20): Promise<NotificationEntity[]> {
    return this.query<NotificationEntity>(
      `SELECT * FROM \`notification\` WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
      [userId, limit]
    );
  }

  public async getPaginatedNotifications(filter: NotificationFilter): Promise<PaginatedNotifications> {
    const {
      userId,
      isRead,
      type,
      severity,
      eventId,
      entityType,
      locationId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const conditions: string[] = ['userId = ?'];
    const params: any[] = [userId];

    if (isRead !== undefined) {
      conditions.push('isRead = ?');
      params.push(isRead);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }
    if (severity) {
      conditions.push('severity = ?');
      params.push(severity);
    }
    if (eventId) {
      conditions.push('eventId = ?');
      params.push(eventId);
    }
    if (entityType) {
      conditions.push('entityType = ?');
      params.push(entityType);
    }
    if (locationId) {
      conditions.push('locationId = ?');
      params.push(locationId);
    }
    if (startDate) {
      conditions.push('createdAt >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('createdAt <= ?');
      params.push(endDate);
    }

    // Filter out expired notifications
    conditions.push('(expiresAt IS NULL OR expiresAt > NOW())');

    const whereClause = conditions.join(' AND ');
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const offset = (page - 1) * safeLimit;

    const [notifications, totalResult, unreadResult] = await Promise.all([
      this.query<NotificationEntity>(
        `SELECT * FROM \`notification\` WHERE ${whereClause} ORDER BY \`${sortBy}\` ${sortOrder} LIMIT ? OFFSET ?`,
        [...params, safeLimit, offset]
      ),
      this.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM \`notification\` WHERE ${whereClause}`,
        params
      ),
      this.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM \`notification\` WHERE userId = ? AND isRead = FALSE AND (expiresAt IS NULL OR expiresAt > NOW())`,
        [userId]
      ),
    ]);

    const total = Number(totalResult?.count || 0);
    const unreadCount = Number(unreadResult?.count || 0);

    return {
      notifications,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      unreadCount,
    };
  }

  public async getUnreadCount(userId: string): Promise<number> {
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM \`notification\` WHERE userId = ? AND isRead = FALSE AND (expiresAt IS NULL OR expiresAt > NOW())`,
      [userId]
    );
    return Number(result?.count || 0);
  }

  public async markAsRead(id: string, userId: string): Promise<boolean> {
    const result = await this.execute(
      `UPDATE \`notification\` SET isRead = TRUE, readAt = NOW() WHERE id = ? AND userId = ?`,
      [id, userId]
    );
    return (result.affectedRows || 0) > 0;
  }

  public async markAsUnread(id: string, userId: string): Promise<boolean> {
    const result = await this.execute(
      `UPDATE \`notification\` SET isRead = FALSE, readAt = NULL WHERE id = ? AND userId = ?`,
      [id, userId]
    );
    return (result.affectedRows || 0) > 0;
  }

  public async markAllAsRead(userId: string): Promise<number> {
    const result = await this.execute(
      `UPDATE \`notification\` SET isRead = TRUE, readAt = NOW() WHERE userId = ? AND isRead = FALSE`,
      [userId]
    );
    return result.affectedRows || 0;
  }

  public async deleteNotification(id: string, userId: string): Promise<boolean> {
    const result = await this.execute(
      `DELETE FROM \`notification\` WHERE id = ? AND userId = ?`,
      [id, userId]
    );
    return (result.affectedRows || 0) > 0;
  }

  public async getById(id: string, userId: string): Promise<NotificationEntity | null> {
    return this.queryOne<NotificationEntity>(
      `SELECT * FROM \`notification\` WHERE id = ? AND userId = ?`,
      [id, userId]
    );
  }

  public async updateDeliveryStatus(notificationId: string, channel: string, status: string, error?: string): Promise<void> {
    try {
      const current = await this.queryOne<{ deliveryStatus: string }>(
        `SELECT deliveryStatus FROM \`notification\` WHERE id = ?`,
        [notificationId]
      );

      let deliveryStatus: Record<string, any> = {};
      if (current?.deliveryStatus) {
        try {
          deliveryStatus = JSON.parse(current.deliveryStatus);
        } catch {
          deliveryStatus = {};
        }
      }

      deliveryStatus[channel] = {
        status,
        error: error || null,
        updatedAt: new Date().toISOString(),
      };

      await this.execute(
        `UPDATE \`notification\` SET deliveryStatus = ? WHERE id = ?`,
        [JSON.stringify(deliveryStatus), notificationId]
      );
    } catch (err: any) {
      console.warn('[NotificationRepository] Update delivery status error:', err.message);
    }
  }

  public async cleanupExpired(): Promise<number> {
    const result = await this.execute(
      `DELETE FROM \`notification\` WHERE expiresAt IS NOT NULL AND expiresAt <= NOW()`
    );
    return result.affectedRows || 0;
  }

  public async getRecentByEventId(eventId: string, userId: string, windowMinutes = 60): Promise<NotificationEntity[]> {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.query<NotificationEntity>(
      `SELECT * FROM \`notification\` WHERE userId = ? AND eventId = ? AND createdAt >= ? ORDER BY createdAt DESC`,
      [userId, eventId, cutoff]
    );
  }

  public static generateDedupKey(eventId: string, entityType: string | null, entityId: string | null, userId: string): string {
    const base = `${eventId}:${entityType || 'none'}:${entityId || 'none'}:${userId}`;
    return crypto.createHash('sha256').update(base).digest('hex').substring(0, 32);
  }
}
