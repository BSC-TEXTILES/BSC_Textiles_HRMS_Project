/**
 * PasswordService — Argon2id hashing, password history,
 * strength validation, and legacy bcrypt migration.
 */
import { hash, verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Pool } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';

/** Minimum password requirements */
const MIN_LENGTH = 10;
const MAX_LENGTH = 128;
const HISTORY_DEPTH = 5;

/** Common weak passwords (top-20 supplement to length/complexity rules) */
const COMMON_PASSWORDS = new Set([
  'password', '12345678', 'qwerty', 'abc12345', 'password1',
  'iloveyou', 'sunshine', 'princess', 'admin123', 'welcome1',
  'letmein', 'monkey', 'dragon', 'master', 'qwerty123',
  'password123', '1234567890', 'changeme', 'bsctextiles', 'hrms2024',
]);

export interface PasswordStrengthResult {
  valid: boolean;
  score: number;         // 0-4
  feedback: string[];
}

export class PasswordService {
  constructor(private readonly pool: Pool) {}

  // ─── Hashing ──────────────────────────────────────────────────────────
  async hashPassword(plaintext: string): Promise<string> {
    return hash(plaintext, {
      memoryCost: 19456,   // ~19 MiB
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    });
  }

  /**
   * Verify a password against a hash. Supports both argon2id and legacy bcrypt.
   * Returns `{ match, needsRehash }` so callers can transparently upgrade hashes.
   */
  async verifyPassword(
    plaintext: string,
    storedHash: string,
  ): Promise<{ match: boolean; needsRehash: boolean }> {
    // argon2id hashes start with $argon2
    if (storedHash.startsWith('$argon2')) {
      const match = await verify(storedHash, plaintext);
      return { match, needsRehash: false };
    }

    // Legacy bcrypt hash
    const match = await bcrypt.compare(plaintext, storedHash);
    return { match, needsRehash: match };   // rehash on next login
  }

  // ─── Strength Validation ─────────────────────────────────────────────
  validateStrength(password: string): PasswordStrengthResult {
    const feedback: string[] = [];
    let score = 0;

    if (password.length < MIN_LENGTH) {
      feedback.push(`Password must be at least ${MIN_LENGTH} characters`);
    } else {
      score++;
    }
    if (password.length > MAX_LENGTH) {
      feedback.push(`Password must not exceed ${MAX_LENGTH} characters`);
    }
    if (!/[A-Z]/.test(password)) {
      feedback.push('Include at least one uppercase letter');
    } else {
      score++;
    }
    if (!/[a-z]/.test(password)) {
      feedback.push('Include at least one lowercase letter');
    } else {
      score++;
    }
    if (!/\d/.test(password)) {
      feedback.push('Include at least one digit');
    } else {
      score++;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      feedback.push('Include at least one special character');
    }

    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      feedback.push('This password is too common');
      score = 0;
    }

    return {
      valid: feedback.length === 0 && score >= 3,
      score: Math.min(score, 4),
      feedback,
    };
  }

  // ─── Password History ─────────────────────────────────────────────────
  async isPasswordReused(userId: string, plaintext: string): Promise<boolean> {
    const [rows] = await this.pool.query(
      `SELECT passwordHash FROM password_history
       WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`,
      [userId, HISTORY_DEPTH],
    ) as any;

    for (const row of rows) {
      const { match } = await this.verifyPassword(plaintext, row.passwordHash);
      if (match) return true;
    }
    return false;
  }

  async recordPasswordHistory(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      'INSERT INTO password_history (id, userId, passwordHash, createdAt) VALUES (?, ?, ?, NOW(3))',
      [uuid(), userId, passwordHash],
    );

    // Prune old entries beyond HISTORY_DEPTH
    await this.pool.query(
      `DELETE FROM password_history
       WHERE userId = ? AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM password_history WHERE userId = ?
           ORDER BY createdAt DESC LIMIT ?
         ) AS keep
       )`,
      [userId, userId, HISTORY_DEPTH],
    );
  }

  // ─── Token Generation ─────────────────────────────────────────────────
  generateResetToken(): { token: string; hash: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    return { token, hash: tokenHash, expiresAt };
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
