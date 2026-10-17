import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { prisma, pool } from './db.js';
import { readBiometricHealth } from './services/biometricService.js';
import { apiV1Router } from './api/v1/index.js';
import { docsRouter } from './api/docs/index.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { csrfProtection } from './middleware/csrfProtection.js';
import { globalRateLimit, ipRuleGuard, clientIpOf } from './middleware/securityGuards.js';
import { securityConfig, auditSecurityConfig, IS_PROD } from './config/security.js';
import { ensureActiveKey, signingKeyHealth } from './services/signingKeys.js';
import { redisHealth } from './services/redisStore.js';
import { cookieNames, ACCESS_COOKIE } from './services/authCookies.js';
import { verifyAccessToken } from './services/tokenService.js';
import { runRetentionPurge } from './services/privacy.js';
import { jwksHandler } from './routes/authSession.js';
import { timingMiddleware } from './middleware/timing.js';
import { errorHandler } from './middleware/errorHandler.js';
import { setupViews } from './scripts/setupViews.js';
import { setupCustodyAssets } from './scripts/setupCustodyAssets.js';
import { setupKycSchema } from './scripts/setupKycSchema.js';
import { setupEmployeeDocuments } from './scripts/setupEmployeeDocuments.js';
import { setupFormerEmployees } from './scripts/setupFormerEmployees.js';
import { setupOrganizationHubs } from './scripts/setupOrganizationHubs.js';
import { ensureEmployeeImportSchema } from './scripts/setupEmployeeImportSchema.js';
import { setupPayrollSchema } from './scripts/setupPayrollSchema.js';
import { setupLateFines } from './scripts/setupLateFines.js';
import { setupRetailOperations } from './scripts/setupRetailOperations.js';
import { setupBreaks } from './scripts/setupBreaks.js';
import { registerLocationRegistryRefresh } from './services/locationRegistry.js';
import { UserUploadService } from './services/userUploadService.js';
import { EmailNotificationService } from './services/emailNotificationService.js';

const app = express();
const httpServer = createServer(app);

// 0. Strict CORS: an explicit allowlist, credentials only for listed origins.
//    The previous handler accepted any localhost/192.168 origin and everything
//    outside production, which is precisely what a credentialed cross-origin
//    request needs to be able to read.
const allowedOrigins = new Set(securityConfig.transport.corsAllowlist);

// `next dev` is reachable as both localhost:3000 and 127.0.0.1:3000 and they are
// different origins to a browser. Only the configured one is in the allowlist,
// so the other used to be refused — correctly, but noisily (see below). Adding
// the loopback twin in development keeps a developer on 127.0.0.1 from seeing
// phantom failures; production is unaffected.
if (!IS_PROD) {
  for (const entry of [...allowedOrigins]) {
    const twin = entry.replace(/^http:\/\/localhost:/, 'http://127.0.0.1:');
    if (twin !== entry) allowedOrigins.add(twin);
  }
}

const corsOriginHandler = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (!origin) {
    // Non-browser clients (curl, service-to-service, the device connector) send
    // no Origin; the browser is the only party that enforces CORS anyway.
    return callback(null, true);
  }
  if (allowedOrigins.has(origin)) return callback(null, true);
  // Refuse by omitting the CORS headers (`allow: false`) rather than by throwing.
  // The security outcome is identical — the browser cannot read the response —
  // but throwing turned every rejected cross-origin probe into an
  // "UnhandledError" 500, which floods the error log and the security event
  // feed with what is really a routine, expected rejection.
  return callback(null, false);
};

// Behind Nginx/CDN the socket address is the proxy. `trust proxy` is set from
// TRUST_PROXY_HOPS so req.ip resolves to the real client without letting an
// arbitrary caller forge X-Forwarded-For to dodge a rate limit.
app.set('trust proxy', securityConfig.transport.trustProxyHops);

import { setSocketIO, socketIO } from './socket.js';

const io = new Server(httpServer, {
  cors: {
    origin: corsOriginHandler,
    credentials: true,
  },
});
setSocketIO(io);

export { prisma, socketIO, app, httpServer };
export default app;

// 1. High-resolution timing, latency metrics, and request correlation IDs
app.use(timingMiddleware);

// 2. Basic security headers via helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// 3. Comprehensive enterprise security headers (CSP, HSTS, X-Content-Type-Options, etc.)
app.use(securityHeaders);

app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
}));

