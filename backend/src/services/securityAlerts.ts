/**
 * Security alerting — one call records the tamper-evident event and notifies
 * whoever needs to know.
 *
 * Alerts are best-effort by design: a dead SMTP relay must never turn a
 * successful login into a 500. The durable record is always the `security_event`
 * row plus the audit log; email and webhook are delivery conveniences.
 */
import { EmailNotificationService } from './emailNotificationService.js';
import { SecurityMonitoringService } from './securityMonitoringService.js';
import { securityConfig } from '../config/security.js';
import type { SecurityEventOptions } from './securityMonitoringService.js';

export interface AlertInput {
  event: SecurityEventOptions;
  /** Human-readable subject line for the Admin channel. */
  title: string;
  message: string;
  /** Extra recipients beyond SECURITY_ALERT_EMAIL (for example the affected user). */
  alsoEmail?: string[];
}

async function postWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = securityConfig.alerts.webhookUrl;
  if (!url || !securityConfig.alerts.webhookEnabled) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err: any) {
    console.warn('[alerts] webhook delivery failed:', err?.message || err);
  }
}

/**
 * Records the event and fans out notifications. Never throws.
 */
export async function raiseSecurityAlert(input: AlertInput): Promise<string | null> {
  let eventId: string | null = null;
  try {
    eventId = await SecurityMonitoringService.recordEvent(input.event);
  } catch (err: any) {
    console.error('[alerts] could not record security event:', err?.message || err);
  }

  const severity = input.event.severity;
  const shouldEmail =
    securityConfig.alerts.emailEnabled &&
    (severity === 'HIGH' || severity === 'CRITICAL') &&
    Boolean(securityConfig.alerts.adminEmail);

  const recipients = [...new Set([shouldEmail ? securityConfig.alerts.adminEmail : '', ...(input.alsoEmail || [])].filter(Boolean))];

  for (const to of recipients) {
    try {
      await EmailNotificationService.sendSecurityAlert({
        to,
        subject: `[HRMS ${severity}] ${input.title}`,
        text: `${input.message}\n\nTime: ${new Date().toISOString()}\nAccount: ${input.event.userId || 'n/a'}\nIP: ${input.event.ipAddress || 'n/a'}`,
        html: `<p>${input.message}</p><ul><li><strong>Time:</strong> ${new Date().toISOString()}</li><li><strong>User:</strong> ${
          input.event.userId || 'n/a'
        }</li><li><strong>IP:</strong> ${input.event.ipAddress || 'n/a'}</li><li><strong>Severity:</strong> ${severity}</li></ul>`,
      });
    } catch (err: any) {
      console.warn('[alerts] email delivery failed:', err?.message || err);
    }
  }

  await postWebhook({
    kind: input.event.type,
    severity,
    title: input.title,
    message: input.message,
    userId: input.event.userId ?? null,
    ipAddress: input.event.ipAddress ?? null,
    details: input.event.details,
    at: new Date().toISOString(),
  }).catch(() => undefined);

  return eventId;
}
