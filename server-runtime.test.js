const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { isBackendRequest } = require('./server-routing');

test('session, device and health requests reach Express; NextAuth and frontend APIs reach Next', () => {
  for (const url of ['/api/session/status', '/api/session/login', '/api/session/consent?x=1', '/api/health', '/iclock/cdata', '/.well-known/jwks.json']) {
    assert.equal(isBackendRequest(url), true, url);
  }
  for (const url of ['/login', '/_next/static/app.js', '/api/auth/session', '/api/auth/callback/credentials', '/api/presence/live-floor', '/api/attendance/punches/detail']) {
    assert.equal(isBackendRequest(url), false, url);
  }
});

test('unified startup binds before loading frameworks and uses no child process or second listener', async () => {
  let bound = false;
  let requestHandler;
  let deferred;
  let backendRequests = 0;
  let frontendRequests = 0;
  const server = {
    listen() { assert.equal(bound, false); bound = true; },
    on() {}, close() {},
  };
  const context = {
    __dirname, console,
    process: { env: { PORT: '4567' }, exit() { assert.fail('Unexpected process exit'); } },
    setImmediate(fn) { deferred = fn; },
    require(name) {
      if (name === 'node:http') return { createServer(fn) { requestHandler = fn; return server; } };
      if (name === 'node:path') return require('node:path');
      if (name === './server-routing') return { isBackendRequest };
      if (name === 'dotenv') return { config() {} };
      assert.ok(bound, 'listener must be bound before framework loading');
      if (name === './backend/dist/index.js') {
        assert.equal(context.__HRMS_HTTP_SERVER, server);
        return { app() { backendRequests++; } };
      }
      if (name === 'next') return () => ({ prepare: async () => {}, getRequestHandler: () => async () => { frontendRequests++; } });
      assert.fail('Unexpected dependency: ' + name);
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./server'), 'utf8'), context);
  let status;
  requestHandler({ url: '/api/session/status' }, { writeHead(code) { status = code; }, end() {} });
  assert.equal(status, 503);
  await deferred();
  assert.equal(context.process.env.API_URL, 'http://127.0.0.1:4567/api');
  requestHandler({ url: '/api/session/status' }, {});
  requestHandler({ url: '/api/auth/session' }, {});
  assert.equal(backendRequests, 1);
  assert.equal(frontendRequests, 1);
});
