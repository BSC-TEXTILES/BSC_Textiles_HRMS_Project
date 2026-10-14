import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { dbDate } from '../utils/dates.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { socketIO } from '../socket.js';
import { validate } from '../middleware/validation.js';
import { container } from '../core/container/ServiceContainer.js';
import { pool } from '../nativeDb.js';
import {
  computeDurations,
  computeShiftWindow,
  describeException,
  deriveDisplayStatus,
  isValidYmd,
  statusMatchesFilter,
  tallyRows,
  todayYmd,
  weekdayOf,
  windowFromScheduled,
  type DisplayStatus,
  type ShiftWindow,
} from '../core/services/AttendanceCalculationService.js';
import lateFineRoutes from './lateFines.js';

const router = Router();

router.use('/late-fines', lateFineRoutes);
router.use(authenticate);

/**
 * GET /api/attendance/monthly-matrix
 * Get monthly attendance register matrix with full days of month and database synced records
 */
router.get('/monthly-matrix', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1); // 1-12
    const locationId = req.query.locationId as string;
    const search = (req.query.search as string || '').trim().toLowerCase();

    // Determine days in this specific month
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    // Query employees
    let empQuery = `
      SELECT e.id, e.employeeCode, e.fullName, e.role, e.designation, e.locationId, e.departmentId, e.shiftId,
             l.name as locationName, d.name as departmentName
      FROM employee e
      LEFT JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      WHERE e.status = 'ACTIVE'
    `;
    const empParams: any[] = [];
    if (locationId && locationId !== 'ALL') {
      empQuery += ` AND (e.locationId = ? OR l.code = ?)`;
      empParams.push(locationId, locationId);
    }
    if (search) {
      empQuery += ` AND (LOWER(e.fullName) LIKE ? OR LOWER(e.employeeCode) LIKE ? OR LOWER(e.role) LIKE ?)`;
      const term = `%${search}%`;
      empParams.push(term, term, term);
    }
    empQuery += ` ORDER BY e.fullName ASC LIMIT 100`;

    const [employees]: any = await pool.query(empQuery, empParams);

    // Query all existing attendance records for this month
    const [attRows]: any = await pool.query(
      `SELECT id, employeeId, DATE_FORMAT(attendanceDate, '%Y-%m-%d') as attDate,
              DAY(attendanceDate) as dayNum, actualLogin, actualLogout, status, notes
       FROM attendance
       WHERE attendanceDate >= ? AND attendanceDate <= ?`,
      [startDateStr, endDateStr]
    );

    // Group by employeeId and dayNum
    const matrix: Record<string, Record<number, any>> = {};
    for (const row of attRows) {
      if (!matrix[row.employeeId]) {
        matrix[row.employeeId] = {};
      }
      let code = 'P';
      if (row.status === 'WEEKLY_OFF') code = 'WO';
      else if (row.status === 'LATE') code = 'L';
      else if (row.status === 'ABSENT') code = 'A';
      else if (row.notes?.includes('Earned Leave') || row.notes?.includes('EL')) code = 'EL';
      else if (row.notes?.includes('Half Day') || row.notes?.includes('HD')) code = 'HD';
      else if (row.notes?.includes('On Duty') || row.notes?.includes('OD')) code = 'OD';

      matrix[row.employeeId][row.dayNum] = {
        id: row.id,
        date: row.attDate,
        code,
        status: row.status,
        actualLogin: row.actualLogin ? new Date(row.actualLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
        actualLogout: row.actualLogout ? new Date(row.actualLogout).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
        notes: row.notes || '',
      };
    }

    res.json({
      year,
      month,
      daysInMonth,
      startDate: startDateStr,
      endDate: endDateStr,
      employees,
      matrix,
    });
  } catch (error: any) {
    console.error('Monthly matrix error:', error);
    res.status(500).json({ error: 'Failed to retrieve monthly matrix', message: error.message });
  }
});

/**
 * PUT /api/attendance/update-day
 * Directly updates an employee's attendance status & timings for a specific day in the database
 */
router.put('/update-day', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, date, code, inTime, outTime, notes } = req.body;
    if (!employeeId || !date) {
      return res.status(400).json({ error: 'employeeId and date are required' });
    }

    // Get employee details
    const [empRows]: any = await pool.query('SELECT id, locationId, shiftId FROM employee WHERE id = ?', [employeeId]);
    if (!empRows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = empRows[0];

    // Map muster code to valid status enum
    let dbStatus = 'PRESENT';
    let noteText = notes || '';
    if (code === 'WO') {
      dbStatus = 'WEEKLY_OFF';
    } else if (code === 'L') {
      dbStatus = 'LATE';
    } else if (code === 'A') {
      dbStatus = 'ABSENT';
    } else if (code === 'EL') {
      dbStatus = 'PRESENT';
      noteText = noteText ? `${noteText} [Earned Leave]` : '[Earned Leave]';
    } else if (code === 'HD') {
      dbStatus = 'PRESENT';
      noteText = noteText ? `${noteText} [Half Day]` : '[Half Day]';
    } else if (code === 'OD') {
      dbStatus = 'PRESENT';
      noteText = noteText ? `${noteText} [On Duty]` : '[On Duty]';
    }

    // Format timestamps
    let loginDt: Date | null = null;
    let logoutDt: Date | null = null;
    if (inTime && inTime.trim()) {
      const parsedIn = new Date(`${date}T${inTime.includes(':') && inTime.length <= 5 ? inTime + ':00' : inTime}`);
      if (!isNaN(parsedIn.getTime())) loginDt = parsedIn;
    }
    if (outTime && outTime.trim()) {
      const parsedOut = new Date(`${date}T${outTime.includes(':') && outTime.length <= 5 ? outTime + ':00' : outTime}`);
      if (!isNaN(parsedOut.getTime())) logoutDt = parsedOut;
    }

    const id = `att_${employeeId}_${date.replace(/-/g, '')}`;

    await pool.query(
      `INSERT INTO attendance (
        id, employeeId, locationId, shiftId, attendanceDate, actualLogin, actualLogout, status, notes, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        actualLogin = COALESCE(VALUES(actualLogin), actualLogin),
        actualLogout = COALESCE(VALUES(actualLogout), actualLogout),
        status = VALUES(status),
        notes = VALUES(notes),
        updatedAt = NOW(3)`,
      [
        id,
        employeeId,
        emp.locationId,
        emp.shiftId || null,
        date,
        loginDt,
        logoutDt,
        dbStatus,
        noteText,
      ]
    );

    res.json({
      success: true,
      message: `Attendance for ${date} updated in database successfully`,
      record: {
        id,
        employeeId,
        date,
        code: code || 'P',
        status: dbStatus,
        inTime,
        outTime,
        notes: noteText,
      },
    });
  } catch (error: any) {
    console.error('Update day attendance error:', error);
    res.status(500).json({ error: 'Failed to update attendance in database', message: error.message });
  }
});

/**
 * GET /api/attendance/corrections
 * Fetch punch regularization requests
 */
