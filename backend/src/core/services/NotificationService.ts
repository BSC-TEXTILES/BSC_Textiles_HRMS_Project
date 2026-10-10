import { NotificationRepository, NotificationEntity, NotificationFilter, PaginatedNotifications } from '../repositories/NotificationRepository.js';
import { socketIO } from '../../index.js';
import crypto from 'node:crypto';

export interface NotificationEvent {
  eventId: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  entityType?: string;
  entityId?: string;
  locationId?: string;
  actionUrl?: string;
  correlationId?: string;
  metadata?: any;
  dedupWindowMinutes?: number;
  mandatoryChannels?: ('inApp' | 'email' | 'realtime' | 'push')[];
  recipientRoles?: string[];
}

export interface RecipientResolutionResult {
  userId: string;
  locationId?: string;
  email?: string;
  fullName?: string;
  preferences?: any;
}

export class NotificationService {
  private readonly HR_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR'];
  private readonly LOCATION_HR_ROLES = ['HR_MANAGER', 'HR_EXECUTIVE'];
  private readonly LOCATION_OPS_ROLES = ['LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD'];
  private readonly PAYROLL_ROLES = ['PAYROLL_MANAGER'];
  private readonly SECURITY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'];

  constructor(
    private readonly notifRepo: NotificationRepository,
    private readonly emailService?: any
  ) {}

  public async publishEvent(
    event: NotificationEvent,
    options: {
      recipients?: RecipientResolutionResult[];
      skipDeduplication?: boolean;
      skipRealtime?: boolean;
      skipEmail?: boolean;
    } = {}
  ): Promise<string[]> {
    const {
      recipients = [],
      skipDeduplication = false,
      skipRealtime = false,
      skipEmail = false,
    } = options;

    const correlationId = event.correlationId || `corr_${crypto.randomUUID()}`;
    const dedupKey = event.entityType && event.entityId
      ? NotificationRepository.generateDedupKey(event.eventId, event.entityType, event.entityId, 'global')
      : null;

    if (!skipDeduplication && dedupKey) {
      const existing = await this.notifRepo.findByDedupKey(dedupKey);
      if (existing) {
        console.log(`[NotificationService] Duplicate event suppressed: ${event.eventId} (${dedupKey})`);
        return [existing.id];
      }
    }

    let targetRecipients = recipients;
    if (targetRecipients.length === 0) {
      targetRecipients = await this.resolveRecipients(event);
    }

    if (targetRecipients.length === 0) {
      console.warn(`[NotificationService] No recipients resolved for event: ${event.eventId}`);
      return [];
    }

    const notificationIds: string[] = [];
    const notificationsToCreate = targetRecipients.map((recipient) => {
      const id = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      notificationIds.push(id);
      return {
        id,
        userId: recipient.userId,
        locationId: recipient.locationId || event.locationId || null,
        title: event.title,
        message: event.message,
        type: event.type,
        severity: event.severity,
        eventId: event.eventId,
        entityType: event.entityType,
        entityId: event.entityId,
        actionUrl: event.actionUrl,
        correlationId,
        metadata: event.metadata,
        dedupKey: recipient.userId === targetRecipients[0].userId ? dedupKey : null,
        expiresAt: this.calculateExpiry(event.severity),
      };
    });

    await this.notifRepo.createNotificationBatch(notificationsToCreate);

    if (!skipRealtime) {
      await this.deliverRealtime(targetRecipients, notificationsToCreate);
    }

    if (!skipEmail) {
      await this.deliverEmail(targetRecipients, notificationsToCreate, event, correlationId);
    }

    return notificationIds;
  }

  private async resolveRecipients(event: NotificationEvent): Promise<RecipientResolutionResult[]> {
    const { prisma } = await import('../../db.js');

    let targetRoles: string[] = [];
    let locationIds: string[] = [];

    if (event.recipientRoles && event.recipientRoles.length > 0) {
      targetRoles = event.recipientRoles;
    } else {
      targetRoles = this.getDefaultRecipientRoles(event.eventId);
    }

    if (event.locationId) {
      locationIds = [event.locationId];
    } else if (event.entityId && event.entityType === 'employee') {
      const employee = await prisma.employee.findUnique({
        where: { id: event.entityId },
        select: { locationId: true },
      });
      if (employee?.locationId) locationIds = [employee.locationId];
    }

    const where: any = {
      role: { in: targetRoles },
      isActive: true,
      status: 'ACTIVE',
    };

    if (locationIds.length > 0) {
      if (targetRoles.some(r => this.HR_ROLES.includes(r))) {
        where.OR = [
          { locationId: { in: locationIds } },
          { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
        ];
      } else {
        where.locationId = { in: locationIds };
      }
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        locationId: true,
        role: true,
      },
    });

