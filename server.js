/** Hostinger entrypoint: one process and one HTTP/Socket.IO listener. */
const http = require('node:http');
const path = require('node:path');
const { isBackendRequest } = require('./server-routing');
require('dotenv').config({ path: path.join(__dirname, '.env') });
process.env.NODE_ENV = 'production';
const port = Number(process.env.PORT) || 3000;
let backend = null;
let handleFrontend = null;

function unavailable(res) {
  res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '5' });
  res.end(JSON.stringify({ error: 'Service starting', message: 'The service is starting. Please try again shortly.' }));
}

const server = http.createServer((req, res) => {
  if (isBackendRequest(req.url || '/')) {
    if (!backend) return unavailable(res);
    return backend.app(req, res);
  }
  if (!handleFrontend) return unavailable(res);
  Promise.resolve(handleFrontend(req, res)).catch(err => {
    console.error('[web] Request failed:', err.message);
    if (!res.headersSent) unavailable(res);
    else res.destroy();
  });
});

// Bind before loading Next or the API: Hostinger requires listen within 3 seconds.
server.listen(port, '0.0.0.0', () => console.log('[server] HTTP listener ready on port ' + port));
server.on('error', err => { console.error('[server] Listener failed:', err.message); process.exit(1); });

setImmediate(async () => {
  try {
    // Socket.IO attaches to this same listener; the API must not bind port 4000.
    globalThis.__HRMS_HTTP_SERVER = server;
    process.env.BACKEND_URL = 'http://127.0.0.1:' + port;
    process.env.API_URL = process.env.BACKEND_URL + '/api';
    backend = require('./backend/dist/index.js');
    const next = require('next');
    const web = next({ dev: false, dir: path.join(__dirname, 'frontend'), hostname: '0.0.0.0', port });
    await web.prepare();
    handleFrontend = web.getRequestHandler();
    console.log('[server] API, Socket.IO and frontend ready on one listener');
  } catch (err) {
    console.error('[server] Startup failed:', err.message);
    server.close();
    process.exit(1);
  }
});
