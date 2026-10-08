import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

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
        earlyLoginRatePerSecond: 1,
        latePenaltyEnabled: true,
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
        qrDailyTokenEnabled: true,
        qrOneTimeScan: true,
        scannerRoles: ['T_SHOP_OWNER', 'TEA_BREAK_MANAGER', 'HR_MANAGER', 'FLOOR_MANAGER'],
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

// Update settings
router.put('/', authorize('CONFIGURE'), async (req: AuthRequest, res) => {
  try {
    const {
      locationId,
      gracePeriodMinutes,
      lateThresholdMinutes,
      earlyLoginIncentiveEnabled,
      earlyLoginRatePerSecond,
      latePenaltyEnabled,
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
      qrDailyTokenEnabled,
      qrOneTimeScan,
      scannerRoles,
    } = req.body;

    const targetLocId = req.user!.role === 'SUPER_ADMIN' ? locationId : req.user!.locationId;

    if (!targetLocId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    const updated = await prisma.attendanceRules.upsert({
      where: { locationId: targetLocId },
      update: {
        gracePeriodMinutes: Number(gracePeriodMinutes ?? 5),
        lateThresholdMinutes: Number(lateThresholdMinutes ?? 5),
        earlyLoginIncentiveEnabled: Boolean(earlyLoginIncentiveEnabled),
        earlyLoginRatePerSecond: Number(earlyLoginRatePerSecond ?? 1),
        latePenaltyEnabled: Boolean(latePenaltyEnabled),
        latePenaltyRatePerSecond: Number(latePenaltyRatePerSecond ?? 1),
        overtimeIncentiveEnabled: Boolean(overtimeIncentiveEnabled),
        overtimeRatePerSecond: Number(overtimeRatePerSecond ?? 1.5),
        earlyLogoutPenaltyEnabled: Boolean(earlyLogoutPenaltyEnabled),
        earlyLogoutRatePerSecond: Number(earlyLogoutRatePerSecond ?? 1),
        lunchDurationMinutes: Number(lunchDurationMinutes ?? 100),
        teaDurationMinutes: Number(teaDurationMinutes ?? 20),
        maleLunchMinutes: Number(maleLunchMinutes ?? 100),
        femaleLunchMinutes: Number(femaleLunchMinutes ?? 40),
        maleTeaMinutes: Number(maleTeaMinutes ?? 20),
        femaleTeaMinutes: Number(femaleTeaMinutes ?? 15),
        faceVerificationThreshold: Number(faceVerificationThreshold ?? 85),
        qrDailyTokenEnabled: Boolean(qrDailyTokenEnabled ?? true),
        qrOneTimeScan: Boolean(qrOneTimeScan ?? true),
        scannerRoles: scannerRoles || ['T_SHOP_OWNER', 'TEA_BREAK_MANAGER', 'HR_MANAGER'],
      },
      create: {
        locationId: targetLocId,
        loginTime: new Date('2024-01-01T09:30:00'),
        logoutTime: new Date('2024-01-01T18:30:00'),
        gracePeriodMinutes: Number(gracePeriodMinutes ?? 5),
        lateThresholdMinutes: Number(lateThresholdMinutes ?? 5),
        earlyLoginIncentiveEnabled: Boolean(earlyLoginIncentiveEnabled),
        earlyLoginRatePerSecond: Number(earlyLoginRatePerSecond ?? 1),
        latePenaltyEnabled: Boolean(latePenaltyEnabled),
        latePenaltyRatePerSecond: Number(latePenaltyRatePerSecond ?? 1),
        overtimeIncentiveEnabled: Boolean(overtimeIncentiveEnabled),
        overtimeRatePerSecond: Number(overtimeRatePerSecond ?? 1.5),
        earlyLogoutPenaltyEnabled: Boolean(earlyLogoutPenaltyEnabled),
        earlyLogoutRatePerSecond: Number(earlyLogoutRatePerSecond ?? 1),
        lunchDurationMinutes: Number(lunchDurationMinutes ?? 100),
        teaDurationMinutes: Number(teaDurationMinutes ?? 20),
        maleLunchMinutes: Number(maleLunchMinutes ?? 100),
        femaleLunchMinutes: Number(femaleLunchMinutes ?? 40),
        maleTeaMinutes: Number(maleTeaMinutes ?? 20),
        femaleTeaMinutes: Number(femaleTeaMinutes ?? 15),
        faceVerificationThreshold: Number(faceVerificationThreshold ?? 85),
        qrDailyTokenEnabled: Boolean(qrDailyTokenEnabled ?? true),
        qrOneTimeScan: Boolean(qrOneTimeScan ?? true),
        scannerRoles: scannerRoles || ['T_SHOP_OWNER', 'TEA_BREAK_MANAGER', 'HR_MANAGER'],
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
