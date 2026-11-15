import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootstrapDatabaseSchema, splitSqlStatements, type BootstrapConnection } from '../services/schemaBootstrap';

function fakeDatabaseDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrms-schema-'));
  fs.writeFileSync(path.join(dir, 'schema.sql'), 'CREATE TABLE `user` (id INT);');
  fs.mkdirSync(path.join(dir, 'migrations'));
  fs.writeFileSync(path.join(dir, 'migrations', '001_a.sql'), 'ALTER TABLE `user` ADD x INT;');
  fs.writeFileSync(path.join(dir, 'migrations', '002_b.sql'), 'ALTER TABLE `user` ADD y INT;');
  return dir;
}

function fakeConnection(existingTables: string[], lockAcquired = 1) {
  const executed: string[] = [];
  let destroyed = false;
  const conn: BootstrapConnection = {
    async query(sql: string) {
      executed.push(sql);
      if (sql.includes('GET_LOCK')) return [[{ acquired: lockAcquired }]];
      if (sql.includes('information_schema.TABLES')) return [existingTables.map((name) => ({ name }))];
      if (sql.startsWith('SELECT id FROM _migrations')) return [[]];
      return [[]];
    },
    destroy() { destroyed = true; },
  };
  return { conn, executed, isDestroyed: () => destroyed };
}

test('empty database receives the baseline and every migration', async () => {
  const { conn, executed, isDestroyed } = fakeConnection([]);
  const outcome = await bootstrapDatabaseSchema(async () => conn, { databaseDir: fakeDatabaseDir(), log: () => {} });
  assert.deepEqual(outcome, { status: 'installed', applied: 2, skipped: 0 });
  assert.ok(executed.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS `user`')));
  assert.ok(executed.some((sql) => sql.includes('ADD y INT')));
  assert.ok(executed.some((sql) => sql.includes('RELEASE_LOCK')));
  assert.equal(isDestroyed(), true);
});

test('populated database without a migration ledger is left untouched', async () => {
  const { conn, executed, isDestroyed } = fakeConnection(['customers', 'orders']);
  const outcome = await bootstrapDatabaseSchema(async () => conn, { databaseDir: fakeDatabaseDir(), log: () => {} });
  assert.equal(outcome.status, 'skipped');
  assert.equal(executed.some((sql) => /CREATE TABLE|ALTER TABLE/.test(sql)), false);
  assert.equal(isDestroyed(), true);
});

test('partial install with a ledger is completed', async () => {
  const { conn } = fakeConnection(['_migrations', 'user']);
  const outcome = await bootstrapDatabaseSchema(async () => conn, { databaseDir: fakeDatabaseDir(), log: () => {} });
  assert.equal(outcome.status, 'installed');
});

test('a concurrent install holding the lock is not duplicated', async () => {
  const { conn, executed } = fakeConnection([], 0);
  const outcome = await bootstrapDatabaseSchema(async () => conn, { databaseDir: fakeDatabaseDir(), log: () => {} });
  assert.equal(outcome.status, 'skipped');
  assert.equal(executed.some((sql) => sql.includes('CREATE TABLE')), false);
});

test('missing database directory skips without connecting', async () => {
  let connected = false;
  const outcome = await bootstrapDatabaseSchema(async () => { connected = true; throw new Error('unused'); }, { databaseDir: null });
  assert.equal(outcome.status, 'skipped');
  assert.equal(connected, false);
});

test('statement splitter keeps procedure bodies whole', () => {
  const sql = 'DELIMITER //\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END //\nDELIMITER ;\nSELECT 3;';
  assert.equal(splitSqlStatements(sql).length, 2);
});
