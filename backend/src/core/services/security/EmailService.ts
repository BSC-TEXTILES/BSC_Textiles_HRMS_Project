/**
 * EmailService — SMTP notifications for security events.
 * Sends email alerts for login, password changes, registration approval, etc.
 */
import nodemailer, { type Transporter } from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  appUrl: string;
}

function loadConfig(): EmailConfig {
  return {
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'BSC Textiles HRMS <noreply@bsctextiles.com>',
    appUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  };
}

export class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;
  private enabled: boolean;

  constructor() {
    this.config = loadConfig();
    this.enabled = !!(this.config.host && this.config.user);

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.pass,
        },
      });
    }
  }

  private async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      console.log(`[EmailService] SMTP not configured. Skipping email to ${to}: ${subject}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to,
        subject: `[BSC Textiles HRMS] ${subject}`,
        html,
      });
      return true;
    } catch (error) {
      console.error('[EmailService] Send failed:', error);
      return false;
    }
  }

  // ─── Email Templates ──────────────────────────────────────────────

  async sendEmailVerification(email: string, fullName: string, token: string): Promise<boolean> {
    const link = `${this.config.appUrl}/verify-email?token=${token}`;
    return this.send(email, 'Verify Your Email Address', `
      <h2>Welcome to BSC Textiles HRMS, ${this.esc(fullName)}!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
      <p style="color:#888;font-size:12px;">If you didn't register, you can safely ignore this email.</p>
    `);
  }

  async sendApprovalNotification(hrEmail: string, hrName: string, applicantName: string, applicantEmail: string, token: string): Promise<boolean> {
    const link = `${this.config.appUrl}/admin/approve-account?token=${token}`;
    return this.send(hrEmail, 'New Account Pending Approval', `
      <h2>New Registration Request</h2>
      <p>Hello ${this.esc(hrName)},</p>
      <p><strong>${this.esc(applicantName)}</strong> (${this.esc(applicantEmail)}) has registered and is awaiting your approval.</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Review &amp; Approve</a></p>
      <p style="color:#888;font-size:12px;">This link expires in 48 hours.</p>
    `);
  }

  async sendApprovalDecision(email: string, fullName: string, approved: boolean, reason?: string): Promise<boolean> {
    const status = approved ? 'Approved' : 'Rejected';
    const color = approved ? '#16a34a' : '#dc2626';
    return this.send(email, `Account ${status}`, `
      <h2>Account ${status}</h2>
      <p>Hello ${this.esc(fullName)},</p>
      <p>Your BSC Textiles HRMS account has been <strong style="color:${color}">${status.toLowerCase()}</strong>.</p>
      ${approved ? `<p><a href="${this.config.appUrl}/login" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Sign In</a></p>` : ''}
      ${reason ? `<p>Reason: ${this.esc(reason)}</p>` : ''}
    `);
  }

  async sendPasswordResetLink(email: string, fullName: string, token: string): Promise<boolean> {
    const link = `${this.config.appUrl}/reset-password?token=${token}`;
    return this.send(email, 'Password Reset Request', `
      <h2>Password Reset</h2>
      <p>Hello ${this.esc(fullName)},</p>
      <p>A password reset was requested for your account. Click below to set a new password:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, please change your password immediately.</p>
    `);
  }

  async sendPasswordChanged(email: string, fullName: string): Promise<boolean> {
    return this.send(email, 'Password Changed', `
      <h2>Password Changed Successfully</h2>
      <p>Hello ${this.esc(fullName)},</p>
      <p>Your password was changed successfully. If you did not make this change, contact HR immediately.</p>
      <p style="color:#888;font-size:12px;">Time: ${new Date().toISOString()}</p>
    `);
  }

  async sendNewDeviceAlert(email: string, fullName: string, deviceInfo: { ip: string; userAgent: string; time: string }): Promise<boolean> {
    return this.send(email, 'New Device Login Detected', `
      <h2>New Device Login</h2>
      <p>Hello ${this.esc(fullName)},</p>
      <p>A login to your account was detected from a new device:</p>
      <ul>
        <li>IP: ${this.esc(deviceInfo.ip)}</li>
        <li>Device: ${this.esc(deviceInfo.userAgent)}</li>
        <li>Time: ${this.esc(deviceInfo.time)}</li>
      </ul>
      <p>If this wasn't you, please change your password and contact HR immediately.</p>
    `);
  }

  async sendAccountSuspended(email: string, fullName: string, reason: string): Promise<boolean> {
    return this.send(email, 'Account Suspended', `
      <h2>Account Suspended</h2>
      <p>Hello ${this.esc(fullName)},</p>
      <p>Your BSC Textiles HRMS account has been <strong style="color:#dc2626">suspended</strong>.</p>
      <p>Reason: ${this.esc(reason)}</p>
      <p>Please contact HR for more information.</p>
    `);
  }

  async sendMfaEnrolled(email: string, fullName: string): Promise<boolean> {
    return this.send(email, 'MFA Enabled', `
      <h2>Multi-Factor Authentication Enabled</h2>
      <p>Hello ${this.esc(fullName)},</p>
      <p>Two-factor authentication has been enabled on your account. You will now need your authenticator app to sign in.</p>
    `);
  }

  private esc(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
