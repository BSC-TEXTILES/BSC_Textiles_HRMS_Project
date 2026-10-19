/**
 * BSC Textiles HRMS - Employee Dedicated Biometric Attendance Module
 * 
 * Implements authoritative monthly attendance retrieval, rule validation,
 * eSSL MB160 terminal synchronization, and HR manual correction workflows
 * for one employee at their own store. Identity, roster, holiday and device values
 */

import { Router, Response } from 'express';
import { pool } from '../nativeDb.js';
import { AuthRequest, authenticate, authorize } from '../middleware/auth.js';
import { ingestRawPunches, probeDeviceSocket } from '../services/biometricService.js';
import { loadGlobalSettings } from '../services/biometric/settings.js';
import { loadCalendarContext } from '../services/attendance/attendanceWorkbook.js';
import {
  deviceCalendarDate,
  formatWallString,
  formatWallString12,
  fromUtcMysqlString,
  toUtcMysqlString,
  wallTimeToInstant,
} from '../services/biometric/timeCodec.js';
import { socketIO } from '../socket.js';
import crypto from 'node:crypto';

/**
 * The store timezone for an employee: the terminal that recorded their punches
 * decides it, falling back to the deployment default. Display must not depend on
 * whichever zone the API process happens to run in.
 */
async function resolveEmployeeTimezone(employeeId: string): Promise<string> {
  const settings = await loadGlobalSettings();
  try {
    const [rows]: any = await pool.query(
      `SELECT d.timezone
         FROM biometric_raw_punches r
         JOIN biometric_devices d ON d.id = r.deviceId
        WHERE r.employeeId = ? AND d.timezone IS NOT NULL AND d.timezone <> ''
        ORDER BY r.punchTimeUtc DESC
        LIMIT 1`,
      [employeeId]
    );
    if (rows[0]?.timezone) return String(rows[0].timezone);
  } catch {
    // No punches yet — the deployment default is the right answer.
  }
  return settings.defaultTimezone;
}

/** A 12-hour clock string in the store's timezone, e.g. "09:12 AM". */
function wallHhmm(instant: Date | null, timeZone: string): string | null {
  if (!instant) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(instant);
}

/** Absolute instant of a stored punch, preferring the authoritative UTC column. */
function punchInstantOf(p: any, fallbackZone: string): Date | null {
  if (p.punchTimeUtc) {
    const asUtc = fromUtcMysqlString(p.punchTimeUtc);
    if (asUtc) return asUtc;
  }
  if (p.punchTime instanceof Date) return p.punchTime;
  if (!p.punchTime) return null;
  // Legacy rows written before punchTimeUtc existed: the pool hands back the
  // instant already, and the raw text is in the device zone if present.
  return p.rawDeviceTimeString
    ? toSafeInstantForLegacyRow(String(p.rawDeviceTimeString), p.rawTimezone || fallbackZone)
    : new Date(String(p.punchTime));
}

function toSafeInstantForLegacyRow(wall: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(wall);
  if (!match) return null;
  return wallTimeToInstant(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6]),
      ms: 0,
    },
    timeZone
  );
}

function wallMonthBoundary(year: number, month: number, day: number, hhmmss: string, timeZone: string): Date {
  const [h, mi, s] = hhmmss.split(':').map(Number);
  return wallTimeToInstant({ year, month, day, hour: h, minute: mi, second: s, ms: 0 }, timeZone);
}

const router = Router();
router.use(authenticate);


/**
 * Helper to resolve employee by ID, employeeCode, or biometric mapping
 */
