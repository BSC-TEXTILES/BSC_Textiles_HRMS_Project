/**
 * RBAC correctness suite.
 *
 * Covers the rules the access-control screens depend on: the legacy
 * none|view|edit ladder staying in step with the new action booleans, the
 * union of grants across roles, the legacy `'ALL'` wildcard (the bug that made
 * every non-SUPER_ADMIN demo account 403 on all 141 `authorize('VIEW')`
 * routes), and the seeded default matrix matching the specification.
 *
 *   npm run test:rbac                 # unit + database integration
 *   RBAC_TEST_UNIT_ONLY=1 npm run test:rbac   # skip anything needing MySQL
 *
 * The database group is read-only: it resolves real users and role rows but
 * writes nothing.
 */
import assert from 'node:assert/strict';
import { pool } from '../nativeDb.js';
import {
  RBAC_ACTIONS,
  actionsToAccessLevel,
  canAccess,
  grantForModule,
  impliedRoleName,
  invalidateAccessCaches,
  isWidgetVisible,
  resolveUserAccess,
  type EffectiveAccess,
  type RbacAction,
} from '../services/accessControl.js';
import {
  deriveAccessLevel,
  entriesFromLegacyLevels,
  legacyTokensForAccess,
} from '../services/rbacAdmin.js';

type Case = { group: string; name: string; run: () => Promise<void> };
const cases: Case[] = [];
const test = (group: string, name: string, run: () => Promise<void>) => cases.push({ group, name, run });

function blankAccess(overrides: Partial<EffectiveAccess> = {}): EffectiveAccess {
  return {
    userId: 'u-test',
    roleIds: [],
    roles: [],
    source: 'rbac',
    unrestricted: false,
    canManageRoles: false,
    canAssignModuleAccess: false,
    canManageCredentials: false,
    grants: {},
    widgets: [],
    legacyPermissions: [],
    ...overrides,
  };
}

function grant(module: string, enabled: boolean, actions: RbacAction[]) {
  return { module, enabled, actions: Object.fromEntries(RBAC_ACTIONS.map((a) => [a, actions.includes(a)])) as Record<RbacAction, boolean> };
}

// ─── A. Ladder translation ──────────────────────────────────────────────────

test('ladder', 'view grants only View, and maps back to "view"', async () => {
  const entry = { module: 'PAYROLL', enabled: true, actions: { ...Object.fromEntries(RBAC_ACTIONS.map((a) => [a, false])), view: true } as Record<RbacAction, boolean> };
  assert.equal(deriveAccessLevel(entry), 'view');
  assert.equal(actionsToAccessLevel(entry), 'view');
});

test('ladder', 'any write action maps to "edit"', async () => {
  for (const action of RBAC_ACTIONS.filter((a) => a !== 'view')) {
    const entry = grant('PAYROLL', true, ['view', action]);
    assert.equal(deriveAccessLevel(entry), 'edit', `${action} should rank as edit`);
  }
});

test('ladder', 'a grant without View is "none" — writes cannot outlive visibility', async () => {
  const entry = { module: 'PAYROLL', enabled: true, actions: { ...Object.fromEntries(RBAC_ACTIONS.map((a) => [a, true])), view: false } as Record<RbacAction, boolean> };
  assert.equal(deriveAccessLevel(entry), 'none');
});

test('ladder', 'entriesFromLegacyLevels expands edit to the full action set', async () => {
  const [none, view, edit] = entriesFromLegacyLevels({ A: 'none', B: 'view', C: 'edit' });
  assert.equal(none.enabled, false);
  assert.equal(RBAC_ACTIONS.filter((a) => view.actions[a]).length, 1);
  assert.equal(RBAC_ACTIONS.filter((a) => edit.actions[a]).length, RBAC_ACTIONS.length);
  assert.equal(edit.module, 'C');
});

test('ladder', 'legacy levels survive a round trip through the booleans', async () => {
  const levels = { DASHBOARD: 'edit', PAYROLL: 'view', STORES: 'none' } as Record<string, string>;
  for (const entry of entriesFromLegacyLevels(levels)) {
    assert.equal(deriveAccessLevel(entry), levels[entry.module], entry.module);
  }
});

