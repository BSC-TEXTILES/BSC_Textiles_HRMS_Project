import { Router } from 'express';
import { z } from 'zod';
import { prisma, pool } from '../db.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { cacheService } from '../services/cacheService.js';

const router = Router();

router.use(authenticate);

/** Canonical standard shift names for BSC Textiles HRMS */
export const STANDARD_SHIFT_NAMES = [
  'Shift I',
  'Shift II',
  'Shift III',
  'Shift IV',
  'Shift V',
  'Shift VI',
  'Shift VII',
  'Shift VIII',
  'Shift IX',
] as const;

/** 24-hour wall-clock time, e.g. "09:30" or "16:30:00". */
const timeOfDay = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be in HH:MM format (24-hour)');

const shiftSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(50),
    code: z.string().min(2).max(50).toUpperCase().optional(),
    locationId: z.string().optional(),
    departmentId: z.string().optional(),
    startTime: timeOfDay,
    endTime: timeOfDay,
    gracePeriod: z.number().int().min(0).max(60).optional(),
    lateThreshold: z.number().int().min(0).max(120).optional(),
    earlyLoginIncentive: z.boolean().optional(),
    earlyLoginRatePerMinute: z.number().optional(),
    earlyLoginRatePerSecond: z.number().optional(),
    latePenaltyEnabled: z.boolean().optional(),
    latePenaltyRatePerMinute: z.number().optional(),
    latePenaltyRatePerSecond: z.number().optional(),
    overtimeEnabled: z.boolean().optional(),
    overtimeRatePerSecond: z.number().optional(),
    earlyLogoutPenaltyEnabled: z.boolean().optional(),
    earlyLogoutRatePerSecond: z.number().optional(),
    lunchDurationMinutes: z.number().int().min(0).max(480).optional(),
    teaDurationMinutes: z.number().int().min(0).max(120).optional(),
    maleLunchMinutes: z.number().int().min(0).max(480).optional(),
    femaleLunchMinutes: z.number().int().min(0).max(480).optional(),
    maleTeaMinutes: z.number().int().min(0).max(120).optional(),
    femaleTeaMinutes: z.number().int().min(0).max(120).optional(),
    faceVerificationThreshold: z.number().min(0).max(100).optional(),
    scannerRoles: z.any().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  }),
});

/** Return standard shift names and status for a given location */
router.get('/standard-names', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;
    const scopedLocId = getScopedLocationId(req.user, locationId);

    let whereClause = "WHERE status = 'ACTIVE'";
    const params: any[] = [];
    if (scopedLocId && scopedLocId !== 'all') {
      whereClause += ' AND (locationId = ? OR locationId IN (SELECT id FROM location WHERE code = ?))';
      params.push(scopedLocId, scopedLocId.toUpperCase());
    }

    const [existing]: any = await pool.query(
      `SELECT DISTINCT name FROM shift ${whereClause}`,
      params
    );
    const existingSet = new Set((existing || []).map((e: any) => e.name.trim().toLowerCase()));

    const result = STANDARD_SHIFT_NAMES.map((name) => ({
      name,
      isConfigured: existingSet.has(name.toLowerCase()),
    }));

    res.json({ standardNames: result });
  } catch (error) {
    console.error('Get standard shift names error:', error);
    res.status(500).json({ error: 'Failed to retrieve standard shift names' });
  }
});

