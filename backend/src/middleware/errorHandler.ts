import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

/**
 * Sanitizes log output to ensure passwords, tokens, and secret keys are never written to logs
 */
function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const SENSITIVE_KEYS = ['password', 'token', 'secret', 'authorization', 'cookie', 'accesstoken', 'refreshtoken', 'aadhaar', 'otp'];
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForLogging);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      sanitized[key] = sanitizeForLogging(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

/**
 * Centralized Enterprise Error Handling Middleware
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.metrics?.requestId as string) || (req.headers['x-request-id'] as string) || 'unknown';
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      error: 'Validation failed',
      errorCode: 'VALIDATION_ERROR',
      message: 'Invalid request input parameters',
      details: formattedErrors,
      requestId,
    });
    return;
  }

  // 2. Custom Domain Operational Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      errorCode: err.errorCode,
      details: err.details || null,
      requestId,
    });
    return;
  }

  // 3. MySQL Database Specific Errors
  if (err.code === 'ER_DUP_ENTRY') {
    res.status(409).json({
      error: 'Conflict: A record with this unique identifier already exists',
      errorCode: 'DUPLICATE_ENTRY',
      requestId,
    });
    return;
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    res.status(400).json({
      error: 'Foreign key constraint violation: Referenced parent record does not exist',
      errorCode: 'INVALID_REFERENCE',
      requestId,
    });
    return;
  }

  // 4. Fallback for unhandled / internal exceptions
  console.error(`[UnhandledError] [ReqID: ${requestId}] ${req.method} ${req.originalUrl}:`, {
    name: err.name,
    message: err.message,
    stack: isProd ? undefined : err.stack,
    body: sanitizeForLogging(req.body),
    query: sanitizeForLogging(req.query),
  });

  res.status(500).json({
    error: 'Internal server error',
    errorCode: 'INTERNAL_SERVER_ERROR',
    message: isProd
      ? 'An unexpected error occurred. Please contact the system administrator.'
      : err.message || 'An unexpected error occurred',
    requestId,
  });
}