// ─── B. Legacy permission tokens ────────────────────────────────────────────

test('legacy', 'each action contributes exactly its historical token', async () => {
  assert.deepEqual(legacyTokensForAccess([grant('X', true, ['view'])]), ['VIEW']);
  assert.deepEqual(legacyTokensForAccess([grant('X', true, ['view', 'create'])]), ['ADD', 'VIEW']);
  assert.deepEqual(legacyTokensForAccess([grant('X', true, ['view', 'update'])]), ['EDIT', 'VIEW']);
  assert.deepEqual(legacyTokensForAccess([grant('X', true, ['view', 'delete', 'export', 'approve'])]).sort(), [
    'APPROVE',
    'DELETE',
    'EXPORT',
    'VIEW',
  ]);
});

test('legacy', 'tokens are deduplicated across modules', async () => {
  const tokens = legacyTokensForAccess([grant('A', true, ['view', 'edit']), grant('B', true, ['view', 'edit'])]);
  assert.deepEqual(tokens, ['EDIT', 'VIEW']);
});

test('legacy', 'a disabled grant contributes nothing', async () => {
  assert.deepEqual(legacyTokensForAccess([grant('A', false, ['view', 'create', 'delete'])]), []);
});

// ─── C. Resolution rules ────────────────────────────────────────────────────

test('resolve', "legacy 'ALL' is a wildcard, not an ordinary permission token", async () => {
  const access = blankAccess({ source: 'legacy', unrestricted: true, legacyPermissions: ['ALL'] });
  assert.equal(canAccess(access, 'PAYROLL', 'view'), true);
  assert.equal(canAccess(access, 'ANY_UNKNOWN_MODULE', 'delete'), true);
});

test('resolve', 'a legacy user without the wildcard is limited to their tokens', async () => {
  const access = blankAccess({ source: 'legacy', legacyPermissions: ['VIEW'] });
  assert.equal(canAccess(access, 'PAYROLL', 'view'), true);
  assert.equal(canAccess(access, 'PAYROLL', 'create'), false);
  assert.equal(canAccess(access, 'PAYROLL', 'delete'), false);
});

test('resolve', 'an RBAC user with no grant on a module is denied', async () => {
  const access = blankAccess({ grants: { PAYROLL: grant('PAYROLL', true, ['view']) } });
  assert.equal(canAccess(access, 'PAYROLL', 'view'), true);
  assert.equal(canAccess(access, 'SALARY_CADRES', 'view'), false);
});

test('resolve', 'grants union across roles — a second role can only add', async () => {
  const single = blankAccess({ grants: { PAYROLL: grant('PAYROLL', true, ['view']) } });
  const merged = blankAccess({
    grants: { PAYROLL: grant('PAYROLL', true, ['view', 'approve', 'export']) },
    roleIds: ['role_hr', 'role_admin'],
  });
  assert.equal(canAccess(single, 'PAYROLL', 'approve'), false);
  for (const action of ['view', 'approve', 'export'] as RbacAction[]) {
    assert.equal(canAccess(merged, 'PAYROLL', action), true, action);
  }
});

test('resolve', 'an enabled=false grant denies every action even when booleans are set', async () => {
  const access = blankAccess({ grants: { PAYROLL: { ...grant('PAYROLL', false, RBAC_ACTIONS as unknown as RbacAction[]), enabled: false } } });
  for (const action of RBAC_ACTIONS) assert.equal(canAccess(access, 'PAYROLL', action), false, action);
});

test('resolve', 'Super Admin is unrestricted without per-module rows', async () => {
  const access = blankAccess({ unrestricted: true, canManageRoles: true, canAssignModuleAccess: true, roles: ['SUPER_ADMIN'] });
  assert.equal(canAccess(access, 'MODULE_ACCESS', 'approve'), true);
  assert.equal(grantForModule(access, 'SOMETHING_NEW').actions.delete, true);
});

