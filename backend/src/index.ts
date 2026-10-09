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
import { prisma } from './db.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import locationRoutes from './routes/locations.js';
import floorRoutes from './routes/floors.js';
import departmentRoutes from './routes/departments.js';
import sectionRoutes from './routes/sections.js';
import sellingPointRoutes from './routes/sellingPoints.js';
import employeeRoutes from './routes/employees.js';
import shiftRoutes from './routes/shifts.js';
import attendanceRoutes from './routes/attendance.js';
import breakRoutes from './routes/breaks.js';
import faceVerificationRoutes from './routes/faceVerification.js';
import qrCodeRoutes from './routes/qrCodes.js';
import incentiveRoutes from './routes/incentives.js';
import observationRoutes from './routes/observations.js';
import liveStreamRoutes from './routes/liveStreams.js';
import weeklyOffRoutes from './routes/weeklyOffs.js';
import holidayRoutes from './routes/holidays.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/audit.js';
import payrollRoutes from './routes/payroll.js';
import penaltyRoutes from './routes/penalties.js';
import notificationRoutes from './routes/notifications.js';
import roleRoutes from './routes/roles.js';
import settingRoutes from './routes/settings.js';
import deviceRoutes from './routes/devices.js';
import { staffOpsRouter, observationLevelsRouter } from './routes/workerOps.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
});

export { prisma };
export const socketIO = io;

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/floors', floorRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/selling-points', sellingPointRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/staff-ops', staffOpsRouter);
app.use('/api/observation-levels', observationLevelsRouter);
app.use('/api/breaks', breakRoutes);
app.use('/api/face-verification', faceVerificationRoutes);
app.use('/api/qr-codes', qrCodeRoutes);
app.use('/api/incentives', incentiveRoutes);
app.use('/api/observations', observationRoutes);
app.use('/api/live-streams', liveStreamRoutes);
app.use('/api/weekly-offs', weeklyOffRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/penalties', penaltyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/devices', deviceRoutes);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-location', (locationId: string) => {
    socket.join(`location:${locationId}`);
  });

  socket.on('join-stream', (streamId: string) => {
    socket.join(`stream:${streamId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
});
console.log('Listen called, waiting for callback...');

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});