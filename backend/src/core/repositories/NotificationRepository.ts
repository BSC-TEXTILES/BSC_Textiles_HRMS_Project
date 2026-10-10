import { BaseRepository } from './BaseRepository.js';

export interface NotificationEntity {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
}

export class NotificationRepository extends BaseRepository<NotificationEntity> {
  protected readonly tableName = 'notifications';

  public async createNotification(data: {
    id: string;
    userId: string;
    title: string;
    message: string;
    type?: string;
  }): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO notifications (id, userId, title, message, type, isRead, createdAt)
         VALUES (?, ?, ?, ?, ?, FALSE, NOW())`,
        [data.id, data.userId, data.title, data.message, data.type || 'INFO']
      );
    } catch (err: any) {
      console.warn('[NotificationRepository] Create notification error:', err.message);
    }
  }

  public async listForUser(userId: string, limit = 20): Promise<NotificationEntity[]> {
    return this.query<NotificationEntity>(
      `SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
      [userId, limit]
    );
  }

  public async markAsRead(id: string): Promise<void> {
    await this.execute(`UPDATE notifications SET isRead = TRUE WHERE id = ?`, [id]);
  }
}
