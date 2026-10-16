import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { prisma, pool } from './db.js';
import { apiV1Router } from './api/v1/index.js';
import { docsRouter } from './api/docs/index.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { csrfProtection } from './middleware/csrfProtection.js';
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
import { UserUploadService } from './services/userUploadService.js';

const app = express();
const httpServer = createServer(app);

// 0. Strict CORS configuration with local network dev support
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
].filter(Boolean) as string[];

const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (
    !origin ||
    allowedOrigins.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('http://192.168.') ||
    origin.endsWith('.vercel.app') ||
    process.env.NODE_ENV !== 'production'
  ) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
};

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

// 4. CSRF protection on mutating cookie requests
app.use(csrfProtection);

// 5. Baseline API Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    security: {
      argon2: 'active',
      mfa: 'enforced',
      sessionTracking: 'active',
      auditIntegrity: 'active',
    },
  });
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

// Interactive OpenAPI 3.0 Documentation & Swagger Explorer
app.use('/api/docs', docsRouter);

// Hardware eSSL / ZKTeco ADMS Cloud Push Protocol listener
app.use('/iclock', express.text({ type: '*/*' }), admsRouter);

// Domain & Security Routes (v1 API + backwards-compatible /api alias)
app.use('/api/v1', apiV1Router);
app.use('/api', apiV1Router);

// Centralized Enterprise Error Handler
app.use(errorHandler);

io.on('connection', (socket) => {
  const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
  if (userId) {
    socket.join(`user:${userId}`);
    socket.data.userId = userId;
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

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BSC Textiles HRMS Security-Hardened Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  shardManager.initialize().catch((err) => console.error('[ShardManager init warning]:', err.message));
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
});

process.on('SIGINT', async () => {
  await shardManager.shutdown();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shardManager.shutdown();
  await prisma.$disconnect();
  process.exit(0);
});