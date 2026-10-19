import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { AuditService } from '../services/auditService.js';
import { getUserModuleAccess, accessRank } from '../services/rbacService.js';

const router = Router();
router.use(authenticate);

/**
 * Module-level write gate for settings:
 *  - Unrestricted (legacy) users need CONFIGURE (or SUPER_ADMIN) as before.
 *  - RBAC-restricted users are checked per module group in the request body:
 *    biometric fields → BIOMETRIC_POLICY edit, break fields → BREAK_POLICIES
 *    edit, everything else → legacy CONFIGURE.
 */
async function settingsWriteAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  try {
    const userAccess = await getUserModuleAccess(req.user.id, req.user.role);
    if (userAccess.source !== 'rbac') {
      if (req.user.role === 'SUPER_ADMIN' || req.user.permissions.includes('CONFIGURE')) {
        return next();
      }
      return res.status(403).json({
        error: 'Forbidden: insufficient permissions',
        message: 'You do not have permission to change system settings.',
      });
    }
    next();
  } catch (error) {
    console.error('Settings write access error:', error);
    res.status(500).json({ error: 'Failed to verify settings permissions' });
  }
}

const GROUP_MODULE: Record<string, string> = {
  BIOMETRIC: 'BIOMETRIC_POLICY',
  BREAK: 'BREAK_POLICIES',
};

const GROUP_FIELDS: Record<string, string[]> = {
  BIOMETRIC: ['faceVerificationThreshold'],
  BREAK: [
    'lunchDurationMinutes',
    'teaDurationMinutes',
    'maleLunchMinutes',
    'femaleLunchMinutes',
    'maleTeaMinutes',
    'femaleTeaMinutes',
  ],
  GENERAL: [
    'gracePeriodMinutes',
    'lateThresholdMinutes',
    'earlyLoginIncentiveEnabled',
    'earlyLoginRatePerMinute',
    'earlyLoginRatePerSecond',
    'earlyLoginMaxDaily',
    'earlyLoginMaxMonthly',
    'latePenaltyEnabled',
    'latePenaltyRatePerMinute',
    'latePenaltyRatePerSecond',
    'latePenaltyMaxDaily',
    'latePenaltyMaxMonthly',
    'overtimeIncentiveEnabled',
    'overtimeRatePerSecond',
    'earlyLogoutPenaltyEnabled',
    'earlyLogoutRatePerSecond',
  ],
};

function groupsPresentIn(body: Record<string, unknown>): string[] {
  return Object.entries(GROUP_FIELDS)
    .filter(([, fields]) => fields.some((f) => body[f] !== undefined))
    .map(([group]) => group);
}