router.get('/corrections', async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, status, date } = req.query;
    let query = `
      SELECT c.*, 
             e.fullName as employeeName, 
             e.employeeCode, 
             e.designation, 
             l.name as locationName,
             d.name as departmentName
      FROM attendancecorrection c
      JOIN employee e ON c.employeeId = e.id
      LEFT JOIN location l ON c.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (employeeId) {
      query += ` AND c.employeeId = ?`;
      params.push(employeeId);
    } else if (req.user!.role === 'EMPLOYEE' || req.user!.role === 'SALES_EMPLOYEE') {
      if (req.user!.employeeId) {
        query += ` AND c.employeeId = ?`;
        params.push(req.user!.employeeId);
      }
    }
    if (locationId && locationId !== 'all') {
      query += ` AND c.locationId = ?`;
      params.push(locationId);
    }
    if (status && status !== 'ALL') {
      query += ` AND c.status = ?`;
      params.push(status);
    }
    if (date) {
      query += ` AND c.attendanceDate = ?`;
      params.push(date);
    }
    query += ` ORDER BY c.createdAt DESC LIMIT 100`;

    const [rows]: any = await pool.query(query, params);
    res.json({ corrections: rows, count: rows.length });
  } catch (error: any) {
    console.error('Get punch corrections error:', error);
    res.status(500).json({ error: 'Failed to fetch punch corrections', message: error.message });
  }
});

/**
 * POST /api/attendance/corrections
 * Submit punch regularization request
 */
router.post('/corrections', async (req: AuthRequest, res) => {
  try {
    const { employeeId, attendanceDate, requestedLogin, requestedLogout, reason } = req.body;
    let targetEmpId = employeeId;
    if (req.user!.role === 'EMPLOYEE' || req.user!.role === 'SALES_EMPLOYEE') {
      targetEmpId = req.user!.employeeId || employeeId;
    } else if (!targetEmpId) {
      targetEmpId = req.user?.employeeId;
    }
    if (!targetEmpId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    if (!reason?.trim()) {
      return res.status(400).json({ error: 'Reason for punch correction is mandatory' });
    }

    const [empRows]: any = await pool.query('SELECT id, locationId FROM employee WHERE id = ?', [targetEmpId]);
    if (!empRows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = empRows[0];

    const attDate = attendanceDate || new Date().toISOString().slice(0, 10);
    const id = `corr_${crypto.randomUUID()}`;

    await pool.query(
      `INSERT INTO attendancecorrection 
       (id, employeeId, locationId, attendanceDate, requestedLogin, requestedLogout, reason, status, requestedById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW(3), NOW(3))`,
      [
        id,
        targetEmpId,
        emp.locationId,
        attDate,
        requestedLogin ? new Date(requestedLogin) : null,
        requestedLogout ? new Date(requestedLogout) : null,
        reason.trim(),
        req.user?.id || null,
      ]
    );

    const [createdRows]: any = await pool.query('SELECT * FROM attendancecorrection WHERE id = ?', [id]);
    res.status(201).json({ correction: createdRows[0], message: 'Punch correction request submitted successfully' });
  } catch (error: any) {
    console.error('Create punch correction error:', error);
    res.status(500).json({ error: 'Failed to submit punch correction', message: error.message });
  }
});

/**
 * POST /api/attendance/corrections/:id/approve
 */
router.post('/corrections/:id/approve', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { reviewNote } = req.body;
    const [rows]: any = await pool.query('SELECT * FROM attendancecorrection WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Correction request not found' });
    }
    const corr = rows[0];

    await pool.query(
      `UPDATE attendancecorrection 
       SET status = 'APPROVED', reviewedById = ?, reviewNote = ?, appliedAt = NOW(3), updatedAt = NOW(3)
       WHERE id = ?`,
      [req.user?.id || 'admin', reviewNote || 'Approved by floor manager', req.params.id]
    );

    if (corr.requestedLogin || corr.requestedLogout) {
      const dateStr = new Date(corr.attendanceDate).toISOString().slice(0, 10);
      const [attRows]: any = await pool.query(
        'SELECT id, actualLogin, actualLogout FROM attendance WHERE employeeId = ? AND DATE(attendanceDate) = ?',
        [corr.employeeId, dateStr]
      );
      if (attRows.length) {
        await pool.query(
          `UPDATE attendance 
           SET actualLogin = COALESCE(?, actualLogin), 
               actualLogout = COALESCE(?, actualLogout),
               status = 'PRESENT',
               notes = CONCAT(COALESCE(notes, ''), ' [Regularized]')
           WHERE id = ?`,
          [corr.requestedLogin, corr.requestedLogout, attRows[0].id]
        );
      }
    }

    res.json({ message: 'Correction request approved and attendance synchronized' });
  } catch (error: any) {
    console.error('Approve punch correction error:', error);
    res.status(500).json({ error: 'Failed to approve correction', message: error.message });
  }
});

/**
 * POST /api/attendance/corrections/:id/reject
 */
router.post('/corrections/:id/reject', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { reviewNote } = req.body;
    await pool.query(
      `UPDATE attendancecorrection 
       SET status = 'REJECTED', reviewedById = ?, reviewNote = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      [req.user?.id || 'admin', reviewNote || 'Rejected per policy', req.params.id]
    );
    res.json({ message: 'Correction request rejected' });
  } catch (error: any) {
    console.error('Reject punch correction error:', error);
    res.status(500).json({ error: 'Failed to reject correction', message: error.message });
  }
});

/**
 * PUT /api/attendance/corrections/:id
 * Update punch regularization request details
 */
router.put('/corrections/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const {
      requestedLogin,
      requestedLogout,
      reason,
      status,
      reviewNote,
    } = req.body;

    const [rows]: any = await pool.query('SELECT * FROM attendancecorrection WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Correction request not found' });
    }

    await pool.query(
      `UPDATE attendancecorrection 
       SET requestedLogin = COALESCE(?, requestedLogin),
           requestedLogout = COALESCE(?, requestedLogout),
           reason = COALESCE(?, reason),
           status = COALESCE(?, status),
           reviewNote = COALESCE(?, reviewNote),
           updatedAt = NOW(3)
       WHERE id = ?`,
      [
        requestedLogin ? new Date(requestedLogin) : null,
        requestedLogout ? new Date(requestedLogout) : null,
        reason ? reason.trim() : null,
        status || null,
        reviewNote || null,
        req.params.id,
      ]
    );

    res.json({ message: 'Punch correction updated successfully', id: req.params.id });
  } catch (error: any) {
    console.error('Update punch correction error:', error);
    res.status(500).json({ error: 'Failed to update punch correction', message: error.message });
  }
});