async function resolveEmployee(identifier: string) {
  const clean = identifier.trim();
  const [rows]: any = await pool.query(
    `SELECT e.*, l.name as locationName, l.code as locationCode, d.name as departmentName, s.name as shiftName,
            s.startTime, s.endTime, s.gracePeriod, s.lateThreshold
     FROM employee e
     LEFT JOIN location l ON e.locationId = l.id
     LEFT JOIN department d ON e.departmentId = d.id
     LEFT JOIN shift s ON e.shiftId = s.id
     WHERE e.id = ? OR e.employeeCode = ? OR e.salesmanNo = ? OR e.biometricDeviceEmployeeId = ?
     LIMIT 1`,
    [clean, clean, clean, clean]
  );

  if (rows.length > 0) return rows[0];

  // Try checking biometric_employee_mappings
  const [mapRows]: any = await pool.query(
    `SELECT employeeId FROM biometric_employee_mappings WHERE enrollmentNumber = ? LIMIT 1`,
    [clean]
  );
  if (mapRows.length > 0) {
    const [empRows]: any = await pool.query(
      `SELECT e.*, l.name as locationName, l.code as locationCode, d.name as departmentName, s.name as shiftName,
              s.startTime, s.endTime, s.gracePeriod, s.lateThreshold
       FROM employee e
       LEFT JOIN location l ON e.locationId = l.id
       LEFT JOIN department d ON e.departmentId = d.id
       LEFT JOIN shift s ON e.shiftId = s.id
       WHERE e.id = ? LIMIT 1`,
      [mapRows[0].employeeId]
    );
    if (empRows.length > 0) return empRows[0];
  }

  return null;
}

/**
 * GET /api/attendance/employee/:id
 * Retrieve complete monthly biometric attendance report for specified employee (e.g. 1604)
 */
