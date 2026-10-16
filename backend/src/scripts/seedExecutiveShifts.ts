import { pool } from '../nativeDb.js';
import { cacheService } from '../services/cacheService.js';

export async function seedExecutiveShifts() {
  const locations = [
    { id: 'cmuzam5fe00014n4pq25hkcww', code: 'BEL' },
    { id: 'cmuzam5fr00024n4p4izbomev', code: 'DAV' },
    { id: 'cmuzam5g400034n4p89o33l8e', code: 'SHI' },
    { id: 'cmuzam5gf00044n4pb43g9y4v', code: 'HUB' },
  ];

  for (const loc of locations) {
    // 1. Shift I: Punch IN 10:00 AM, Punch OUT 9:30 PM (21:30), Lunch 100 min, Tea 20 min (Evening)
    const [existingShift1]: any = await pool.query(
      'SELECT id FROM shift WHERE locationId = ? AND (name = ? OR code = ?)',
      [loc.id, 'Shift I', `SHIFT_I_${loc.code}`]
    );

    if (!existingShift1 || existingShift1.length === 0) {
      await pool.query(
        `INSERT INTO shift (
          id, name, code, locationId, startTime, endTime, gracePeriod, lateThreshold,
          earlyLoginIncentive, earlyLoginRatePerSecond, latePenaltyEnabled, latePenaltyRatePerSecond,
          overtimeEnabled, earlyLogoutPenaltyEnabled, lunchDurationMinutes, teaDurationMinutes,
          maleLunchMinutes, femaleLunchMinutes, maleTeaMinutes, femaleTeaMinutes,
          faceVerificationThreshold, qrDailyTokenEnabled, qrOneTimeScan, scannerRoles, status, createdAt, updatedAt
        ) VALUES (
          ?, 'Shift I', ?, ?, '2024-01-01 10:00:00.000', '2024-01-01 21:30:00.000', 5, 15,
          1, 0, 0, 0,
          1, 0, 100, 20,
          100, 100, 20, 20,
          85, 1, 1, ?, 'ACTIVE', NOW(), NOW()
        )`,
        [
          `shift-i-${loc.code.toLowerCase()}`,
          `SHIFT_I_${loc.code}`,
          loc.id,
          JSON.stringify({ teaBreakSlot: 'Evening', isSystemShift: true }),
        ]
      );
      console.log(`[seedExecutiveShifts] Seeded Shift I for ${loc.code}`);
    }

    // 2. Shift 2: Punch IN 11:00 AM, Punch OUT 9:00 PM (21:00), Lunch 45 min, Tea 10 min
    const [existingShift2]: any = await pool.query(
      'SELECT id FROM shift WHERE locationId = ? AND (name = ? OR code = ?)',
      [loc.id, 'Shift 2', `SHIFT_2_${loc.code}`]
    );

    if (!existingShift2 || existingShift2.length === 0) {
      await pool.query(
        `INSERT INTO shift (
          id, name, code, locationId, startTime, endTime, gracePeriod, lateThreshold,
          earlyLoginIncentive, earlyLoginRatePerSecond, latePenaltyEnabled, latePenaltyRatePerSecond,
          overtimeEnabled, earlyLogoutPenaltyEnabled, lunchDurationMinutes, teaDurationMinutes,
          maleLunchMinutes, femaleLunchMinutes, maleTeaMinutes, femaleTeaMinutes,
          faceVerificationThreshold, qrDailyTokenEnabled, qrOneTimeScan, scannerRoles, status, createdAt, updatedAt
        ) VALUES (
          ?, 'Shift 2', ?, ?, '2024-01-01 11:00:00.000', '2024-01-01 21:00:00.000', 5, 15,
          1, 0, 0, 0,
          1, 0, 45, 10,
          45, 45, 10, 10,
          85, 1, 1, ?, 'ACTIVE', NOW(), NOW()
        )`,
        [
          `shift-2-${loc.code.toLowerCase()}`,
          `SHIFT_2_${loc.code}`,
          loc.id,
          JSON.stringify({ teaBreakSlot: 'None', isSystemShift: true }),
        ]
      );
      console.log(`[seedExecutiveShifts] Seeded Shift 2 for ${loc.code}`);
    }
  }

  cacheService.invalidatePrefix('shifts');
  console.log('[seedExecutiveShifts] Shift I and Shift 2 synchronized successfully.');
}

if (process.argv[1] && process.argv[1].includes('seedExecutiveShifts')) {
  seedExecutiveShifts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seedExecutiveShifts] Failed:', err);
      process.exit(1);
    });
}