const attendanceSchema = z.object({
  body: z.object({
    employeeId: z.string().min(1),
    locationId: z.string().min(1),
    shiftId: z.string().optional(),
    attendanceDate: z.string(),
    scheduledLogin: z.string().optional(),
    actualLogin: z.string().optional(),
    scheduledLogout: z.string().optional(),
    actualLogout: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, employeeId, shiftId, departmentId, date, startDate, endDate, status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    let scopedLocId = getScopedLocationId(req.user, locationId);
    if (scopedLocId === 'all') scopedLocId = undefined;
    if (scopedLocId) {
      const cleanCode = scopedLocId.replace(/^loc_/, '').toUpperCase();
      const locMatch = await prisma.location.findFirst({
        where: { OR: [{ id: scopedLocId }, { code: cleanCode }] },
      });
      if (locMatch) scopedLocId = locMatch.id;
    }

    const where: any = {};
    if (scopedLocId) where.locationId = scopedLocId;
    if (employeeId) where.employeeId = employeeId;
    if (shiftId && shiftId !== 'all') {
      if (String(shiftId).includes(',')) {
        where.shiftId = { in: String(shiftId).split(',').map((s: string) => s.trim()).filter(Boolean) };
      } else {
        where.shiftId = shiftId;
      }
    }
    if (status && status !== 'all') where.status = status;
    if (departmentId && departmentId !== 'all' && departmentId !== 'ALL') {
      if (String(departmentId).includes(',')) {
        where.employee = { ...(where.employee || {}), departmentId: { in: String(departmentId).split(',').map((s: string) => s.trim()).filter(Boolean) } };
      } else {
        where.employee = { ...(where.employee || {}), departmentId: String(departmentId) };
      }
    }
    // Date filters are normalised to strict yyyy-mm-dd strings so that
    // DATE column comparisons never drift with server/client timezone.
    const dayOf = (v: any): string | null => {
      const s = String(v);
      if (isValidYmd(s)) return s;
      const short = s.slice(0, 10);
      if (isValidYmd(short)) return short;
      const parsed = new Date(s);
      if (isNaN(parsed.getTime())) return null;
      return dbDate(parsed).toISOString().slice(0, 10);
    };

    if (date) {
      const ymd = dayOf(date);
      if (!ymd) {
        return res.status(400).json({ error: 'INVALID_DATE', message: 'date must be a valid calendar date (YYYY-MM-DD).' });
      }
      where.attendanceDate = ymd;
    } else if (startDate || endDate) {
      where.attendanceDate = {};
      if (startDate) {
        const s = dayOf(startDate);
        if (!s) {
          return res.status(400).json({ error: 'INVALID_DATE', message: 'startDate must be a valid calendar date (YYYY-MM-DD).' });
        }
        where.attendanceDate.gte = s;
      }
      if (endDate) {
        const e = dayOf(endDate);
        if (!e) {
          return res.status(400).json({ error: 'INVALID_DATE', message: 'endDate must be a valid calendar date (YYYY-MM-DD).' });
        }
        where.attendanceDate.lte = e;
      }
    }
    
    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { attendanceDate: 'desc' },
        include: {
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          shift: { select: { id: true, name: true } },
          location: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.attendance.count({ where }),
    ]);
    
    res.json({ attendances, attendance: attendances, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get attendances error:', error);
    res.status(500).json({ error: 'Failed to get attendances' });
  }
});

router.get('/employee/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;
    const limit = Number(req.query.limit || 14);

    const attendances = await prisma.attendance.findMany({
      where: { employeeId },
      take: limit,
      orderBy: { attendanceDate: 'desc' },
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    });

    res.json({ attendances, attendance: attendances, total: attendances.length });
  } catch (error) {
    console.error('Get employee attendance error:', error);
    res.status(500).json({ error: 'Failed to get employee attendance' });
  }
});

router.post('/punch', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, punchType = 'IN', faceMatchPercentage = 95.0, reason } = req.body;
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { shift: true },
    });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const today = dbDate();
    const now = new Date();

    let existing = await prisma.attendance.findFirst({
      where: { employeeId, attendanceDate: today },
    });

    if (!existing) {
      existing = await prisma.attendance.create({
        data: {
          employeeId,
          locationId: employee.locationId,
          shiftId: employee.shiftId,
          attendanceDate: today,
          scheduledLogin: employee.shift?.startTime ? new Date(`${today.toISOString().slice(0, 10)}T${employee.shift.startTime}`) : now,
          actualLogin: punchType === 'IN' ? now : null,
          status: 'PRESENT',
          faceVerified: faceMatchPercentage >= 85,
          faceMatchPercentage,
          notes: reason || 'Punch recorded',
        },
      });
    } else {
      const updateData: any = {};
      if (punchType === 'IN' && !existing.actualLogin) {
        updateData.actualLogin = now;
        updateData.status = 'PRESENT';
      } else if (punchType === 'OUT') {
        updateData.actualLogout = now;
        if (existing.actualLogin) {
          const duration = Math.floor((now.getTime() - new Date(existing.actualLogin).getTime()) / 1000);
          updateData.totalWorkingSeconds = duration;
          updateData.effectiveWorkingSeconds = duration;
        }
      }
      if (faceMatchPercentage) {
        updateData.faceVerified = faceMatchPercentage >= 85;
        updateData.faceMatchPercentage = faceMatchPercentage;
      }
      existing = await prisma.attendance.update({
        where: { id: existing.id },
        data: updateData,
      });
    }

    // Publish notifications for attendance events
    if (punchType === 'IN') {
      // Check for late arrival
      if (existing.scheduledLogin && existing.actualLogin) {
        const lateSeconds = Math.max(0, (new Date(existing.actualLogin).getTime() - new Date(existing.scheduledLogin).getTime()) / 1000);
        if (lateSeconds > 300) { // 5 minutes grace
          await container.notificationService.publishEvent({
            eventId: 'ATT.LATE_ARRIVAL',
            title: 'Late Arrival Detected',
            message: `${employee.fullName} (${employee.employeeCode}) arrived ${Math.round(lateSeconds / 60)} minutes late.`,
            type: 'WARNING',
            severity: 'MEDIUM',
            entityType: 'attendance',
            entityId: existing.id,
            locationId: employee.locationId,
            actionUrl: `/attendance/punches?employeeId=${employee.id}`,
            correlationId: `att_late_${existing.id}`,
            metadata: { lateMinutes: Math.round(lateSeconds / 60), employeeCode: employee.employeeCode },
          });
        }
      }

      // Check for face verification failure
      if (faceMatchPercentage < 85) {
        await container.notificationService.publishEvent({
          eventId: 'ATT.FACE_VERIFY_FAILED',
          title: 'Face Verification Failed',
          message: `${employee.fullName} (${employee.employeeCode}) face verification failed with ${faceMatchPercentage}% match.`,
          type: 'DANGER',
          severity: 'HIGH',
          entityType: 'faceVerification',
          entityId: existing.id,
          locationId: employee.locationId,
          actionUrl: `/operations/face-verification?employeeId=${employee.id}`,
          correlationId: `fv_failed_${employee.id}_${Date.now()}`,
          metadata: { matchPercentage: faceMatchPercentage, employeeCode: employee.employeeCode },
        });
      }
    }

    res.json({
      success: true,
      message: `Punch ${punchType} recorded successfully`,
      attendance: existing,
    });
  } catch (error) {
    console.error('Punch record error:', error);
    res.status(500).json({ error: 'Failed to record punch' });
  }
});

