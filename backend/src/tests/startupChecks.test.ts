import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runStartupChecks } from '../services/startupChecks';

test('denied database prevents dependent startup work', async () => {
  let calls = 0;
  const denied = Object.assign(new Error('denied'), { code: 'ER_ACCESS_DENIED_ERROR' });
  await assert.rejects(runStartupChecks(async () => { throw denied; }, [
    { name: 'worker', run: async () => { calls++; } },
  ]), error => error === denied);
  assert.equal(calls, 0);
});

test('startup reports failed tasks while allowing independent tasks to finish', async () => {
  const warnings: string[] = [];
  let completed = false;
  const failures = await runStartupChecks(async () => {}, [
    { name: 'schema', run: async () => { throw Object.assign(new Error('private detail'), { code: 'ER_NO_SUCH_TABLE' }); } },
    { name: 'reference', run: async () => { completed = true; } },
  ], message => warnings.push(message));
  assert.deepEqual(failures, ['schema']);
  assert.equal(completed, true);
  assert.equal(warnings.some(message => message.includes('private detail')), false);
});
