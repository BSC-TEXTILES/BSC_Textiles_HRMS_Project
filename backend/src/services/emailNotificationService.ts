import nodemailer, { type Transporter } from 'nodemailer';
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';

export class EmailNotificationService {
  private static transporter: Transporter | null = null;
  private static readonly FROM_ADDRESS = process.env.SMTP_FROM || 'security@bsctextiles.com';
  private static readonly APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

  private static getTransporter(): Transporter {
    if (!this.transporter) {
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT) || 587;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      if (host && user && pass) {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
      } else {
        // Safe development stream transport (does not contact external SMTP server)
        this.transporter = nodemailer.createTransport({
          jsonTransport: true,
        });
      }
    }
    return this.transporter;
  }

  /**
   * Helper to safely dispatch an email without crashing the application
   */
  private static async send(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<boolean> {
    try {
      const mailOptions = {
        from: `"BSC Textiles Security Core" <${this.FROM_ADDRESS}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.getTransporter().sendMail(mailOptions);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[EmailNotificationService] Dispatched email: ${options.subject} to ${options.to}`);
      }
      return true;
    } catch (err) {
      console.error('[EmailNotificationService] Failed to send email:', err);
      return false;
    }
  }

  /**
   * Public entry point for the security layer's own notifications (lockouts,
   * credential changes, token reuse). Returns false rather than throwing so a
   * dead SMTP relay cannot fail the request that triggered it.
   */
  public static async sendSecurityAlert(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<boolean> {
    if (!options.to) return false;
    return await this.send(options);
  }

  /**
   * Send Email Verification Link
   */
  public static async sendEmailVerification(params: {
    to: string;
    fullName: string;
    token: string;
  }): Promise<boolean> {
    const link = `${this.APP_URL}/auth/verify-email?token=${encodeURIComponent(params.token)}`;
    const subject = 'Action Required: Verify Your BSC Textiles HRMS Account';
    const text = `Namaskara ${params.fullName},\n\nPlease verify your email address by visiting the following link:\n${link}\n\nThis link expires in 24 hours.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2>BSC Textiles HRMS — Account Verification</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>Thank you for initiating registration. Please verify your email address to proceed with the HR approval workflow:</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #2563EB; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email Address</a>
        </p>
        <p style="color: #64748B; font-size: 13px;">This verification link will expire in 24 hours. If you did not request this, please disregard this email.</p>
      </div>
    `;

    return await this.send({ to: params.to, subject, text, html });
  }

  /**
   * Notify HR administrators about a new registration awaiting approval
   */
  public static async notifyHrPendingApproval(params: { user: any }): Promise<boolean> {
    const hrEmail = process.env.HR_ADMIN_EMAIL || 'hr@bsctextiles.com';
    const link = `${this.APP_URL}/admin/registrations`;
    const subject = `[HR Action Required] New Registration Pending Approval: ${params.user.fullName}`;
    const text = `A new user (${params.user.fullName}, ${params.user.email}) has verified their email and is awaiting HR approval. Review at: ${link}`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2>BSC Textiles HRMS — Registration Approval Required</h2>
        <p>The following staff member has completed email verification and is pending approval:</p>
        <ul>
          <li><strong>Name:</strong> ${params.user.fullName}</li>
          <li><strong>Email:</strong> ${params.user.email}</li>
          <li><strong>Assigned Role:</strong> ${params.user.role}</li>
        </ul>
        <p style="margin: 20px 0;">
          <a href="${link}" style="background: #0284C7; color: #FFFFFF; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Open HR Approval Queue</a>
        </p>
      </div>
    `;

    return await this.send({ to: hrEmail, subject, text, html });
  }

  /**
   * Notify user of successful HR account approval
   */
  public static async sendAccountApproved(params: {
    to: string;
    fullName: string;
    role: string;
  }): Promise<boolean> {
    const link = `${this.APP_URL}/auth/login`;
    const subject = 'Welcome to BSC Textiles: Account Approved';
    const text = `Namaskara ${params.fullName},\n\nYour BSC Textiles HRMS account has been approved by HR. You can now log in at: ${link}`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2>Account Approved</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>Your HRMS account has been reviewed and approved with the role of <strong>${params.role}</strong>.</p>
        <p style="margin: 20px 0;">
          <a href="${link}" style="background: #16A34A; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Sign In to BSC Textiles HRMS</a>
        </p>
      </div>
    `;

    return await this.send({ to: params.to, subject, text, html });
  }

  /**
   * Notify user of HR account rejection
   */
  public static async sendAccountRejected(params: {
    to: string;
    fullName: string;
    reason: string;
  }): Promise<boolean> {
    const subject = 'BSC Textiles HRMS: Account Registration Update';
    const text = `Namaskara ${params.fullName},\n\nYour account request has been reviewed and was not approved at this time.\nReason: ${params.reason}\n\nPlease contact HR for assistance.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2>Registration Status Update</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>Your registration request could not be approved for the following reason:</p>
        <blockquote style="background: #F1F5F9; padding: 12px; border-left: 4px solid #EF4444;">${params.reason}</blockquote>
        <p>Please contact your HR manager or store supervisor if you believe this is in error.</p>
      </div>
    `;

    return await this.send({ to: params.to, subject, text, html });
  }

  /**
   * Send Password Reset Link
   */
  public static async sendPasswordReset(params: {
    to: string;
    fullName: string;
    token: string;
  }): Promise<boolean> {
    const link = `${this.APP_URL}/auth/reset-password?token=${encodeURIComponent(params.token)}`;
    const subject = 'Security Notice: BSC Textiles HRMS Password Reset Request';
    const text = `Namaskara ${params.fullName},\n\nA password reset was requested for your account. Reset your password here:\n${link}\n\nThis single-use link expires in 15 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2>Password Reset Request</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>A password reset was requested for your account. Click the button below to choose a new password:</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background: #DC2626; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
        </p>
        <p style="color: #64748B; font-size: 13px;">This single-use link will expire in 15 minutes. If you did not request this, please notify your system administrator immediately.</p>
      </div>
    `;

    return await this.send({ to: params.to, subject, text, html });
  }

  /**
   * Alert user upon successful password change
   */
  public static async sendPasswordChangedAlert(params: {
    to: string;
    fullName: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<boolean> {
    const subject = 'Security Alert: Your BSC Textiles Password Was Changed';
    const text = `Namaskara ${params.fullName},\n\nYour password was successfully changed from IP: ${params.ipAddress}.\nIf you did not make this change, contact security immediately.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2>Security Alert — Password Changed</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>Your BSC Textiles HRMS password was changed successfully.</p>
        <ul>
          <li><strong>IP Address:</strong> ${params.ipAddress}</li>
          <li><strong>Device / Client:</strong> ${params.userAgent}</li>
          <li><strong>Timestamp:</strong> ${new Date().toUTCString()}</li>
        </ul>
        <p style="color: #DC2626; font-weight: bold;">If you did not perform this change, please report this incident immediately to security@bsctextiles.com.</p>
      </div>
    `;

    return await this.send({ to: params.to, subject, text, html });
  }

  /**
   * Alert user when login is detected from a new device / IP
   */
  public static async sendNewDeviceAlert(params: {
    to: string;
    fullName: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<boolean> {
    const subject = 'Security Notice: New Device Sign-In to BSC Textiles';
    const text = `Namaskara ${params.fullName},\n\nA sign-in was detected from a new device or location (IP: ${params.ipAddress}).`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2>New Device Sign-In Detected</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>We noticed a login to your account from a new device:</p>
        <ul>
          <li><strong>IP Address:</strong> ${params.ipAddress}</li>
          <li><strong>Device / Client:</strong> ${params.userAgent}</li>
          <li><strong>Time:</strong> ${new Date().toUTCString()}</li>
        </ul>
      </div>
    `;

    return await this.send({ to: params.to, subject, text, html });
  }

  /**
   * Queue email for asynchronous delivery with automatic retry.
   */
  public static async queueEmail(options: {
    to: string;
    recipientName?: string;
    subject: string;
    html: string;
    eventType: string;
  }): Promise<string> {
    const queueId = `emq_${crypto.randomBytes(12).toString('hex')}`;
    try {
      await pool.query(
        `INSERT INTO email_notification_queue (id, recipientEmail, recipientName, subject, bodyHtml, eventType, status, retryCount, maxRetries, scheduledAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, 3, NOW(3), NOW(3))`,
        [queueId, options.to, options.recipientName || null, options.subject, options.html, options.eventType]
      );
    } catch (e) {
      console.error('[EmailNotificationService] Failed to insert into email queue:', e);
    }

    // Attempt immediate opportunistic delivery
    this.send({
      to: options.to,
      subject: options.subject,
      text: options.subject,
      html: options.html,
    }).then(async (success) => {
      try {
        if (success) {
          await pool.query('UPDATE email_notification_queue SET status = "SENT", sentAt = NOW(3) WHERE id = ?', [queueId]);
        } else {
          await pool.query('UPDATE email_notification_queue SET retryCount = retryCount + 1, lastError = "Delivery failed" WHERE id = ?', [queueId]);
        }
      } catch {
        // Ignore
      }
    }).catch(() => {});

    return queueId;
  }

  /**
   * Process pending items in email queue with retry limit.
   */
  public static async processQueue(): Promise<{ processed: number; sent: number; failed: number }> {
    let processed = 0;
    let sent = 0;
    let failed = 0;

    try {
      const [rows]: any = await pool.query(
        `SELECT id, recipientEmail, subject, bodyHtml, retryCount, maxRetries 
         FROM email_notification_queue 
         WHERE status = 'PENDING' AND retryCount < maxRetries 
         ORDER BY scheduledAt ASC LIMIT 25`
      );

      if (!rows || rows.length === 0) return { processed: 0, sent: 0, failed: 0 };

      for (const row of rows) {
        processed++;
        const ok = await this.send({
          to: row.recipientEmail,
          subject: row.subject,
          text: row.subject,
          html: row.bodyHtml,
        });

        if (ok) {
          sent++;
          await pool.query('UPDATE email_notification_queue SET status = "SENT", sentAt = NOW(3) WHERE id = ?', [row.id]);
        } else {
          failed++;
          const nextRetry = row.retryCount + 1;
          const status = nextRetry >= row.maxRetries ? 'FAILED' : 'PENDING';
          await pool.query(
            'UPDATE email_notification_queue SET retryCount = ?, status = ?, lastError = "Delivery attempt failed" WHERE id = ?',
            [nextRetry, status, row.id]
          );
        }
      }
    } catch (err) {
      console.error('[EmailNotificationService] processQueue error:', err);
    }

    return { processed, sent, failed };
  }

  /**
   * Notify new employee with login credentials and activation link.
   */
  public static async sendEmployeeWelcomeCredentials(params: {
    to: string;
    fullName: string;
    employeeCode: string;
    username: string;
    tempPassword?: string;
    activationToken?: string;
  }): Promise<boolean> {
    const activationLink = params.activationToken
      ? `${this.APP_URL}/auth/activate?token=${encodeURIComponent(params.activationToken)}`
      : `${this.APP_URL}/login`;

    const subject = `Welcome to BSC Textiles — Your HRMS Login Credentials (${params.employeeCode})`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #1E293B; max-width: 600px; margin: auto; border: 1px solid #E2E8F0; border-radius: 8px;">
        <h2 style="color: #092B69; margin-top: 0;">BSC Textiles HRMS — Employee Onboarding</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>Your employee profile has been officially created in the BSC Textiles Human Resource Management System.</p>
        
        <div style="background: #F8FAFC; border-left: 4px solid #0284C7; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Employee Code:</strong> ${params.employeeCode}</p>
          <p style="margin: 4px 0;"><strong>Username / Login:</strong> ${params.username}</p>
          ${params.tempPassword ? `<p style="margin: 4px 0;"><strong>Temporary Password:</strong> <code style="background: #E2E8F0; padding: 2px 6px; border-radius: 4px;">${params.tempPassword}</code></p>` : ''}
        </div>

        <p style="margin: 24px 0;">
          <a href="${activationLink}" style="background: #092B69; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Activate Account & Sign In</a>
        </p>

        <p style="color: #64748B; font-size: 13px;">Please change your password immediately upon your first sign-in. Never share your credentials with anyone.</p>
      </div>
    `;

    await this.queueEmail({
      to: params.to,
      recipientName: params.fullName,
      subject,
      html,
      eventType: 'ACCOUNT_ACTIVATION',
    });

    return true;
  }

  /**
   * Alert employee and supervisor of missed punch beyond grace period.
   */
  public static async sendMissedPunchAlert(params: {
    to: string;
    fullName: string;
    date: string;
    punchType: 'CHECK_IN' | 'CHECK_OUT';
    shiftName?: string;
  }): Promise<boolean> {
    const subject = `[Attendance Notice] Missed ${params.punchType === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} on ${params.date}`;
    const link = `${this.APP_URL}/my-desk`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2 style="color: #DC2626;">Missed Attendance Punch Notice</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>Our biometric and attendance records indicate that your <strong>${params.punchType}</strong> punch for <strong>${params.date}</strong> was not recorded within the shift grace period.</p>
        <p>If you were present on the floor, please submit an <strong>Attendance Correction Request</strong> through your employee portal:</p>
        <p style="margin: 20px 0;">
          <a href="${link}" style="background: #DC2626; color: #FFFFFF; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Submit Punch Correction</a>
        </p>
      </div>
    `;

    await this.queueEmail({
      to: params.to,
      recipientName: params.fullName,
      subject,
      html,
      eventType: 'MISSED_PUNCH',
    });

    return true;
  }

  /**
   * Notify employee of monthly salary slip generation and availability.
   */
  public static async sendSalarySlipReady(params: {
    to: string;
    fullName: string;
    month: string;
    year: number;
    netPay: number;
  }): Promise<boolean> {
    const subject = `Your BSC Textiles Salary Slip for ${params.month} ${params.year} is Ready`;
    const link = `${this.APP_URL}/my-desk`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E293B;">
        <h2 style="color: #092B69;">Salary Slip Available</h2>
        <p>Namaskara <strong>${params.fullName}</strong>,</p>
        <p>Your salary slip for <strong>${params.month} ${params.year}</strong> has been processed.</p>
        <p><strong>Net Payable Amount:</strong> ₹${params.netPay.toLocaleString('en-IN')}</p>
        <p style="margin: 20px 0;">
          <a href="${link}" style="background: #092B69; color: #FFFFFF; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Download Salary Slip PDF</a>
        </p>
      </div>
    `;

    await this.queueEmail({
      to: params.to,
      recipientName: params.fullName,
      subject,
      html,
      eventType: 'PAYSLIP_GENERATED',
    });

    return true;
  }

  /**
   * Health check to safely verify SMTP connectivity without exposing credentials or sending test messages
   */
  public static async verifyConnection(): Promise<{
    status: 'healthy' | 'degraded';
    configured: boolean;
    transport: 'smtp' | 'mock_development';
    message: string;
  }> {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return {
        status: 'healthy',
        configured: false,
        transport: 'mock_development',
        message: 'SMTP credentials not configured; application is using safe non-delivering development transport.',
      };
    }

    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return {
        status: 'healthy',
        configured: true,
        transport: 'smtp',
        message: 'SMTP transport connection and authentication verified successfully.',
      };
    } catch {
      return {
        status: 'degraded',
        configured: true,
        transport: 'smtp',
        message: 'SMTP server rejected connectivity or authentication check.',
      };
    }
  }
}