/** Get all shifts with location filtering, search, and accurate staff counts */
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId, status, search, page = 1, limit = 100 } = req.query;
    const scopedLocId = getScopedLocationId(req.user, locationId);

    let resolvedLocId = scopedLocId;
    if (resolvedLocId && resolvedLocId !== 'all') {
      const [locRows]: any = await pool.query(
        'SELECT id FROM location WHERE id = ? OR code = ? LIMIT 1',
        [resolvedLocId, String(locationId || resolvedLocId).toUpperCase()]
      );
      if (locRows && locRows.length > 0) {
        resolvedLocId = locRows[0].id;
      }
    }

    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    if (resolvedLocId && resolvedLocId !== 'all') {
      whereConditions.push('s.locationId = ?');
      queryParams.push(resolvedLocId);
    }
    if (departmentId && departmentId !== 'all') {
      whereConditions.push('s.departmentId = ?');
      queryParams.push(departmentId);
    }
    if (status) {
      whereConditions.push('s.status = ?');
      queryParams.push(status);
    } else {
      whereConditions.push("s.status = 'ACTIVE'");
    }
    if (search && typeof search === 'string' && search.trim()) {
      whereConditions.push('(s.name LIKE ? OR s.code LIKE ?)');
      queryParams.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total shifts matching filter
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) as total FROM shift s ${whereClause}`,
      queryParams
    );
    const total = Number(countRows[0]?.total || 0);

    const offset = (Number(page) - 1) * Number(limit);
    const dataParams = [...queryParams, Number(limit), offset];

    // Fetch shifts with department name, location info, and active employee counts
    const [rows]: any = await pool.query(
      `SELECT 
        s.*,
        l.name as locationName,
        l.code as locationCode,
        d.name as departmentName,
        (
          SELECT COUNT(e.id) 
          FROM employee e 
          WHERE e.shiftId = s.id AND e.status = 'ACTIVE'
        ) as activeStaffCount
       FROM shift s
       LEFT JOIN location l ON s.locationId = l.id
       LEFT JOIN department d ON s.departmentId = d.id
       ${whereClause}
       ORDER BY 
         CASE 
           WHEN s.name LIKE 'Shift I%' THEN 1
           WHEN s.name LIKE 'Shift II%' THEN 2
           WHEN s.name LIKE 'Shift III%' THEN 3
           WHEN s.name LIKE 'Shift IV%' THEN 4
           WHEN s.name LIKE 'Shift V%' THEN 5
           WHEN s.name LIKE 'Shift VI%' THEN 6
           WHEN s.name LIKE 'Shift VII%' THEN 7
           WHEN s.name LIKE 'Shift VIII%' THEN 8
           WHEN s.name LIKE 'Shift IX%' THEN 9
           ELSE 10
         END ASC,
         s.startTime ASC,
         s.name ASC
       LIMIT ? OFFSET ?`,
      dataParams
    );

    // Format shifts for frontend consistency
    const shifts = (rows || []).map((s: any) => {
      let scanner = {};
      if (typeof s.scannerRoles === 'string') {
        try {
          scanner = JSON.parse(s.scannerRoles);
        } catch {}
      } else if (s.scannerRoles && typeof s.scannerRoles === 'object') {
        scanner = s.scannerRoles;
      }

      const staffCount = Number(s.activeStaffCount || 0);

      return {
        id: s.id,
        name: s.name,
        code: s.code,
        locationId: s.locationId,
        locationName: s.locationName,
        locationCode: s.locationCode,
        departmentId: s.departmentId,
        department: s.departmentName ? { id: s.departmentId, name: s.departmentName } : null,
        startTime: s.startTime,
        endTime: s.endTime,
        gracePeriod: s.gracePeriod ?? 5,
        lateThreshold: s.lateThreshold ?? 15,
        earlyLoginIncentive: Boolean(s.earlyLoginIncentive),
        latePenaltyEnabled: Boolean(s.latePenaltyEnabled),
        overtimeEnabled: Boolean(s.overtimeEnabled),
        earlyLogoutPenaltyEnabled: Boolean(s.earlyLogoutPenaltyEnabled),
        lunchDurationMinutes: s.lunchDurationMinutes ?? 45,
        teaDurationMinutes: s.teaDurationMinutes ?? 15,
        maleLunchMinutes: s.maleLunchMinutes ?? s.lunchDurationMinutes ?? 45,
        femaleLunchMinutes: s.femaleLunchMinutes ?? s.lunchDurationMinutes ?? 45,
        maleTeaMinutes: s.maleTeaMinutes ?? s.teaDurationMinutes ?? 15,
        femaleTeaMinutes: s.femaleTeaMinutes ?? s.teaDurationMinutes ?? 15,
        faceVerificationThreshold: s.faceVerificationThreshold ?? 85,
        scannerRoles: scanner,
        status: s.status,
        staffCount,
        _count: { employees: staffCount },
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });

    res.json({ shifts, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ error: 'Failed to get shifts' });
  }
});

/** Get single shift by ID */
router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT s.*, l.name as locationName, l.code as locationCode, d.name as departmentName,
        (SELECT COUNT(e.id) FROM employee e WHERE e.shiftId = s.id AND e.status = 'ACTIVE') as activeStaffCount
       FROM shift s
       LEFT JOIN location l ON s.locationId = l.id
       LEFT JOIN department d ON s.departmentId = d.id
       WHERE s.id = ? LIMIT 1`,
      [req.params.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const shift = rows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && shift.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied to this shift location' });
    }

    let scanner = {};
    if (typeof shift.scannerRoles === 'string') {
      try {
        scanner = JSON.parse(shift.scannerRoles);
      } catch {}
    } else if (shift.scannerRoles && typeof shift.scannerRoles === 'object') {
      scanner = shift.scannerRoles;
    }

    res.json({
      ...shift,
      scannerRoles: scanner,
      staffCount: Number(shift.activeStaffCount || 0),
      _count: { employees: Number(shift.activeStaffCount || 0) },
    });
  } catch (error) {
    console.error('Get shift error:', error);
    res.status(500).json({ error: 'Failed to get shift' });
  }
});

