import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { prisma } from '../db.js';

authenticator.options = {
  window: 1, // Allow 1 step before/after for slight clock drift
};

export interface MfaEnrollmentDetails {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export class MfaService {
  private static readonly BACKUP_CODE_COUNT = 10;
  private static readonly MANDATORY_ROLES = new Set([
    'SUPER_ADMIN',
    'ADMIN',
    'HR_MANAGER',
    'PAYROLL_MANAGER',
  ]);

  /**
   * Determine if MFA is mandatory for a given role
   */
  public static isMfaRequired(role?: string): boolean {
    if (!role) return false;
    return this.MANDATORY_ROLES.has(role.toUpperCase());
  }

  /**
   * Check if user has active MFA device configured
   */
  public static async isMfaEnabled(userId: string): Promise<boolean> {
    const count = await prisma.mfaDevice.count({
      where: { userId },
    });
    return count > 0;
  }

  /**
   * Generate raw backup codes and their SHA-256 hashes for storage
   */
  public static generateBackupCodes(): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      const plain = crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. "A1B2C3D4"
      const hash = crypto.createHash('sha256').update(plain).digest('hex');
      plainCodes.push(plain);
      hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * Start TOTP enrollment for a user: generates secret, QR code and backup codes
   */
  public static async generateTotpEnrollment(
    userId: string,
    email: string
  ): Promise<MfaEnrollmentDetails> {
    const secret = authenticator.generateSecret();
    const serviceName = 'BSC Textiles HRMS';
    const otpauthUrl = authenticator.keyuri(email, serviceName, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    const { plainCodes, hashedCodes } = this.generateBackupCodes();

    // Store in temporary challenge / unconfirmed device
    const deviceId = `mfa_${crypto.randomUUID()}`;
    await prisma.mfaDevice.create({
      data: {
        id: deviceId,
        userId,
        type: 'totp',
        name: 'Authenticator App (Pending)',
        secret,
        backupCodes: hashedCodes,
      },
    });

    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl,
      backupCodes: plainCodes,
    };
  }

  /**
   * Verify TOTP code during enrollment and activate the device
   */
  public static async confirmTotpEnrollment(
    userId: string,
    token: string
  ): Promise<boolean> {
    const pendingDevice = await prisma.mfaDevice.findFirst({
      where: {
        userId,
        name: 'Authenticator App (Pending)',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingDevice || !pendingDevice.secret) {
      return false;
    }

    const isValid = authenticator.verify({
      token,
      secret: pendingDevice.secret,
    });

    if (!isValid) {
      return false;
    }

    // Activate the device
    await prisma.mfaDevice.update({
      where: { id: pendingDevice.id },
      data: {
        name: 'Authenticator App',
        lastUsedAt: new Date(),
      },
    });

    // Update user record
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: 1 },
    });

    // Remove any older unconfirmed devices for this user
    const oldDevices = await prisma.mfaDevice.findMany({
      where: {
        userId,
        name: 'Authenticator App (Pending)',
        id: { not: pendingDevice.id },
      },
    });
    for (const d of oldDevices) {
      await prisma.mfaDevice.delete({ where: { id: d.id } }).catch(() => {});
    }

    return true;
  }

  /**
   * Verify TOTP code or backup code during authentication challenge
   */
  public static async verifyChallenge(
    userId: string,
    tokenOrBackupCode: string
  ): Promise<{ success: boolean; method: 'totp' | 'backup_code' | 'invalid' }> {
    const devices = await prisma.mfaDevice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!devices || devices.length === 0) {
      return { success: false, method: 'invalid' };
    }

    const cleanInput = (tokenOrBackupCode || '').trim();

    // 1. Try TOTP code first
    for (const device of devices) {
      if (device.secret && device.name !== 'Authenticator App (Pending)') {
        const isTotpValid = authenticator.verify({
          token: cleanInput,
          secret: device.secret,
        });

        if (isTotpValid) {
          await prisma.mfaDevice.update({
            where: { id: device.id },
            data: { lastUsedAt: new Date() },
          });
          return { success: true, method: 'totp' };
        }
      }
    }

    // 2. Try Backup Code (single-use)
    const codeHash = crypto.createHash('sha256').update(cleanInput.toUpperCase()).digest('hex');

    for (const device of devices) {
      const backupCodes = Array.isArray(device.backupCodes)
        ? (device.backupCodes as string[])
        : [];

      if (backupCodes.includes(codeHash)) {
        // Burn the backup code by removing it from the array
        const updatedCodes = backupCodes.filter((c) => c !== codeHash);
        await prisma.mfaDevice.update({
          where: { id: device.id },
          data: {
            backupCodes: updatedCodes,
            lastUsedAt: new Date(),
          },
        });

        return { success: true, method: 'backup_code' };
      }
    }

    return { success: false, method: 'invalid' };
  }

  /**
   * Disable MFA for a user (removes devices and unsets mfaEnabled flag)
   */
  public static async disableMfa(userId: string): Promise<void> {
    await prisma.mfaDevice.deleteMany({
      where: { userId },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: 0 },
    });
  }
}
