import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma, pool } from '../db.js';

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export class PasswordService {
  // Argon2id parameters (OWASP recommended baseline)
  private static readonly ARGON2_OPTIONS = {
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4,    // 4 threads
  };

  private static readonly MAX_HISTORY_CHECK = 12;
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * Hash a plain password using Argon2id
   */
  public static async hashPassword(password: string): Promise<string> {
    try {
      return await argon2Hash(password, this.ARGON2_OPTIONS);
    } catch (err) {
      // Fallback to high-work-factor bcrypt if native module ever fails
      console.warn('[PasswordService] Argon2 hashing failed, falling back to bcrypt:', err);
      return await bcrypt.hash(password, 12);
    }
  }

  /**
   * Verify password against hash (supports both Argon2id and legacy bcrypt)
   */
  public static async verifyPassword(
    password: string,
    hash: string
  ): Promise<{ valid: boolean; isLegacyBcrypt: boolean }> {
    if (!hash || !password) {
      return { valid: false, isLegacyBcrypt: false };
    }

    // Check if hash is Argon2id
    if (hash.startsWith('$argon2')) {
      try {
        const valid = await argon2Verify(hash, password);
        return { valid, isLegacyBcrypt: false };
      } catch {
        return { valid: false, isLegacyBcrypt: false };
      }
    }

    // Check if hash is legacy bcrypt
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      try {
        const valid = await bcrypt.compare(password, hash);
        return { valid, isLegacyBcrypt: valid };
      } catch {
        return { valid: false, isLegacyBcrypt: false };
      }
    }

    return { valid: false, isLegacyBcrypt: false };
  }

  /**
   * Validate password strength according to enterprise policy
   */
  public static validateStrength(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (!password || password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Common weak patterns
    const lower = (password || '').toLowerCase();
    if (lower.includes('password') || lower.includes('bsctextiles') || lower.includes('admin123')) {
      errors.push('Password contains easily guessable words');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if password has been compromised via HaveIBeenPwned API (k-Anonymity model)
   */
  public static async checkCompromised(password: string): Promise<boolean> {
    try {
      const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'BSC-Textiles-Security-Check' },
      });
      clearTimeout(timeoutId);

      if (!res.ok) return false;

      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        const [hashSuffix] = line.split(':');
        if (hashSuffix && hashSuffix.trim() === suffix) {
          return true; // Password found in breach
        }
      }
      return false;
    } catch {
      // In offline/dev environment, safely ignore external check
      return false;
    }
  }

  /**
   * Check if new password was previously used in the user's password history (last 12)
   */
  public static async isPasswordInHistory(userId: string, newPassword: string): Promise<boolean> {
    try {
      const history = await prisma.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: this.MAX_HISTORY_CHECK,
      });

      for (const entry of history) {
        const check = await this.verifyPassword(newPassword, entry.passwordHash);
        if (check.valid) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('[PasswordService] Error checking password history:', err);
      return false;
    }
  }

  /**
   * Record a password hash in the user's password history
   */
  public static async recordPasswordHistory(userId: string, passwordHash: string): Promise<void> {
    try {
      await prisma.passwordHistory.create({
        data: {
          id: `pwh_${crypto.randomUUID()}`,
          userId,
          passwordHash,
        },
      });

      // Keep only last MAX_HISTORY_CHECK entries
      const [rows]: any = await pool.query(
        'SELECT id FROM password_history WHERE userId = ? ORDER BY createdAt DESC LIMIT 100 OFFSET ?',
        [userId, this.MAX_HISTORY_CHECK]
      );

      if (rows && rows.length > 0) {
        const idsToDelete = rows.map((r: any) => r.id);
        const placeholders = idsToDelete.map(() => '?').join(',');
        await pool.query(
          `DELETE FROM password_history WHERE id IN (${placeholders})`,
          idsToDelete
        );
      }
    } catch (err) {
      console.error('[PasswordService] Error recording password history:', err);
    }
  }

  /**
   * Check account lockout status for a user
   */
  public static async isAccountLocked(user: any): Promise<{ locked: boolean; remainingSeconds: number }> {
    if (!user) return { locked: false, remainingSeconds: 0 };

    if (user.lockedUntil) {
      const lockUntil = new Date(user.lockedUntil).getTime();
      const now = Date.now();
      if (now < lockUntil) {
        const remainingSeconds = Math.ceil((lockUntil - now) / 1000);
        return { locked: true, remainingSeconds };
      }
    }

    return { locked: false, remainingSeconds: 0 };
  }

  /**
   * Record a failed login attempt and apply progressive lockout if threshold reached
   */
  public static async recordFailedLogin(userId?: string): Promise<{ locked: boolean; remainingSeconds: number }> {
    if (!userId) return { locked: false, remainingSeconds: 0 };

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, failedLoginAttempts: true },
      });

      if (!user) return { locked: false, remainingSeconds: 0 };

      const attempts = (user.failedLoginAttempts || 0) + 1;
      let lockedUntil: Date | null = null;
      let remainingSeconds = 0;

      if (attempts >= this.MAX_FAILED_ATTEMPTS) {
        // Multiplier based on how many times attempts exceeded 5
        const multiplier = Math.min(Math.floor(attempts / this.MAX_FAILED_ATTEMPTS), 4);
        const duration = this.LOCKOUT_DURATION_MS * multiplier;
        lockedUntil = new Date(Date.now() + duration);
        remainingSeconds = Math.ceil(duration / 1000);
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: attempts,
          lastFailedLoginAt: new Date(),
          lockedUntil,
        },
      });

      return {
        locked: Boolean(lockedUntil),
        remainingSeconds,
      };
    } catch (err) {
      console.error('[PasswordService] Error recording failed login:', err);
      return { locked: false, remainingSeconds: 0 };
    }
  }

  /**
   * Reset failed login counter upon successful login
   */
  public static async resetFailedLogins(userId: string): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastFailedLoginAt: null,
        },
      });
    } catch (err) {
      console.error('[PasswordService] Error resetting failed logins:', err);
    }
  }
}