/** Get all employees assigned to a specific shift */
router.get('/:id/employees', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status = 'ACTIVE', search } = req.query;

    const [shiftRows]: any = await pool.query(
      'SELECT id, name, code, locationId FROM shift WHERE id = ? LIMIT 1',
      [id]
    );
    if (!shiftRows || shiftRows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const targetShift = shiftRows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && targetShift.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied to this shift location' });
    }

    const conditions: string[] = ['e.shiftId = ?'];
    const params: any[] = [id];

    if (status && status !== 'all') {
      conditions.push('e.status = ?');
      params.push(status);
    }
    if (search && typeof search === 'string' && search.trim()) {
      conditions.push('(e.fullName LIKE ? OR e.employeeCode LIKE ? OR e.designation LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [employees]: any = await pool.query(
      `SELECT 
        e.id,
        e.employeeCode,
        e.fullName,
        e.gender,
        e.designation,
        e.status,
        e.phone,
        e.joiningDate,
        e.locationId,
        e.departmentId,
        d.name as departmentName,
        l.name as locationName
       FROM employee e
       LEFT JOIN department d ON e.departmentId = d.id
       LEFT JOIN location l ON e.locationId = l.id
       ${whereClause}
       ORDER BY e.fullName ASC`,
      params
    );

    res.json({
      shift: {
        id: targetShift.id,
        name: targetShift.name,
        code: targetShift.code,
      },
      employees: employees || [],
      total: employees ? employees.length : 0,
    });
  } catch (error) {
    console.error('Get shift employees error:', error);
    res.status(500).json({ error: 'Failed to get shift employees' });
  }
});

