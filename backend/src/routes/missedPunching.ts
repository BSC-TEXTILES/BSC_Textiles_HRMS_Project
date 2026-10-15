import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { pool } from '../nativeDb.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authenticate);

/** Helper to format seconds as 07h 30m */
function formatHoursMinutes(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '00h 00m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
}

/** Helper to format time as 10:00 AM */
function formatTimeOnly(dateInput: any): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Resolves Floor/Folder Manager assigned scope if user has restricted role */
async function resolveManagerScope(user: AuthRequest['user']): Promise<{ locationId?: string; floorId?: string; departmentId?: string } | null> {
  if (!user || (user.role !== 'FLOOR_MANAGER' && user.role !== 'FOLDER_MANAGER')) return null;

  try {
    const empId = user.employeeId || user.id;
    const [floors]: any = await pool.query(
      'SELECT id, locationId FROM floor WHERE floorManagerId = ? OR id = (SELECT floorId FROM employee WHERE id = ? LIMIT 1) LIMIT 1',
      [empId, empId]
    );

    const [empRows]: any = await pool.query(
      'SELECT departmentId, locationId, floorId FROM employee WHERE id = ? LIMIT 1',
      [empId]
    );

    const depId = empRows[0]?.departmentId;
    const flId = floors[0]?.id || empRows[0]?.floorId;
    const locId = floors[0]?.locationId || empRows[0]?.locationId || user.locationId;

    return { locationId: locId, floorId: flId, departmentId: depId };
  } catch (err) {
    console.error('[MissedPunching] resolveManagerScope error:', err);
    return { locationId: user.locationId };
  }
}

/**
 * GET /api/attendance/missed-punching/stats
 * Dashboard summary counts (Missed Punches, Under 9 Hours, Pending Corrections, Resolved Today)
 */
router.get('/stats', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { date, startDate, endDate, store, locationId, floorId, departmentId } = req.query;
    const mgrScope = await resolveManagerScope(req.user);
    const filterLoc = mgrScope?.locationId || (req.user!.role === 'SUPER_ADMIN' ? (store || locationId) : req.user!.locationId);
    const filterFloor = mgrScope?.floorId || floorId;
    const filterDept = mgrScope?.departmentId || departmentId;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (filterLoc && filterLoc !== 'all') {
      whereClause += ' AND (a.locationId = ? OR l.code = ?)';
      params.push(filterLoc, String(filterLoc).toUpperCase());
    }

    if (filterFloor && filterFloor !== 'all') {
      whereClause += ' AND e.floorId = ?';
      params.push(filterFloor);
    }

    if (filterDept && filterDept !== 'all') {
      whereClause += ' AND (e.departmentId = ? OR d.name = ?)';
      params.push(filterDept, filterDept);
    }

    if (date && date !== 'all') {
      whereClause += ' AND DATE(a.attendanceDate) = ?';
      params.push(date);
    } else if (startDate || endDate) {
      if (startDate) {
        whereClause += ' AND DATE(a.attendanceDate) >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND DATE(a.attendanceDate) <= ?';
        params.push(endDate);
      }
    }

    // 1. Missed punches
    const [missedRows]: any = await pool.query(
      `SELECT COUNT(DISTINCT a.id) as cnt
       FROM attendance a
       JOIN employee e ON a.employeeId = e.id
       LEFT JOIN location l ON a.locationId = l.id
       LEFT JOIN department d ON e.departmentId = d.id
       ${whereClause}
       AND (
         (a.actualLogin IS NULL AND a.actualLogout IS NOT NULL) OR
         (a.actualLogin IS NOT NULL AND a.actualLogout IS NULL) OR
         a.status = 'INCOMPLETE'
       )`,
      params
    );

    // 2. Under 9 hours (32400 seconds)
    const [under9Rows]: any = await pool.query(
      `SELECT COUNT(DISTINCT a.id) as cnt
       FROM attendance a
       JOIN employee e ON a.employeeId = e.id
       LEFT JOIN location l ON a.locationId = l.id
       LEFT JOIN department d ON e.departmentId = d.id
       ${whereClause}
       AND a.actualLogin IS NOT NULL 
       AND a.actualLogout IS NOT NULL
       AND (
         (a.effectiveWorkingSeconds > 0 AND a.effectiveWorkingSeconds < 32400) OR
         (a.effectiveWorkingSeconds = 0 AND a.totalWorkingSeconds > 0 AND a.totalWorkingSeconds < 32400)
       )`,
      params
    );

    // 3. Pending corrections
    let corrWhere = 'WHERE c.status = "PENDING"';
    const corrParams: any[] = [];
    if (filterLoc && filterLoc !== 'all') {
      corrWhere += ' AND (c.locationId = ? OR l.code = ?)';
      corrParams.push(filterLoc, String(filterLoc).toUpperCase());
    }
    if (filterFloor && filterFloor !== 'all') {
      corrWhere += ' AND e.floorId = ?';
      corrParams.push(filterFloor);
    }
    if (filterDept && filterDept !== 'all') {
      corrWhere += ' AND (e.departmentId = ? OR d.name = ?)';
      corrParams.push(filterDept, filterDept);
    }
    if (date && date !== 'all') {
      corrWhere += ' AND DATE(c.attendanceDate) = ?';
      corrParams.push(date);
    }

    const [pendingRows]: any = await pool.query(
      `SELECT COUNT(DISTINCT c.id) as cnt
       FROM attendancecorrection c
       LEFT JOIN location l ON c.locationId = l.id
       LEFT JOIN employee e ON c.employeeId = e.id
       LEFT JOIN department d ON e.departmentId = d.id
       ${corrWhere}`,
      corrParams
    );

    // 4. Resolved
    let resolvedWhere = 'WHERE c.status = "APPROVED"';
    const resolvedParams: any[] = [];
    if (filterLoc && filterLoc !== 'all') {
      resolvedWhere += ' AND (c.locationId = ? OR l.code = ?)';
      resolvedParams.push(filterLoc, String(filterLoc).toUpperCase());
    }
    if (date && date !== 'all') {
      resolvedWhere += ' AND (DATE(c.appliedAt) = ? OR DATE(c.attendanceDate) = ?)';
      resolvedParams.push(date, date);
    } else {
      resolvedWhere += ' AND (DATE(c.appliedAt) = CURDATE() OR DATE(c.updatedAt) = CURDATE())';
    }

    const [resolvedRows]: any = await pool.query(
      `SELECT COUNT(DISTINCT c.id) as cnt
       FROM attendancecorrection c
       LEFT JOIN location l ON c.locationId = l.id
       ${resolvedWhere}`,
      resolvedParams
    );

    const missedCount = Number(missedRows[0]?.cnt || 0);
    const under9Count = Number(under9Rows[0]?.cnt || 0);
    const pendingCount = Number(pendingRows[0]?.cnt || 0);
    const resolvedCount = Number(resolvedRows[0]?.cnt || 0);

    const totalAttentionNeeded = missedCount + under9Count + pendingCount;

    res.json({
      missedPunches: missedCount,
      under9Hours: under9Count,
      pendingCorrections: pendingCount,
      resolvedToday: resolvedCount,
      totalAttentionNeeded,
    });
  } catch (error: any) {
    console.error('[MissedPunching] Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch missed punching summary', message: error.message });
  }
});

