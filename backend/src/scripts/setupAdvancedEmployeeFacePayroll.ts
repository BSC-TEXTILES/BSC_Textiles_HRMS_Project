import { pool } from '../nativeDb.js';
import crypto from 'crypto';

export async function setupAdvancedEmployeeFacePayroll(options?: { schemaOnly?: boolean }) {
  const conn = pool;

  try {
    // 1. Dedicated Office Attendance Device (Kiosk Mode)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`kiosk_device\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`deviceCode\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`locationId\` VARCHAR(191) NOT NULL,
        \`pinHash\` VARCHAR(191) NOT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        \`lastHeartbeat\` DATETIME(3) NULL,
        \`ipAddress\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`KioskDevice_deviceCode_key\` (\`deviceCode\`),
        KEY \`KioskDevice_locationId_idx\` (\`locationId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Multi-Angle Face Registration Samples
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`face_registration_sample\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`employeeId\` VARCHAR(191) NOT NULL,
        \`pose\` VARCHAR(50) NOT NULL DEFAULT 'STRAIGHT',
        \`embedding\` LONGTEXT NOT NULL,
        \`qualityScore\` DECIMAL(5,2) NOT NULL DEFAULT 95.00,
        \`livenessScore\` DECIMAL(5,2) NOT NULL DEFAULT 99.00,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`FaceSample_employeeId_idx\` (\`employeeId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Dynamic Sunday & Weekly Off Configuration
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`employee_weekly_off_config\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`employeeId\` VARCHAR(191) NOT NULL,
        \`offType\` VARCHAR(50) NOT NULL DEFAULT 'FIXED',
        \`primaryDay\` VARCHAR(20) NOT NULL DEFAULT 'SUNDAY',
        \`secondaryDay\` VARCHAR(20) NULL,
        \`rotationalPattern\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`WeeklyOffConfig_employeeId_key\` (\`employeeId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Holiday Working (2x Double Salary) Records
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`holiday_working_record\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`employeeId\` VARCHAR(191) NOT NULL,
        \`attendanceId\` VARCHAR(191) NULL,
        \`holidayDate\` DATE NOT NULL,
        \`holidayName\` VARCHAR(191) NOT NULL,
        \`multiplier\` DECIMAL(4,2) NOT NULL DEFAULT 2.00,
        \`baseDailyRate\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`holidayPayAmount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'CALCULATED',
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`HolidayWorking_employeeId_date_idx\` (\`employeeId\`, \`holidayDate\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Email Notification Queue with Retry Mechanism
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`email_notification_queue\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`recipientEmail\` VARCHAR(191) NOT NULL,
        \`recipientName\` VARCHAR(191) NULL,
        \`subject\` VARCHAR(255) NOT NULL,
        \`bodyHtml\` LONGTEXT NOT NULL,
        \`eventType\` VARCHAR(100) NOT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        \`retryCount\` INT NOT NULL DEFAULT 0,
        \`maxRetries\` INT NOT NULL DEFAULT 3,
        \`lastError\` TEXT NULL,
        \`scheduledAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`sentAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`EmailQueue_status_scheduledAt_idx\` (\`status\`, \`scheduledAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Safe idempotent column additions on attendance
    try {
      const [attCols]: any = await conn.query('SHOW COLUMNS FROM `attendance`');
      const attFields = (attCols || []).map((c: any) => c.Field.toLowerCase());
      if (!attFields.includes('cooldownuntil')) {
        await conn.query('ALTER TABLE `attendance` ADD COLUMN `cooldownUntil` DATETIME(3) NULL');
      }
      if (!attFields.includes('sourcechannel')) {
        await conn.query("ALTER TABLE `attendance` ADD COLUMN `sourceChannel` VARCHAR(50) NOT NULL DEFAULT 'WEB'");
      }
    } catch (e: any) {
      console.warn('[setupAdvancedSchema] attendance column check notice:', e?.message || e);
    }

    // 7. Safe idempotent column additions on faceprofile
    try {
      const [fpCols]: any = await conn.query('SHOW COLUMNS FROM `faceprofile`');
      const fpFields = (fpCols || []).map((c: any) => c.Field.toLowerCase());
      if (!fpFields.includes('multiangleenrolled')) {
        await conn.query('ALTER TABLE `faceprofile` ADD COLUMN `multiAngleEnrolled` TINYINT(1) NOT NULL DEFAULT 0');
      }
      if (!fpFields.includes('threshold')) {
        await conn.query('ALTER TABLE `faceprofile` ADD COLUMN `threshold` DECIMAL(5,2) NOT NULL DEFAULT 70.00');
      }
      if (!fpFields.includes('embedding')) {
        await conn.query('ALTER TABLE `faceprofile` ADD COLUMN `embedding` LONGTEXT NULL');
      }
    } catch (e: any) {
      console.warn('[setupAdvancedSchema] faceprofile column check notice:', e?.message || e);
    }

    // 8. Ensure default Davanagere kiosk terminal device is registered with PIN 1234
    try {
      const [kioskRows]: any = await conn.query("SELECT id FROM kiosk_device WHERE deviceCode = 'DAV-KIOSK-01' LIMIT 1");
      if (!kioskRows || kioskRows.length === 0) {
        const [locRows]: any = await conn.query("SELECT id FROM location WHERE code = 'DAV' OR name LIKE '%Davanagere%' LIMIT 1");
        const davLocId = locRows?.[0]?.id || 'cmuwszr9500021vdtxscy3nsc';
        const pinHash = crypto.createHash('sha256').update('1234').digest('hex');
        await conn.query(
          `INSERT INTO kiosk_device (id, deviceCode, name, locationId, pinHash, status, lastHeartbeat, createdAt, updatedAt)
           VALUES ('kiosk_dav_01', 'DAV-KIOSK-01', 'Davanagere Main Entrance Kiosk', ?, ?, 'ACTIVE', NOW(3), NOW(3), NOW(3))`,
          [davLocId, pinHash]
        );
        console.log('[setupAdvancedSchema] Default kiosk terminal DAV-KIOSK-01 initialized.');
      }
    } catch (e: any) {
      console.warn('[setupAdvancedSchema] default kiosk device seed notice:', e?.message || e);
    }

    console.log('[setupAdvancedSchema] Advanced employee, face recognition, and payroll schema verified/created.');
  } catch (err: any) {
    console.error('[setupAdvancedSchema] Error ensuring advanced schema:', err);
  }
}