router.get('/calculate/:employeeId/:date', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, date } = req.params;
    const targetDate = dbDate(new Date(date));

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { location: true, shift: true },
    });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const attendance = await prisma.attendance.findFirst({
      where: { employeeId, attendanceDate: targetDate },
    });

    const breaks = await prisma.employeeBreak.findMany({
      where: { employeeId, breakDate: targetDate },
    });

    const faceLogs = await prisma.faceVerification.findMany({
      where: { employeeId },
      take: 5,
      orderBy: { verifiedAt: 'desc' },
    });

    const qrLogs = await prisma.qRScanRecord.findMany({
      where: { employeeId },
      take: 5,
      orderBy: { scannedAt: 'desc' },
    });

    const scheduledLogin = `${date}T10:30:00.000Z`;
    const scheduledLogout = `${date}T19:30:00.000Z`;
    const actualLogin = attendance?.actualLogin?.toISOString() || `${date}T10:20:00.000Z`;
    const actualLogout = attendance?.actualLogout?.toISOString() || `${date}T19:30:00.000Z`;

    const earlySeconds = 600;
    const earlyIncentive = 600;
    const totalWorkingSeconds = 32400;
    const totalBreakSeconds = 2400;
    const effectiveWorkingSeconds = 30000;

    const calculation = {
      employee: {
        id: employee.id,
        code: employee.employeeCode,
        name: employee.fullName,
        gender: employee.gender || 'male',
        locationId: employee.locationId,
        shiftId: employee.shiftId,
      },
      date,
      scheduledLogin,
      scheduledLogout,
      actualLogin,
      actualLogout,
      graceMinutes: 5,
      lateThresholdMinutes: 15,
      graceEndTime: `${date}T10:35:00.000Z`,
      lateThresholdTime: `${date}T10:45:00.000Z`,
      earlyLoginSeconds: earlySeconds,
      earlyLoginIncentive: earlyIncentive,
      lateLoginSeconds: 0,
      latePenalty: 0,
      overtimeSeconds: 0,
      overtimeIncentive: 0,
      totalWorkingSeconds,
      totalBreakSeconds,
      effectiveWorkingSeconds,
      lunchBreakSeconds: 1800,
      teaBreakSeconds: 600,
      lunchDurationAllowed: 45,
      teaDurationAllowed: 20,
      attendanceStatus: attendance?.status || 'PRESENT',
      breaks: breaks.map((b: any) => ({
        id: b.id,
        breakTypeId: b.breakType,
        startTime: b.startTime?.toISOString() || `${date}T13:00:00.000Z`,
        endTime: b.endTime?.toISOString() || `${date}T13:30:00.000Z`,
        durationMinutes: b.actualDuration || 30,
        exceededMinutes: b.excessDuration || 0,
        status: b.status || 'COMPLETED',
      })),
      faceVerifications: faceLogs.map((f: any) => ({
        score: Number(f.matchPercentage),
        result: f.result,
        threshold: Number(f.threshold || 85),
        attemptedAt: f.verifiedAt?.toISOString() || new Date().toISOString(),
      })),
      qrScans: qrLogs.map((q: any) => ({
        purpose: q.purpose,
        result: q.result,
        scannedAt: q.scannedAt?.toISOString() || new Date().toISOString(),
      })),
      events: [
        {
          eventType: 'CHECK_IN',
          eventSubtype: 'EARLY',
          actualTime: actualLogin,
          durationSeconds: earlySeconds,
          amount: earlyIncentive,
          calculationBasis: '600s early @ ₹1.00/sec',
          source: 'Biometric Face Verification',
        },
      ],
    };

    res.json(calculation);
  } catch (error) {
    console.error('Attendance calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate attendance' });
  }
});

router.get('/summary/:employeeId/:date', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, date } = req.params;
    const targetDate = dbDate(new Date(date));

    const attendance = await prisma.attendance.findFirst({
      where: { employeeId, attendanceDate: targetDate },
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true } },
      },
    });

    res.json({
      date,
      employeeId,
      attendance: attendance || {
        status: 'PRESENT',
        earlyLoginSeconds: 600,
        earlyLoginIncentive: 600,
        lateLoginSeconds: 0,
        lateLoginPenalty: 0,
        totalWorkingSeconds: 32400,
      },
    });
  } catch (error) {
    console.error('Attendance summary error:', error);
    res.status(500).json({ error: 'Failed to get attendance summary' });
  }
});

router.get('/rules/:locationId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    let { locationId } = req.params;
    if (locationId && locationId.length < 10) {
      const locMatch = await prisma.location.findFirst({
        where: { OR: [{ code: locationId.toUpperCase() }, { id: locationId }] },
      });
      if (locMatch) locationId = locMatch.id;
    }

    let rules = await prisma.attendanceRules.findUnique({ where: { locationId } });
    if (!rules) {
      rules = {
        login_time: '10:30:00',
        logout_time: '19:30:00',
        grace_minutes: 5,
        late_threshold_minutes: 15,
        early_login_incentive_enabled: true,
        early_login_rate_per_second: 1.0,
        early_login_max_daily: 900,
        early_login_max_monthly: 15000,
        late_penalty_enabled: true,
        late_penalty_rate_per_second: 1.0,
        late_penalty_max_daily: 900,
        late_penalty_max_monthly: 15000,
        overtime_incentive_enabled: true,
        overtime_rate_per_second: 1.5,
        overtime_minimum_minutes: 30,
        early_logout_penalty_enabled: true,
        early_logout_penalty_rate_per_second: 1.0,
        face_verification_mandatory: true,
        face_verification_threshold: 85.0,
      } as any;
    }

    res.json(rules);
  } catch (error) {
    console.error('Get attendance rules error:', error);
    res.status(500).json({ error: 'Failed to get attendance rules' });
  }
});

router.put('/rules/:locationId', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    let { locationId } = req.params;
    if (locationId && locationId.length < 10) {
      const locMatch = await prisma.location.findFirst({
        where: { OR: [{ code: locationId.toUpperCase() }, { id: locationId }] },
      });
      if (locMatch) locationId = locMatch.id;
    }

    const updated = await prisma.attendanceRules.upsert({
      where: { locationId },
      create: { locationId, ...req.body },
      update: req.body,
    });
    res.json(updated);
  } catch (error) {
    console.error('Update attendance rules error:', error);
    res.status(500).json({ error: 'Failed to update attendance rules' });
  }
});

router.get('/today', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const where: any = {
      locationId: req.user!.role === 'SUPER_ADMIN' ? req.query.locationId : req.user!.locationId,
      attendanceDate: { gte: today, lt: tomorrow },
    };
    
    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, floor: true, department: true, shift: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // Calculate summary stats
    const stats = {
      total: attendances.length,
      present: attendances.filter((a: any) => a.status === 'PRESENT').length,
      absent: attendances.filter((a: any) => a.status === 'ABSENT').length,
      late: attendances.filter((a: any) => a.status === 'LATE').length,
      early: attendances.filter((a: any) => a.status === 'EARLY').length,
      onLunch: attendances.filter((a: any) => a.status === 'ON_LUNCH').length,
      onTeaBreak: attendances.filter((a: any) => a.status === 'ON_TEA_BREAK').length,
      weeklyOff: attendances.filter((a: any) => a.status === 'WEEKLY_OFF').length,
      overtime: attendances.filter((a: any) => a.status === 'OVERTIME').length,
      faceVerified: attendances.filter((a: any) => a.faceVerified).length,
      faceFailed: attendances.filter((a: any) => a.status === 'FACE_VERIFICATION_FAILED').length,
    };
    
    res.json({ attendances, stats });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ error: 'Failed to get today attendance' });
  }
});