/**
 * GET /api/attendance/missed-punching/folders
 * Folder-Wise (Department) aggregation of attendance exceptions
 */
router.get('/folders', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { date, startDate, endDate, store, locationId } = req.query;
    const mgrScope = await resolveManagerScope(req.user);
    const effectiveLoc = mgrScope?.locationId || (req.user!.role === 'SUPER_ADMIN' ? (store || locationId) : req.user!.locationId);

    let attDateFilter = '';
    const params: any[] = [];

    if (date && date !== 'all') {
      attDateFilter = ' AND DATE(a.attendanceDate) = ?';
      params.push(date);
    } else if (startDate || endDate) {
      if (startDate) {
        attDateFilter += ' AND DATE(a.attendanceDate) >= ?';
        params.push(startDate);
      }
      if (endDate) {
        attDateFilter += ' AND DATE(a.attendanceDate) <= ?';
        params.push(endDate);
      }
    }

    let locFilter = '';
    if (effectiveLoc && effectiveLoc !== 'all') {
      locFilter = ' AND (e.locationId = ? OR l.code = ?)';
      params.push(effectiveLoc, String(effectiveLoc).toUpperCase());
    }

    const [rows]: any = await pool.query(
      `SELECT 
        MIN(d.id) as folderId,
        d.name as folderName,
        COALESCE(l.code, 'BEL') as storeCode,
        COALESCE(l.name, 'Belagavi Head Store') as storeName,
        COUNT(DISTINCT e.id) as totalAssigned,
        COUNT(DISTINCT CASE WHEN (a.actualLogin IS NULL AND a.actualLogout IS NOT NULL) THEN a.id END) as missedIn,
        COUNT(DISTINCT CASE WHEN (a.actualLogin IS NOT NULL AND a.actualLogout IS NULL) THEN a.id END) as missedOut,
        COUNT(DISTINCT CASE WHEN (a.status = 'INCOMPLETE') THEN a.id END) as incomplete,
        COUNT(DISTINCT CASE WHEN (a.actualLogin IS NOT NULL AND a.actualLogout IS NOT NULL AND (
          (a.effectiveWorkingSeconds > 0 AND a.effectiveWorkingSeconds < 32400) OR
          (a.effectiveWorkingSeconds = 0 AND a.totalWorkingSeconds > 0 AND a.totalWorkingSeconds < 32400)
        )) THEN a.id END) as under9Hours,
        COUNT(DISTINCT CASE WHEN c.status = 'PENDING' THEN c.id END) as pendingCorrections,
        COUNT(DISTINCT CASE WHEN c.status = 'APPROVED' THEN c.id END) as resolvedIssues
      FROM department d
      JOIN employee e ON e.departmentId = d.id
      LEFT JOIN location l ON e.locationId = l.id
      LEFT JOIN attendance a ON a.employeeId = e.id ${attDateFilter}
      LEFT JOIN attendancecorrection c ON c.employeeId = e.id AND DATE(c.attendanceDate) = DATE(a.attendanceDate)
      WHERE 1=1 ${locFilter}
      GROUP BY d.name, COALESCE(l.code, 'BEL'), COALESCE(l.name, 'Belagavi Head Store')
      ORDER BY (missedIn + missedOut + under9Hours + pendingCorrections) DESC, d.name ASC`,
      params
    );

    const folders = rows.map((r: any) => ({
      folderId: r.folderId,
      folderName: r.folderName,
      storeCode: r.storeCode || 'BEL',
      storeName: r.storeName || 'Store Hub',
      totalAssigned: Number(r.totalAssigned || 0),
      missedIn: Number(r.missedIn || 0),
      missedOut: Number(r.missedOut || 0),
      incomplete: Number(r.incomplete || 0),
      missingPunchTotal: Number(r.missedIn || 0) + Number(r.missedOut || 0) + Number(r.incomplete || 0),
      under9Hours: Number(r.under9Hours || 0),
      pendingCorrections: Number(r.pendingCorrections || 0),
      resolvedIssues: Number(r.resolvedIssues || 0),
      totalAttentionNeeded: Number(r.missedIn || 0) + Number(r.missedOut || 0) + Number(r.under9Hours || 0) + Number(r.pendingCorrections || 0),
    }));

    res.json({ folders });
  } catch (error: any) {
    console.error('[MissedPunching] Folders error:', error);
    res.status(500).json({ error: 'Failed to fetch folder-wise attendance exceptions', message: error.message });
  }
});

