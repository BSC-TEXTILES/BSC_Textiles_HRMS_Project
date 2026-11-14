import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { assertSessionSchema } from '../services/sessionSchema';
import { pool } from '../nativeDb';
import { saveConsent } from '../services/privacy';

after(async () => { await pool.end(); });

test('readiness rejects a database that connects but has no user table', async () => {
  await assert.rejects(assertSessionSchema(async sql => {
    if (sql.includes('`user`')) throw Object.assign(new Error('missing table'), { code: 'ER_NO_SUCH_TABLE' });
    return [[]];
  }), { code: 'ER_NO_SUCH_TABLE' });
});

test('readiness checks all required session tables', async () => {
  const checked: string[] = [];
  await assertSessionSchema(async sql => { checked.push(sql); return [[]]; });
  assert.equal(checked.length, 5);
  assert.ok(checked.some(sql => sql.includes('`cookie_consent`')));
  assert.ok(checked.includes('SELECT kid FROM `jwt_signing_key` LIMIT 0'));
  assert.ok(checked.every(sql => sql.endsWith('LIMIT 0')));
});

test('consent cookies are issued only after persistence succeeds', async () => {
  const original = pool.query;
  const events: string[] = [];
  const response = { cookie: () => events.push('cookie') };
  const request = { ip: '127.0.0.1', headers: {} };
  try {
    pool.query = (async () => { throw new Error('missing table'); }) as any;
    await assert.rejects(saveConsent(request, response, 'fixture', { analytics: true }), /missing table/);
    assert.equal(events.length, 0);
    pool.query = (async () => { events.push('persisted'); return [{ affectedRows: 1 }]; }) as any;
    const state = await saveConsent(request, response, 'fixture', { analytics: false });
    assert.equal(state.recorded, true);
    assert.deepEqual(events, ['persisted', 'cookie']);
  } finally {
    pool.query = original;
  }
});