/* ------------------------------------------------------------------ */
/* Shift Board — date-driven roster behind /attendance/shifts          */
/* ------------------------------------------------------------------ */

/** Employment statuses that form the current roster base. */
const ROSTER_EMP_STATUSES = new Set(['ACTIVE', 'PROBATION', 'ON_LEAVE']);

/** Attendance statuses selectable from the UI Status filter. */
export const BOARD_STATUS_OPTIONS = [
  'PRESENT',
  'CHECKED_OUT',
  'PUNCHED_IN',
  'LATE',
  'ON_BREAK',
  'ABSENT',
  'ON_LEAVE',
  'WEEKLY_OFF',
  'HOLIDAY',
  'NOT_PUNCHED_IN',
  'INCOMPLETE',
  'SCHEDULED',
] as const;

const SORT_KEYS = new Set(['code', 'name', 'department', 'hub', 'shift', 'status', 'in', 'late']);

function ymdOfDate(v: any): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return todayYmd(d);
}

function isoOrNull(v: any): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Resolves the effective location scope for the board (RBAC enforced). */
async function resolveBoardScope(user: AuthRequest['user'], requested: any): Promise<string | undefined> {
  const scoped = getScopedLocationId(user, requested);
  if (!scoped || scoped === 'all') return undefined;
  const cleanCode = scoped.replace(/^loc_/, '').toUpperCase();
  const locMatch = await prisma.location.findFirst({ where: { OR: [{ id: scoped }, { code: cleanCode }] } });
  return locMatch ? locMatch.id : scoped;
}

interface BoardRow {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  departmentId: string | null;
  department: string;
  locationId: string | null;
  hub: string;
  designation: string;
  employmentStatus: string;
  shiftId: string | null;
  shiftName: string;
  shiftCode: string | null;
  overnight: boolean;
  scheduledLogin: string | null;
  scheduledLogout: string | null;
  actualLogin: string | null;
  actualLogout: string | null;
  status: DisplayStatus;
  isLate: boolean;
  lateMinutes: number;
  earlyMinutes: number;
  earlyExitMinutes: number;
  overtimeMinutes: number;
  workedSeconds: number;
  breakMinutes: number;
  attendanceRecordId: string | null;
  attendanceDate: string;
  hasRecord: boolean;
  faceVerified: boolean | null;
  notes: string | null;
  correction: {
    id: string;
    status: string;
    reason: string;
    reviewNote: string | null;
    requestedById: string | null;
    reviewedById: string | null;
  } | null;
  exception: string;
  exceptionTone: 'green' | 'blue' | 'amber' | 'red' | 'slate';
  isException: boolean;
}

/**
 * Builds the complete Shift Board dataset for one date: summary counters,
 * per-shift cards and every employee row (before pagination). All filters
 * (hub, department, shift, attendance status, search, exceptions-only) are
 * applied against real database records — nothing is fabricated for empty
 * dates.
 */
