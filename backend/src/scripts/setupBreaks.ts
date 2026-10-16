import { pool } from '../nativeDb.js';
import crypto from 'crypto';

function genId(prefix = 'brk_') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

export async function setupBreaks() {
  const conn = pool;

  // 1. Ensure table and columns exist in database
  try {
    const [cols]: any = await conn.query(`PRAGMA table_info(employeebreak)`);
    if (Array.isArray(cols) && cols.length > 0) {
      const colNames = cols.map((c: any) => c.name);
      if (!colNames.includes('allowedDuration')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN allowedDuration INTEGER DEFAULT 20`);
      }
      if (!colNames.includes('actualDuration')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN actualDuration INTEGER DEFAULT 0`);
      }
      if (!colNames.includes('excessDuration')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN excessDuration INTEGER DEFAULT 0`);
      }
      if (!colNames.includes('qrScanId')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN qrScanId TEXT`);
      }
    }
  } catch (e) {
    // If MySQL, ensure table exists and all required columns are present
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`employeebreak\` (
          \`id\` varchar(191) NOT NULL,
          \`attendanceId\` varchar(191) DEFAULT NULL,
          \`employeeId\` varchar(191) NOT NULL,
          \`locationId\` varchar(191) DEFAULT NULL,
          \`breakType\` enum('LUNCH','TEA','OTHER') NOT NULL DEFAULT 'TEA',
          \`breakDate\` date NOT NULL,
          \`startTime\` datetime(3) DEFAULT NULL,
          \`endTime\` datetime(3) DEFAULT NULL,
          \`allowedDuration\` int NOT NULL DEFAULT 20,
          \`actualDuration\` int DEFAULT NULL,
          \`excessDuration\` int DEFAULT NULL,
          \`durationMinutes\` double DEFAULT 0,
          \`overrunMinutes\` double DEFAULT 0,
          \`isOverrun\` tinyint DEFAULT 0,
          \`penaltyAmount\` double DEFAULT 0,
          \`status\` enum('NOT_STARTED','ACTIVE','COMPLETED','EXCEEDED','MANUALLY_ADJUSTED') NOT NULL DEFAULT 'ACTIVE',
          \`qrScanId\` varchar(191) DEFAULT NULL,
          \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      const [myCols]: any = await conn.query(`SHOW COLUMNS FROM employeebreak`);
      const existingColNames = myCols.map((c: any) => c.Field.toLowerCase());
      if (!existingColNames.includes('attendanceid')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN attendanceId varchar(191) DEFAULT NULL`);
      }
      if (!existingColNames.includes('locationid')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN locationId varchar(191) DEFAULT NULL`);
      }
      if (!existingColNames.includes('durationminutes')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN durationMinutes double DEFAULT 0`);
      }
      if (!existingColNames.includes('overrunminutes')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN overrunMinutes double DEFAULT 0`);
      }
      if (!existingColNames.includes('isoverrun')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN isOverrun tinyint DEFAULT 0`);
      }
      if (!existingColNames.includes('penaltyamount')) {
        await conn.query(`ALTER TABLE employeebreak ADD COLUMN penaltyAmount double DEFAULT 0`);
      }
    } catch (err) {
      // Table already exists or handled by SQLite
    }
  }

  // 2. Check if break records already exist
  const [existing]: any = await conn.query('SELECT count(*) as count FROM employeebreak');
  const count = Number(existing[0]?.count || 0);

  if (count > 0) {
    console.log(`[setupBreaks] employeebreak already has ${count} records. Ensuring data coverage...`);
    return;
  }

  console.log('[setupBreaks] Seeding realistic break telemetry data...');

  const [employees]: any = await conn.query(
    'SELECT id, employeeCode, fullName, locationId FROM employee LIMIT 25'
  );

  if (!employees || employees.length === 0) {
    console.warn('[setupBreaks] No employees found to seed breaks for.');
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const recordsToInsert: any[] = [];

  // A. ACTIVE BREAKS (Currently in Tea/Lunch)
  // 1. Employee 0: Active Tea Break (12 mins in, normal)
  const emp0 = employees[0];
  const sDate0 = new Date(now.getTime() - 12 * 60 * 1000);
  recordsToInsert.push({
    id: genId('brk_act_'),
    attendanceId: `att_${emp0.id}`,
    employeeId: emp0.id,
    locationId: emp0.locationId || 'loc_belagavi',
    breakType: 'TEA',
    breakDate: todayStr,
    startTime: sDate0.toISOString(),
    endTime: null,
    allowedDuration: 20,
    actualDuration: 12,
    excessDuration: 0,
    durationMinutes: 12,
    overrunMinutes: 0,
    isOverrun: 0,
    penaltyAmount: 0,
    status: 'ACTIVE',
  });

  // 2. Employee 1: Active Lunch Break (25 mins in, normal)
  const emp1 = employees[1] || employees[0];
  const sDate1 = new Date(now.getTime() - 25 * 60 * 1000);
  recordsToInsert.push({
    id: genId('brk_act_'),
    attendanceId: `att_${emp1.id}`,
    employeeId: emp1.id,
    locationId: emp1.locationId || 'loc_belagavi',
    breakType: 'LUNCH',
    breakDate: todayStr,
    startTime: sDate1.toISOString(),
    endTime: null,
    allowedDuration: 45,
    actualDuration: 25,
    excessDuration: 0,
    durationMinutes: 25,
    overrunMinutes: 0,
    isOverrun: 0,
    penaltyAmount: 0,
    status: 'ACTIVE',
  });

  // 3. Employee 2: Active Tea Break (Overrun! 26 mins in, >20 cap)
  const emp2 = employees[2] || employees[0];
  const sDate2 = new Date(now.getTime() - 26 * 60 * 1000);
  recordsToInsert.push({
    id: genId('brk_act_'),
    attendanceId: `att_${emp2.id}`,
    employeeId: emp2.id,
    locationId: emp2.locationId || 'loc_davanagere',
    breakType: 'TEA',
    breakDate: todayStr,
    startTime: sDate2.toISOString(),
    endTime: null,
    allowedDuration: 20,
    actualDuration: 26,
    excessDuration: 6,
    durationMinutes: 26,
    overrunMinutes: 6,
    isOverrun: 1,
    penaltyAmount: 0,
    status: 'ACTIVE',
  });

  // B. COMPLETED LUNCH SESSIONS (45-Minute Window)
  const lunchDurations = [38, 41, 42, 40, 44, 43, 39, 45, 42, 41];
  for (let i = 0; i < lunchDurations.length; i++) {
    const emp = employees[(i + 3) % employees.length];
    const dur = lunchDurations[i];
    const sDate = new Date(now);
    sDate.setHours(12 + (i % 3), 10 + (i * 4), 0, 0);
    const eDate = new Date(sDate.getTime() + dur * 60 * 1000);

    recordsToInsert.push({
      id: genId('brk_lnc_'),
      attendanceId: `att_${emp.id}`,
      employeeId: emp.id,
      locationId: emp.locationId || 'loc_belagavi',
      breakType: 'LUNCH',
      breakDate: todayStr,
      startTime: sDate.toISOString(),
      endTime: eDate.toISOString(),
      allowedDuration: 45,
      actualDuration: dur,
      excessDuration: 0,
      durationMinutes: dur,
      overrunMinutes: 0,
      isOverrun: 0,
      penaltyAmount: 0,
      status: 'COMPLETED',
    });
  }

  // C. LUNCH OVERRUNS (EXCEEDED)
  const lunchOverruns = [
    { dur: 53, over: 8 },
    { dur: 58, over: 13 },
  ];
  for (let i = 0; i < lunchOverruns.length; i++) {
    const emp = employees[(i + 13) % employees.length];
    const { dur, over } = lunchOverruns[i];
    const sDate = new Date(now);
    sDate.setHours(13, 15 + i * 20, 0, 0);
    const eDate = new Date(sDate.getTime() + dur * 60 * 1000);

    recordsToInsert.push({
      id: genId('brk_lnc_ovr_'),
      attendanceId: `att_${emp.id}`,
      employeeId: emp.id,
      locationId: emp.locationId || 'loc_shivamogga',
      breakType: 'LUNCH',
      breakDate: todayStr,
      startTime: sDate.toISOString(),
      endTime: eDate.toISOString(),
      allowedDuration: 45,
      actualDuration: dur,
      excessDuration: over,
      durationMinutes: dur,
      overrunMinutes: over,
      isOverrun: 1,
      penaltyAmount: over * 1.0,
      status: 'EXCEEDED',
    });
  }

  // D. COMPLETED TEA SESSIONS (20-Minute Window, Morning vs Evening)
  const teaDurations = [14, 17, 18, 16, 19, 15, 18, 17, 20, 18, 16, 19];
  for (let i = 0; i < teaDurations.length; i++) {
    const emp = employees[(i + 5) % employees.length];
    const dur = teaDurations[i];
    const isMorning = i < 7;
    const sDate = new Date(now);
    sDate.setHours(isMorning ? 10 : 16, 15 + ((i * 3) % 40), 0, 0);
    const eDate = new Date(sDate.getTime() + dur * 60 * 1000);

    recordsToInsert.push({
      id: genId('brk_tea_'),
      attendanceId: `att_${emp.id}`,
      employeeId: emp.id,
      locationId: emp.locationId || 'loc_davanagere',
      breakType: 'TEA',
      breakDate: todayStr,
      startTime: sDate.toISOString(),
      endTime: eDate.toISOString(),
      allowedDuration: 20,
      actualDuration: dur,
      excessDuration: 0,
      durationMinutes: dur,
      overrunMinutes: 0,
      isOverrun: 0,
      penaltyAmount: 0,
      status: 'COMPLETED',
    });
  }

  // E. TEA OVERRUNS (EXCEEDED)
  const teaOverruns = [
    { dur: 27, over: 7 },
    { dur: 29, over: 9 },
  ];
  for (let i = 0; i < teaOverruns.length; i++) {
    const emp = employees[(i + 18) % employees.length];
    const { dur, over } = teaOverruns[i];
    const sDate = new Date(now);
    sDate.setHours(11, 20 + i * 15, 0, 0);
    const eDate = new Date(sDate.getTime() + dur * 60 * 1000);

    recordsToInsert.push({
      id: genId('brk_tea_ovr_'),
      attendanceId: `att_${emp.id}`,
      employeeId: emp.id,
      locationId: emp.locationId || 'loc_belagavi',
      breakType: 'TEA',
      breakDate: todayStr,
      startTime: sDate.toISOString(),
      endTime: eDate.toISOString(),
      allowedDuration: 20,
      actualDuration: dur,
      excessDuration: over,
      durationMinutes: dur,
      overrunMinutes: over,
      isOverrun: 1,
      penaltyAmount: over * 1.0,
      status: 'EXCEEDED',
    });
  }

  try { await conn.query('PRAGMA foreign_keys = OFF'); } catch {}

  const toSqlDateTime = (val: string | null) => {
    if (!val) return null;
    return val.replace('T', ' ').replace('Z', '').slice(0, 19);
  };

  // Insert records into employeebreak table
  for (const r of recordsToInsert) {
    await conn.query(
      `INSERT INTO employeebreak 
       (id, attendanceId, employeeId, locationId, breakType, breakDate, startTime, endTime, allowedDuration, actualDuration, excessDuration, durationMinutes, overrunMinutes, isOverrun, penaltyAmount, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        r.id,
        r.attendanceId,
        r.employeeId,
        r.locationId,
        r.breakType,
        r.breakDate,
        toSqlDateTime(r.startTime),
        toSqlDateTime(r.endTime),
        r.allowedDuration,
        r.actualDuration,
        r.excessDuration,
        r.durationMinutes,
        r.overrunMinutes,
        r.isOverrun,
        r.penaltyAmount,
        r.status,
      ]
    );
  }

  try { await conn.query('PRAGMA foreign_keys = ON'); } catch {}

  console.log(`[setupBreaks] Successfully seeded ${recordsToInsert.length} realistic break records!`);
}

if (process.argv[1]?.includes('setupBreaks')) {
  setupBreaks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[setupBreaks error]:', err);
      process.exit(1);
    });
}
