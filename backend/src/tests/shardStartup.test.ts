import assert from 'node:assert/strict';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { shardManager } from '../core/sharding/ShardConnectionManager';

test('failed shard registry closes pools and allows a later initialization retry', async () => {
  const original = mysql.createPool;
  let attempts = 0;
  let closed = 0;
  const denied = Object.assign(new Error('fixture denial'), { code: 'ER_ACCESS_DENIED_ERROR' });
  mysql.createPool = (() => ({
    query: async () => { attempts++; throw denied; },
    end: async () => { closed++; },
  })) as any;
  try {
    await assert.rejects(shardManager.initialize(), error => error === denied);
    assert.throws(() => shardManager.getControlPool(), /unavailable/);
    await assert.rejects(shardManager.initialize(), error => error === denied);
    assert.equal(attempts, 2);
    assert.equal(closed, 2);
  } finally {
    await shardManager.shutdown();
    mysql.createPool = original;
  }
});