/**
 * GET /api/attendance/missed-punching/floors
 * Floor-Wise aggregation of attendance exceptions
 */
router.get('/floors', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { date, startDate, endDate, store, locationId } = req.query;
    const mgrScope = await resolveManagerScope(req.user);
    const effectiveLoc = mgrScope?.locationId || (req.user!.role === 'SUPER_ADMIN' ? (store || locationId) : req.user!.locationId);
    const effectiveFloor = mgrScope?.floorId;

    let attDateFilter = '';
    const params: any[] = [];

    if (date && date !== 'all') {
      attDateFilter = ' AND DATE(a.attendanceDate) = ?';
      params.push(date);
    } else if (startDate || endDate) {
      if (startDate) {
        attDateFilter += ' AND DATE(a.attendanceDate) >= ?';
        params.push(startDate);
      }
      if (endDate) {
        attDateFilter += ' AND DATE(a.attendanceDate) <= ?';
        params.push(endDate);
      }
    }

    let locFilter = '';
    if (effectiveLoc && effectiveLoc !== 'all') {
      locFilter += ' AND (e.locationId = ? OR l.code = ?)';
      params.push(effectiveLoc, String(effectiveLoc).toUpperCase());
    }
    if (effectiveFloor && effectiveFloor !== 'all') {
      locFilter += ' AND fl.id = ?';
      params.push(effectiveFloor);
    }

    const [rows]: any = await pool.query(
      `SELECT 
        fl.id as floorId,
        fl.name as floorName,
        fl.floorNumber,
        l.code as storeCode,
        l.name as storeName,
        fm.fullName as floorManagerName,
        COUNT(DISTINCT e.id) as totalAssigned,
        COUNT(DISTINCT CASE WHEN (a.actualLogin IS NULL AND a.actualLogout IS NOT NULL) THEN a.id END) as missedIn,
        COUNT(DISTINCT CASE WHEN (a.actualLogin IS NOT NULL AND a.actualLogout IS NULL) THEN a.id END) as missedOut,
        COUNT(DISTINCT CASE WHEN (a.status = 'INCOMPLETE') THEN a.id END) as incomplete,
        COUNT(DISTINCT CASE WHEN (a.actualLogin IS NOT NULL AND a.actualLogout IS NOT NULL AND (
          (a.effectiveWorkingSeconds > 0 AND a.effectiveWorkingSeconds < 32400) OR
          (a.effectiveWorkingSeconds = 0 AND a.totalWorkingSeconds > 0 AND a.totalWorkingSeconds < 32400)
        )) THEN a.id END) as under9Hours,
        COUNT(DISTINCT CASE WHEN c.status = 'PENDING' THEN c.id END) as pendingCorrections,
        COUNT(DISTINCT CASE WHEN c.status = 'APPROVED' THEN c.id END) as resolvedIssues
      FROM floor fl
      JOIN employee e ON e.floorId = fl.id
      LEFT JOIN location l ON e.locationId = l.id
      LEFT JOIN employee fm ON fl.floorManagerId = fm.id
      LEFT JOIN attendance a ON a.employeeId = e.id ${attDateFilter}
      LEFT JOIN attendancecorrection c ON c.employeeId = e.id AND DATE(c.attendanceDate) = DATE(a.attendanceDate)
      WHERE 1=1 ${locFilter}
      GROUP BY fl.id, fl.name, fl.floorNumber, l.code, l.name, fm.fullName
      ORDER BY (missedIn + missedOut + under9Hours + pendingCorrections) DESC, fl.floorNumber ASC`,
      params
    );

    const floors = rows.map((r: any) => ({
      floorId: r.floorId,
      floorName: r.floorName,
      floorNumber: r.floorNumber,
      storeCode: r.storeCode || 'BEL',
      storeName: r.storeName || 'Store Hub',
      floorManagerName: r.floorManagerName || 'Floor Manager',
      totalAssigned: Number(r.totalAssigned || 0),
      missedIn: Number(r.missedIn || 0),
      missedOut: Number(r.missedOut || 0),
      incomplete: Number(r.incomplete || 0),
      missingPunchTotal: Number(r.missedIn || 0) + Number(r.missedOut || 0) + Number(r.incomplete || 0),
      under9Hours: Number(r.under9Hours || 0),
      pendingCorrections: Number(r.pendingCorrections || 0),
      resolvedIssues: Number(r.resolvedIssues || 0),
      totalAttentionNeeded: Number(r.missedIn || 0) + Number(r.missedOut || 0) + Number(r.under9Hours || 0) + Number(r.pendingCorrections || 0),
    }));

    res.json({ floors });
  } catch (error: any) {
    console.error('[MissedPunching] Floors error:', error);
    res.status(500).json({ error: 'Failed to fetch floor-wise attendance exceptions', message: error.message });
  }
});

