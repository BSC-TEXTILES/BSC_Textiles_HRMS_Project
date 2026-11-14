import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { GET, POST } from '../app/api/session/[...path]/route';

test('session proxy uses runtime configuration and preserves authentication semantics', async () => {
  const previous = process.env.BACKEND_URL;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.cookie, 'bsc_access=existing');
    if (req.url === '/api/session/login') {
      let body = '';
      for await (const chunk of req) body += chunk;
      assert.deepEqual(JSON.parse(body), { identifier: 'fixture', password: 'test-only' });
      assert.equal(req.headers.origin, 'https://hrms.example');
      res.setHeader('Set-Cookie', ['bsc_access=new; HttpOnly; Path=/', 'bsc_refresh=refresh; HttpOnly; Path=/']);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ticket: 'one-use-fixture' }));
    } else if (req.url === '/api/session/refresh') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid session' }));
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ path: req.url, authenticated: false }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  process.env.BACKEND_URL = `http://127.0.0.1:${address.port}`;
  const headers = { cookie: 'bsc_access=existing', origin: 'https://hrms.example', 'content-type': 'application/json' };
  try {
    for (const path of ['status', 'consent?version=2026-10']) {
      const response = await GET(new Request(`https://hrms.example/api/session/${path}`, { headers }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).path, `/api/session/${path}`);
    }
    const login = await POST(new Request('https://hrms.example/api/session/login', {
      method: 'POST', headers, body: JSON.stringify({ identifier: 'fixture', password: 'test-only' }),
    }));
    assert.equal(login.status, 200);
    assert.equal(login.headers.getSetCookie().length, 2);
    assert.equal((await login.json()).ticket, 'one-use-fixture');
    const denied = await POST(new Request('https://hrms.example/api/session/refresh', { method: 'POST', headers }));
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'Invalid session' });
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    const unavailable = await GET(new Request('https://hrms.example/api/session/status'));
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).code, 'AUTH_SERVICE_UNAVAILABLE');
    process.env.BACKEND_URL = 'https://hrms.example';
    const loop = await GET(new Request('https://hrms.example/api/session/status'));
    assert.equal(loop.status, 503);
  } finally {
    server.close();
    if (previous === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previous;
  }
});