router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const year = Number(req.query.year) || 2026;
    const month = Number(req.query.month) || 10; // Default to October 2026

    const emp = await resolveEmployee(id);
    if (!emp) {
      return res.status(404).json({
        success: false,
        error: `Employee record '${id}' was not found in the HRMS database. Actionable HR review and verified onboarding is required before biometric attendance can be calculated.`,
      });
    }

    const empId = emp.id;
    const employeeCode = emp.employeeCode || id;

    // Days in selected month
    const totalDays = new Date(year, month, 0).getDate();
    const today = new Date();
    // "Today" in the store's own timezone, not in UTC: before 05:30 IST the UTC
    // date is still yesterday, which made the board mark today as future/past
    // incorrectly.
    const storeTimezone = await resolveEmployeeTimezone(empId);
    const todayYmd = deviceCalendarDate(today, storeTimezone);
    /**
     * Holidays and weekly offs come from the `holiday` and `weeklyoffrule` tables via
     * the same loader the Excel exports use, so the self-service screen and the
     * downloaded workbook can never disagree about which day was a holiday.
     */
    const calendar = await loadCalendarContext(
      { from: `${year}-${String(month).padStart(2, '0')}-01`, to: `${year}-${String(month).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`, locationId: emp.locationId || null },
      [empId]
    );

    // 1. Fetch raw biometric punches for this employee across its devices.
    //    The window is built in the employee's store timezone and compared
    //    against punchTimeUtc, so a month boundary means the same thing here as
    //    it does on the terminal — not whatever zone the API server happens to
    //    run in.
    const monthStartUtc = wallMonthBoundary(year, month, 1, '00:00:00', storeTimezone);
    const monthEndUtc = wallMonthBoundary(year, month, totalDays, '23:59:59', storeTimezone);

    const [rawPunches]: any = await pool.query(
      `SELECT r.id, r.deviceId, r.serialNumber, r.enrollmentNumber, r.normalizedId,
              r.punchTime, r.punchTimeUtc, r.punchType, r.verifyMode, r.rawVerifyType,
              r.rawPunchState, r.verifyModeLabel, r.matchValue, r.photoPath,
              r.rawTimezone, r.mappingStatus, r.receivedAt, r.syncStatus,
              d.name as deviceName, d.timezone as deviceTimezone
         FROM biometric_raw_punches r
         LEFT JOIN biometric_devices d ON r.deviceId = d.id
        WHERE (r.employeeId = ? OR r.normalizedId = ? OR r.enrollmentNumber = ?)
          AND r.punchTimeUtc >= ? AND r.punchTimeUtc <= ?
        ORDER BY r.punchTimeUtc ASC`,
      [
        empId,
        employeeCode.replace(/^0+/, '') || employeeCode,
        employeeCode,
        toUtcMysqlString(monthStartUtc),
        toUtcMysqlString(monthEndUtc),
      ]
    );

    // 2. Fetch computed daily attendance records.
    //    `attendanceDate` is a DATE; mysql2 hands it back as a Date at local
    //    midnight, so `toISOString()` reports the previous day on an IST server.
    //    Asking MySQL for the string removes the whole class of bug.
    const [attendanceRows]: any = await pool.query(
      `SELECT a.*, DATE_FORMAT(a.attendanceDate, '%Y-%m-%d') AS attendanceDateYmd
         FROM attendance a
        WHERE a.employeeId = ?
          AND a.attendanceDate >= ? AND a.attendanceDate <= ?`,
      [
        empId,
        `${year}-${String(month).padStart(2, '0')}-01`,
        `${year}-${String(month).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`,
      ]
    );
    const attendanceMap = new Map<string, any>();
    for (const att of attendanceRows) {
      attendanceMap.set(att.attendanceDateYmd, att);
    }

    // 3. Fetch HR attendance corrections
    const [corrections]: any = await pool.query(
      `SELECT c.*, u1.fullName as requesterName, u2.fullName as reviewerName
       FROM attendancecorrection c
       LEFT JOIN user u1 ON c.requestedById = u1.id
       LEFT JOIN user u2 ON c.reviewedById = u2.id
       WHERE c.employeeId = ? AND c.attendanceDate >= ? AND c.attendanceDate <= ?
       ORDER BY c.createdAt DESC`,
      [
        empId,
        `${year}-${String(month).padStart(2, '0')}-01`,
        `${year}-${String(month).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`,
      ]
    );
    const correctionMap = new Map<string, any[]>();
    for (const corr of corrections) {
      const dStr = corr.attendanceDate instanceof Date
        ? corr.attendanceDate.toISOString().slice(0, 10)
        : String(corr.attendanceDate).slice(0, 10);
      if (!correctionMap.has(dStr)) correctionMap.set(dStr, []);
      correctionMap.get(dStr)!.push(corr);
    }


    // 4. Device connectivity, read from the registry the operator maintains.
    //    A terminal is only ever reported with the status the server last
    //    observed — an unregistered or never-seen device is NOT_CONNECTED, never
    //    a reassuring "CONNECTED".
    const [devicesInDb]: any = await pool.query(
      `SELECT id, serialNumber, name, model, firmwareVersion, status, lastConnectionAt, lastSyncAt, lastError, isActive
       FROM biometric_devices
       WHERE locationCode = ? OR locationId = ?`,
      [emp.locationCode || 'DAV', emp.locationId]
    );

    const deviceStatuses = devicesInDb.map((device: any) => ({
      serialNumber: device.serialNumber,
      name: device.name,
      model: device.model || 'Unknown model',
      showroom: emp.locationCode || null,
      configured: Boolean(device.isActive),
      status: device.isActive ? device.status || 'NOT_CONNECTED' : 'DEACTIVATED',
      lastSyncAt: device.lastSyncAt || device.lastConnectionAt || null,
      lastConnectionAt: device.lastConnectionAt || null,
      lastError: device.lastError || null,
    }));

    // Which terminal this employee is actually enrolled on, from the mapping the
    // registry holds — never a hard-coded device identity.
    const [enrollmentRows]: any = await pool.query(
      `SELECT m.enrollmentNumber, m.status, m.showroomCode, m.serialNumber, m.updatedAt, d.model
         FROM biometric_employee_mappings m
         LEFT JOIN biometric_devices d ON d.serialNumber = m.serialNumber
        WHERE m.employeeId = ?
        ORDER BY m.updatedAt DESC
        LIMIT 1`,
      [empId]
    );
    const enrollment = enrollmentRows[0] || null;

    const [lastSyncRows]: any = await pool.query(
      'SELECT MAX(receivedAt) AS lastReceived FROM biometric_raw_punches WHERE employeeId = ?',
      [empId]
    );

    // 5. Generate complete daily records for all 31 days
    const dailyRecords: any[] = [];
    let presentCount = 0;
    let absentCount = 0;
    let weeklyOffCount = 0;
    let holidayCount = 0;
    let leaveCount = 0;
    let pendingVerificationCount = 0;
    let totalWorkingSeconds = 0;
    let missingPunchCount = 0;
    let pendingCorrectionsCount = 0;

    for (let day = 1; day <= totalDays; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateYmd = `${year}-${String(month).padStart(2, '0')}-${dayStr}`;
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeekNum = dateObj.getDay(); // 0 is Sunday
      const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = dayOfWeekNames[dayOfWeekNum];
      const isSunday = dayOfWeekNum === 0;
      const dayAttendance = attendanceMap.get(dateYmd);
      const holidayName = calendar.holidayByDay.get(dateYmd) || null;
      const isHoliday = Boolean(holidayName);
      // A weekly off is only a weekly off when a rule says so — being a Sunday is
      // not evidence, and the day's own attendance row outranks any assumption.
      const offRuleDays = calendar.weeklyOffByEmployee.get(empId) || calendar.weeklyOffDays;
      const isConfiguredWeeklyOff =
        dayAttendance?.status === 'WEEKLY_OFF' || offRuleDays.has(dayOfWeek.toUpperCase());

      const isFutureDate = dateYmd > todayYmd;

      // Filter punches for this specific date, by the day the terminal was in.
      const dayPunches = rawPunches.filter((p: any) => {
        const instant = punchInstantOf(p, storeTimezone);
        return instant ? deviceCalendarDate(instant, p.rawTimezone || storeTimezone) === dateYmd : false;
      });

      const dayCorrections = correctionMap.get(dateYmd) || [];
      const pendingCorr = dayCorrections.find((c) => c.status === 'PENDING');
      const approvedCorr = dayCorrections.find((c) => c.status === 'APPROVED');

      if (pendingCorr) pendingCorrectionsCount++;

      let status = 'PENDING_VERIFICATION';
      let statusLabel = 'Pending Verification';
      let inPunch: string | null = null;
      let outPunch: string | null = null;
      let netDurationSec = 0;
      let breakDurationSec = 0;
      let lateMinutes = 0;
      let earlyDepartureMinutes = 0;
      let flags: string[] = [];

      if (isFutureDate) {
        status = 'FUTURE_DATE';
        statusLabel = 'Future Date (Not Yet Due)';
      } else if (isHoliday) {
        status = 'HOLIDAY';
        statusLabel = `Holiday (${holidayName})`;
        holidayCount++;
      } else if (isConfiguredWeeklyOff) {
        status = 'WEEKLY_OFF';
        statusLabel = 'Weekly Off (configured rule)';
        weeklyOffCount++;
      } else if (dayAttendance?.status === 'ABSENT') {
        status = 'ABSENT';
        statusLabel = 'Absent (recorded by HR)';
        absentCount++;
      } else if ((calendar.leaveByEmployee.get(empId) || []).some((r) => dateYmd >= r.from && dateYmd <= r.to)) {
        status = 'ON_LEAVE';
        statusLabel = 'Approved Leave';
        leaveCount++;
      } else if (approvedCorr) {
        // HR Approved manual correction applied. The corrected timings are the
        // record; the duration is computed from them instead of assuming a shift
        // length, and a one-sided correction is still reported as a missing punch.
        status = 'PRESENT';
        statusLabel = 'Present (HR Approved Correction)';
        const corrIn = approvedCorr.requestedLogin ? new Date(approvedCorr.requestedLogin) : null;
        const corrOut = approvedCorr.requestedLogout ? new Date(approvedCorr.requestedLogout) : null;
        inPunch = corrIn ? wallHhmm(corrIn, storeTimezone) : null;
        outPunch = corrOut ? wallHhmm(corrOut, storeTimezone) : null;
        if (corrIn && corrOut) {
          netDurationSec = Math.max(0, Math.floor((corrOut.getTime() - corrIn.getTime()) / 1000));
        } else {
          flags.push(corrIn ? 'Missing OUT punch' : 'Missing IN punch');
          missingPunchCount++;
          status = 'INCOMPLETE_CORRECTION';
          statusLabel = 'Correction has only one punch';
        }
        totalWorkingSeconds += netDurationSec;
        presentCount++;
      } else if (dayPunches.length > 0 || dayAttendance?.actualLogin) {
        // Biometric events present
        status = 'PRESENT';
        statusLabel = 'Present';

        if (dayPunches.length > 0) {
          const sorted = dayPunches
            .map((p: any) => ({ p, instant: punchInstantOf(p, storeTimezone) }))
            .filter((x: any): x is { p: any; instant: Date } => Boolean(x.instant))
            .sort((a, b) => a.instant.getTime() - b.instant.getTime());
          const zoneOf = (row: any) => row.p.rawTimezone || storeTimezone;

          if (sorted.length > 0) {
            inPunch = wallHhmm(sorted[0].instant, zoneOf(sorted[0]));
          }

          if (sorted.length > 1) {
            const last = sorted[sorted.length - 1];
            outPunch = wallHhmm(last.instant, zoneOf(last));
            netDurationSec = Math.max(0, Math.floor((last.instant.getTime() - sorted[0].instant.getTime()) / 1000));
            // Standard break deduction if worked over 6 hours
            if (netDurationSec > 21600) {
              breakDurationSec = 3600; // 60 min lunch
              netDurationSec -= breakDurationSec;
            }
          } else {
            // Missing OUT punch
            flags.push('Missing OUT punch');
            missingPunchCount++;
            status = 'MISSING_OUT';
            statusLabel = 'Incomplete (Missing OUT)';
          }
        } else if (dayAttendance?.actualLogin) {
          inPunch = wallHhmm(new Date(dayAttendance.actualLogin), storeTimezone);
          if (dayAttendance.actualLogout) {
            outPunch = wallHhmm(new Date(dayAttendance.actualLogout), storeTimezone);
            netDurationSec = dayAttendance.effectiveWorkingSeconds || dayAttendance.totalWorkingSeconds || 32400;
          } else {
            flags.push('Missing OUT punch');
            missingPunchCount++;
            status = 'MISSING_OUT';
            statusLabel = 'Incomplete (Missing OUT)';
          }
        }

        // Lateness check against shift start (10:00 AM)
        if (dayAttendance?.lateLoginSeconds) {
          lateMinutes = Math.floor(dayAttendance.lateLoginSeconds / 60);
          if (lateMinutes > 5) {
            flags.push(`Late Arrival (${lateMinutes}m)`);
          }
        }

        if (netDurationSec < 14400 && status !== 'MISSING_OUT') {
          flags.push('Insufficient working hours (< 4h)');
        }

        totalWorkingSeconds += netDurationSec;
        presentCount++;
      } else {
        // No biometric event recorded on a past working day
        status = 'PENDING_VERIFICATION';
        statusLabel = 'Pending Biometric Sync / HR Review';
        flags.push('Missing biometric records (Hardware offline or pending ingest)');
        pendingVerificationCount++;
      }

      dailyRecords.push({
        date: dateYmd,
        dayNumber: day,
        dayOfWeek,
        isSunday,
        isHoliday,
        holidayName,
        isFutureDate,
        inPunch,
        outPunch,
        allPunches: dayPunches.map((p: any) => {
          const zone = p.rawTimezone || storeTimezone;
          const instant = punchInstantOf(p, storeTimezone);
          return {
            id: p.id,
            punchTime: instant ? instant.toISOString() : null,
            timeFormatted: wallHhmm(instant, zone),
            dateTimeFormatted: instant ? formatWallString12(instant, zone) : null,
            timezone: zone,
            punchType: p.punchType,
            // Resolved once at ingest from the editable mapping table; an
            // unrecognised code says Unknown instead of borrowing "Card".
            verifyMode: p.verifyModeLabel || 'Unknown',
            rawVerifyMode: p.verifyMode,
            rawVerifyType: p.rawVerifyType,
            rawPunchState: p.rawPunchState,
            matchValue: p.matchValue ?? null,
            photoUrl: p.photoPath ? `/${String(p.photoPath).replace(/^\/+/, '')}` : null,
            photoMissingReason: p.photoPath ? null : 'No photo available from device',
            mappingStatus: p.mappingStatus,
            deviceSerialNumber: p.serialNumber,
            deviceName: p.deviceName || 'Unregistered terminal',
            syncStatus: p.syncStatus,
          };
        }),
        workingSeconds: netDurationSec,
        workingHoursFormatted: netDurationSec > 0 ? `${Math.floor(netDurationSec / 3600)}h ${Math.floor((netDurationSec % 3600) / 60)}m` : '—',
        breakSeconds: breakDurationSec,
        breakMinutesFormatted: breakDurationSec > 0 ? `${Math.floor(breakDurationSec / 60)} mins` : '—',
        status,
        statusLabel,
        lateMinutes,
        earlyDepartureMinutes,
        flags,
        hasMissingPunches: flags.some((f) => f.includes('Missing')),
        corrections: dayCorrections,
        hasPendingCorrection: Boolean(pendingCorr),
        hasApprovedCorrection: Boolean(approvedCorr),
        dataSource: dayPunches.length > 0 ? 'eSSL MB160 Hardware ADMS Push' : (approvedCorr ? 'HR Approved Manual Correction' : 'Pending Device Sync'),
      });
    }

    const totalHours = Math.floor(totalWorkingSeconds / 3600);
    const totalMinutes = Math.floor((totalWorkingSeconds % 3600) / 60);

    res.json({
      success: true,
      data: {
        employee: {
          id: emp.id,
          employeeCode: emp.employeeCode || null,
          name: emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || null,
          email: emp.email || null,
          phone: emp.phone || null,
          role: emp.role || null,
          designation: emp.designation || null,
          location: {
            id: emp.locationId,
            name: emp.locationName || null,
            code: emp.locationCode || null,
          },
          department: emp.departmentName || null,
          shift: {
            id: emp.shiftId,
            name: emp.shiftName || null,
            // The employee's own shift master, not a fixed pair of times that
            // would show every employee a roster they were never assigned to.
            startTime: emp.startTime || null,
            endTime: emp.endTime || null,
            timing: emp.startTime && emp.endTime ? `${emp.startTime} - ${emp.endTime}` : null,
            gracePeriodMinutes: emp.gracePeriod ?? null,
            lateThresholdMinutes: emp.lateThreshold ?? null,
          },
          biometricEnrollment: {
            enrollmentNumber: emp.biometricDeviceEmployeeId || enrollment?.enrollmentNumber || null,
            status: enrollment ? enrollment.status : 'NOT_ENROLLED',
            verifiedShowroom: enrollment?.showroomCode || null,
            serialNumber: enrollment?.serialNumber || null,
            hardwareModel: enrollment?.model || null,
            lastSyncedAt: enrollment?.updatedAt || null,
          },
        },
        period: {
          year,
          month,
          monthName: new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          startDate: `${year}-${String(month).padStart(2, '0')}-01`,
          endDate: `${year}-${String(month).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`,
          totalDays,
          currentCalendarDate: todayYmd,
        },
        metrics: {
          presentDays: presentCount,
          absentDays: absentCount,
          weeklyOffs: weeklyOffCount,
          holidays: holidayCount,
          leaveDays: leaveCount,
          pendingVerificationDays: pendingVerificationCount,
          totalWorkingHours: `${totalHours}h ${totalMinutes}m`,
          totalWorkingSeconds,
          missingPunchCount,
          pendingCorrectionsCount,
          pendingApprovalsCount: pendingCorrectionsCount,
        },
        deviceStatuses,
        dailyRecords,
      lastBiometricSync: lastSyncRows[0]?.lastReceived ?? null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching employee biometric attendance:', error);
    res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
});

/**
 * POST /api/attendance/employee/:id/sync
 * Trigger biometric synchronization across all 3 Davanagere terminals for employee 1604
 */
router.post('/:id/sync', authorize('EDIT'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const emp = await resolveEmployee(id);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    // Terminals come from the registry the operator maintains, not from a list
    // hard-coded in this file: an unlisted device must not be probed, and a
    // listed one must be reported with its own configured address.
    const [registryDevices]: any = await pool.query(
      `SELECT id, serialNumber, name, ipAddress, port, isActive, consecutiveFailures
         FROM biometric_devices
        WHERE locationCode = ? OR locationId = ?
        ORDER BY name`,
      [emp.locationCode || null, emp.locationId]
    );

    const deviceReports: any[] = [];
    for (const dev of registryDevices) {
      if (!dev.ipAddress) {
        deviceReports.push({
          serialNumber: dev.serialNumber,
          name: dev.name,
          reachable: false,
          error: 'No IP address configured for this terminal',
        });
        continue;
      }
      const probe = await probeDeviceSocket(dev.ipAddress, dev.port || 4370, 1500);

      // A TCP handshake is connectivity, not a synchronisation: `lastSyncAt` is
      // only ever written by the importer that actually stored punch records.
      await pool.query(
        `UPDATE biometric_devices
            SET status = ?, lastConnectionAt = NOW(), consecutiveFailures = ?, lastError = ?
          WHERE id = ?`,
        [
          probe.online ? 'CONNECTED' : 'DISCONNECTED',
          probe.online ? 0 : (dev.consecutiveFailures ?? 0) + 1,
          probe.error || null,
          dev.id,
        ]
      ).catch(() => {});

      deviceReports.push({
        serialNumber: dev.serialNumber,
        name: dev.name,
        reachable: probe.online,
        latencyMs: probe.latency ?? null,
        error: probe.error || null,
      });
    }

    const reachableCount = deviceReports.filter((d) => d.reachable).length;
    // Emit live sync event via Socket.IO
    socketIO.emit('biometric:employee_synced', {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      showroomCode: emp.locationCode || null,
      timestamp: new Date().toISOString(),
      deviceReports,
    });

    res.json({
      success: true,
      message: `Checked ${deviceReports.length} registered terminal(s) for this store; ${reachableCount} answered on the network. No attendance records were imported by this check.`,
      deviceReports,
      reachableTerminals: reachableCount,
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    res.status(500).json({ success: false, error: 'Synchronization failed: ' + error.message });
  }
});

/**
 * POST /api/attendance/employee/:id/corrections
 * Request manual attendance correction for HR review
 */
router.post('/:id/corrections', authorize('EDIT'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { attendanceDate, requestedLogin, requestedLogout, reason } = req.body;

    if (!attendanceDate || !reason) {
      return res.status(400).json({ success: false, error: 'attendanceDate and reason are required' });
    }

    const emp = await resolveEmployee(id);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    // Check for existing pending correction on this date
    const [existing]: any = await pool.query(
      `SELECT id FROM attendancecorrection WHERE employeeId = ? AND attendanceDate = ? AND status = 'PENDING'`,
      [emp.id, attendanceDate]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'A pending correction request already exists for this date' });
    }

    // Fetch existing attendance to record original data
    const [attRows]: any = await pool.query(
      `SELECT actualLogin, actualLogout FROM attendance WHERE employeeId = ? AND attendanceDate = ? LIMIT 1`,
      [emp.id, attendanceDate]
    );
    const origLogin = attRows[0]?.actualLogin || null;
    const origLogout = attRows[0]?.actualLogout || null;

    const correctionId = `corr-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

    await pool.query(
      `INSERT INTO attendancecorrection (
        id, employeeId, locationId, attendanceDate, originalLogin, originalLogout,
        requestedLogin, requestedLogout, reason, status, requestedById, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW(), NOW())`,
      [
        correctionId,
        emp.id,
        emp.locationId,
        attendanceDate,
        origLogin,
        origLogout,
        requestedLogin ? new Date(requestedLogin) : null,
        requestedLogout ? new Date(requestedLogout) : null,
        reason.trim(),
        req.user?.id || 'admin',
      ]
    );

    res.json({
      success: true,
      message: 'Correction request submitted for HR approval',
      correctionId,
    });
  } catch (error: any) {
    console.error('Correction submit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/attendance/employee/corrections/:correctionId/approve
 * HR Manager approval of an attendance correction (transaction safe)
 * ENFORCES: Users cannot approve their own correction requests!
 */
router.post('/corrections/:correctionId/approve', authorize('EDIT'), async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const { correctionId } = req.params;
    const { reviewNote } = req.body;
    const reviewerId = req.user?.id;
    const reviewerRole = req.user?.role;

    // Check correction record
    const [rows]: any = await connection.query(
      `SELECT * FROM attendancecorrection WHERE id = ? FOR UPDATE`,
      [correctionId]
    );
    if (rows.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, error: 'Correction record not found' });
    }

    const corr = rows[0];
    if (corr.status !== 'PENDING') {
      connection.release();
      return res.status(400).json({ success: false, error: `Correction is already ${corr.status}` });
    }

    // SECURITY RULE: Users cannot approve their own correction requests
    if (corr.requestedById === reviewerId && reviewerRole !== 'SUPER_ADMIN') {
      connection.release();
      return res.status(403).json({
        success: false,
        error: 'Separation of duties violation: You cannot approve your own attendance correction request. Another authorized HR manager must review and approve it.',
      });
    }

    await connection.beginTransaction();

    // 1. Mark correction approved
    await connection.query(
      `UPDATE attendancecorrection 
       SET status = 'APPROVED', reviewedById = ?, reviewNote = ?, appliedAt = NOW(), updatedAt = NOW()
       WHERE id = ?`,
      [reviewerId || 'admin', reviewNote || 'Approved by HR', correctionId]
    );

    // 2. Recalculate and update the day's attendance
    const dateYmd = corr.attendanceDate instanceof Date
      ? corr.attendanceDate.toISOString().slice(0, 10)
      : String(corr.attendanceDate).slice(0, 10);

    const newLogin = corr.requestedLogin || corr.originalLogin;
    const newLogout = corr.requestedLogout || corr.originalLogout;

    let workingSec = 34200; // default 9.5 hours
    if (newLogin && newLogout) {
      const inMs = new Date(newLogin).getTime();
      const outMs = new Date(newLogout).getTime();
      workingSec = Math.max(0, Math.floor((outMs - inMs) / 1000));
    }

    const attId = `att-${corr.employeeId.slice(0, 8)}-${dateYmd.replace(/-/g, '')}`;

    await connection.query(
      `INSERT INTO attendance (
        id, employeeId, locationId, attendanceDate, actualLogin, actualLogout,
        totalWorkingSeconds, effectiveWorkingSeconds, status, notes, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PRESENT', ?, NOW())
      ON DUPLICATE KEY UPDATE
        actualLogin = VALUES(actualLogin),
        actualLogout = VALUES(actualLogout),
        totalWorkingSeconds = VALUES(totalWorkingSeconds),
        effectiveWorkingSeconds = VALUES(effectiveWorkingSeconds),
        status = 'PRESENT',
        notes = VALUES(notes),
        updatedAt = NOW()`,
      [
        attId,
        corr.employeeId,
        corr.locationId,
        dateYmd,
        newLogin,
        newLogout,
        workingSec,
        workingSec,
        `HR Approved Correction (Req: ${corr.reason})`,
      ]
    );

    await connection.commit();
    connection.release();

    socketIO.emit('attendance:correction_approved', {
      correctionId,
      employeeId: corr.employeeId,
      date: dateYmd,
      approvedBy: reviewerId,
    });

    res.json({
      success: true,
      message: 'Attendance correction approved and applied to authoritative records',
    });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Correction approve error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/attendance/employee/corrections/:correctionId/reject
 * Reject a manual correction request with an audit note
 */
router.post('/corrections/:correctionId/reject', authorize('EDIT'), async (req: AuthRequest, res: Response) => {
  try {
    const { correctionId } = req.params;
    const { reviewNote } = req.body;
    const reviewerId = req.user?.id;

    const [rows]: any = await pool.query(
      `SELECT * FROM attendancecorrection WHERE id = ?`,
      [correctionId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Correction record not found' });
    }

    await pool.query(
      `UPDATE attendancecorrection 
       SET status = 'REJECTED', reviewedById = ?, reviewNote = ?, updatedAt = NOW()
       WHERE id = ?`,
      [reviewerId || 'admin', reviewNote || 'Rejected by HR', correctionId]
    );

    res.json({
      success: true,
      message: 'Attendance correction rejected',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
