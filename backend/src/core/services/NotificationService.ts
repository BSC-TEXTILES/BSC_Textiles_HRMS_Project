import { NotificationRepository, NotificationEntity } from '../repositories/NotificationRepository.js';

export class NotificationService {
  constructor(private readonly notifRepo: NotificationRepository) {}

  public async notifyUser(userId: string, title: string, message: string, type = 'INFO'): Promise<void> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await this.notifRepo.createNotification({ id, userId, title, message, type });
  }

  public async getUserNotifications(userId: string): Promise<NotificationEntity[]> {
    return this.notifRepo.listForUser(userId);
  }

  public async markAsRead(id: string): Promise<void> {
    await this.notifRepo.markAsRead(id);
  }
}