test('resolve', 'widget visibility follows the union and ignores inactive rows', async () => {
  const access = blankAccess({ widgets: ['TOTAL_EMPLOYEES', 'PUNCH_LEDGER'] });
  assert.equal(isWidgetVisible(access, 'PUNCH_LEDGER'), true);
  assert.equal(isWidgetVisible(access, 'PAYROLL_RUN'), false);
  assert.equal(isWidgetVisible(blankAccess({ unrestricted: true }), 'ANYTHING'), true);
});

test('resolve', 'a legacy enum role maps to the spec role it behaves as', async () => {
  assert.equal(impliedRoleName('SUPER_ADMIN'), 'SUPER_ADMIN');
  assert.equal(impliedRoleName('HR_EXECUTIVE'), 'HR');
  assert.equal(impliedRoleName('PAYROLL_MANAGER'), 'HR');
  assert.equal(impliedRoleName('TEAM_LEAD'), 'FLOOR_MANAGER');
  assert.equal(impliedRoleName('SALES_EMPLOYEE'), 'EMPLOYEE');
  assert.equal(impliedRoleName(undefined), 'EMPLOYEE');
});

// ─── D. Database integration ────────────────────────────────────────────────

const unitOnly = process.env.RBAC_TEST_UNIT_ONLY === '1';

test('db', 'migration 030 registered modules, widgets and the five default roles', async () => {
  const [modules]: any = await pool.query('SELECT COUNT(*) AS n FROM `module`');
  const [widgets]: any = await pool.query('SELECT COUNT(*) AS n FROM `dashboard_widget`');
  const [roles]: any = await pool.query(
    "SELECT COUNT(*) AS n FROM `role` WHERE `id` IN ('role_super_admin','role_admin','role_hr','role_floor_manager','role_employee')"
  );
  assert.ok(Number(modules[0].n) >= 38, `expected ≥38 modules, got ${modules[0].n}`);
  assert.ok(Number(widgets[0].n) >= 17, `expected ≥17 widgets, got ${widgets[0].n}`);
  assert.equal(Number(roles[0].n), 5, 'the four spec roles plus SUPER_ADMIN must exist');
});

test('db', 'spec §5 — Floor Manager may delete only on tasks and shifts', async () => {
  const [rows]: any = await pool.query(
    'SELECT `module` FROM `rolepermission` WHERE `roleId` = ? AND `can_delete` = 1 ORDER BY `module`',
    ['role_floor_manager']
  );
  assert.deepEqual(
    rows.map((r: any) => r.module),
    ['SHIFT_SCHEDULING', 'TASK_ASSIGNMENT']
  );
});

test('db', 'spec §5 — Employee may create only Apply Leave, and edit only My Profile', async () => {
  const [creates]: any = await pool.query(
    'SELECT `module` FROM `rolepermission` WHERE `roleId` = ? AND `can_create` = 1',
    ['role_employee']
  );
  const [edits]: any = await pool.query(
    'SELECT `module` FROM `rolepermission` WHERE `roleId` = ? AND `can_edit` = 1',
    ['role_employee']
  );
  assert.deepEqual(creates.map((r: any) => r.module), ['APPLY_LEAVE']);
  assert.deepEqual(edits.map((r: any) => r.module), ['MY_PROFILE']);
});

test('db', 'spec §5 — the eight HR modules carry the full action set', async () => {
  const [rows]: any = await pool.query(
    `SELECT \`module\`, \`can_view\`, \`can_create\`, \`can_edit\`, \`can_delete\`
       FROM \`rolepermission\` WHERE \`roleId\` = 'role_hr' AND \`module\` IN
       ('EMPLOYEE_RECORDS','RECRUITMENT','ATTENDANCE','LEAVE_MANAGEMENT','PAYROLL','PERFORMANCE_REVIEWS','DOCUMENTS','HR_REPORTS')`
  );
  assert.equal(rows.length, 8, 'all eight spec modules must be granted to HR');
  for (const row of rows) {
    for (const column of ['can_view', 'can_create', 'can_edit', 'can_delete']) {
      assert.equal(Number(row[column]), 1, `${row.module} missing ${column}`);
    }
  }
});

