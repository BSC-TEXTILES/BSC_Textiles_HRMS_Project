/**
 * Role-based access control demo dataset.
 *
 * Creates one signed-in account per spec role (Admin, HR, Floor Manager,
 * Employee) and assigns the RBAC roles that migration 030 seeded, so the
 * governance split can be clicked through in a browser without hand-editing
 * rows. Every account shares the documented `password123` credential.
 *
 * It also back-assigns roles to the three users `seedBiometricDemo` creates.
 * Until a user has an `userrole` row they are governed by the legacy permission
 * set (`["ALL"]`), which means the matrix has no effect on them — this is the
 * step that puts them under it.
 *
 * Idempotent, additive-only: it inserts or updates the rows it owns and never
 * deletes anything.
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const uri = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';

const ACTIONS = ['view', 'create', 'edit', 'update', 'delete', 'export', 'approve'] as const;

/** role row id → the legacy `user.role` enum value that best matches it. */
const SPEC_ROLES = [
  { roleId: 'role_admin', name: 'ADMIN', legacyRole: 'ADMIN', email: 'rbac.admin@bsctextiles.com', fullName: 'Meera Iyer' },
  { roleId: 'role_hr', name: 'HR', legacyRole: 'HR_MANAGER', email: 'rbac.hr@bsctextiles.com', fullName: 'Kavita Rao' },
  {
    roleId: 'role_floor_manager',
    name: 'FLOOR_MANAGER',
    legacyRole: 'FLOOR_MANAGER',
    email: 'rbac.floor@bsctextiles.com',
    fullName: 'Suresh Kumar',
  },
  {
    roleId: 'role_employee',
    name: 'EMPLOYEE',
    legacyRole: 'SALES_EMPLOYEE',
    email: 'rbac.employee@bsctextiles.com',
    fullName: 'Anil Kumar',
  },
];

/** Existing demo users and the role each should now be governed by. */
const BACKFILL_BY_EMAIL = [
  { email: 'admin@bsctextiles.com', roleId: 'role_super_admin' },
  { email: 'vikram.singh@bsctextiles.com', roleId: 'role_hr' },
  { email: 'amit.patel@bsctextiles.com', roleId: 'role_floor_manager' },
];

const TOKEN_FOR_ACTION: Record<(typeof ACTIONS)[number], string | null> = {
  view: 'VIEW',
  create: 'ADD',
  edit: 'EDIT',
  update: 'EDIT',
  delete: 'DELETE',
  export: 'EXPORT',
  approve: 'APPROVE',
};

