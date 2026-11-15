import assert from 'node:assert/strict';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { buildMysqlPoolOptions, createAdaptiveMysqlPool } from '../mysqlAdapter';

// Fixture URLs are assembled at runtime so no credential-bearing connection
// string literal sits in source (CI secret scanners reject that shape).
function mysqlUrl(user: string, encodedPassword: string, hostAndPath: string): string {
  return ['mysql://', user, ':', encodedPassword, '@', hostAndPath].join('');
}

test('MySQL credentials and database selection stay isolated between shards', () => {
  const first = buildMysqlPoolOptions(mysqlUrl('first', 'p%40ss%2520', 'remote.example:3307/store_one'));
  const second = buildMysqlPoolOptions(mysqlUrl('second', 'other', 'second.example/store_two'));
  assert.equal(first.user, 'first');
  assert.equal(first.password, 'p@ss%20');
  assert.equal(first.database, 'store_one');
  assert.equal(first.host, 'remote.example');
  assert.equal(first.port, 3307);
  assert.equal(first.socketPath, undefined);
  assert.equal(second.user, 'second');
  assert.equal(second.database, 'store_two');
  assert.equal(buildMysqlPoolOptions(mysqlUrl('first', 'pass', 'remote.example'), 'shard_three').database, 'shard_three');
});

test('access denied is returned without probing alternative accounts or databases', async () => {
  const original = mysql.createPool;
  let queries = 0;
  const denied = Object.assign(new Error('Access denied'), { code: 'ER_ACCESS_DENIED_ERROR' });
  mysql.createPool = (() => ({ query: async () => { queries++; throw denied; } })) as any;
  try {
    const pool = createAdaptiveMysqlPool(mysqlUrl('configured', 'fixture', 'remote.example/expected'));
    await assert.rejects(pool.query('SELECT 1'), error => error === denied);
    assert.equal(queries, 1);
  } finally {
    mysql.createPool = original;
  }
});