async function buildShiftBoard(req: AuthRequest) {
  const dateParam = req.query.date || todayYmd();
  if (!isValidYmd(String(dateParam))) {
    return {
      status: 400,
      error: {
        error: 'INVALID_DATE',
        message: 'Query parameter "date" must be a valid calendar date in YYYY-MM-DD format.',
      },
    };
  }
  const date = String(dateParam);
  const today = todayYmd();
  const now = new Date();

  const search = String(req.query.search || '').trim();
  const statusFilter =
    req.query.status && req.query.status !== 'all' ? String(req.query.status) : '';
  const exceptionsOnly = req.query.exceptions === '1' || req.query.exceptions === 'true';
  const sortKey = SORT_KEYS.has(String(req.query.sort)) ? String(req.query.sort) : 'code';
  const departmentId =
    req.query.departmentId && req.query.departmentId !== 'all' ? String(req.query.departmentId) : null;
  const shiftId = req.query.shiftId && req.query.shiftId !== 'all' ? String(req.query.shiftId) : null;
  const scopeLocId = await resolveBoardScope(req.user, req.query.locationId);

  const [locations, shifts, employees, attendance, weeklyOffRules, holidays, breakRows, leaveRows, correctionRows] =
    await Promise.all([
      prisma.location.findMany({ select: { id: true, name: true, code: true } }).catch(() => []),
      prisma.shift.findMany({
        where: {
          ...(scopeLocId ? { locationId: scopeLocId } : {}),
          ...(shiftId ? { id: shiftId } : { status: 'ACTIVE' }),
        },
        orderBy: { startTime: 'asc' },
      }) as Promise<any[]>,
      prisma.employee.findMany({
        where: scopeLocId ? { locationId: scopeLocId } : {},
        include: { location: true, department: true, shift: true },
      }) as Promise<any[]>,
      prisma.attendance.findMany({
        where: {
          attendanceDate: date,
          ...(scopeLocId ? { locationId: scopeLocId } : {}),
          ...(shiftId ? { shiftId } : {}),
        },
        include: { shift: true, location: true },
      }) as Promise<any[]>,
      prisma.weeklyOffRule.findMany({
        where: { ...(scopeLocId ? { locationId: scopeLocId } : {}), effectiveFrom: { lte: date } },
      }).catch(() => []) as Promise<any[]>,
      prisma.holiday.findMany({ where: { date } }).catch(() => []) as Promise<any[]>,
      prisma.employeeBreak.findMany({ where: { breakDate: date } }).catch(() => []) as Promise<any[]>,
      pool
        .query(
          `SELECT employee_id AS employeeId, leave_type_id AS leaveTypeId, is_half_day AS isHalfDay
             FROM leave_applications
            WHERE status = 'APPROVED' AND start_date <= ? AND end_date >= ?`,
          [date, date]
        )
        .then(([rows]: any[]) => rows)
        .catch(() => []),
      pool
        .query(
          `SELECT * FROM attendancecorrection
            WHERE attendanceDate = ?
              ${scopeLocId ? 'AND locationId = ?' : ''}
            ORDER BY createdAt DESC`,
          scopeLocId ? [date, scopeLocId] : [date]
        )
        .then(([rows]: any[]) => rows)
        .catch(() => []),
    ]);

  // Shifts referenced by roster/attendance rows but outside the loaded list.
  const shiftById = new Map<string, any>(shifts.map((s: any) => [s.id, s]));
  const referencedShiftIds = [
    ...attendance.map((a: any) => a.shiftId),
    ...employees.map((e: any) => e.shiftId),
  ].filter((id: any) => id && !shiftById.has(id));
  const missingShiftIds = [...new Set(referencedShiftIds)] as string[];
  if (missingShiftIds.length > 0) {
    const extra: any[] = await prisma.shift.findMany({ where: { id: { in: missingShiftIds } } }).catch(() => []);
    for (const s of extra) shiftById.set(s.id, s);
  }

  const locationName = new Map<string, string>(locations.map((l: any) => [l.id, l.name]));
  const empById = new Map<string, any>(employees.map((e: any) => [e.id, e]));
  const attByEmp = new Map<string, any>(attendance.map((a: any) => [a.employeeId, a]));
  const leaveSet = new Set<string>(leaveRows.map((l: any) => String(l.employeeId)));
  const breakByEmp = new Map<string, { minutes: number; active: boolean }>();
  for (const b of breakRows as any[]) {
    const prev = breakByEmp.get(b.employeeId) || { minutes: 0, active: false };
    prev.minutes += Math.max(0, Number(b.actualDuration || 0));
    prev.active = prev.active || (b.status === 'ACTIVE' && !b.endTime);
    breakByEmp.set(b.employeeId, prev);
  }
  const correctionByEmp = new Map<string, any>();
  for (const c of correctionRows as any[]) {
    if (!correctionByEmp.has(c.employeeId)) correctionByEmp.set(c.employeeId, c);
  }
  const activeWeeklyOffRules = (weeklyOffRules as any[]).filter((r) => {
    const from = ymdOfDate(r.effectiveFrom);
    const to = ymdOfDate(r.effectiveTo);
    return (!from || from <= date) && (!to || to >= date);
  });
  const weekday = weekdayOf(date);

  // Roster = filtered current employees ∪ employees with an attendance
  // snapshot on this date (covers transfers and exits for historical dates).
  const rosterIds = new Set<string>();
  for (const e of employees) {
    if (departmentId && e.departmentId !== departmentId) continue;
    if (shiftId && e.shiftId !== shiftId) continue;
    if (e.status && !ROSTER_EMP_STATUSES.has(e.status)) continue;

    // Respect employment lifecycle: ignore employees who joined after this date or exited before it
    const joinYmd = ymdOfDate(e.joiningDate);
    if (joinYmd && joinYmd > date) continue;
    const exitYmd = ymdOfDate(e.exitDate);
    if (exitYmd && exitYmd < date) continue;

    // A shift board roster strictly schedules employees with an assigned shift
    const a = attByEmp.get(e.id);
    const effShift = a?.shiftId || e.shiftId;
    if (!effShift || !shiftById.has(effShift)) continue;

    rosterIds.add(e.id);
  }
  for (const a of attendance) {
    if (departmentId) {
      const e = empById.get(a.employeeId);
      if (!e || e.departmentId !== departmentId) continue;
    }
    if (shiftId && a.shiftId !== shiftId) continue;
    const effShift = a.shiftId || empById.get(a.employeeId)?.shiftId;
    if (!effShift || !shiftById.has(effShift)) continue;
    rosterIds.add(a.employeeId);
  }

  const rows: BoardRow[] = [];
  for (const empId of rosterIds) {
    const e = empById.get(empId);
    const a = attByEmp.get(empId) || null;
    const locId = (a && a.locationId) || (e && e.locationId) || null;
    const deptId = (e && e.departmentId) || null;
    let effShiftId: string | null = (a && a.shiftId) || (e && e.shiftId) || null;
    if (a?.shiftId && locId) {
      const attShift = shiftById.get(a.shiftId);
      if (attShift && attShift.locationId && attShift.locationId !== locId) {
        // Attendance snapshot points at another hub's shift (legacy data) —
        // trust the employee's current assignment for the roster view.
        effShiftId = (e && e.shiftId) || null;
      }
    }
    const shift = effShiftId ? shiftById.get(effShiftId) : null;

    const window: ShiftWindow | null =
      a && a.scheduledLogin && a.scheduledLogout
        ? windowFromScheduled(a.scheduledLogin, a.scheduledLogout)
        : computeShiftWindow(shift, date);

    const lateThreshold = shift ? Number(shift.lateThreshold ?? 5) : 5;
    const durations = computeDurations(window, a?.actualLogin, a?.actualLogout, lateThreshold);
    const breaks = breakByEmp.get(empId) || { minutes: 0, active: false };

    const isHoliday = (holidays as any[]).some(
      (h) => (!h.locationId || h.locationId === locId) && (!h.departmentId || h.departmentId === deptId)
    );
    const isWeeklyOff = activeWeeklyOffRules.some(
      (r) =>
        r.locationId === locId &&
        (!r.employeeId || r.employeeId === empId) &&
        (!r.departmentId || r.departmentId === deptId) &&
        (!r.shiftId || r.shiftId === effShiftId) &&
        r.dayOfWeek === weekday
    );

    const derived = deriveDisplayStatus({
      recordStatus: a?.status,
      actualLogin: a?.actualLogin,
      actualLogout: a?.actualLogout,
      isLeave: leaveSet.has(empId),
      isHoliday,
      isWeeklyOff,
      onBreak: breaks.active,
      window,
      durations,
      workDate: date,
      today,
      now,
      lateThresholdMinutes: lateThreshold,
    });

    const exc = describeException(derived.status, {
      durations,
      window,
      graceMinutes: shift ? Number(shift.gracePeriod ?? 5) : 5,
      hasLogin: !!a?.actualLogin,
      hasLogout: !!a?.actualLogout,
      isPastDate: date < today,
      isLate: derived.isLate,
    });

    const corr = correctionByEmp.get(empId);

    rows.push({
      id: empId,
      employeeId: empId,
      employeeCode: e?.employeeCode || '—',
      fullName: e?.fullName || '—',
      departmentId: deptId,
      department: e?.department?.name || '—',
      locationId: locId,
      hub: (a && a.location?.name) || e?.location?.name || locationName.get(locId || '') || '—',
      designation: e?.designation || '—',
      employmentStatus: e?.status || '—',
      shiftId: effShiftId,
      shiftName: shift?.name || '—',
      shiftCode: shift?.code || null,
      overnight: window?.overnight || false,
      scheduledLogin: window ? window.start.toISOString() : null,
      scheduledLogout: window ? window.end.toISOString() : null,
      actualLogin: isoOrNull(a?.actualLogin),
      actualLogout: isoOrNull(a?.actualLogout),
      status: derived.status,
      isLate: derived.isLate,
      lateMinutes: derived.lateMinutes,
      earlyMinutes: Math.round(durations.earlyLoginSeconds / 60),
      earlyExitMinutes: Math.round(durations.earlyLogoutSeconds / 60),
      overtimeMinutes: Math.round(durations.overtimeSeconds / 60),
      workedSeconds: durations.totalWorkingSeconds || Number(a?.totalWorkingSeconds || 0),
      breakMinutes: breaks.minutes,
      attendanceRecordId: a?.id || null,
      attendanceDate: date,
      hasRecord: !!a,
      faceVerified: a ? !!a.faceVerified : null,
      notes: a?.notes || null,
      correction: corr
        ? {
            id: corr.id,
            status: corr.status,
            reason: corr.reason,
            reviewNote: corr.reviewNote || null,
            requestedById: corr.requestedById || null,
            reviewedById: corr.reviewedById || null,
          }
        : null,
      exception: exc.text,
      exceptionTone: exc.tone,
      isException: exc.isException,
    });
  }

  // Summary + per-shift cards are computed over the hub/dept/shift scope and
  // deliberately ignore the status/search filters so the cards stay stable.
  const summary = tallyRows(rows);
  const shiftCards = (shifts as any[])
    .filter((s) => !shiftId || s.id === shiftId)
    .map((s) => {
      const staff = tallyRows(rows.filter((r) => r.shiftId === s.id));
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        locationId: s.locationId,
        locationName: locationName.get(s.locationId) || '—',
        startTime: isoOrNull(s.startTime),
        endTime: isoOrNull(s.endTime),
        gracePeriod: Number(s.gracePeriod ?? 5),
        lateThreshold: Number(s.lateThreshold ?? 15),
        status: s.status,
        overnight:
          computeShiftWindow(s, date)?.overnight ||
          false,
        staff,
      };
    });

  // Status / exceptions / search filters narrow the row list.
  let filtered = rows;
  if (statusFilter) filtered = filtered.filter((r) => statusMatchesFilter(r.status, r.isLate, statusFilter));
  if (exceptionsOnly) filtered = filtered.filter((r) => r.isException);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((r) =>
      [r.employeeCode, r.fullName, r.department, r.hub, r.shiftName, r.designation, r.employmentStatus]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }

  const dir = 1;
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name':
        cmp = a.fullName.localeCompare(b.fullName);
        break;
      case 'department':
        cmp = a.department.localeCompare(b.department);
        break;
      case 'hub':
        cmp = a.hub.localeCompare(b.hub);
        break;
      case 'shift':
        cmp = a.shiftName.localeCompare(b.shiftName);
        break;
      case 'status':
        cmp = a.status.localeCompare(b.status);
        break;
      case 'in':
        cmp = String(a.actualLogin || '').localeCompare(String(b.actualLogin || ''));
        break;
      case 'late':
        cmp = a.lateMinutes - b.lateMinutes;
        break;
      default:
        cmp = a.employeeCode.localeCompare(b.employeeCode);
    }
    return cmp !== 0 ? cmp * dir : a.fullName.localeCompare(b.fullName);
  });

  return {
    status: 200,
    data: {
      date,
      today,
      isToday: date === today,
      isFuture: date > today,
      scope: {
        locationId: scopeLocId || 'all',
        departmentId,
        shiftId,
        status: statusFilter || 'all',
        search,
        exceptions: exceptionsOnly,
        sort: sortKey,
      },
      summary,
      shifts: shiftCards,
      total: sorted.length,
      rows: sorted,
      statusOptions: BOARD_STATUS_OPTIONS,
    },
  };
}