app.use(compression());
app.use(process.env.NODE_ENV === 'production' ? morgan('combined') : morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Resolves the real client IP once, from trusted proxy hops only, so every
// guard and log line below agrees on who is calling.
app.use((req, _res, next) => {
  (req as any).clientIp = clientIpOf(req as any);
  next();
});

// 4. CSRF protection on mutating cookie requests
app.use(csrfProtection);

// 5. IP allow/deny list, then the global sliding-window limiter (Redis-backed,
//    so the limit holds across processes instead of resetting on every restart).
app.use('/api/', ipRuleGuard, globalRateLimit);
app.use('/iclock', ipRuleGuard);

// Public key set for token verification by other services. Also served at
// /api/.well-known/jwks.json for clients that only speak the API prefix.
app.get('/.well-known/jwks.json', jwksHandler);
app.get('/api/.well-known/jwks.json', jwksHandler);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', async (req, res) => {
  const [biometric, store] = await Promise.all([readBiometricHealth(), redisHealth()]);
  res.json({
    status: biometric.ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    security: {
      passwordHashing: 'argon2id+pepper',
      tokenSigning: `${securityConfig.tokens.algorithm} (kid ${signingKeyHealth().kid ?? 'uninitialised'})`,
      sharedStore: store.driver,
      mfa: 'available',
      sessionTracking: 'active',
      auditIntegrity: 'active',
      rateLimitPerSecond: securityConfig.rateLimit.globalPerSecond,
      lockout: `${securityConfig.login.maxAttempts} attempts / ${securityConfig.login.lockoutSeconds}s`,
      configWarnings: auditSecurityConfig(),
    },
    biometric,
  });
});

app.get('/api/health/email', async (req, res) => {
  try {
    const emailHealth = await EmailNotificationService.verifyConnection();
    const statusCode = emailHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      status: emailHealth.status,
      timestamp: new Date().toISOString(),
      email: emailHealth,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      email: {
        status: 'degraded',
        configured: false,
        transport: 'error',
        message: 'Internal email health check failure',
      },
    });
  }
});

// Deep readiness probe for Kubernetes / load balancers
app.get(['/ready', '/api/ready'], async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: 'connected',
      memory: process.memoryUsage(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'unready',
      timestamp: new Date().toISOString(),
      database: 'error',
      message: err.message,
    });
  }
});

import admsRouter from './routes/adms.js';
import path from 'node:path';

// Interactive OpenAPI 3.0 Documentation & Swagger Explorer
app.use('/api/docs', docsRouter);

// Hardware eSSL / ZKTeco ADMS Cloud Push Protocol listener.
// ATTPHOTO pushes carry a base64 snapshot per line, so the text body limit has
// to cover a full-size face image rather than the Express default of 100 kb.
app.use('/iclock', express.text({ type: '*/*', limit: '12mb' }), admsRouter);

// Device-pushed attendance snapshots. Mounted narrowly (attendance subtree
// only) so this cannot become a way to reach other tenants' uploaded documents.
app.use(
  '/uploads/attendance',
  express.static(path.resolve(process.env.UPLOAD_DIR || './uploads', 'attendance'), {
    index: false,
    dotfiles: 'deny',
    fallthrough: true,
    maxAge: '1h',
  })
);

// Domain & Security Routes (v1 API + backwards-compatible /api alias)
app.use('/api/v1', apiV1Router);
app.use('/api', apiV1Router);

// Centralized Enterprise Error Handler
app.use(errorHandler);

/**
 * Every socket connection is authenticated before it can join a room.
 *
 * Without this, `auth.userId` was whatever the client chose to send, so any
 * connection could subscribe to `user:<someone-else>` and receive that
 * person's notifications. The identity is now taken from a verified access
 * token — presented either as the HttpOnly session cookie or as a bearer
 * token by the mobile client — and never from the handshake payload.
 */
io.use(async (socket, next) => {
  try {
    const auth = socket.handshake.auth || {};
    const bearer = typeof auth.token === 'string' && auth.token ? auth.token : null;
    const cookieHeader = socket.handshake.headers?.cookie as string | undefined;
    let token = bearer;
    if (!token && cookieHeader) {
      const names = cookieNames();
      for (const part of cookieHeader.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === names.access || key === ACCESS_COOKIE) {
          token = decodeURIComponent(rest.join('='));
          break;
        }
      }
    }
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const claims = await verifyAccessToken(token);
    socket.data.userId = claims.sub;
    socket.data.sessionId = claims.sid ?? null;
    return next();
  } catch (error: any) {
    return next(new Error('Invalid or expired session'));
  }
});