/**
 * GET /api/attendance/missed-punching
 * Paginated, searchable, filterable list of attendance records requiring attention
 */
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const {
      date,
      startDate,
      endDate,
      store,
      locationId,
      floorId,
      departmentId,
      search,
      missingType = 'ALL',
      page = 1,
      limit = 25,
    } = req.query;

    const mgrScope = await resolveManagerScope(req.user);
    const effectiveLoc = mgrScope?.locationId || (req.user!.role === 'SUPER_ADMIN' ? (store || locationId) : req.user!.locationId);
    const effectiveFloor = mgrScope?.floorId || floorId;
    const effectiveDept = mgrScope?.departmentId || departmentId;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    // Store / Location isolation
    if (effectiveLoc && effectiveLoc !== 'all') {
      whereClause += ' AND (a.locationId = ? OR l.code = ?)';
      params.push(effectiveLoc, String(effectiveLoc).toUpperCase());
    }

    // Floor isolation
    if (effectiveFloor && effectiveFloor !== 'all') {
      whereClause += ' AND e.floorId = ?';
      params.push(effectiveFloor);
    }

    // Department / Folder filter
    if (effectiveDept && effectiveDept !== 'all') {
      whereClause += ' AND (e.departmentId = ? OR d.name = ?)';
      params.push(effectiveDept, effectiveDept);
    }

    // Date filters (defaults to all records or specified date)
    if (date && date !== 'all') {
      whereClause += ' AND DATE(a.attendanceDate) = ?';
      params.push(date);
    } else if (startDate || endDate) {
      if (startDate) {
        whereClause += ' AND DATE(a.attendanceDate) >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND DATE(a.attendanceDate) <= ?';
        params.push(endDate);
      }
    }

    // Search by employee code or name
    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      whereClause += ' AND (e.employeeCode LIKE ? OR e.fullName LIKE ?)';
      params.push(term, term);
    }

    // Core condition: Only return records that have:
    // 1. Missing punch (in or out)
    // 2. Under 9 hours
    // 3. Or incomplete / pending correction
    whereClause += ` AND (
      (a.actualLogin IS NULL AND a.actualLogout IS NOT NULL) OR
      (a.actualLogin IS NOT NULL AND a.actualLogout IS NULL) OR
      (a.status = 'INCOMPLETE') OR
      (a.actualLogin IS NOT NULL AND a.actualLogout IS NOT NULL AND (
        (a.effectiveWorkingSeconds > 0 AND a.effectiveWorkingSeconds < 32400) OR
        (a.effectiveWorkingSeconds = 0 AND a.totalWorkingSeconds > 0 AND a.totalWorkingSeconds < 32400)
      )) OR
      EXISTS (SELECT 1 FROM attendancecorrection c WHERE c.employeeId = a.employeeId AND DATE(c.attendanceDate) = DATE(a.attendanceDate) AND c.status = 'PENDING')
    )`;

    // Filter by specific missing type if requested
    if (missingType === 'MISSED_IN') {
      whereClause += ' AND a.actualLogin IS NULL AND a.actualLogout IS NOT NULL';
    } else if (missingType === 'MISSED_OUT') {
      whereClause += ' AND a.actualLogin IS NOT NULL AND a.actualLogout IS NULL';
    } else if (missingType === 'INCOMPLETE') {
      whereClause += ' AND (a.status = "INCOMPLETE" OR (a.actualLogin IS NULL AND a.actualLogout IS NULL))';
    } else if (missingType === 'UNDER_9_HOURS') {
      whereClause += ' AND a.actualLogin IS NOT NULL AND a.actualLogout IS NOT NULL AND (a.effectiveWorkingSeconds < 32400 OR a.totalWorkingSeconds < 32400)';
    }

    // Count query
    const [countRows]: any = await pool.query(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM attendance a
       JOIN employee e ON a.employeeId = e.id
       LEFT JOIN location l ON a.locationId = l.id
       LEFT JOIN department d ON e.departmentId = d.id
       ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const offset = (Number(page) - 1) * Number(limit);
    const queryParams = [...params, Number(limit), offset];

    const [rows]: any = await pool.query(
      `SELECT 
        a.id, a.employeeId, a.locationId, a.attendanceDate, a.actualLogin, a.actualLogout, 
        a.totalWorkingSeconds, a.breakSeconds, a.effectiveWorkingSeconds, a.status as attendanceStatus,
        a.updatedAt,
        e.employeeCode, e.fullName as employeeName, e.designation, e.photoReference,
        l.code as storeCode, l.name as storeName,
        d.id as departmentId, d.name as departmentName,
        fl.id as floorId, fl.name as floorName,
        fm.fullName as floorManagerName,
        s.id as shiftId, s.name as shiftName, s.startTime as shiftStartTime, s.endTime as shiftEndTime,
        (
          SELECT c.status 
          FROM attendancecorrection c 
          WHERE c.employeeId = a.employeeId 
          AND DATE(c.attendanceDate) = DATE(a.attendanceDate) 
          ORDER BY c.createdAt DESC 
          LIMIT 1
        ) as correctionStatus,
        (
          SELECT c.id 
          FROM attendancecorrection c 
          WHERE c.employeeId = a.employeeId 
          AND DATE(c.attendanceDate) = DATE(a.attendanceDate) 
          ORDER BY c.createdAt DESC 
          LIMIT 1
        ) as correctionId,
        (
          SELECT c.reason 
          FROM attendancecorrection c 
          WHERE c.employeeId = a.employeeId 
          AND DATE(c.attendanceDate) = DATE(a.attendanceDate) 
          ORDER BY c.createdAt DESC 
          LIMIT 1
        ) as correctionReason
       FROM attendance a
       JOIN employee e ON a.employeeId = e.id
       LEFT JOIN location l ON a.locationId = l.id
       LEFT JOIN department d ON e.departmentId = d.id
       LEFT JOIN floor fl ON e.floorId = fl.id
       LEFT JOIN employee fm ON fl.floorManagerId = fm.id
       LEFT JOIN shift s ON a.shiftId = s.id
       ${whereClause}
       ORDER BY a.attendanceDate DESC, a.createdAt DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    const REQUIRED_SECONDS = 9 * 3600; // 9 hours target

    const records = rows.map((r: any) => {
      const hasIn = !!r.actualLogin;
      const hasOut = !!r.actualLogout;

      // Classify missing punch type
      let missingPunchType = 'NONE';
      if (!hasIn && hasOut) missingPunchType = 'MISSED_IN';
      else if (hasIn && !hasOut) missingPunchType = 'MISSED_OUT';
      else if (!hasIn && !hasOut) missingPunchType = 'INCOMPLETE';

      // Verified working time calculation: sessions - breaks
      let verifiedWorkingSeconds = 0;
      let hoursVerifiable = false;
      if (hasIn && hasOut) {
        hoursVerifiable = true;
        const rawSec = r.effectiveWorkingSeconds > 0 
          ? r.effectiveWorkingSeconds 
          : (r.totalWorkingSeconds > 0 ? r.totalWorkingSeconds : Math.max(0, Math.floor((new Date(r.actualLogout).getTime() - new Date(r.actualLogin).getTime()) / 1000) - (r.breakSeconds || 0)));
        verifiedWorkingSeconds = Math.max(0, rawSec);
      }

      const isUnder9Hours = hoursVerifiable && verifiedWorkingSeconds < REQUIRED_SECONDS;
      const remainingSeconds = hoursVerifiable ? Math.max(0, REQUIRED_SECONDS - verifiedWorkingSeconds) : REQUIRED_SECONDS;

      // Applicable condition tags
      const conditions: string[] = [];
      if (!hasIn && hasOut) conditions.push('Missed Punch-In');
      if (hasIn && !hasOut) conditions.push('Missed Punch-Out');
      if (!hasIn && !hasOut) conditions.push('Incomplete Punch Record');
      if (isUnder9Hours) conditions.push('Under 9 Hours');
      if (r.correctionStatus === 'PENDING') conditions.push('Pending HR Review');
      if (r.correctionStatus === 'APPROVED') conditions.push('Resolved');

      // Primary display status
      let primaryStatus = 'Pending Verification';
      if (r.correctionStatus === 'APPROVED') primaryStatus = 'Resolved';
      else if (r.correctionStatus === 'PENDING') primaryStatus = 'Pending HR Review';
      else if (!hasIn && hasOut) primaryStatus = 'Missed Punch-In';
      else if (hasIn && !hasOut) primaryStatus = 'Missed Punch-Out';
      else if (!hasIn && !hasOut) primaryStatus = 'Incomplete Punch Record';
      else if (isUnder9Hours) primaryStatus = 'Under 9 Hours';

      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeCode: r.employeeCode,
        employeeName: r.employeeName,
        photoReference: r.photoReference,
        designation: r.designation || 'Staff',
        storeCode: r.storeCode || 'BEL',
        storeName: r.storeName || 'Belagavi Head Store',
        department: r.departmentName || 'General',
        departmentId: r.departmentId,
        folderName: r.departmentName || 'General',
        floor: r.floorName || 'Ground Floor',
        floorId: r.floorId,
        floorManager: r.floorManagerName || 'Floor Manager',
        attendanceDate: r.attendanceDate ? new Date(r.attendanceDate).toISOString().split('T')[0] : '—',
        scheduledShift: r.shiftName || 'Standard 9H Shift',
        scheduledLoginTime: formatTimeOnly(r.shiftStartTime),
        scheduledLogoutTime: formatTimeOnly(r.shiftEndTime),
        firstPunchIn: r.actualLogin ? new Date(r.actualLogin).toISOString() : null,
        firstPunchInFormatted: formatTimeOnly(r.actualLogin),
        lastPunchOut: r.actualLogout ? new Date(r.actualLogout).toISOString() : null,
        lastPunchOutFormatted: formatTimeOnly(r.actualLogout),
        missingPunchType,
        totalWorkingHours: hoursVerifiable ? formatHoursMinutes(verifiedWorkingSeconds) : 'Hours Cannot Be Verified',
        totalWorkingSeconds: verifiedWorkingSeconds,
        requiredWorkingHours: '09h 00m',
        requiredWorkingSeconds: REQUIRED_SECONDS,
        remainingHours: hoursVerifiable ? formatHoursMinutes(remainingSeconds) : '—',
        remainingSeconds,
        hoursStatus: hoursVerifiable ? (isUnder9Hours ? 'UNDER_9_HOURS' : 'COMPLETED_9_HOURS') : 'UNVERIFIED',
        attendanceStatus: primaryStatus,
        applicableConditions: conditions,
        breakDurationMinutes: Math.round((r.breakSeconds || 0) / 60),
        correctionStatus: r.correctionStatus || null,
        correctionId: r.correctionId || null,
        correctionReason: r.correctionReason || null,
        lastUpdated: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
      };
    });

    res.json({
      records,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error: any) {
    console.error('[MissedPunching] Get records error:', error);
    res.status(500).json({ error: 'Failed to fetch missed punching records', message: error.message });
  }
});

/**
 * GET /api/attendance/missed-punching/export
 * Exports authorized CSV report of attendance exceptions
 */
router.get('/export', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { date, startDate, endDate, store, locationId, floorId, departmentId } = req.query;
    const mgrScope = await resolveManagerScope(req.user);
    const effectiveLoc = mgrScope?.locationId || (req.user!.role === 'SUPER_ADMIN' ? (store || locationId) : req.user!.locationId);
    const effectiveFloor = mgrScope?.floorId || floorId;
    const effectiveDept = mgrScope?.departmentId || departmentId;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (effectiveLoc && effectiveLoc !== 'all') {
      whereClause += ' AND (a.locationId = ? OR l.code = ?)';
      params.push(effectiveLoc, String(effectiveLoc).toUpperCase());
    }
    if (effectiveFloor && effectiveFloor !== 'all') {
      whereClause += ' AND e.floorId = ?';
      params.push(effectiveFloor);
    }
    if (effectiveDept && effectiveDept !== 'all') {
      whereClause += ' AND (e.departmentId = ? OR d.name = ?)';
      params.push(effectiveDept, effectiveDept);
    }

    if (date && date !== 'all') {
      whereClause += ' AND DATE(a.attendanceDate) = ?';
      params.push(date);
    } else if (startDate || endDate) {
      if (startDate) {
        whereClause += ' AND DATE(a.attendanceDate) >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND DATE(a.attendanceDate) <= ?';
        params.push(endDate);
      }
    }

    whereClause += ` AND (
      (a.actualLogin IS NULL AND a.actualLogout IS NOT NULL) OR
      (a.actualLogin IS NOT NULL AND a.actualLogout IS NULL) OR
      (a.status = 'INCOMPLETE') OR
      (a.actualLogin IS NOT NULL AND a.actualLogout IS NOT NULL AND (
        (a.effectiveWorkingSeconds > 0 AND a.effectiveWorkingSeconds < 32400) OR
        (a.effectiveWorkingSeconds = 0 AND a.totalWorkingSeconds > 0 AND a.totalWorkingSeconds < 32400)
      ))
    )`;

    const [rows]: any = await pool.query(
      `SELECT 
        e.employeeCode, e.fullName as employeeName, e.designation,
        l.code as storeCode, d.name as folderName, fl.name as floorName, fm.fullName as floorManager,
        DATE(a.attendanceDate) as attDate, s.name as shiftName,
        a.actualLogin, a.actualLogout, a.effectiveWorkingSeconds, a.totalWorkingSeconds, a.breakSeconds,
        a.status as attendanceStatus
       FROM attendance a
       JOIN employee e ON a.employeeId = e.id
       LEFT JOIN location l ON a.locationId = l.id
       LEFT JOIN department d ON e.departmentId = d.id
       LEFT JOIN floor fl ON e.floorId = fl.id
       LEFT JOIN employee fm ON fl.floorManagerId = fm.id
       LEFT JOIN shift s ON a.shiftId = s.id
       ${whereClause}
       ORDER BY a.attendanceDate DESC, e.fullName ASC
       LIMIT 5000`,
      params
    );

    const headers = [
      'Employee Code',
      'Employee Name',
      'Designation',
      'Store Location',
      'Folder (Department)',
      'Floor',
      'Floor Manager',
      'Attendance Date',
      'Shift',
      'Punch-In',
      'Punch-Out',
      'Verified Working Time',
      'Required Hours',
      'Remaining Hours',
      'Attendance Status',
    ];

    const lines = [headers.join(',')];

    for (const r of rows) {
      const hasIn = !!r.actualLogin;
      const hasOut = !!r.actualLogout;
      let workedSec = 0;
      let hoursVerifiable = false;
      if (hasIn && hasOut) {
        hoursVerifiable = true;
        workedSec = r.effectiveWorkingSeconds > 0 ? r.effectiveWorkingSeconds : r.totalWorkingSeconds;
      }
      const remSec = hoursVerifiable ? Math.max(0, 32400 - workedSec) : 32400;

      let status = 'Under 9 Hours';
      if (!hasIn && hasOut) status = 'Missing Punch-In';
      else if (hasIn && !hasOut) status = 'Missing Punch-Out';
      else if (!hasIn && !hasOut) status = 'Incomplete Punch Record';

      const row = [
        `"${r.employeeCode || ''}"`,
        `"${(r.employeeName || '').replace(/"/g, '""')}"`,
        `"${(r.designation || '').replace(/"/g, '""')}"`,
        `"${r.storeCode || ''}"`,
        `"${(r.folderName || '').replace(/"/g, '""')}"`,
        `"${(r.floorName || '').replace(/"/g, '""')}"`,
        `"${(r.floorManager || '').replace(/"/g, '""')}"`,
        `"${r.attDate ? new Date(r.attDate).toISOString().split('T')[0] : ''}"`,
        `"${(r.shiftName || '').replace(/"/g, '""')}"`,
        `"${formatTimeOnly(r.actualLogin)}"`,
        `"${formatTimeOnly(r.actualLogout)}"`,
        `"${hoursVerifiable ? formatHoursMinutes(workedSec) : 'Hours Cannot Be Verified'}"`,
        `"09h 00m"`,
        `"${hoursVerifiable ? formatHoursMinutes(remSec) : '—'}"`,
        `"${status}"`,
      ];
      lines.push(row.join(','));
    }

    const csvContent = `\uFEFF${lines.join('\r\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Missed_Punching_Report_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    console.error('[MissedPunching] Export error:', error);
    res.status(500).json({ error: 'Failed to export attendance report', message: error.message });
  }
});

/**
 * POST /api/attendance/missed-punching/correct
 * Submit or apply attendance punch correction (Folder Manager / Floor Manager / HR / Admin)
 */
router.post('/correct', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const {
      attendanceId,
      employeeId,
      attendanceDate,
      punchIn,
      punchOut,
      breakDurationMinutes = 0,
      missingReason,
      correctionReason,
      managerRemarks,
    } = req.body;

    if (!employeeId || !attendanceDate) {
      return res.status(400).json({ error: 'employeeId and attendanceDate are required' });
    }
    if (!correctionReason || !correctionReason.trim()) {
      return res.status(400).json({ error: 'A mandatory correction reason is required' });
    }

    // Role-based floor/folder isolation check
    const userRole = req.user!.role;
    if (userRole === 'FLOOR_MANAGER' || userRole === 'FOLDER_MANAGER') {
      const mgrScope = await resolveManagerScope(req.user);
      const [empRows]: any = await pool.query('SELECT floorId, locationId, departmentId FROM employee WHERE id = ?', [employeeId]);
      if (empRows.length > 0) {
        const emp = empRows[0];
        if (mgrScope?.locationId && emp.locationId !== mgrScope.locationId) {
          return res.status(403).json({ error: 'Unauthorized: Cannot edit attendance outside your assigned store location.' });
        }
        if (userRole === 'FLOOR_MANAGER' && mgrScope?.floorId && emp.floorId !== mgrScope.floorId) {
          return res.status(403).json({ error: 'Unauthorized: Cannot edit attendance outside your assigned floor.' });
        }
        if (userRole === 'FOLDER_MANAGER' && mgrScope?.departmentId && emp.departmentId !== mgrScope.departmentId) {
          return res.status(403).json({ error: 'Unauthorized: Cannot edit attendance outside your assigned folder/department.' });
        }
      }
    }

    // Fetch original attendance values to preserve original punches
    const [attRows]: any = await pool.query('SELECT * FROM attendance WHERE id = ? OR (employeeId = ? AND DATE(attendanceDate) = ?)', [
      attendanceId || 'none',
      employeeId,
      attendanceDate,
    ]);

    const originalLogin = attRows[0]?.actualLogin || null;
    const originalLogout = attRows[0]?.actualLogout || null;
    const locationId = attRows[0]?.locationId || req.user!.locationId;

    const requestedLoginDate = punchIn ? new Date(punchIn) : null;
    const requestedLogoutDate = punchOut ? new Date(punchOut) : null;

    const corrId = 'corr_' + uuidv4();
    const canDirectFinalize = ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER'].includes(userRole);
    const initialStatus = canDirectFinalize ? 'APPROVED' : 'PENDING';

    const fullReason = [
      correctionReason,
      missingReason ? `[Missing Punch: ${missingReason}]` : '',
      managerRemarks ? `[Remarks: ${managerRemarks}]` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    // Non-destructive: Record in attendancecorrection
    await pool.query(
      `INSERT INTO attendancecorrection 
       (id, employeeId, locationId, attendanceDate, originalLogin, originalLogout, requestedLogin, requestedLogout, reason, status, requestedById, reviewedById, reviewNote, appliedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        corrId,
        employeeId,
        locationId,
        attendanceDate,
        originalLogin,
        originalLogout,
        requestedLoginDate,
        requestedLogoutDate,
        fullReason,
        initialStatus,
        req.user!.id,
        canDirectFinalize ? req.user!.id : null,
        canDirectFinalize ? 'Directly approved by ' + userRole : null,
        canDirectFinalize ? new Date() : null,
      ]
    );

    // If direct finalize (Admin / HR), apply to attendance immediately and recalculate hours
    if (canDirectFinalize && attRows.length > 0) {
      let totalWorkingSeconds = 0;
      let effectiveWorkingSeconds = 0;
      const breakSec = Number(breakDurationMinutes || 0) * 60;

      if (requestedLoginDate && requestedLogoutDate) {
        totalWorkingSeconds = Math.max(0, Math.floor((requestedLogoutDate.getTime() - requestedLoginDate.getTime()) / 1000));
        effectiveWorkingSeconds = Math.max(0, totalWorkingSeconds - breakSec);
      }

      await pool.query(
        `UPDATE attendance 
         SET actualLogin = COALESCE(?, actualLogin),
             actualLogout = COALESCE(?, actualLogout),
             breakSeconds = ?,
             totalWorkingSeconds = ?,
             effectiveWorkingSeconds = ?,
             status = 'PRESENT',
             updatedAt = NOW()
         WHERE id = ?`,
        [requestedLoginDate, requestedLogoutDate, breakSec, totalWorkingSeconds, effectiveWorkingSeconds, attRows[0].id]
      );
    }

    res.json({
      success: true,
      correctionId: corrId,
      status: initialStatus,
      message: canDirectFinalize
        ? 'Attendance record corrected and finalized successfully.'
        : 'Attendance correction submitted successfully for HR approval.',
    });
  } catch (error: any) {
    console.error('[MissedPunching] Correction error:', error);
    res.status(500).json({ error: 'Failed to process attendance correction', message: error.message });
  }
});