router.get('/shift-board', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const result = await buildShiftBoard(req);
    if (result.status !== 200 || !('data' in result)) {
      return res.status(result.status).json((result as any).error);
    }
    const data: any = (result as any).data;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 15));
    const start = (page - 1) * limit;
    const rows = data.rows.slice(start, start + limit);
    res.json({
      ...data,
      rows,
      page,
      limit,
      pages: Math.max(1, Math.ceil(data.total / limit)),
    });
  } catch (error) {
    console.error('Shift board error:', error);
    res.status(500).json({ error: 'Failed to build shift board' });
  }
});

/** Escapes one CSV cell and neutralises spreadsheet formula injection. */
function csvCell(v: any): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvStamp(v: any): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

router.get('/shift-board/export', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const result = await buildShiftBoard(req);
    if (result.status !== 200 || !('data' in result)) {
      return res.status(result.status).json((result as any).error);
    }
    const data: any = (result as any).data;
    const rows: BoardRow[] = data.rows;

    const header = [
      'Employee ID',
      'Employee Name',
      'Department',
      'Hub',
      'Designation',
      'Employment Status',
      'Scheduled Shift',
      'Scheduled Login',
      'Scheduled Logout',
      'Actual Login',
      'Actual Logout',
      'Attendance Status',
      'Late (min)',
      'Early Arrival (min)',
      'Early Exit (min)',
      'Worked (h:mm)',
      'Break (min)',
      'Attendance Date',
      'Regularization Status',
      'Punch Exception',
    ];
    const workedHm = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;

    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.employeeCode,
          r.fullName,
          r.department,
          r.hub,
          r.designation,
          r.employmentStatus,
          r.shiftName,
          csvStamp(r.scheduledLogin),
          csvStamp(r.scheduledLogout),
          csvStamp(r.actualLogin),
          csvStamp(r.actualLogout),
          r.status,
          r.lateMinutes,
          r.earlyMinutes,
          r.earlyExitMinutes,
          workedHm(r.workedSeconds),
          r.breakMinutes,
          r.attendanceDate,
          r.correction ? r.correction.status : '',
          r.exception,
        ]
          .map(csvCell)
          .join(',')
      );
    }

    const csv = `\uFEFF${lines.join('\r\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="BSC_Shift_Board_${data.date}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  } catch (error) {
    console.error('Shift board export error:', error);
    res.status(500).json({ error: 'Failed to export shift board' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const attendance = await prisma.attendance.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, location: true, floor: true, department: true, shift: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    });
    
    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && attendance.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(attendance);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Failed to get attendance' });
  }
});

router.post('/', authorize('RECORD'), validate(attendanceSchema), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, shiftId, attendanceDate, scheduledLogin, actualLogin, scheduledLogout, actualLogout } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const shift = shiftId
      ? await prisma.shift.findUnique({ where: { id: shiftId } })
      : employee.shiftId
        ? await prisma.shift.findUnique({ where: { id: employee.shiftId } })
        : null;
    const rules = await prisma.attendanceRules.findUnique({ where: { locationId } });
    
    const date = dbDate(new Date(attendanceDate));
    
    // Check if attendance already exists
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_attendanceDate: { employeeId, attendanceDate: date } },
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Attendance record already exists for this date' });
    }
    
    // Calculate times
    const scheduledIn = scheduledLogin ? new Date(scheduledLogin) : shift?.startTime || rules?.loginTime;
    const scheduledOut = scheduledLogout ? new Date(scheduledLogout) : shift?.endTime || rules?.logoutTime;
    const actualIn = actualLogin ? new Date(actualLogin) : null;
    const actualOut = actualLogout ? new Date(actualLogout) : null;
    
    // Calculate early/late/overtime
    let earlyLoginSeconds = 0;
    let lateLoginSeconds = 0;
    let earlyLogoutSeconds = 0;
    let overtimeSeconds = 0;
    
    if (actualIn && scheduledIn) {
      const diff = scheduledIn.getTime() - actualIn.getTime();
      if (diff > 0) earlyLoginSeconds = Math.floor(diff / 1000);
      else if (diff < -(rules?.lateThresholdMinutes || 5) * 60 * 1000) lateLoginSeconds = Math.floor(Math.abs(diff) / 1000);
    }
    
    if (actualOut && scheduledOut) {
      const diff = actualOut.getTime() - scheduledOut.getTime();
      if (diff < 0) earlyLogoutSeconds = Math.floor(Math.abs(diff) / 1000);
      else overtimeSeconds = Math.floor(diff / 1000);
    }
    
    // Calculate incentives/penalties
    let earlyLoginIncentive = 0;
    let lateLoginPenalty = 0;
    let overtimeIncentive = 0;
    let earlyLogoutPenalty = 0;
    
    if (earlyLoginSeconds > 0 && rules?.earlyLoginIncentiveEnabled) {
      earlyLoginIncentive = earlyLoginSeconds * Number(rules.earlyLoginRatePerSecond || 1);
      if (rules.earlyLoginMaxDaily && earlyLoginIncentive > Number(rules.earlyLoginMaxDaily)) {
        earlyLoginIncentive = Number(rules.earlyLoginMaxDaily);
      }
    }
    
    if (lateLoginSeconds > 0 && rules?.latePenaltyEnabled) {
      lateLoginPenalty = lateLoginSeconds * Number(rules.latePenaltyRatePerSecond || 1);
      if (rules.latePenaltyMaxDaily && lateLoginPenalty > Number(rules.latePenaltyMaxDaily)) {
        lateLoginPenalty = Number(rules.latePenaltyMaxDaily);
      }
    }
    
    if (overtimeSeconds > 0 && rules?.overtimeIncentiveEnabled) {
      overtimeIncentive = overtimeSeconds * Number(rules.overtimeRatePerSecond || 1.5);
    }
    
    if (earlyLogoutSeconds > 0 && rules?.earlyLogoutPenaltyEnabled) {
      earlyLogoutPenalty = earlyLogoutSeconds * Number(rules.earlyLogoutRatePerSecond || 1);
    }
    
    // Calculate total working time
    let totalWorkingSeconds = 0;
    if (actualIn && actualOut) {
      totalWorkingSeconds = Math.floor((actualOut.getTime() - actualIn.getTime()) / 1000);
    }
    
    const status = !actualIn ? 'ABSENT' : 
      lateLoginSeconds > 0 ? 'LATE' : 
      earlyLoginSeconds > 0 ? 'EARLY' : 'PRESENT';
    
    const attendance = await prisma.attendance.create({
      data: {
        employeeId,
        locationId,
        shiftId,
        attendanceDate: date,
        scheduledLogin: scheduledIn,
        actualLogin: actualIn,
        scheduledLogout: scheduledOut,
        actualLogout: actualOut,
        earlyLoginSeconds,
        lateLoginSeconds,
        earlyLogoutSeconds,
        overtimeSeconds,
        totalWorkingSeconds,
        earlyLoginIncentive,
        lateLoginPenalty,
        overtimeIncentive,
        earlyLogoutPenalty,
        status,
      },
    });
    
    // Emit real-time update
    socketIO.to(`location:${locationId}`).emit('attendance:created', attendance);
    
    res.status(201).json(attendance);
  } catch (error) {
    console.error('Create attendance error:', error);
    res.status(500).json({ error: 'Failed to create attendance' });
  }
});

router.put('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { scheduledLogin, actualLogin, scheduledLogout, actualLogout, status, notes } = req.body;
    
    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updateData: any = { notes };
    if (scheduledLogin) updateData.scheduledLogin = new Date(scheduledLogin);
    if (actualLogin) updateData.actualLogin = new Date(actualLogin);
    if (scheduledLogout) updateData.scheduledLogout = new Date(scheduledLogout);
    if (actualLogout) updateData.actualLogout = new Date(actualLogout);
    if (status) updateData.status = status;
    
    // Recalculate if times changed
    if (actualLogin || actualLogout) {
      const rules = await prisma.attendanceRules.findUnique({ where: { locationId: existing.locationId } });
      const shift = existing.shiftId ? await prisma.shift.findUnique({ where: { id: existing.shiftId } }) : null;
      
      const scheduledIn = updateData.scheduledLogin || existing.scheduledLogin;
      const scheduledOut = updateData.scheduledLogout || existing.scheduledLogout;
      const actualIn = updateData.actualLogin || existing.actualLogin;
      const actualOut = updateData.actualLogout || existing.actualLogout;
      
      if (actualIn && scheduledIn) {
        const diff = scheduledIn.getTime() - actualIn.getTime();
        updateData.earlyLoginSeconds = diff > 0 ? Math.floor(diff / 1000) : 0;
        updateData.lateLoginSeconds = diff < -(rules?.lateThresholdMinutes || 5) * 60 * 1000 ? Math.floor(Math.abs(diff) / 1000) : 0;
      }
      
      if (actualOut && scheduledOut) {
        const diff = actualOut.getTime() - scheduledOut.getTime();
        updateData.earlyLogoutSeconds = diff < 0 ? Math.floor(Math.abs(diff) / 1000) : 0;
        updateData.overtimeSeconds = diff > 0 ? Math.floor(diff / 1000) : 0;
      }
      
      // Recalculate incentives
      if (updateData.earlyLoginSeconds > 0 && rules?.earlyLoginIncentiveEnabled) {
        updateData.earlyLoginIncentive = updateData.earlyLoginSeconds * Number(rules.earlyLoginRatePerSecond || 1);
      }
      if (updateData.lateLoginSeconds > 0 && rules?.latePenaltyEnabled) {
        updateData.lateLoginPenalty = updateData.lateLoginSeconds * Number(rules.latePenaltyRatePerSecond || 1);
      }
      if (updateData.overtimeSeconds > 0 && rules?.overtimeIncentiveEnabled) {
        updateData.overtimeIncentive = updateData.overtimeSeconds * Number(rules.overtimeRatePerSecond || 1.5);
      }
      if (updateData.earlyLogoutSeconds > 0 && rules?.earlyLogoutPenaltyEnabled) {
        updateData.earlyLogoutPenalty = updateData.earlyLogoutSeconds * Number(rules.earlyLogoutRatePerSecond || 1);
      }
      
      if (actualIn && actualOut) {
        updateData.totalWorkingSeconds = Math.floor((actualOut.getTime() - actualIn.getTime()) / 1000);
      }
    }
    
    if (status) updateData.status = status;
    
    const attendance = await prisma.attendance.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // Publish notification for manual attendance change
    await container.notificationService.publishEvent({
      eventId: 'ATT.MANUAL_CHANGE',
      title: 'Attendance Record Manually Updated',
      message: `Attendance record for ${existing.employeeId} was manually updated by ${req.user!.fullName}.`,
      type: 'INFO',
      severity: 'MEDIUM',
      entityType: 'attendance',
      entityId: attendance.id,
      locationId: existing.locationId,
      actionUrl: `/attendance/punches?id=${attendance.id}`,
      correlationId: `att_manual_${attendance.id}_${Date.now()}`,
      metadata: { updatedBy: req.user!.id, updatedFields: Object.keys(updateData) },
    });

    socketIO.to(`location:${existing.locationId}`).emit('attendance:updated', attendance);
    
    res.json(attendance);
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

router.post('/bulk', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { records } = req.body;
    
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Records array is required' });
    }
    
    const results: any[] = [];
    for (const record of records) {
      try {
        // Process each record similar to single create
        // This is a simplified version
        const attendance = await prisma.attendance.create({
          data: {
            ...record,
            attendanceDate: new Date(record.attendanceDate),
            scheduledLogin: record.scheduledLogin ? new Date(record.scheduledLogin) : null,
            actualLogin: record.actualLogin ? new Date(record.actualLogin) : null,
            scheduledLogout: record.scheduledLogout ? new Date(record.scheduledLogout) : null,
            actualLogout: record.actualLogout ? new Date(record.actualLogout) : null,
          },
        });
        results.push({ success: true, data: attendance });
      } catch (e: any) {
        results.push({ success: false, error: e.message, record });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Bulk attendance error:', error);
    res.status(500).json({ error: 'Failed to process bulk attendance' });
  }
});

export default router;