/** Create a new shift (standard or customized) */
router.post('/', authorize('ADD'), validate(shiftSchema), async (req: AuthRequest, res) => {
  try {
    const {
      name,
      code,
      locationId,
      departmentId,
      startTime,
      endTime,
      gracePeriod = 5,
      lateThreshold = 15,
      lunchDurationMinutes = 45,
      teaDurationMinutes = 15,
      maleLunchMinutes,
      femaleLunchMinutes,
      maleTeaMinutes,
      femaleTeaMinutes,
      ...rest
    } = req.body;

    let resolvedLocId = locationId;
    if (!resolvedLocId || resolvedLocId === 'all') {
      resolvedLocId = req.user?.locationId;
      if (!resolvedLocId) {
        // Fallback to first active location
        const [firstLoc]: any = await pool.query('SELECT id FROM location ORDER BY code ASC LIMIT 1');
        resolvedLocId = firstLoc?.[0]?.id;
      }
    } else {
      const [locMatch]: any = await pool.query(
        'SELECT id, code, name FROM location WHERE id = ? OR code = ? LIMIT 1',
        [resolvedLocId, String(resolvedLocId).toUpperCase()]
      );
      if (locMatch && locMatch.length > 0) {
        resolvedLocId = locMatch[0].id;
      }
    }

    if (!resolvedLocId) {
      return res.status(400).json({ error: 'Valid location hub is required' });
    }

    if (req.user!.role !== 'SUPER_ADMIN' && resolvedLocId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied to create shift for this location' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ error: 'Shift name is required' });
    }

    // Check unique shift name within location
    const [existingName]: any = await pool.query(
      'SELECT id FROM shift WHERE locationId = ? AND LOWER(name) = LOWER(?) LIMIT 1',
      [resolvedLocId, trimmedName]
    );
    if (existingName && existingName.length > 0) {
      return res.status(400).json({ error: `Shift name "${trimmedName}" already exists for this location` });
    }

    // Auto-generate code if not provided
    const [locRows]: any = await pool.query('SELECT code FROM location WHERE id = ? LIMIT 1', [resolvedLocId]);
    const locCode = locRows?.[0]?.code || 'LOC';
    const cleanCode = (
      code ||
      `${locCode}_` +
        trimmedName.replace(/[^A-Z0-9]/gi, '_').replace(/_+/g, '_').toUpperCase()
    ).slice(0, 50);

    const [existingCode]: any = await pool.query(
      'SELECT id FROM shift WHERE locationId = ? AND code = ? LIMIT 1',
      [resolvedLocId, cleanCode]
    );
    if (existingCode && existingCode.length > 0) {
      return res.status(400).json({ error: `Shift code "${cleanCode}" already exists for this location` });
    }

    const shiftId = `shift-${locCode.toLowerCase()}-${Date.now().toString(36)}`;
    const startDateTime = `2024-01-01 ${startTime.slice(0, 5)}:00`;
    const endDateTime = `2024-01-01 ${endTime.slice(0, 5)}:00`;

    const finalMaleLunch = maleLunchMinutes ?? lunchDurationMinutes ?? 45;
    const finalFemaleLunch = femaleLunchMinutes ?? lunchDurationMinutes ?? 45;
    const finalMaleTea = maleTeaMinutes ?? teaDurationMinutes ?? 15;
    const finalFemaleTea = femaleTeaMinutes ?? teaDurationMinutes ?? 15;

    await pool.query(
      `INSERT INTO shift (
        id, name, code, locationId, departmentId, startTime, endTime, gracePeriod, lateThreshold,
        earlyLoginIncentive, latePenaltyEnabled, overtimeEnabled, earlyLogoutPenaltyEnabled,
        lunchDurationMinutes, teaDurationMinutes, maleLunchMinutes, femaleLunchMinutes, maleTeaMinutes, femaleTeaMinutes,
        status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(3), NOW(3))`,
      [
        shiftId,
        trimmedName,
        cleanCode,
        resolvedLocId,
        departmentId || null,
        startDateTime,
        endDateTime,
        gracePeriod,
        lateThreshold,
        rest.earlyLoginIncentive ?? 1,
        rest.latePenaltyEnabled ?? 0,
        rest.overtimeEnabled ?? 1,
        rest.earlyLogoutPenaltyEnabled ?? 0,
        lunchDurationMinutes,
        teaDurationMinutes,
        finalMaleLunch,
        finalFemaleLunch,
        finalMaleTea,
        finalFemaleTea,
      ]
    );

    // Audit log
    try {
      await pool.query(
        `INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, newValue, createdAt)
         VALUES (?, ?, ?, 'CREATE', 'Shift', ?, ?, NOW(3))`,
        [
          `al_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          req.user!.id,
          resolvedLocId,
          shiftId,
          JSON.stringify({ name: trimmedName, code: cleanCode, startTime, endTime }),
        ]
      );
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr);
    }

    cacheService.invalidateShifts();

    const [created]: any = await pool.query('SELECT * FROM shift WHERE id = ? LIMIT 1', [shiftId]);
    res.status(201).json(created?.[0] || { id: shiftId, name: trimmedName, code: cleanCode });
  } catch (error) {
    console.error('Create shift error:', error);
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

/** Update an existing shift */
router.put('/:id', authorize('EDIT'), validate(shiftSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      startTime,
      endTime,
      gracePeriod,
      lateThreshold,
      lunchDurationMinutes,
      teaDurationMinutes,
      maleLunchMinutes,
      femaleLunchMinutes,
      maleTeaMinutes,
      femaleTeaMinutes,
      departmentId,
      status,
      ...rest
    } = req.body;

    const [existingRows]: any = await pool.query('SELECT * FROM shift WHERE id = ? LIMIT 1', [id]);
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    const existing = existingRows[0];

    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied to this shift location' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : existing.name;

    // Check unique shift name within location (excluding this shift)
    const [nameClash]: any = await pool.query(
      'SELECT id FROM shift WHERE locationId = ? AND LOWER(name) = LOWER(?) AND id != ? LIMIT 1',
      [existing.locationId, trimmedName, id]
    );
    if (nameClash && nameClash.length > 0) {
      return res.status(400).json({ error: `Another shift named "${trimmedName}" already exists for this location` });
    }

    const startDateTime = startTime ? `2024-01-01 ${startTime.slice(0, 5)}:00` : existing.startTime;
    const endDateTime = endTime ? `2024-01-01 ${endTime.slice(0, 5)}:00` : existing.endTime;

    await pool.query(
      `UPDATE shift SET
        name = ?,
        code = ?,
        startTime = ?,
        endTime = ?,
        gracePeriod = COALESCE(?, gracePeriod),
        lateThreshold = COALESCE(?, lateThreshold),
        lunchDurationMinutes = COALESCE(?, lunchDurationMinutes),
        teaDurationMinutes = COALESCE(?, teaDurationMinutes),
        maleLunchMinutes = COALESCE(?, maleLunchMinutes),
        femaleLunchMinutes = COALESCE(?, femaleLunchMinutes),
        maleTeaMinutes = COALESCE(?, maleTeaMinutes),
        femaleTeaMinutes = COALESCE(?, femaleTeaMinutes),
        departmentId = ?,
        status = COALESCE(?, status),
        updatedAt = NOW(3)
       WHERE id = ?`,
      [
        trimmedName,
        code || existing.code,
        startDateTime,
        endDateTime,
        gracePeriod,
        lateThreshold,
        lunchDurationMinutes,
        teaDurationMinutes,
        maleLunchMinutes,
        femaleLunchMinutes,
        maleTeaMinutes,
        femaleTeaMinutes,
        departmentId !== undefined ? departmentId : existing.departmentId,
        status,
        id,
      ]
    );

    // Audit log
    try {
      await pool.query(
        `INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, oldValue, newValue, createdAt)
         VALUES (?, ?, ?, 'UPDATE', 'Shift', ?, ?, ?, NOW(3))`,
        [
          `al_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          req.user!.id,
          existing.locationId,
          id,
          JSON.stringify({ name: existing.name, startTime: existing.startTime, endTime: existing.endTime }),
          JSON.stringify({ name: trimmedName, startTime, endTime }),
        ]
      );
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr);
    }

    cacheService.invalidateShifts();

    const [updated]: any = await pool.query('SELECT * FROM shift WHERE id = ? LIMIT 1', [id]);
    res.json(updated?.[0] || { id, name: trimmedName });
  } catch (error) {
    console.error('Update shift error:', error);
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

/** Reassign an employee or list of employees to another shift */
router.post('/reassign', authorize('EDIT'), async (req: AuthRequest, res) => {
  const conn = await pool.getConnection();
  try {
    const { employeeIds, targetShiftId, sourceShiftId, notes } = req.body;

    const ids: string[] = Array.isArray(employeeIds) ? employeeIds : employeeIds ? [employeeIds] : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Please select at least one employee to reassign' });
    }

    if (!targetShiftId) {
      return res.status(400).json({ error: 'Target shift is required' });
    }

    // Verify target shift exists
    const [targetRows]: any = await conn.query(
      'SELECT id, name, locationId, status FROM shift WHERE id = ? LIMIT 1',
      [targetShiftId]
    );
    if (!targetRows || targetRows.length === 0) {
      return res.status(404).json({ error: 'Target shift not found' });
    }
    const targetShift = targetRows[0];

    if (req.user!.role !== 'SUPER_ADMIN' && targetShift.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied to target shift location' });
    }

    await conn.beginTransaction();

    // Verify employees exist and belong to authorized location
    const placeholders = ids.map(() => '?').join(', ');
    const [emps]: any = await conn.query(
      `SELECT id, employeeCode, fullName, locationId, shiftId FROM employee WHERE id IN (${placeholders})`,
      ids
    );

    if (emps.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'No matching employees found' });
    }

    for (const emp of emps) {
      if (req.user!.role !== 'SUPER_ADMIN' && emp.locationId !== req.user!.locationId) {
        await conn.rollback();
        return res.status(403).json({
          error: `Access denied to reassign employee ${emp.fullName} (${emp.employeeCode}) belonging to another location`,
        });
      }
    }

    // Perform reassignment
    await conn.query(
      `UPDATE employee SET shiftId = ?, updatedAt = NOW(3) WHERE id IN (${placeholders})`,
      [targetShiftId, ...ids]
    );

    // Audit log
    await conn.query(
      `INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, oldValue, newValue, createdAt)
       VALUES (?, ?, ?, 'REASSIGN', 'EmployeeShift', ?, ?, ?, NOW(3))`,
      [
        `al_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        req.user!.id,
        targetShift.locationId,
        targetShiftId,
        JSON.stringify({ sourceShiftId, employeeCount: ids.length, employeeIds: ids }),
        JSON.stringify({ targetShiftId, targetShiftName: targetShift.name, notes }),
      ]
    );

    await conn.commit();

    cacheService.invalidateShifts();
    cacheService.invalidateAttendance();

    res.json({
      message: `Successfully reassigned ${ids.length} employee(s) to ${targetShift.name}`,
      reassignedCount: ids.length,
      targetShift: {
        id: targetShift.id,
        name: targetShift.name,
      },
    });
  } catch (error) {
    await conn.rollback();
    console.error('Reassign shift error:', error);
    res.status(500).json({ error: 'Failed to reassign employees to shift' });
  } finally {
    conn.release();
  }
});

/** Safe deletion/archival handler */
async function handleSafeDeleteShift(req: AuthRequest, res: any) {
  try {
    const { id } = req.params;

    const [existingRows]: any = await pool.query(
      'SELECT id, name, locationId FROM shift WHERE id = ? LIMIT 1',
      [id]
    );
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    const existing = existingRows[0];

    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied to this shift location' });
    }

    // Check for assigned active employees
    const [assigned]: any = await pool.query(
      `SELECT e.id, e.employeeCode, e.fullName, d.name as departmentName
       FROM employee e
       LEFT JOIN department d ON e.departmentId = d.id
       WHERE e.shiftId = ? AND e.status = 'ACTIVE'`,
      [id]
    );

    if (assigned && assigned.length > 0) {
      return res.status(400).json({
        code: 'BLOCKED_ASSIGNED_STAFF',
        error: `Cannot delete shift "${existing.name}". ${assigned.length} employee(s) are currently assigned. Please reassign them to another shift first.`,
        assignedCount: assigned.length,
        employees: assigned.slice(0, 10).map((e: any) => ({
          id: e.id,
          code: e.employeeCode,
          name: e.fullName,
          department: e.departmentName,
        })),
        requiresReassignment: true,
      });
    }

    // Check for historical attendance records referencing this shift
    const [attRows]: any = await pool.query(
      'SELECT COUNT(*) as count FROM attendance WHERE shiftId = ?',
      [id]
    );
    const hasHistoricalAttendance = Number(attRows[0]?.count || 0) > 0;

    if (hasHistoricalAttendance) {
      // Soft-delete to preserve historical attendance calculations and referential integrity
      await pool.query(
        "UPDATE shift SET status = 'INACTIVE', updatedAt = NOW(3) WHERE id = ?",
        [id]
      );
    } else {
      // Safe to permanently delete from database
      await pool.query('DELETE FROM shift WHERE id = ?', [id]);
    }

    // Audit log
    try {
      await pool.query(
        `INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, oldValue, createdAt)
         VALUES (?, ?, ?, 'DELETE', 'Shift', ?, NOW(3))`,
        [
          `al_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          req.user!.id,
          existing.locationId,
          id,
          JSON.stringify({ name: existing.name, softDeleted: hasHistoricalAttendance }),
        ]
      );
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr);
    }

    cacheService.invalidateShifts();

    res.json({
      success: true,
      shiftId: id,
      name: existing.name,
      message: `Shift "${existing.name}" deleted successfully${hasHistoricalAttendance ? ' (archived to preserve historical records)' : ''}`,
      softDeleted: hasHistoricalAttendance,
    });
  } catch (error) {
    console.error('Delete shift error:', error);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
}

/** Delete a shift safely */
router.delete('/:id', authorize('DELETE'), handleSafeDeleteShift);

/** Archive/Soft-delete a shift safely */
router.patch('/:id/archive', authorize('DELETE'), handleSafeDeleteShift);

export default router;