/**
 * POST /api/attendance/missed-punching/approve
 * HR / Admin approves attendance correction and updates working hours
 */
router.post('/approve', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { correctionId, reviewNote } = req.body;
    if (!correctionId) return res.status(400).json({ error: 'correctionId is required' });

    const [corrRows]: any = await pool.query('SELECT * FROM attendancecorrection WHERE id = ?', [correctionId]);
    if (corrRows.length === 0) return res.status(404).json({ error: 'Correction record not found' });

    const corr = corrRows[0];
    const reviewerId = req.user!.id;

    // Update correction status
    await pool.query(
      'UPDATE attendancecorrection SET status = "APPROVED", reviewedById = ?, reviewNote = ?, appliedAt = NOW(), updatedAt = NOW() WHERE id = ?',
      [reviewerId, reviewNote || 'Approved by HR', correctionId]
    );

    // Apply correction to attendance and recalculate working hours
    const loginDate = corr.requestedLogin ? new Date(corr.requestedLogin) : null;
    const logoutDate = corr.requestedLogout ? new Date(corr.requestedLogout) : null;
    let totalSec = 0;
    let effectiveSec = 0;
    if (loginDate && logoutDate) {
      totalSec = Math.max(0, Math.floor((logoutDate.getTime() - loginDate.getTime()) / 1000));
      effectiveSec = totalSec;
    }

    await pool.query(
      `UPDATE attendance 
       SET actualLogin = COALESCE(?, actualLogin),
           actualLogout = COALESCE(?, actualLogout),
           totalWorkingSeconds = ?,
           effectiveWorkingSeconds = ?,
           status = 'PRESENT',
           updatedAt = NOW()
       WHERE employeeId = ? AND DATE(attendanceDate) = DATE(?)`,
      [loginDate, logoutDate, totalSec, effectiveSec, corr.employeeId, corr.attendanceDate]
    );

    res.json({ success: true, message: 'Correction approved and attendance record updated.' });
  } catch (error: any) {
    console.error('[MissedPunching] Approve error:', error);
    res.status(500).json({ error: 'Failed to approve correction', message: error.message });
  }
});

