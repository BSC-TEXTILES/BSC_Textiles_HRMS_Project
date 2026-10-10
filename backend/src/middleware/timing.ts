import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

export interface PerformanceMetrics {
  requestId: string;
  startTime: bigint;
  dbQueries: number;
  dbTimeMs: number;
}

declare global {
  namespace Express {
    interface Request {
      metrics?: PerformanceMetrics;
      recordDbTime?: (durationMs: number) => void;
    }
  }
}

/**
 * Enterprise Performance Timing & Correlation Middleware
 * Attaches X-Request-Id, X-Response-Time, and Server-Timing headers
 */
export function timingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const requestId = (req.headers['x-request-id'] as string) || (req.headers['x-correlation-id'] as string) || crypto.randomUUID();

  const metrics: PerformanceMetrics = {
    requestId,
    startTime: start,
    dbQueries: 0,
    dbTimeMs: 0,
  };

  req.metrics = metrics;
  req.recordDbTime = (durationMs: number) => {
    metrics.dbQueries++;
    metrics.dbTimeMs += durationMs;
  };

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', requestId);

  // Intercept res.send and res.json to set timing headers before headers are committed
  const originalSend = res.send;
  res.send = function (body?: any) {
    if (!res.headersSent) {
      const end = process.hrtime.bigint();
      const totalMs = Number(end - start) / 1_000_000;
      const roundedTotal = Number(totalMs.toFixed(2));
      const roundedDb = Number(metrics.dbTimeMs.toFixed(2));
      res.setHeader('X-Response-Time', `${roundedTotal}ms`);
      const timingEntries = [
        `total;dur=${roundedTotal};desc="Total Response Time"`,
        metrics.dbQueries > 0 ? `db;dur=${roundedDb};desc="Database Time (${metrics.dbQueries} queries)"` : '',
      ].filter(Boolean).join(', ');
      res.setHeader('Server-Timing', timingEntries);

      if (roundedTotal > 100 && req.path !== '/api/auth/login') {
        console.warn(`[SLOW_API_ALERT] ${req.method} ${req.originalUrl || req.url} took ${roundedTotal}ms (DB: ${roundedDb}ms, ${metrics.dbQueries} queries) [ReqID: ${requestId}]`);
      }
    }
    return originalSend.call(this, body);
  };

  next();
}
