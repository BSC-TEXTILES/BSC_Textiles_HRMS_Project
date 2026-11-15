/**
 * Creates (or, with --reset, re-credentials) a SUPER_ADMIN account.
 *
 * For a fresh production database that has no users. Run ON THE SERVER, so the
 * password is hashed with that server's PASSWORD_PEPPER:
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_LOGIN_ID=admin ADMIN_NAME="Full Name" \
 *     node backend/dist/scripts/createSuperAdmin.js
 *
 * ADMIN_PASSWORD is optional: when omitted, a random temporary password is
 * printed once and the account must change it at first sign-in.
 * Add --reset to reset the password of an existing account with that email/loginId.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

async function main(): Promise<void> {
  const { pool } = await import('../nativeDb.js');
  const { PasswordService } = await import('../services/passwordService.js');

  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const loginId = String(process.env.ADMIN_LOGIN_ID || '').trim().toLowerCase() || null;
  const fullName = String(process.env.ADMIN_NAME || 'Super Admin').trim();
  const reset = process.argv.includes('--reset');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set ADMIN_EMAIL to a valid email address.');
  if (loginId && !/^[a-z0-9._-]{3,64}$/.test(loginId)) throw new Error('ADMIN_LOGIN_ID must be 3-64 chars of a-z, 0-9, ".", "_" or "-".');

  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url') + '#9a';
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  const passwordHash = await PasswordService.hashPassword(password);

  const [existing]: any = await pool.query(
    'SELECT id, email, loginId FROM `user` WHERE LOWER(email) = ? OR (? IS NOT NULL AND LOWER(loginId) = ?) LIMIT 1',
    [email, loginId, loginId],
  );

  let userId: string;
  if (existing.length) {
    userId = existing[0].id;
    if (!reset) {
      throw new Error(`An account already exists for ${existing[0].email}. Re-run with --reset to set a new password for it.`);
    }
    await pool.query(
      `UPDATE \`user\` SET passwordHash = ?, role = 'SUPER_ADMIN', isActive = 1, status = 'ACTIVE',
              mustChangePassword = ?, failedLoginAttempts = 0, lockedUntil = NULL,
              tokenVersion = tokenVersion + 1, updatedAt = NOW(3)
        WHERE id = ?`,
      [passwordHash, generated ? 1 : 0, userId],
    );
  } else {
    userId = 'usr_' + crypto.randomBytes(12).toString('hex');
    await pool.query(
      `INSERT INTO \`user\` (id, email, loginId, passwordHash, fullName, role, isActive, status, mustChangePassword, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'SUPER_ADMIN', 1, 'ACTIVE', ?, NOW(3), NOW(3))`,
      [userId, email, loginId, passwordHash, fullName, generated ? 1 : 0],
    );
  }

  await pool.query(
    `INSERT IGNORE INTO \`userrole\` (id, userId, roleId)
     SELECT ?, ?, id FROM \`role\` WHERE id = 'role_super_admin'`,
    ['ur_' + crypto.randomBytes(12).toString('hex'), userId],
  ).catch((err: any) => console.warn(`[createSuperAdmin] RBAC role link skipped: ${err?.message || err}`));

  console.log(`[createSuperAdmin] ${existing.length ? 'Reset' : 'Created'} SUPER_ADMIN ${email}${loginId ? ` (login ID: ${loginId})` : ''}.`);
  if (generated) {
    console.log(`[createSuperAdmin] Temporary password (shown once, change it at first sign-in): ${password}`);
  }
  await (pool as any).end?.().catch?.(() => undefined);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[createSuperAdmin] Failed: ${err?.message || err}`);
    process.exit(1);
  });