/**
 * POST /api/attendance/missed-punching/reject
 * HR / Admin rejects attendance correction
 */
router.post('/reject', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { correctionId, reviewNote } = req.body;
    if (!correctionId) return res.status(400).json({ error: 'correctionId is required' });

    await pool.query(
      'UPDATE attendancecorrection SET status = "REJECTED", reviewedById = ?, reviewNote = ?, updatedAt = NOW() WHERE id = ?',
      [req.user!.id, reviewNote || 'Correction request rejected by HR', correctionId]
    );

    res.json({ success: true, message: 'Correction request rejected.' });
  } catch (error: any) {
    console.error('[MissedPunching] Reject error:', error);
    res.status(500).json({ error: 'Failed to reject correction', message: error.message });
  }
});

/**
 * GET /api/attendance/missed-punching/history/:employeeId/:date
 * Complete audit trail for employee and attendance date
 */
router.get('/history/:employeeId/:date', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, date } = req.params;

    const [attRows]: any = await pool.query(
      'SELECT * FROM attendance WHERE employeeId = ? AND DATE(attendanceDate) = ?',
      [employeeId, date]
    );

    const [corrRows]: any = await pool.query(
      `SELECT c.*, u.fullName as requestedByName, r.fullName as reviewedByName
       FROM attendancecorrection c
       LEFT JOIN user u ON c.requestedById = u.id
       LEFT JOIN user r ON c.reviewedById = r.id
       WHERE c.employeeId = ? AND DATE(c.attendanceDate) = ?
       ORDER BY c.createdAt DESC`,
      [employeeId, date]
    );

    const [breakRows]: any = await pool.query(
      'SELECT * FROM employeebreak WHERE employeeId = ? AND DATE(breakDate) = ? ORDER BY startTime ASC',
      [employeeId, date]
    );

    res.json({
      attendance: attRows[0] || null,
      corrections: corrRows,
      breaks: breakRows,
    });
  } catch (error: any) {
    console.error('[MissedPunching] History error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history', message: error.message });
  }
});

export default router;