test('db', 'Admin assigns module access but never owns the role lifecycle', async () => {
  const access = await resolveUserAccessFor('role_admin', 'ADMIN');
  assert.equal(access.canAssignModuleAccess, true);
  assert.equal(access.canManageRoles, false);
  assert.equal(canAccess(access, 'MODULE_ACCESS', 'edit'), true);
  assert.equal(canAccess(access, 'ROLES_PERMISSIONS', 'create'), false, 'Admin may not invent roles');
  assert.equal(canAccess(access, 'ROLES_PERMISSIONS', 'view'), true);
});

test('db', 'Super Admin can manage roles and sees every module', async () => {
  const access = await resolveUserAccessFor('role_super_admin', 'SUPER_ADMIN');
  assert.equal(access.canManageRoles, true);
  assert.equal(access.unrestricted, true);
  const [modules]: any = await pool.query('SELECT `key` FROM `module`');
  for (const module of modules) {
    assert.equal(canAccess(access, module.key, 'view'), true, module.key);
  }
});

test('db', 'an Employee account resolves to RBAC and sees only its own modules', async () => {
  const [users]: any = await pool.query("SELECT `id`, `role`, `permissions` FROM `user` WHERE `email` = 'rbac.employee@bsctextiles.com' LIMIT 1");
  if (!users?.length) return;
  const access = await resolveUserAccess(users[0].id, users[0].role, users[0].permissions as string[]);
  assert.equal(access.source, 'rbac', 'a role assignment must outrank the legacy ["ALL"] set');
  assert.equal(access.unrestricted, false);
  assert.equal(access.canManageRoles, false);
  assert.equal(canAccess(access, 'MY_ATTENDANCE', 'view'), true);
  assert.equal(canAccess(access, 'APPLY_LEAVE', 'create'), true);
  assert.equal(canAccess(access, 'APPLY_LEAVE', 'delete'), false);
  assert.equal(canAccess(access, 'PAYROLL', 'view'), false, 'an employee must not reach payroll');
  assert.equal(canAccess(access, 'USERS', 'view'), false);
});

test('db', 'the stale ["ALL"] on a role-assigned account no longer grants anything', async () => {
  const [users]: any = await pool.query("SELECT `id` FROM `user` WHERE `email` = 'vikram.singh@bsctextiles.com' LIMIT 1");
  if (!users?.length) return;
  await pool.query("UPDATE `user` SET `permissions` = JSON_ARRAY('ALL') WHERE `id` = ?", [users[0].id]);
  invalidateAccessCaches(users[0].id);
  const access = await resolveUserAccess(users[0].id, 'HR_MANAGER', ['ALL']);
  assert.equal(access.source, 'rbac');
  assert.equal(access.unrestricted, false, 'RBAC must win over a stale wildcard');
  assert.equal(canAccess(access, 'PAYROLL', 'view'), true, 'granted to HR');
  assert.equal(canAccess(access, 'MODULE_ACCESS', 'edit'), false, 'not granted to HR');
});

test('db', 'rolepermission.accessLevel never disagrees with the action booleans', async () => {
  const [rows]: any = await pool.query(
    `SELECT \`module\`, \`roleId\`, \`accessLevel\`, \`enabled\`, \`can_view\`,
            (\`can_create\` OR \`can_edit\` OR \`can_update\` OR \`can_delete\` OR \`can_export\` OR \`can_approve\`) AS writes
       FROM \`rolepermission\``
  );
  for (const row of rows) {
    const expected = !row.enabled || !row.can_view ? 'none' : Number(row.writes) ? 'edit' : 'view';
    assert.equal(row.accessLevel, expected, `${row.roleId}/${row.module}: ${row.accessLevel} ≠ ${expected}`);
  }
});