async function main() {
  const pool = mysql.createPool({ uri, multipleStatements: true, timezone: '+05:30' });

  console.log('================================================================');
  console.log('🔐 BSC TEXTILES HRMS — RBAC DEMO SEED');
  console.log('================================================================');

  const [roleRows]: any = await pool.query(
    `SELECT r.\`id\`, r.\`name\`, r.\`isActive\`,
            (SELECT COUNT(*) FROM \`rolepermission\` rp WHERE rp.\`roleId\` = r.\`id\` AND rp.\`enabled\` = 1) AS grants
       FROM \`role\` r`
  );
  const rolesById = new Map<string, any>(roleRows.map((row: any) => [row.id, row]));
  const missing = SPEC_ROLES.filter((spec) => !rolesById.has(spec.roleId));
  if (missing.length > 0) {
    console.error(`❌ Missing role row(s): ${missing.map((m) => m.name).join(', ')}.`);
    console.error('   Run `npm run db:migrate` first — migration 030 seeds the default roles.');
    await pool.end();
    process.exit(1);
  }

  // A union over the assigned roles, matching what the backend resolves.
  async function effectiveTokens(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const [rows]: any = await pool.query(
      `SELECT rp.\`enabled\`, rp.\`can_view\`, rp.\`can_create\`, rp.\`can_edit\`, rp.\`can_update\`,
              rp.\`can_delete\`, rp.\`can_export\`, rp.\`can_approve\`
         FROM \`rolepermission\` rp WHERE rp.\`roleId\` IN (?)`,
      [roleIds]
    );
    const tokens = new Set<string>();
    for (const row of rows || []) {
      if (!row.enabled) continue;
      for (const action of ACTIONS) {
        if (row[`can_${action}`]) {
          const token = TOKEN_FOR_ACTION[action];
          if (token) tokens.add(token);
        }
      }
    }
    return [...tokens].sort();
  }

  const [locations]: any = await pool.query('SELECT id, code FROM location ORDER BY code ASC');
  const locationId: string | null = locations?.[0]?.id ?? null;

  // Prefer an employee with no login yet, so the demo accounts do not fight the
  // biometric seed over the same employee row.
  const [employees]: any = await pool.query(
    `SELECT e.\`id\`, e.\`employeeCode\`, e.\`fullName\`, e.\`locationId\`
       FROM \`employee\` e
      WHERE e.\`id\` NOT IN (SELECT \`employeeId\` FROM \`user\` WHERE \`employeeId\` IS NOT NULL)
      ORDER BY e.\`employeeCode\` ASC LIMIT 8`
  );

  const passwordHash = await bcrypt.hash('password123', 10);
  const created: string[] = [];
  const assigned: string[] = [];

  console.log('— Spec-role accounts (password: password123)');
  for (const [index, spec] of SPEC_ROLES.entries()) {
    const id = `usr-rbac-${spec.name.toLowerCase()}`;
    const employee = employees[index % Math.max(employees.length, 1)];
    const tokens = await effectiveTokens([spec.roleId]);

    const loginId = spec.email.split('@')[0];

    await pool.query(
      `INSERT INTO user (id, loginId, email, passwordHash, fullName, role, permissions, locationId, employeeId,
                         isActive, status, accessStatus, mustChangePassword, mfaEnabled, mfaRequired,
                         emailVerifiedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', 'ACTIVE', 0, 0, 0, NOW(3), NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         loginId = VALUES(loginId), passwordHash = VALUES(passwordHash), fullName = VALUES(fullName), role = VALUES(role),
         permissions = VALUES(permissions), isActive = 1, status = 'ACTIVE', accessStatus = 'ACTIVE',
         updatedAt = NOW(3)`,
      [
        id,
        loginId,
        spec.email,
        passwordHash,
        spec.fullName,
        spec.legacyRole,
        JSON.stringify(tokens),
        employee?.locationId || locationId,
        employee?.id ?? null,
      ]
    );
    created.push(`${spec.email.padEnd(30)} ${spec.name}`);

    await pool.query(
      `INSERT INTO userrole (id, userId, roleId, createdAt) VALUES (?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE createdAt = VALUES(createdAt)`,
      [`ur-rbac-${spec.name.toLowerCase()}`, id, spec.roleId]
    );
    assigned.push(`${spec.fullName} → ${spec.name}`);
  }

  console.log('— Back-assigning roles to the biometric demo accounts');
  for (const backfill of BACKFILL_BY_EMAIL) {
    const [users]: any = await pool.query('SELECT `id`, `email`, `role` FROM `user` WHERE `email` = ? LIMIT 1', [backfill.email]);
    if (!users?.length) {
      console.log(`   · ${backfill.email} not present — skipped (run db:seed:biometric-demo first)`);
      continue;
    }
    const user = users[0];
    await pool.query(
      `INSERT INTO userrole (id, userId, roleId, createdAt) VALUES (?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE createdAt = VALUES(createdAt)`,
      [`ur-rbac-${user.id}`, user.id, backfill.roleId]
    );
    const tokens = await effectiveTokens([backfill.roleId]);
    await pool.query('UPDATE `user` SET `permissions` = ?, `updatedAt` = NOW(3) WHERE `id` = ?', [
      JSON.stringify(tokens),
      user.id,
    ]);
    assigned.push(`${user.email} → ${rolesById.get(backfill.roleId)?.name}`);
  }

  console.log('\n— Effective grants per role');
  for (const spec of SPEC_ROLES) {
    const [rows]: any = await pool.query(
      `SELECT rp.\`module\`, rp.\`can_view\`, rp.\`can_create\`, rp.\`can_edit\`, rp.\`can_delete\`, rp.\`can_export\`, rp.\`can_approve\`
         FROM \`rolepermission\` rp
        WHERE rp.\`roleId\` = ? AND rp.\`enabled\` = 1
        ORDER BY rp.\`module\` ASC`,
      [spec.roleId]
    );
    const summary = (rows || [])
      .map((row: any) => {
        const granted = ACTIONS.filter((action) => row[`can_${action}`]);
        return `${row.module}(${granted.join('+') || 'none'})`;
      })
      .join(', ');
    console.log(`   ${spec.name.padEnd(14)} ${rows.length} module(s): ${summary.slice(0, 150)}${summary.length > 150 ? '…' : ''}`);
  }

  console.log('\n----------------------------------------------------------------');
  console.log('Accounts ready (all passwords: password123)');
  for (const line of created) console.log(`   ${line}`);
  console.log(`\nRole assignments written: ${assigned.length}`);
  console.log('   Sign in as rbac.employee@… and the sidebar shows only the self-service');
  console.log('   modules; rbac.admin@… can assign module access but cannot create roles;');
  console.log('   rbac.hr@… administers people, not permissions.');
  console.log('================================================================\n');

  await pool.end();
}

main().catch((err) => {
  console.error('❌ RBAC demo seed failed:', err?.message || err);
  process.exit(1);
});
