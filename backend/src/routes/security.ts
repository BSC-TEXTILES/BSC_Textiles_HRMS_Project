import { Router } from 'express';
import { prisma } from '../db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { SecurityMonitoringService } from '../services/securityMonitoringService.js';
import { AuditService } from '../services/auditService.js';

const router = Router();

// Protect all security management endpoints to elevated roles only
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'));

/**
 * GET /api/security/dashboard
 * Administrator Security Dashboard aggregate metrics
 */
router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const metrics = await SecurityMonitoringService.getDashboardMetrics();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load security metrics', message: error.message });
  }
});

/**
 * GET /api/security/events
 * List security monitoring alerts and events
 */
router.get('/events', async (req: AuthRequest, res) => {
  try {
    const { severity, resolved, limit = 50 } = req.query;

    const where: any = {};
    if (severity) where.severity = severity;
    if (resolved !== undefined) where.resolved = resolved === 'true' ? 1 : 0;

    const events = await prisma.securityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      include: {
        user: { select: { id: true, email: true, fullName: true, role: true } },
      },
    });

    res.json({ events });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch security events', message: error.message });
  }
});

/**
 * POST /api/security/events/:id/resolve
 * Resolve a security event
 */
router.post('/events/:id/resolve', async (req: AuthRequest, res) => {
  try {
    const { notes } = req.body;
    await prisma.securityEvent.update({
      where: { id: req.params.id },
      data: {
        resolved: 1,
        resolvedById: req.user!.id,
        resolvedAt: new Date(),
        resolutionNotes: notes || 'Resolved by security administrator',
      },
    });

    res.json({ message: 'Security event marked as resolved' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to resolve event', message: error.message });
  }
});

/**
 * GET /api/security/audit-logs
 * Query tamper-resistant audit logs
 */
router.get('/audit-logs', async (req: AuthRequest, res) => {
  try {
    const { userId, action, entityType, limit = 50 } = req.query;

    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: Number(limit),
      include: {
        user: { select: { id: true, email: true, fullName: true, role: true } },
      },
    });

    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch audit logs', message: error.message });
  }
});

/**
 * POST /api/security/audit-logs/verify-integrity
 * Verify cryptographic hash chains across audit logs
 */
router.post('/audit-logs/verify-integrity', async (req: AuthRequest, res) => {
  try {
    const result = await AuditService.verifyIntegrity(Number(req.query.limit || 100));
    res.json({
      status: result.valid ? 'INTEGRITY_VERIFIED' : 'INTEGRITY_COMPROMISED',
      details: result,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Integrity check failed', message: error.message });
  }
});

/**
 * GET /api/security/locked-accounts
 * List temporarily locked accounts
 */
router.get('/locked-accounts', async (req: AuthRequest, res) => {
  try {
    const lockedUsers = await prisma.user.findMany({
      where: {
        lockedUntil: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        lastFailedLoginAt: true,
      },
    });

    res.json({ lockedAccounts: lockedUsers });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch locked accounts' });
  }
});

/**
 * POST /api/security/locked-accounts/:userId/unlock
 * Admin action to unlock an account
 */
router.post('/locked-accounts/:userId/unlock', async (req: AuthRequest, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await AuditService.log({
      userId: req.user!.id,
      action: 'ADMIN_UNLOCK_ACCOUNT',
      entityType: 'User',
      entityId: req.params.userId,
      ipAddress: req.ip,
      tags: ['security', 'account-unlock'],
    });

    res.json({ message: 'User account successfully unlocked' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to unlock user account' });
  }
});

export default router;