/** Resolves a synthetic user that holds exactly one role, without writing rows. */
async function resolveUserAccessFor(roleId: string, legacyRole: string): Promise<EffectiveAccess> {
  const [permRows]: any = await pool.query(
    `SELECT \`module\`, \`enabled\`, \`can_view\`, \`can_create\`, \`can_edit\`, \`can_update\`,
            \`can_delete\`, \`can_export\`, \`can_approve\` FROM \`rolepermission\` WHERE \`roleId\` = ?`,
    [roleId]
  );
  const grants: EffectiveAccess['grants'] = {};
  for (const row of permRows || []) {
    grants[row.module] = {
      module: row.module,
      enabled: Boolean(row.enabled),
      actions: Object.fromEntries(RBAC_ACTIONS.map((a) => [a, Boolean(row[`can_${a}`])])) as Record<RbacAction, boolean>,
    };
  }
  const [widgetRows]: any = await pool.query(
    `SELECT w.\`key\` FROM \`role_widget\` rw JOIN \`dashboard_widget\` w ON w.\`id\` = rw.\`widgetId\`
      WHERE rw.\`roleId\` = ? AND rw.\`visible\` = 1`,
    [roleId]
  );
  return {
    userId: `synthetic-${roleId}`,
    roleIds: [roleId],
    roles: [roleId.replace('role_', '').toUpperCase()],
    source: 'rbac',
    unrestricted: roleId === 'role_super_admin',
    canManageRoles: roleId === 'role_super_admin',
    canAssignModuleAccess: roleId === 'role_super_admin' || roleId === 'role_admin',
    canManageCredentials: roleId === 'role_admin',
    grants,
    widgets: (widgetRows || []).map((r: any) => r.key),
    legacyPermissions: legacyTokensForAccess(Object.values(grants)),
  };
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function databaseReachable(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name IN ('module','role_widget','rolepermission')`
    );
    return Number(rows[0]?.n || 0) === 3;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  const withDatabase = !unitOnly && (await databaseReachable());
  console.log('================================================================');
  console.log('🧪 RBAC CORRECTNESS SUITE');
  console.log(`   ${withDatabase ? 'unit + database integration' : unitOnly ? 'unit only (RBAC_TEST_UNIT_ONLY=1)' : 'unit only — no database reachable'}`);
  console.log('================================================================\n');

  let passed = 0;
  let skipped = 0;
  const failures: Array<{ group: string; name: string; error: string }> = [];
  let currentGroup = '';

  for (const testCase of cases) {
    if (!withDatabase && testCase.group === 'db') {
      skipped++;
      continue;
    }
    if (testCase.group !== currentGroup) {
      currentGroup = testCase.group;
      console.log(`\n▶ ${currentGroup}`);
    }
    const started = Date.now();
    try {
      await testCase.run();
      passed++;
      console.log(`  ✔ ${testCase.name} (${Date.now() - started}ms)`);
    } catch (err: any) {
      const errDetail = err?.stack || err?.message || String(err);
      failures.push({ group: testCase.group, name: testCase.name, error: errDetail });
      console.log(`  ✖ ${testCase.name}`);
      console.log(`      ${errDetail}`);
      const encodedMsg = errDetail.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
      console.log(`::error title=RBAC Failed [${testCase.group}: ${testCase.name}]::${encodedMsg}`);
    }
  }

  await pool.end().catch(() => undefined);

  console.log('\n----------------------------------------------------------------');
  console.log(`Total: ${cases.length}   Passed: ${passed}   Failed: ${failures.length}   Skipped: ${skipped}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  · [${failure.group}] ${failure.name}\n    ${failure.error}`);
    console.log('----------------------------------------------------------------');
    process.exit(1);
  }
  console.log('🎉 All RBAC correctness tests passed.');
  console.log('----------------------------------------------------------------');
  process.exit(0);
}

run().catch((err) => {
  const errDetail = err?.stack || err?.message || String(err);
  const encodedMsg = errDetail.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error title=RBAC Runner Crash::${encodedMsg}`);
  console.error('Test runner failed:', err);
  process.exit(1);
});
