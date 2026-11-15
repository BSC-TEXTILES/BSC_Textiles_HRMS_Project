/**
 * Provisions the baseline sign-in accounts on a database that has NO users.
 *
 * A freshly installed database otherwise has no way to sign in at all. The SQL
 * seed (`database/seeds/03_*.sql`) cannot fill that gap: its employee rows carry
 * `TEST-EMP-*` codes that the digits-only CHECK from migration 025 rejects, which
 * aborts the file before any user row is written, and its user rows leave
 * `status`/`accessStatus` at their PENDING defaults, which login refuses.
 *
 * These are the accounts the login page's quick-fill offers. Never touches a
 * database that already has a user. Disable with HRMS_SEED_BASELINE_ACCOUNTS=false.
 */
import { pool } from '../nativeDb.js';
import { PasswordService } from './passwordService.js';

const BASELINE_PASSWORD = 'password123';

const BASELINE_ACCOUNTS = [
  { id: 'usr_superadmin', loginId: 'admin', email: 'admin@bsctextiles.com', fullName: 'Super Admin', role: 'SUPER_ADMIN', roleId: 'role_super_admin' },
  { id: 'usr_rbac_hr', loginId: 'rbac.hr', email: 'rbac.hr@bsctextiles.com', fullName: 'Kavita Rao', role: 'HR_MANAGER', roleId: 'role_hr' },
  { id: 'usr_rbac_employee', loginId: 'rbac.employee', email: 'rbac.employee@bsctextiles.com', fullName: 'Anil Kumar', role: 'SALES_EMPLOYEE', roleId: 'role_employee' },
] as const;

export async function ensureBaselineAccounts(log: (message: string) => void = console.log): Promise<void> {
  if (process.env.HRMS_SEED_BASELINE_ACCOUNTS === 'false') return;

  const [[row]]: any = await pool.query('SELECT COUNT(*) AS n FROM `user`');
  if (Number(row?.n || 0) > 0) return;

  const passwordHash = await PasswordService.hashPassword(BASELINE_PASSWORD);
  for (const account of BASELINE_ACCOUNTS) {
    await pool.query(
      `INSERT IGNORE INTO \`user\`
         (id, loginId, email, passwordHash, fullName, role, isActive, status, accessStatus, mustChangePassword, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'ACTIVE', 'ACTIVE', 0, NOW(3), NOW(3))`,
      [account.id, account.loginId, account.email, passwordHash, account.fullName, account.role],
    );
    // Only link roles that exist (seeded by migrations 014/030/048).
    await pool.query(
      `INSERT IGNORE INTO \`userrole\` (id, userId, roleId, createdAt)
       SELECT ?, ?, r.id, NOW(3) FROM \`role\` r WHERE r.id = ?`,
      [`ur_${account.id}`, account.id, account.roleId],
    );
  }

  log(`[baselineAccounts] Database had no users; created ${BASELINE_ACCOUNTS.map((a) => a.email).join(', ')}.`);
  console.warn(
    '[baselineAccounts] These accounts use the shared default password. Change them after first sign-in, ' +
      'or set HRMS_SEED_BASELINE_ACCOUNTS=false to stop provisioning them on an empty database.',
  );
}
