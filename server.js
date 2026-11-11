/**
 * BSC Textiles HRMS — Unified Production Server Entrypoint
 * Designed for Hostinger Cloud/Web Hosting (LiteSpeed / hPanel Node.js Application)
 *
 * Coordinates:
 * 1. Backend Core Express API + Socket.IO (starts on BACKEND_PORT, default 4000)
 * 2. Next.js Production Web Server (binds to process.env.PORT assigned by Hostinger, default 3000)
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const dns = require('dns');
const { fork } = require('child_process');

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

// Load environment variables from .env
require('dotenv').config();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT, 10) || 4000;

console.log('================================================================');
console.log('🚀 BSC TEXTILES HRMS — BOOTING UNIFIED PRODUCTION SERVER');
console.log(`🌐 Web Server Port: ${PORT}`);
console.log(`📡 Backend API Port: ${BACKEND_PORT}`);
console.log('================================================================');

// 1. Launch Backend API Service
let backendProcess = null;
let isShuttingDown = false;
let restartAttempts = 0;
const backendEntry = path.resolve(__dirname, 'backend/dist/index.js');

function probeBackendActive(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host, timeout: 800 });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function startBackend() {
  if (isShuttingDown) return;
  if (!fs.existsSync(backendEntry)) {
    console.warn(`[Hostinger Server] Backend build not found at ${backendEntry}. Backend API was not spawned.`);
    return;
  }

  const isAlreadyActive = await probeBackendActive(BACKEND_PORT);
  if (isAlreadyActive) {
    console.log(`[Hostinger Server] Backend API is already active on port ${BACKEND_PORT}. Serving requests via active instance.`);
    return;
  }

  console.log(`[Hostinger Server] Starting backend API process from ${backendEntry}...`);
  backendProcess = fork(backendEntry, [], {
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  });

  backendProcess.on('error', (err) => {
    console.error('[Hostinger Server] Backend process encountered an error:', err);
  });

  backendProcess.on('exit', async (code, signal) => {
    backendProcess = null;
    if (isShuttingDown) {
      console.log(`[Hostinger Server] Backend process stopped during server shutdown.`);
      return;
    }

    // Always check if port 4000 is still served by another companion worker
    const stillRunning = await probeBackendActive(BACKEND_PORT);
    if (stillRunning) {
      console.log(`[Hostinger Server] Port ${BACKEND_PORT} is actively served by another process. Standing by.`);
      return;
    }

    // Port 4000 is down! We must respawn it
    restartAttempts++;
    const delay = Math.min(10000, 1000 * Math.min(restartAttempts, 5));
    console.warn(`[Hostinger Server] Backend API on port ${BACKEND_PORT} stopped (code ${code}, signal ${signal}). Reviving in ${(delay / 1000).toFixed(1)}s (attempt ${restartAttempts})...`);
    setTimeout(() => {
      startBackend();
    }, delay);
  });
}

// Active watchdog: checks every 10s that port 4000 is alive; if dead, revives it immediately
setInterval(async () => {
  if (isShuttingDown) return;
  const isAlive = await probeBackendActive(BACKEND_PORT);
  if (!isAlive && !backendProcess) {
    console.warn(`[Hostinger Server] Watchdog: Port ${BACKEND_PORT} is inactive. Reviving backend API...`);
    startBackend();
  }
}, 10000).unref();

// 2. Launch Next.js Web Frontend
const next = require('next');
const frontendDir = path.resolve(__dirname, 'frontend');

const app = next({
  dev: false,
  dir: frontendDir,
  hostname: '0.0.0.0',
  port: PORT,
});

const handle = app.getRequestHandler();

async function bootServer() {
  await startBackend();

  // Wait up to 6 seconds for backend on port 4000 to be verified listening before accepting web traffic
  for (let i = 0; i < 30; i++) {
    const ready = await probeBackendActive(BACKEND_PORT);
    if (ready) {
      console.log(`[Hostinger Server] ✅ Backend API is actively listening on port ${BACKEND_PORT}.`);
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  await app.prepare();

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  server.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
      console.error('[Hostinger Server] Failed to bind web server port:', err);
      throw err;
    }
    console.log(`✅ HRMS Web Application is live and listening on port ${PORT}`);
    console.log(`🔗 Primary URL: ${process.env.FRONTEND_URL || `http://localhost:${PORT}`}`);
  });

  // Graceful Shutdown
  const shutdown = (signal) => {
    console.log(`\n[Hostinger Server] Received ${signal}. Initiating graceful shutdown...`);
    isShuttingDown = true;
    server.close(() => {
      console.log('[Hostinger Server] HTTP web server closed.');
      if (backendProcess && !backendProcess.killed) {
        console.log('[Hostinger Server] Terminating backend API process...');
        backendProcess.kill('SIGTERM');
        const killTimer = setTimeout(() => {
          try {
            backendProcess.kill('SIGKILL');
          } catch (e) {}
          process.exit(0);
        }, 3500);
        backendProcess.on('exit', () => {
          clearTimeout(killTimer);
          console.log('[Hostinger Server] Backend API process terminated cleanly.');
          process.exit(0);
        });
        return;
      }
      process.exit(0);
    });

    // Force terminate if graceful shutdown hangs
    setTimeout(() => {
      console.error('[Hostinger Server] Force terminating after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootServer().catch((err) => {
  console.error('[Hostinger Server] Fatal error booting server:', err);
  if (backendProcess) backendProcess.kill('SIGTERM');
  process.exit(1);
});