// Get global and location settings
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;
    const targetLocationId = req.user!.role === 'SUPER_ADMIN' 
      ? (locationId ? String(locationId) : undefined)
      : req.user!.locationId;

    let rules = null;
    if (targetLocationId) {
      rules = await prisma.attendanceRules.findUnique({
        where: { locationId: targetLocationId },
        include: { location: { select: { id: true, name: true, code: true } } },
      });
    }

    // If no specific rules found, return the first one or defaults
    if (!rules) {
      rules = await prisma.attendanceRules.findFirst({
        include: { location: { select: { id: true, name: true, code: true } } },
      });
    }

    res.json({
      settings: rules || {
        gracePeriodMinutes: 5,
        lateThresholdMinutes: 5,
        earlyLoginIncentiveEnabled: true,
        earlyLoginRatePerMinute: 1,
        earlyLoginRatePerSecond: 1,
        latePenaltyEnabled: true,
        latePenaltyRatePerMinute: 1,
        latePenaltyRatePerSecond: 1,
        overtimeIncentiveEnabled: true,
        overtimeRatePerSecond: 1.5,
        lunchDurationMinutes: 100,
        teaDurationMinutes: 20,
        maleLunchMinutes: 100,
        femaleLunchMinutes: 40,
        maleTeaMinutes: 20,
        femaleTeaMinutes: 15,
        faceVerificationThreshold: 85,
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

// Update settings (module-level RBAC enforced per field group)
router.put('/', settingsWriteAccess, async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, any>;
    const {
      locationId,
      gracePeriodMinutes,
      lateThresholdMinutes,
      earlyLoginIncentiveEnabled,
      earlyLoginRatePerMinute,
      earlyLoginRatePerSecond,
      latePenaltyEnabled,
      latePenaltyRatePerMinute,
      latePenaltyRatePerSecond,
      overtimeIncentiveEnabled,
      overtimeRatePerSecond,
      earlyLogoutPenaltyEnabled,
      earlyLogoutRatePerSecond,
      lunchDurationMinutes,
      teaDurationMinutes,
      maleLunchMinutes,
      femaleLunchMinutes,
      maleTeaMinutes,
      femaleTeaMinutes,
      faceVerificationThreshold,
    } = req.body;

    const targetLocId = req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId;

    if (!targetLocId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    // --- Module-level access evaluation -------------------------------------
    const userAccess = await getUserModuleAccess(req.user!.id, req.user!.role);
    const deniedGroups: Array<{ group: string; module: string }> = [];

    if (userAccess.source === 'rbac') {
      for (const group of groupsPresentIn(body)) {
        if (group === 'GENERAL') {
          if (!(req.user!.role === 'SUPER_ADMIN' || req.user!.permissions.includes('CONFIGURE'))) {
            deniedGroups.push({ group, module: 'GENERAL_SETTINGS' });
          }
          continue;
        }
        const module = GROUP_MODULE[group];
        if (accessRank(userAccess.access[module] || 'none') < accessRank('edit')) {
          deniedGroups.push({ group, module });
        }
      }

      if (deniedGroups.length > 0) {
        AuditService.log({
          userId: req.user!.id,
          locationId: targetLocId,
          action: 'UNAUTHORIZED_MODULE_ATTEMPT',
          entityType: 'AttendanceRules',
          entityId: String(targetLocId),
          ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
          userAgent: (req.headers['user-agent'] as string) || 'Client',
          riskScore: 60,
          tags: ['module-rbac-denied', 'security-alert'],
          after: { deniedGroups, roles: userAccess.roles },
        }).catch(() => {});

        return res.status(403).json({
          error: 'Forbidden: insufficient module access',
          message: `Your role does not allow editing: ${deniedGroups
            .map((d) => d.module.replace(/_/g, ' ').toLowerCase())
            .join(', ')}.`,
          deniedModules: deniedGroups.map((d) => d.module),
        });
      }
    }

    // Preserve current values for groups that were not sent or not editable so
    // partial saves never clobber restricted settings with defaults.
    const current = await prisma.attendanceRules.findUnique({ where: { locationId: targetLocId } });

    const biometricValue =
      faceVerificationThreshold !== undefined && (userAccess.source !== 'rbac' || accessRank(userAccess.access.BIOMETRIC_POLICY) >= accessRank('edit'))
        ? Number(faceVerificationThreshold)
        : Number((current as any)?.faceVerificationThreshold ?? 85);

    const breakValue = (field: string, fallback: number) => {
      const editable = userAccess.source !== 'rbac' || accessRank(userAccess.access.BREAK_POLICIES) >= accessRank('edit');
      if (req.body[field] !== undefined && editable) return Number(req.body[field]);
      return Number((current as any)?.[field] ?? fallback);
    };

    const updated = await prisma.attendanceRules.upsert({
      where: { locationId: targetLocId },
      update: {
        gracePeriodMinutes: Number(gracePeriodMinutes ?? (current as any)?.gracePeriodMinutes ?? 5),
        lateThresholdMinutes: Number(lateThresholdMinutes ?? (current as any)?.lateThresholdMinutes ?? 5),
        earlyLoginIncentiveEnabled: Boolean(earlyLoginIncentiveEnabled ?? (current as any)?.earlyLoginIncentiveEnabled ?? true),
        earlyLoginRatePerMinute: Number(earlyLoginRatePerMinute ?? earlyLoginRatePerSecond ?? (current as any)?.earlyLoginRatePerMinute ?? 1),
        earlyLoginRatePerSecond: Number(earlyLoginRatePerSecond ?? earlyLoginRatePerMinute ?? (current as any)?.earlyLoginRatePerSecond ?? 1),
        latePenaltyEnabled: Boolean(latePenaltyEnabled ?? (current as any)?.latePenaltyEnabled ?? true),
        latePenaltyRatePerMinute: Number(latePenaltyRatePerMinute ?? latePenaltyRatePerSecond ?? (current as any)?.latePenaltyRatePerMinute ?? 1),
        latePenaltyRatePerSecond: Number(latePenaltyRatePerSecond ?? latePenaltyRatePerMinute ?? (current as any)?.latePenaltyRatePerSecond ?? 1),
        overtimeIncentiveEnabled: Boolean(overtimeIncentiveEnabled ?? (current as any)?.overtimeIncentiveEnabled ?? true),
        overtimeRatePerSecond: Number(overtimeRatePerSecond ?? (current as any)?.overtimeRatePerSecond ?? 1.5),
        earlyLogoutPenaltyEnabled: Boolean(earlyLogoutPenaltyEnabled ?? (current as any)?.earlyLogoutPenaltyEnabled ?? false),
        earlyLogoutRatePerSecond: Number(earlyLogoutRatePerSecond ?? (current as any)?.earlyLogoutRatePerSecond ?? 1),
        lunchDurationMinutes: breakValue('lunchDurationMinutes', 100),
        teaDurationMinutes: breakValue('teaDurationMinutes', 20),
        maleLunchMinutes: breakValue('maleLunchMinutes', 100),
        femaleLunchMinutes: breakValue('femaleLunchMinutes', 40),
        maleTeaMinutes: breakValue('maleTeaMinutes', 20),
        femaleTeaMinutes: breakValue('femaleTeaMinutes', 15),
        faceVerificationThreshold: biometricValue,
      },
      create: {
        locationId: targetLocId,
        loginTime: new Date('2024-01-01T09:30:00'),
        logoutTime: new Date('2024-01-01T18:30:00'),
        gracePeriodMinutes: Number(gracePeriodMinutes ?? 5),
        lateThresholdMinutes: Number(lateThresholdMinutes ?? 5),
        earlyLoginIncentiveEnabled: Boolean(earlyLoginIncentiveEnabled ?? true),
        earlyLoginRatePerMinute: Number(earlyLoginRatePerMinute ?? earlyLoginRatePerSecond ?? 1),
        earlyLoginRatePerSecond: Number(earlyLoginRatePerSecond ?? earlyLoginRatePerMinute ?? 1),
        latePenaltyEnabled: Boolean(latePenaltyEnabled ?? true),
        latePenaltyRatePerMinute: Number(latePenaltyRatePerMinute ?? latePenaltyRatePerSecond ?? 1),
        latePenaltyRatePerSecond: Number(latePenaltyRatePerSecond ?? latePenaltyRatePerMinute ?? 1),
        overtimeIncentiveEnabled: Boolean(overtimeIncentiveEnabled ?? true),
        overtimeRatePerSecond: Number(overtimeRatePerSecond ?? 1.5),
        earlyLogoutPenaltyEnabled: Boolean(earlyLogoutPenaltyEnabled ?? false),
        earlyLogoutRatePerSecond: Number(earlyLogoutRatePerSecond ?? 1),
        lunchDurationMinutes: Number(lunchDurationMinutes ?? 100),
        teaDurationMinutes: Number(teaDurationMinutes ?? 20),
        maleLunchMinutes: Number(maleLunchMinutes ?? 100),
        femaleLunchMinutes: Number(femaleLunchMinutes ?? 40),
        maleTeaMinutes: Number(maleTeaMinutes ?? 20),
        femaleTeaMinutes: Number(femaleTeaMinutes ?? 15),
        faceVerificationThreshold: biometricValue,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: targetLocId,
        action: 'CONFIGURE',
        entityType: 'AttendanceRules',
        entityId: updated.id,
        newValue: req.body,
      },
    });

    res.json({ message: 'Settings updated successfully', settings: updated });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
