import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { socketIO } from '../socket.js';
import { safeJsonParse } from '../utils/safeJson.js';
import { businessDateOf } from '../services/workforceEvents.js';

const router = Router();

router.use(authenticate);

// Helper to format date strings YYYY-MM-DD
function formatToYMD(d: Date | string): string {
  const dt = new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 1. GET /dashboard
 * Returns 12 summary metrics according to selected filters.
 */
router.get('/dashboard', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId, shiftId, date, startDate, endDate, fineStatus, attendanceStatus, approvalStatus, payrollStatus } = req.query;

    let scopedLocId = getScopedLocationId(req.user, locationId as string);
    if (scopedLocId === 'all') scopedLocId = undefined;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (scopedLocId) {
      conditions.push('(lar.locationId = ? OR l.code = ?)');
      params.push(scopedLocId, scopedLocId.replace(/^loc_/, '').toUpperCase());
    }
    if (departmentId && departmentId !== 'all') {
      conditions.push('lar.departmentId = ?');
      params.push(departmentId);
    }
    if (shiftId && shiftId !== 'all') {
      conditions.push('lar.shiftId = ?');
      params.push(shiftId);
    }
    const effFineStatus = fineStatus || attendanceStatus;
    if (effFineStatus && effFineStatus !== 'all') {
      conditions.push('lar.fineStatus = ?');
      params.push(effFineStatus);
    }
    if (approvalStatus && approvalStatus !== 'all') {
      conditions.push('lar.approvalStatus = ?');
      params.push(approvalStatus);
    }
    if (payrollStatus && payrollStatus !== 'all') {
      conditions.push('lar.payrollStatus = ?');
      params.push(payrollStatus);
    }

    if (date) {
      conditions.push('lar.recordDate = ?');
      params.push(String(date).split('T')[0]);
    } else if (startDate || endDate) {
      if (startDate) {
        conditions.push('lar.recordDate >= ?');
        params.push(String(startDate).split('T')[0]);
      }
      if (endDate) {
        conditions.push('lar.recordDate <= ?');
        params.push(String(endDate).split('T')[0]);
      }
    } else {
      // Default to today in the business timezone. The literal '2026-10-11'
      // that used to sit here meant the dashboard quietly showed a fixed
      // historical day whenever the caller omitted ?date=.
      conditions.push('lar.recordDate = ?');
      params.push(businessDateOf());
    }

    const whereClause = conditions.join(' AND ');

    // Query metrics
    const [rows]: any = await pool.query(`
      SELECT 
        COUNT(lar.id) as totalScheduled,
        SUM(CASE WHEN lar.actualPunchIn IS NOT NULL THEN 1 ELSE 0 END) as employeesPresent,
        SUM(CASE WHEN lar.chargeableLateSeconds > 0 THEN 1 ELSE 0 END) as employeesArrivedLate,
        SUM(CASE WHEN lar.lateSeconds > 0 AND lar.chargeableLateSeconds = 0 THEN 1 ELSE 0 END) as employeesWithinGracePeriod,
        SUM(CASE WHEN lar.actualPunchIn IS NULL THEN 1 ELSE 0 END) as employeesWithMissingPunches,
        SUM(lar.chargeableLateSeconds) as totalLateSeconds,
        SUM(lar.calculatedFine) as totalFineCalculated,
        SUM(CASE WHEN lar.approvalStatus IN ('PENDING', 'PENDING_APPROVAL', 'PENDING_REVIEW') AND lar.chargeableLateSeconds > 0 THEN lar.calculatedFine ELSE 0 END) as totalFinePendingApproval,
        SUM(CASE WHEN lar.approvalStatus = 'APPROVED' THEN lar.approvedFine ELSE 0 END) as totalFineApproved,
        SUM(CASE WHEN lar.payrollStatus = 'APPLIED_TO_PAYROLL' THEN lar.finalFine ELSE 0 END) as totalFineAppliedToPayroll,
        SUM(CASE WHEN lar.approvalStatus = 'WAIVED' THEN lar.waivedFine ELSE 0 END) as totalFineWaived,
        SUM(CASE WHEN lar.earlySeconds > 0 THEN 1 ELSE 0 END) as earlyLoginsCount,
        SUM(lar.earlyIncentive) as totalEarlyIncentives
      FROM late_attendance_record lar
      LEFT JOIN location l ON lar.locationId = l.id
      WHERE ${whereClause}
    `, params);

    // Repeated late arrivals (employees with >= 2 late arrivals within the month or period)
    const monthPrefix = date ? String(date).split('T')[0].substring(0, 7) : '2026-10';
    const repConditions: string[] = ['lar.chargeableLateSeconds > 0', 'lar.recordDate LIKE ?'];
    const repParams: any[] = [`${monthPrefix}%`];
    if (scopedLocId) {
      repConditions.push('(lar.locationId = ? OR l.code = ?)');
      repParams.push(scopedLocId, scopedLocId.replace(/^loc_/, '').toUpperCase());
    }
    if (departmentId && departmentId !== 'all') {
      repConditions.push('lar.departmentId = ?');
      repParams.push(departmentId);
    }
    if (shiftId && shiftId !== 'all') {
      repConditions.push('lar.shiftId = ?');
      repParams.push(shiftId);
    }

    const [repeatedRows]: any = await pool.query(`
      SELECT lar.employeeId
      FROM late_attendance_record lar
      LEFT JOIN location l ON lar.locationId = l.id
      WHERE ${repConditions.join(' AND ')}
      GROUP BY lar.employeeId
      HAVING COUNT(lar.id) >= 2
    `, repParams);

    const repeatedLateArrivals = repeatedRows.length;

    const data = rows[0] || {};
    const totalLateMinutes = Math.round((Number(data.totalLateSeconds || 0) / 60) * 10) / 10;

    res.json({
      success: true,
      data: {
        totalEmployeesScheduled: Number(data.totalScheduled || 0),
        employeesPresent: Number(data.employeesPresent || 0),
        employeesArrivedLate: Number(data.employeesArrivedLate || 0),
        employeesWithinGracePeriod: Number(data.employeesWithinGracePeriod || 0),
        employeesWithMissingPunches: Number(data.employeesWithMissingPunches || 0),
        totalLateMinutes,
        totalFineCalculated: Math.round(Number(data.totalFineCalculated || 0)),
        totalFinePendingApproval: Math.round(Number(data.totalFinePendingApproval || 0)),
        totalFineApproved: Math.round(Number(data.totalFineApproved || 0)),
        totalFineAppliedToPayroll: Math.round(Number(data.totalFineAppliedToPayroll || 0)),
        totalFineWaived: Math.round(Number(data.totalFineWaived || 0)),
        employeesWithRepeatedLateArrivals: repeatedLateArrivals,
        earlyLoginsCount: Number(data.earlyLoginsCount || 0),
        totalEarlyIncentives: Math.round(Number(data.totalEarlyIncentives || 0))
      }
    });
  } catch (err: any) {
    console.error('Error fetching late fine dashboard metrics:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 2. GET /records
 * Detailed Late Attendance Table records with search, filter, drilldown, pagination.
 */
router.get('/records', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const {
      locationId,
      departmentId,
      shiftId,
      date,
      startDate,
      endDate,
      fineStatus,
      approvalStatus,
      payrollStatus,
      search,
      drillDownMetric,
      page = 1,
      limit = 25,
      sortBy = 'lar.scheduledLogin',
      sortOrder = 'DESC'
    } = req.query;

    let scopedLocId = getScopedLocationId(req.user, locationId as string);
    if (scopedLocId === 'all') scopedLocId = undefined;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (scopedLocId) {
      conditions.push('(lar.locationId = ? OR l.code = ?)');
      params.push(scopedLocId, scopedLocId.replace(/^loc_/, '').toUpperCase());
    }
    if (departmentId && departmentId !== 'all') {
      conditions.push('lar.departmentId = ?');
      params.push(departmentId);
    }
    if (shiftId && shiftId !== 'all') {
      conditions.push('lar.shiftId = ?');
      params.push(shiftId);
    }
    if (fineStatus && fineStatus !== 'all') {
      conditions.push('lar.fineStatus = ?');
      params.push(fineStatus);
    }
    if (approvalStatus && approvalStatus !== 'all') {
      conditions.push('lar.approvalStatus = ?');
      params.push(approvalStatus);
    }
    if (payrollStatus && payrollStatus !== 'all') {
      conditions.push('lar.payrollStatus = ?');
      params.push(payrollStatus);
    }

    if (date) {
      conditions.push('lar.recordDate = ?');
      params.push(String(date).split('T')[0]);
    } else if (startDate || endDate) {
      if (startDate) {
        conditions.push('lar.recordDate >= ?');
        params.push(String(startDate).split('T')[0]);
      }
      if (endDate) {
        conditions.push('lar.recordDate <= ?');
        params.push(String(endDate).split('T')[0]);
      }
    }

    if (search) {
      const q = `%${String(search).trim()}%`;
      conditions.push('(e.fullName LIKE ? OR e.employeeCode LIKE ? OR e.designation LIKE ?)');
      params.push(q, q, q);
    }

    // Drill-down filtering based on dashboard card click
    if (drillDownMetric) {
      switch (drillDownMetric) {
        case 'PRESENT':
          conditions.push('lar.actualPunchIn IS NOT NULL');
          break;
        case 'LATE':
          conditions.push('lar.chargeableLateSeconds > 0');
          break;
        case 'GRACE_PERIOD':
          conditions.push('lar.lateSeconds > 0 AND lar.chargeableLateSeconds = 0');
          break;
        case 'MISSING_PUNCH':
          conditions.push('lar.actualPunchIn IS NULL');
          break;
        case 'PENDING_APPROVAL':
          conditions.push("lar.approvalStatus IN ('PENDING', 'PENDING_APPROVAL', 'PENDING_REVIEW') AND lar.chargeableLateSeconds > 0");
          break;
        case 'APPROVED':
          conditions.push("lar.approvalStatus = 'APPROVED'");
          break;
        case 'PAYROLL_APPLIED':
          conditions.push("lar.payrollStatus = 'APPLIED_TO_PAYROLL'");
          break;
        case 'WAIVED':
          conditions.push("lar.approvalStatus = 'WAIVED'");
          break;
        case 'REPEATED_LATE':
          conditions.push(`lar.employeeId IN (
            SELECT employeeId FROM late_attendance_record 
            WHERE chargeableLateSeconds > 0 
            GROUP BY employeeId HAVING COUNT(id) >= 2
          )`);
          break;
        case 'EARLY_LOGIN':
          conditions.push('lar.earlySeconds > 0');
          break;
        default:
          break;
      }
    }

    const whereClause = conditions.join(' AND ');

    // Total Count
    const [countRows]: any = await pool.query(`
      SELECT COUNT(lar.id) as total
      FROM late_attendance_record lar
      LEFT JOIN employee e ON lar.employeeId = e.id
      LEFT JOIN location l ON lar.locationId = l.id
      LEFT JOIN department d ON lar.departmentId = d.id
      LEFT JOIN shift s ON lar.shiftId = s.id
      WHERE ${whereClause}
    `, params);

    const totalRecords = Number(countRows[0]?.total || 0);

    // Sorting & Pagination
    const pageNum = Math.max(1, Number(page));
    const pageSize = Math.max(1, Math.min(100, Number(limit)));
    const offset = (pageNum - 1) * pageSize;

    // Validate sortBy column to prevent SQL injection
    const allowedSort = [
      'lar.scheduledLogin', 'lar.actualPunchIn', 'lar.chargeableLateSeconds',
      'lar.calculatedFine', 'lar.finalFine', 'lar.recordDate', 'e.employeeCode', 'e.fullName'
    ];
    const safeSortBy = allowedSort.includes(String(sortBy)) ? String(sortBy) : 'lar.scheduledLogin';
    const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const [rows]: any = await pool.query(`
      SELECT 
        lar.id,
        lar.attendanceId,
        lar.employeeId,
        lar.locationId,
        lar.departmentId,
        lar.shiftId,
        lar.recordDate,
        lar.scheduledLogin,
        lar.actualPunchIn,
        lar.gracePeriodMinutes,
        lar.lateSeconds,
        lar.chargeableLateSeconds,
        lar.fineCalculationType,
        lar.fineRate,
        lar.calculatedFine,
        lar.approvedFine,
        lar.waivedFine,
        lar.finalFine,
        lar.fineStatus,
        lar.approvalStatus,
        lar.payrollStatus,
        lar.earlySeconds,
        lar.earlyIncentive,
        lar.managerRemarks,
        lar.reviewedById,
        lar.reviewedAt,
        lar.payrollRunId,
        lar.historyJson,
        e.fullName as employeeName,
        e.employeeCode,
        e.designation,
        d.name as departmentName,
        l.name as locationName,
        l.code as locationCode,
        s.name as shiftName,
        s.startTime as shiftStartTime,
        s.endTime as shiftEndTime,
        u.fullName as reviewedByName
      FROM late_attendance_record lar
      LEFT JOIN employee e ON lar.employeeId = e.id
      LEFT JOIN location l ON lar.locationId = l.id
      LEFT JOIN department d ON lar.departmentId = d.id
      LEFT JOIN shift s ON lar.shiftId = s.id
      LEFT JOIN user u ON lar.reviewedById = u.id
      WHERE ${whereClause}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err: any) {
    console.error('Error fetching late fine records:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 3. GET /policy
 * Returns active policy rules and defaults.
 */
router.get('/policy', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const [ruleRows]: any = await pool.query(`
      SELECT * FROM attendancerules ORDER BY createdAt DESC LIMIT 1
    `);
    let penalty: any = {};
    try {
      const [penaltyRules]: any = await pool.query(`
        SELECT * FROM penaltyrule WHERE penaltyType = 'LATE_LOGIN' LIMIT 1
      `);
      if (penaltyRules.length > 0) penalty = penaltyRules[0];
    } catch (e) {
      // penaltyrule table or penaltyType column optional fallback
    }

    const rule = ruleRows[0] || {};

    res.json({
      success: true,
      data: {
        gracePeriodMinutes: rule.gracePeriodMinutes ?? 5,
        latePenaltyRatePerMinute: Number(rule.latePenaltyRatePerMinute ?? 1.0),
        earlyLoginRatePerMinute: Number(rule.earlyLoginRatePerMinute ?? 1.0),
        calculationMethod: penalty.calculationType || 'PER_MINUTE',
        maxFinePerDay: Number(rule.maxFinePerDay ?? 500),
        maxFinePerMonth: Number(rule.maxFinePerMonth ?? 3000),
        effectiveStartDate: '2026-01-01',
        isActive: rule.isActive ?? true,
        roundingRule: 'NEAREST_RUPEE',
        approvalRequired: true,
        exemptions: ['Managing Director', 'Executive Director']
      }
    });
  } catch (err: any) {
    console.error('Error fetching late fine policy:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 4. PUT /policy
 * Update Late & Fine policy configuration (Super Admin / HR Manager).
 */
router.put('/policy', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const {
      gracePeriodMinutes = 5,
      latePenaltyRatePerMinute,
      latePenaltyRatePerSecond,
      earlyLoginRatePerMinute,
      earlyLoginRatePerSecond,
      maxFinePerDay = 500,
      maxFinePerMonth = 3000,
      calculationMethod = 'PER_MINUTE'
    } = req.body;

    const rate = Number(latePenaltyRatePerMinute ?? latePenaltyRatePerSecond ?? 1.0);
    const earlyRate = Number(earlyLoginRatePerMinute ?? earlyLoginRatePerSecond ?? 1.0);

    try {
      await pool.query(`
        UPDATE attendancerules 
        SET gracePeriodMinutes = ?,
            latePenaltyRatePerMinute = ?,
            latePenaltyRatePerSecond = ?,
            earlyLoginRatePerMinute = ?,
            earlyLoginRatePerSecond = ?,
            updatedAt = NOW(3)
      `, [gracePeriodMinutes, rate, rate, earlyRate, earlyRate]);
    } catch {
      await pool.query(`
        UPDATE attendancerules 
        SET gracePeriodMinutes = ?,
            latePenaltyRatePerSecond = ?,
            earlyLoginRatePerSecond = ?,
            updatedAt = NOW(3)
      `, [gracePeriodMinutes, rate, earlyRate]);
    }

    await pool.query(`
      UPDATE shift SET gracePeriod = ?
    `, [gracePeriodMinutes]);

    res.json({
      success: true,
      message: 'Late fine policy successfully updated and active.',
      data: {
        gracePeriodMinutes,
        latePenaltyRatePerMinute: rate,
        latePenaltyRatePerSecond: rate,
        earlyLoginRatePerMinute: earlyRate,
        earlyLoginRatePerSecond: earlyRate,
        maxFinePerDay,
        maxFinePerMonth,
        calculationMethod
      }
    });
  } catch (err: any) {
    console.error('Error updating late fine policy:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 5. POST /approve/:id
 * Approves a calculated late fine.
 */
router.post('/approve/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const reviewerId = req.user?.id || 'usr_admin';
    const reviewerName = req.user?.fullName || 'HR Manager';

    const [rows]: any = await pool.query('SELECT * FROM late_attendance_record WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    const rec = rows[0];
    const prevHistory = safeJsonParse<any[]>(rec.historyJson, []);
    
    const newEntry = {
      action: 'APPROVED',
      previousStatus: rec.approvalStatus,
      newStatus: 'APPROVED',
      previousAmount: rec.finalFine,
      newAmount: rec.calculatedFine,
      reason: remarks || 'Fine approved by HR Manager',
      byUser: reviewerName,
      userId: reviewerId,
      timestamp: new Date().toISOString()
    };
    prevHistory.push(newEntry);

    await pool.query(`
      UPDATE late_attendance_record
      SET approvalStatus = 'APPROVED',
          fineStatus = 'APPROVED',
          approvedFine = calculatedFine,
          finalFine = calculatedFine,
          managerRemarks = COALESCE(?, managerRemarks),
          reviewedById = ?,
          reviewedAt = NOW(3),
          historyJson = ?,
          updatedAt = NOW(3)
      WHERE id = ?
    `, [remarks, reviewerId, JSON.stringify(prevHistory), id]);

    // Also notify real-time clients if socket exists
    if (socketIO) {
      socketIO.emit('fine:approved', { id, finalFine: rec.calculatedFine });
    }

    res.json({ success: true, message: 'Fine successfully approved.', recordId: id });
  } catch (err: any) {
    console.error('Error approving fine:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 6. POST /waive/:id
 * Waives a late fine (mandatory reason required).
 */
router.post('/waive/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'A valid reason is strictly required to waive a fine.' });
    }

    const reviewerId = req.user?.id || 'usr_admin';
    const reviewerName = req.user?.fullName || 'HR Manager';

    const [rows]: any = await pool.query('SELECT * FROM late_attendance_record WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    const rec = rows[0];
    const prevHistory = safeJsonParse<any[]>(rec.historyJson, []);
    
    const newEntry = {
      action: 'WAIVED',
      previousStatus: rec.approvalStatus,
      newStatus: 'WAIVED',
      previousAmount: rec.finalFine,
      newAmount: 0,
      reason: reason.trim(),
      byUser: reviewerName,
      userId: reviewerId,
      timestamp: new Date().toISOString()
    };
    prevHistory.push(newEntry);

    await pool.query(`
      UPDATE late_attendance_record
      SET approvalStatus = 'WAIVED',
          fineStatus = 'WAIVED',
          waivedFine = calculatedFine,
          finalFine = 0,
          managerRemarks = ?,
          reviewedById = ?,
          reviewedAt = NOW(3),
          historyJson = ?,
          updatedAt = NOW(3)
      WHERE id = ?
    `, [reason.trim(), reviewerId, JSON.stringify(prevHistory), id]);

    res.json({ success: true, message: 'Fine successfully waived.', recordId: id });
  } catch (err: any) {
    console.error('Error waiving fine:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 7. POST /reject/:id
 * Rejects a fine with remarks.
 */
router.post('/reject/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    if (!remarks || !remarks.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection remarks are mandatory.' });
    }

    const reviewerId = req.user?.id || 'usr_admin';
    const reviewerName = req.user?.fullName || 'HR Manager';

    const [rows]: any = await pool.query('SELECT * FROM late_attendance_record WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    const rec = rows[0];
    const prevHistory = safeJsonParse<any[]>(rec.historyJson, []);
    
    const newEntry = {
      action: 'REJECTED',
      previousStatus: rec.approvalStatus,
      newStatus: 'REJECTED',
      previousAmount: rec.finalFine,
      newAmount: 0,
      reason: remarks.trim(),
      byUser: reviewerName,
      userId: reviewerId,
      timestamp: new Date().toISOString()
    };
    prevHistory.push(newEntry);

    await pool.query(`
      UPDATE late_attendance_record
      SET approvalStatus = 'REJECTED',
          fineStatus = 'REJECTED',
          finalFine = 0,
          managerRemarks = ?,
          reviewedById = ?,
          reviewedAt = NOW(3),
          historyJson = ?,
          updatedAt = NOW(3)
      WHERE id = ?
    `, [remarks.trim(), reviewerId, JSON.stringify(prevHistory), id]);

    res.json({ success: true, message: 'Fine record rejected.', recordId: id });
  } catch (err: any) {
    console.error('Error rejecting fine:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 8. POST /adjust/:id
 * Adjusts a fine amount with reason.
 */
router.post('/adjust/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { adjustedAmount, reason } = req.body;

    if (adjustedAmount === undefined || isNaN(Number(adjustedAmount)) || Number(adjustedAmount) < 0) {
      return res.status(400).json({ success: false, message: 'Valid adjusted amount is required.' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Adjustment reason is required.' });
    }

    const reviewerId = req.user?.id || 'usr_admin';
    const reviewerName = req.user?.fullName || 'HR Manager';

    const [rows]: any = await pool.query('SELECT * FROM late_attendance_record WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    const rec = rows[0];
    const prevHistory = safeJsonParse<any[]>(rec.historyJson, []);
    
    const newEntry = {
      action: 'ADJUSTED',
      previousStatus: rec.approvalStatus,
      newStatus: 'APPROVED',
      previousAmount: rec.finalFine,
      newAmount: Number(adjustedAmount),
      reason: reason.trim(),
      byUser: reviewerName,
      userId: reviewerId,
      timestamp: new Date().toISOString()
    };
    prevHistory.push(newEntry);

    await pool.query(`
      UPDATE late_attendance_record
      SET approvalStatus = 'APPROVED',
          fineStatus = 'APPROVED',
          approvedFine = ?,
          finalFine = ?,
          managerRemarks = ?,
          reviewedById = ?,
          reviewedAt = NOW(3),
          historyJson = ?,
          updatedAt = NOW(3)
      WHERE id = ?
    `, [adjustedAmount, adjustedAmount, reason.trim(), reviewerId, JSON.stringify(prevHistory), id]);

    res.json({ success: true, message: 'Fine amount successfully adjusted and approved.', recordId: id });
  } catch (err: any) {
    console.error('Error adjusting fine:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 9. POST /apply-payroll/:id
 * Applies an approved fine to payroll run (idempotent).
 */
router.post('/apply-payroll/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { payrollRunId = 'PAYROLL-2026-10' } = req.body;
    const reviewerId = req.user?.id || 'usr_admin';
    const reviewerName = req.user?.fullName || 'Payroll Officer';

    const [rows]: any = await pool.query('SELECT * FROM late_attendance_record WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    const rec = rows[0];

    // Financial Safety Rule: Do not deduct an amount that is not approved!
    if (rec.approvalStatus !== 'APPROVED') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot apply to payroll. Current approval status is '${rec.approvalStatus}'. Only APPROVED fines can be deducted.` 
      });
    }

    if (rec.payrollStatus === 'APPLIED_TO_PAYROLL') {
      return res.json({ success: true, message: 'Fine is already applied to payroll (idempotent operation).', recordId: id });
    }

    const prevHistory = safeJsonParse<any[]>(rec.historyJson, []);
    
    const newEntry = {
      action: 'APPLIED_TO_PAYROLL',
      previousStatus: rec.payrollStatus,
      newStatus: 'APPLIED_TO_PAYROLL',
      amount: rec.finalFine,
      payrollRunId,
      byUser: reviewerName,
      userId: reviewerId,
      timestamp: new Date().toISOString()
    };
    prevHistory.push(newEntry);

    await pool.query(`
      UPDATE late_attendance_record
      SET payrollStatus = 'APPLIED_TO_PAYROLL',
          fineStatus = 'APPLIED_TO_PAYROLL',
          payrollRunId = ?,
          historyJson = ?,
          updatedAt = NOW(3)
      WHERE id = ?
    `, [payrollRunId, JSON.stringify(prevHistory), id]);

    res.json({ success: true, message: 'Fine applied to payroll successfully.', recordId: id });
  } catch (err: any) {
    console.error('Error applying fine to payroll:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 10. POST /batch-apply-payroll
 * Batch apply all approved fines in the filter to payroll.
 */
router.post('/batch-apply-payroll', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { recordIds, payrollRunId = 'PAYROLL-2026-10' } = req.body;
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide an array of record IDs.' });
    }

    const reviewerId = req.user?.id || 'usr_admin';

    const [result]: any = await pool.query(`
      UPDATE late_attendance_record
      SET payrollStatus = 'APPLIED_TO_PAYROLL',
          fineStatus = 'APPLIED_TO_PAYROLL',
          payrollRunId = ?,
          updatedAt = NOW(3)
      WHERE id IN (?) AND approvalStatus = 'APPROVED' AND payrollStatus != 'APPLIED_TO_PAYROLL'
    `, [payrollRunId, recordIds]);

    res.json({ 
      success: true, 
      message: `Batch payroll processing complete. ${result.affectedRows} fines applied to payroll.`,
      affectedRows: result.affectedRows 
    });
  } catch (err: any) {
    console.error('Error in batch payroll application:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 11. POST /reverse/:id
 * Reverses a previously approved or applied fine.
 */
router.post('/reverse/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reversal reason is mandatory.' });
    }

    const reviewerId = req.user?.id || 'usr_admin';
    const reviewerName = req.user?.fullName || 'HR Manager';

    const [rows]: any = await pool.query('SELECT * FROM late_attendance_record WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    const rec = rows[0];
    const prevHistory = safeJsonParse<any[]>(rec.historyJson, []);
    
    const newEntry = {
      action: 'REVERSED',
      previousStatus: rec.approvalStatus,
      newStatus: 'REVERSED',
      previousAmount: rec.finalFine,
      newAmount: 0,
      reason: reason.trim(),
      byUser: reviewerName,
      userId: reviewerId,
      timestamp: new Date().toISOString()
    };
    prevHistory.push(newEntry);

    await pool.query(`
      UPDATE late_attendance_record
      SET approvalStatus = 'REVERSED',
          fineStatus = 'REVERSED',
          payrollStatus = 'REVERSED',
          finalFine = 0,
          managerRemarks = CONCAT(COALESCE(managerRemarks, ''), ' | Reversal Reason: ', ?),
          historyJson = ?,
          updatedAt = NOW(3)
      WHERE id = ?
    `, [reason.trim(), JSON.stringify(prevHistory), id]);

    res.json({ success: true, message: 'Fine successfully reversed.', recordId: id });
  } catch (err: any) {
    console.error('Error reversing fine:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 12. GET /employee-history/:employeeId
 * Complete late attendance and fine history for an individual employee.
 */
router.get('/employee-history/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    // Employee information
    const [empRows]: any = await pool.query(`
      SELECT e.id, e.employeeCode, e.fullName, e.designation, d.name as departmentName, l.name as locationName
      FROM employee e
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN location l ON e.locationId = l.id
      WHERE e.id = ? OR e.employeeCode = ?
      LIMIT 1
    `, [employeeId, employeeId]);

    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const actualEmp = empRows[0];
    const conditions: string[] = ['lar.employeeId = ?'];
    const params: any[] = [actualEmp.id];

    if (startDate) {
      conditions.push('lar.recordDate >= ?');
      params.push(String(startDate).split('T')[0]);
    }
    if (endDate) {
      conditions.push('lar.recordDate <= ?');
      params.push(String(endDate).split('T')[0]);
    }

    const whereClause = conditions.join(' AND ');

    // Historical records
    const [records]: any = await pool.query(`
      SELECT 
        lar.*,
        s.name as shiftName,
        s.startTime as shiftStartTime,
        s.endTime as shiftEndTime,
        u.fullName as reviewedByName
      FROM late_attendance_record lar
      LEFT JOIN shift s ON lar.shiftId = s.id
      LEFT JOIN user u ON lar.reviewedById = u.id
      WHERE ${whereClause}
      ORDER BY lar.recordDate DESC, lar.scheduledLogin DESC
    `, params);

    // Aggregates
    const [summaryRows]: any = await pool.query(`
      SELECT 
        COUNT(id) as totalShifts,
        SUM(CASE WHEN chargeableLateSeconds > 0 THEN 1 ELSE 0 END) as totalLateCount,
        SUM(chargeableLateSeconds) as totalLateSeconds,
        SUM(calculatedFine) as totalCalculatedFine,
        SUM(approvedFine) as totalApprovedFine,
        SUM(waivedFine) as totalWaivedFine,
        SUM(CASE WHEN payrollStatus = 'APPLIED_TO_PAYROLL' THEN finalFine ELSE 0 END) as totalPayrollAppliedFine,
        SUM(CASE WHEN approvalStatus IN ('PENDING', 'PENDING_APPROVAL', 'PENDING_REVIEW') AND chargeableLateSeconds > 0 THEN calculatedFine ELSE 0 END) as remainingPendingFine,
        SUM(earlySeconds) as totalEarlySeconds,
        SUM(earlyIncentive) as totalEarlyIncentives
      FROM late_attendance_record lar
      WHERE ${whereClause}
    `, params);

    const summary = summaryRows[0] || {};

    res.json({
      success: true,
      employee: empRows[0],
      summary: {
        totalShifts: Number(summary.totalShifts || 0),
        totalLateCount: Number(summary.totalLateCount || 0),
        totalLateMinutes: Math.round((Number(summary.totalLateSeconds || 0) / 60) * 10) / 10,
        totalCalculatedFine: Math.round(Number(summary.totalCalculatedFine || 0)),
        totalApprovedFine: Math.round(Number(summary.totalApprovedFine || 0)),
        totalWaivedFine: Math.round(Number(summary.totalWaivedFine || 0)),
        totalPayrollAppliedFine: Math.round(Number(summary.totalPayrollAppliedFine || 0)),
        remainingPendingFine: Math.round(Number(summary.remainingPendingFine || 0)),
        totalEarlyMinutes: Math.round((Number(summary.totalEarlySeconds || 0) / 60) * 10) / 10,
        totalEarlyIncentives: Math.round(Number(summary.totalEarlyIncentives || 0))
      },
      records
    });
  } catch (err: any) {
    console.error('Error fetching employee late history:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 13. GET /early-logins
 * Early login incentives register.
 */
router.get('/early-logins', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId, shiftId, date, startDate, endDate } = req.query;

    const conditions: string[] = ['lar.earlySeconds > 0'];
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      conditions.push('lar.locationId = ?');
      params.push(locationId);
    }
    if (departmentId && departmentId !== 'all') {
      conditions.push('lar.departmentId = ?');
      params.push(departmentId);
    }
    if (shiftId && shiftId !== 'all') {
      conditions.push('lar.shiftId = ?');
      params.push(shiftId);
    }
    if (date) {
      conditions.push('lar.recordDate = ?');
      params.push(String(date).split('T')[0]);
    } else if (startDate || endDate) {
      if (startDate) {
        conditions.push('lar.recordDate >= ?');
        params.push(String(startDate).split('T')[0]);
      }
      if (endDate) {
        conditions.push('lar.recordDate <= ?');
        params.push(String(endDate).split('T')[0]);
      }
    }

    const whereClause = conditions.join(' AND ');

    const [rows]: any = await pool.query(`
      SELECT 
        lar.id,
        lar.recordDate,
        lar.scheduledLogin,
        lar.actualPunchIn,
        lar.earlySeconds,
        lar.earlyIncentive,
        lar.approvalStatus,
        lar.payrollStatus,
        e.fullName as employeeName,
        e.employeeCode,
        e.designation,
        d.name as departmentName,
        l.name as locationName,
        s.name as shiftName
      FROM late_attendance_record lar
      LEFT JOIN employee e ON lar.employeeId = e.id
      LEFT JOIN department d ON lar.departmentId = d.id
      LEFT JOIN location l ON lar.locationId = l.id
      LEFT JOIN shift s ON lar.shiftId = s.id
      WHERE ${whereClause}
      ORDER BY lar.recordDate DESC, lar.actualPunchIn ASC
    `, params);

    res.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('Error fetching early logins:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