    return users.map(u => ({
      userId: u.id,
      locationId: u.locationId,
      email: u.email,
      fullName: u.fullName,
      preferences: null,
    }));
  }

  private getDefaultRecipientRoles(eventId: string): string[] {
    const roleMap: Record<string, string[]> = {
      'AUTH.REGISTER': ['HR_MANAGER', 'HR_EXECUTIVE', 'SUPER_ADMIN', 'ADMIN'],
      'AUTH.EMAIL_VERIFIED': ['HR_MANAGER', 'HR_EXECUTIVE'],
      'AUTH.PENDING_APPROVAL': ['HR_MANAGER', 'HR_EXECUTIVE', 'SUPER_ADMIN', 'ADMIN'],
      'AUTH.APPROVED': [],
      'AUTH.REJECTED': [],
      'AUTH.ACTIVATED': ['HR_MANAGER', 'LOCATION_MANAGER'],
      'AUTH.SUSPENDED': ['HR_MANAGER', 'SUPER_ADMIN', 'ADMIN'],
      'AUTH.PROFILE_CHANGED': ['HR_MANAGER'],
      'AUTH.CONTACT_CHANGED': ['HR_MANAGER', 'SUPER_ADMIN', 'ADMIN'],
      'AUTH.PASSWORD_CHANGED': ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'],
      'AUTH.PASSWORD_RESET': ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'],
      'AUTH.ROLE_CHANGED': ['HR_MANAGER', 'SUPER_ADMIN', 'ADMIN'],
      'AUTH.LOCATION_CHANGED': ['HR_MANAGER', 'SUPER_ADMIN', 'ADMIN'],
      'AUTH.FAILED_LOGIN': ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR', 'HR_MANAGER'],
      'AUTH.SUSPICIOUS_ACTIVITY': ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'],
      'AUTH.UNAUTHORIZED_ATTEMPT': ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR', 'HR_MANAGER'],

      'EMP.CREATED': ['HR_MANAGER', 'HR_EXECUTIVE', 'LOCATION_MANAGER'],
      'EMP.PROFILE_UPDATED': ['HR_MANAGER', 'LOCATION_MANAGER'],
      'EMP.JOINING': ['HR_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER'],
      'EMP.DEPT_CHANGED': ['HR_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER'],
      'EMP.DOCUMENT_UPLOADED': ['HR_EXECUTIVE', 'HR_MANAGER'],
      'EMP.DOCUMENT_VERIFIED': ['HR_EXECUTIVE', 'HR_MANAGER'],
      'EMP.STATUS_CHANGED': ['HR_MANAGER', 'LOCATION_MANAGER', 'PAYROLL_MANAGER', 'SUPER_ADMIN'],
      'EMP.RESIGNATION': ['HR_MANAGER', 'LOCATION_MANAGER', 'SUPER_ADMIN', 'ADMIN'],
      'EMP.EXIT_WORKFLOW': ['HR_MANAGER'],
      'EMP.REVIEW_PENDING': ['HR_MANAGER', 'HR_EXECUTIVE'],

      'ATT.EXCEPTION': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.MISSING_CHECKIN': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.MISSING_CHECKOUT': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.LATE_ARRIVAL': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.EARLY_DEPARTURE': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.CORRECTION_REQUESTED': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.CORRECTION_APPROVED': [],
      'ATT.CORRECTION_REJECTED': [],
      'ATT.MANUAL_CHANGE': ['HR_MANAGER'],
      'ATT.SHIFT_CHANGED': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.WEEKOFF_CHANGED': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.FACE_VERIFY_FAILED': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'ATT.BIOMETRIC_IMPORT_FAILED': ['HR_MANAGER', 'SUPER_ADMIN', 'ADMIN'],

      'LEAVE.REQUESTED': ['HR_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER'],
      'LEAVE.APPROVED': [],
      'LEAVE.REJECTED': [],
      'LEAVE.CANCELLED': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'LEAVE.BALANCE_LOW': ['HR_MANAGER'],
      'BRK.POLICY_VIOLATION': ['HR_MANAGER', 'FLOOR_MANAGER'],
      'BRK.MISSING_BREAK': ['FLOOR_MANAGER'],
      'PAY.EXCEPTION': ['PAYROLL_MANAGER', 'HR_MANAGER'],
      'PAY.CALC_ERROR': ['PAYROLL_MANAGER', 'SUPER_ADMIN', 'ADMIN'],
      'PAY.PROCESSING_FAILED': ['PAYROLL_MANAGER', 'SUPER_ADMIN', 'ADMIN'],
      'INC.CHANGE_REQUESTED': ['PAYROLL_MANAGER', 'HR_MANAGER'],
      'INC.APPROVAL_REQUESTED': ['PAYROLL_MANAGER', 'HR_MANAGER'],
      'INC.RULE_CHANGED': ['HR_MANAGER', 'PAYROLL_MANAGER', 'SUPER_ADMIN', 'ADMIN'],

      'CRM.CUSTOMER_REGISTERED': ['TEAM_LEAD', 'DEPARTMENT_MANAGER'],
      'CRM.ASSIGNED': ['TEAM_LEAD', 'DEPARTMENT_MANAGER'],
      'CRM.FOLLOWUP_DUE': [],
      'CRM.FOLLOWUP_OVERDUE': ['TEAM_LEAD', 'DEPARTMENT_MANAGER', 'HR_MANAGER'],
      'CRM.STATUS_CHANGED': ['TEAM_LEAD', 'DEPARTMENT_MANAGER'],
      'CRM.IMPORT_FAILED': ['SUPER_ADMIN', 'ADMIN', 'DEPARTMENT_MANAGER'],
      'CRM.WORKFLOW_ERROR': ['HR_MANAGER', 'DEPARTMENT_MANAGER'],

      'SYS.DB_CONNECTIVITY': ['SUPER_ADMIN', 'ADMIN'],
      'SYS.API_FAILURES': ['SUPER_ADMIN', 'ADMIN'],
      'SYS.EMAIL_DELIVERY_FAILED': ['SUPER_ADMIN', 'ADMIN'],
      'SYS.WS_CONNECTION_FAILED': ['SUPER_ADMIN', 'ADMIN'],
      'SYS.JOB_FAILED': ['SUPER_ADMIN', 'ADMIN'],
      'SYS.FILE_SCAN_FAILED': ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'],
      'SYS.SECURITY_ALERT': ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'],
      'SYS.IMPORT_EXPORT_FAILED': ['SUPER_ADMIN', 'ADMIN'],
      'SYS.MIGRATION_FAILED': ['SUPER_ADMIN', 'ADMIN'],
    };

    return roleMap[eventId] || ['HR_MANAGER', 'SUPER_ADMIN', 'ADMIN'];
  }

  private calculateExpiry(severity: string): Date | null {
    switch (severity) {
      case 'CRITICAL': return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      case 'HIGH': return new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      case 'MEDIUM': return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      case 'LOW': return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      default: return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  }

  private async deliverRealtime(
    recipients: RecipientResolutionResult[],
    notifications: any[]
  ): Promise<void> {
    try {
      for (const recipient of recipients) {
        socketIO.to(`user:${recipient.userId}`).emit('notification:new', {
          notification: notifications.find(n => n.userId === recipient.userId),
        });
        if (recipient.locationId) {
          socketIO.to(`location:${recipient.locationId}`).emit('notification:new', {
            notification: notifications.find(n => n.userId === recipient.userId),
          });
        }
      }
    } catch (err: any) {
      console.warn('[NotificationService] Realtime delivery error:', err.message);
    }
  }

  private async deliverEmail(
    recipients: RecipientResolutionResult[],
    notifications: any[],
    event: NotificationEvent,
    correlationId: string
  ): Promise<void> {
    const mandatoryEmail = event.mandatoryChannels?.includes('email') ?? 
      ['CRITICAL', 'HIGH'].includes(event.severity);

    for (const recipient of recipients) {
      if (!recipient.email) continue;

      const shouldEmail = mandatoryEmail || 
        (recipient.preferences?.categories?.[this.getCategoryForEvent(event.eventId)]?.email ?? false);

      if (!shouldEmail) continue;

      const notification = notifications.find(n => n.userId === recipient.userId);
      if (!notification) continue;

      try {
        await this.sendEventEmail(recipient, event, correlationId);
        await this.notifRepo.updateDeliveryStatus(
          notification.id,
          'email',
          'sent'
        );
      } catch (err: any) {
        console.warn(`[NotificationService] Email delivery failed for ${recipient.userId}:`, err.message);
        await this.notifRepo.updateDeliveryStatus(
          notification.id,
          'email',
          'failed',
          err.message
        );
      }
    }
  }

  private getCategoryForEvent(eventId: string): string {
    if (eventId.startsWith('AUTH.')) return 'security';
    if (eventId.startsWith('EMP.')) return 'approvals';
    if (eventId.startsWith('ATT.')) return 'attendance';
    if (eventId.startsWith('LEAVE.') || eventId.startsWith('BRK.')) return 'leave';
    if (eventId.startsWith('PAY.') || eventId.startsWith('INC.')) return 'payroll';
    if (eventId.startsWith('CRM.')) return 'crm';
    if (eventId.startsWith('SYS.')) return 'system';
    return 'general';
  }

  private async sendEventEmail(
    recipient: RecipientResolutionResult,
    event: NotificationEvent,
    correlationId: string
  ): Promise<void> {
    const { EmailNotificationService } = await import('../../services/emailNotificationService.js');
    
    const subject = `[BSC HRMS] ${event.type}: ${event.title}`;
    const text = `${event.message}\n\nEvent: ${event.eventId}\nCorrelation ID: ${correlationId}\nTime: ${new Date().toISOString()}`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2>BSC Textiles HRMS — ${event.type} Notification</h2>
        <p>Namaskara <strong>${recipient.fullName || 'User'}</strong>,</p>
        <p>${event.message}</p>
        <div style="background: #F1F5F9; padding: 12px; border-radius: 6px; margin: 16px 0; font-size: 13px;">
          <strong>Event:</strong> ${event.eventId}<br>
          <strong>Severity:</strong> ${event.severity}<br>
          <strong>Correlation ID:</strong> ${correlationId}<br>
          <strong>Time:</strong> ${new Date().toISOString()}
        </div>
        ${event.actionUrl ? `<p><a href="${event.actionUrl}" style="background: #2563EB; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Details</a></p>` : ''}
      </div>
    `;

    await EmailNotificationService['send']({
      to: recipient.email!,
      subject,
      text,
      html,
    });
  }

  public async getUserNotifications(
    userId: string,
    filter: Partial<NotificationFilter> = {}
  ): Promise<PaginatedNotifications> {
    return this.notifRepo.getPaginatedNotifications({ userId, ...filter });
  }

  public async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.getUnreadCount(userId);
  }

  public async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    return this.notifRepo.markAsRead(notificationId, userId);
  }

  public async markAsUnread(notificationId: string, userId: string): Promise<boolean> {
    return this.notifRepo.markAsUnread(notificationId, userId);
  }

  public async markAllAsRead(userId: string): Promise<number> {
    return this.notifRepo.markAllAsRead(userId);
  }

  public async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    return this.notifRepo.deleteNotification(notificationId, userId);
  }

  public async getNotificationById(notificationId: string, userId: string): Promise<NotificationEntity | null> {
    return this.notifRepo.getById(notificationId, userId);
  }

  public async notifyUser(userId: string, title: string, message: string, type: 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL' = 'INFO'): Promise<void> {
    await this.publishEvent({
      eventId: 'MANUAL.NOTIFY',
      title,
      message,
      type,
      severity: type === 'CRITICAL' || type === 'DANGER' ? 'HIGH' : 'MEDIUM',
    }, { recipients: [{ userId }] });
  }
}