io.on('connection', (socket) => {
  // Set by the handshake middleware from the verified token, never from the
  // client's own claim.
  const userId = socket.data.userId;
  if (userId) {
    socket.join(`user:${userId}`);
  }

  socket.on('join-location', (locationId: string) => {
    socket.join(`location:${locationId}`);
  });

  // Organization Management module rooms (live hierarchy updates)
  socket.on('join:organization', () => {
    socket.join('organization');
  });
  socket.on('join:location', (locationId: string) => {
    if (typeof locationId === 'string' && locationId) {
      socket.join(`location:${locationId}`);
    }
  });

  socket.on('join-stream', (streamId: string) => {
    socket.join(`stream:${streamId}`);
  });

  socket.on('disconnect', () => {});
});

import { shardManager } from './core/sharding/index.js';
import { startHiringOutboxWorker } from './services/hiring/hiringOutbox.js';

const PORT = Number(process.env.PORT) || 4000;

if (!process.env.VERCEL) {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BSC Textiles HRMS Security-Hardened Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready`);
    shardManager
      .initialize()
      .then(() => {
        if (process.env.HIRING_OUTBOX_DISABLED !== 'true') startHiringOutboxWorker();
      })
      .catch((err) => console.error('[ShardManager init warning]:', err.message));
    setupViews().catch((err) => console.warn('[setupViews warning]:', err.message));
    setupCustodyAssets().catch((err) => console.warn('[setupCustodyAssets warning]:', err.message));
    setupKycSchema().catch((err) => console.warn('[setupKycSchema warning]:', err.message));
    setupEmployeeDocuments().catch((err) => console.warn('[setupEmployeeDocuments warning]:', err.message));
    setupFormerEmployees().catch((err) => console.warn('[setupFormerEmployees warning]:', err.message));
    setupOrganizationHubs().catch((err) => console.warn('[setupOrganizationHubs warning]:', err.message));
    ensureEmployeeImportSchema().catch((err) => console.warn('[setupEmployeeImportSchema warning]:', err.message));
    setupPayrollSchema().catch((err) => console.warn('[setupPayrollSchema warning]:', err.message));
    setupLateFines().catch((err) => console.warn('[setupLateFines warning]:', err.message));
    setupRetailOperations().catch((err) => console.warn('[setupRetailOperations warning]:', err.message));
    setupBreaks().catch((err) => console.warn('[setupBreaks warning]:', err.message));
    UserUploadService.syncAllUserFolders().catch((err) => console.warn('[UserUploadService warning]:', err.message));
    registerLocationRegistryRefresh()
      .then(() => console.log('📍 Location registry loaded'))
      .catch((err) => console.warn('[locationRegistry warning]:', err.message));

    // Security boot sequence: establish a signing key before the first token is
    // requested, then surface any posture that is unsafe rather than failing
    // silently at 03:00 when a lockout cannot be shared between processes.
    ensureActiveKey()
      .then((key) => console.log(`🔑 Signing key active: ${key.kid} (${key.algorithm})`))
      .catch((err) => console.error('[signingKeys] could not establish a key:', err?.message || err));
    for (const warning of auditSecurityConfig()) console.warn(`[security posture] ${warning}`);

    // Retention purge: an in-process scheduler is enough for a single node; the
    // Docker Compose setup runs it from the worker so it happens once.
    const purge = setInterval(
      () => {
        runRetentionPurge()
          .then((results) => {
            const purged = results.filter((r) => r.deleted > 0);
            if (purged.length) console.log('[retention] purged', purged.map((p) => `${p.name}=${p.deleted}`).join(' '));
          })
          .catch((err) => console.warn('[retention] purge failed:', err?.message || err));
      },
      Math.max(securityConfig.privacy.purgeIntervalHours, 1) * 3600_000
    );
    if (typeof purge.unref === 'function') purge.unref();
  });

  process.on('SIGINT', async () => {
    await shardManager.shutdown();
    await prisma.$disconnect?.();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await shardManager.shutdown();
    await prisma.$disconnect?.();
    process.exit(0);
  });
}

// Universal module export for Vercel Serverless / Express framework
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign(app, {
    default: app,
    app,
    httpServer,
    prisma,
    socketIO,
  });
}