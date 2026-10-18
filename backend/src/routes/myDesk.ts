import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { authenticate, isElevatedRole, AuthRequest } from '../middleware/auth.js';
import { dbDate } from '../utils/dates.js';
import { formatWallString } from '../services/biometric/timeCodec.js';
import { computeShiftWindow } from '../core/services/AttendanceCalculationService.js';

export const myDeskRouter = Router();

/**
 * Which employee a self-service write belongs to.
 *
 * This used to fall back to `SELECT id FROM employee LIMIT 1`, so an account
 * without a linked employee record could clock in, clock out or record a tea
 * break for whichever employee happened to sort first — attendance attributed to
 * someone who was not there. There is now no substitution: it is your record,
 * or an explicit one for staff whose role may edit attendance.
 */
function resolveDeskEmployee(req: AuthRequest, requested?: unknown): string | null {
  const own = req.user?.employeeId ? String(req.user.employeeId) : null;
  const wanted = requested ? String(requested).trim() : '';
  if (!wanted) return own;
  if (own && wanted === own) return wanted;
  return isElevatedRole(req.user?.role) ? wanted : null;
}

/** TIME column → "HH:MM" in the store timezone, whatever shape the driver returned. */
function timeToHHMM(value: unknown, timeZone = 'Asia/Kolkata'): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatWallString(value, timeZone, false).slice(11, 16);
  }
  const m = /(\d{1,2}):(\d{2})/.exec(String(value));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** Share of elapsed calendar days in the period that carry a real attendance record. */
function adherenceOf(rows: any[]): { percent: number | null; presentDays: number; recordedDays: number } {
  const presentDays = rows.filter((r: any) => r.actualLogin || r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'OVERTIME').length;
  if (rows.length === 0) return { percent: null, presentDays: 0, recordedDays: 0 };
  return {
    percent: Math.round((presentDays / rows.length) * 1000) / 10,
    presentDays,
    recordedDays: rows.length,
  };
}

/** Rostered length in minutes from TIME columns, or null when the shift is unknown. */
function shiftMinutesOf(start: unknown, end: unknown): number | null {
  const toMin = (v: unknown): number | null => {
    const text = timeToHHMM(v);
    if (!text) return null;
    const [h, m] = text.split(':').map(Number);
    return h * 60 + m;
  };
  const from = toMin(start);
  const until = toMin(end);
  if (from === null || until === null) return null;
  return until > from ? until - from : 24 * 60 - from + until;
}

myDeskRouter.use(authenticate);

/**
 * GET /api/my-desk/summary
 * Returns comprehensive data bundle for the My Desk dashboard
 */
myDeskRouter.get('/summary', async (req: AuthRequest, res) => {
  try {
    // 1. Resolve employee
    let employeeId = req.query.employeeId as string | undefined;
    if (!employeeId && req.user?.employeeId) {
      employeeId = req.user.employeeId;
    }

    // Never fall back to "some employee": showing another person's attendance,
    // balances or F&F to a caller is an identity leak, not a convenience.
    // Elevated callers may preview a specific record with ?employeeId= above.
    if (!employeeId) {
      return res.status(404).json({
        error: 'NO_EMPLOYEE_LINK',
        message: 'This login is not linked to an employee record, so there is no self-service desk to show. An administrator can link it from Users & Assignments.',
      });
    }

    // 2. Fetch employee details with joins
    const [empRows]: any = await pool.query(
      `SELECT e.id, e.employeeCode, e.fullName, e.firstName, e.lastName, e.email, e.phone, e.gender,
              e.designation, e.role, e.status, e.joiningDate,
              e.panNumber, e.uanNo, e.bankAccount, e.bankIfsc, e.aadhaarVerificationStatus,
              l.id as locationId, l.name as locationName, l.code as locationCode,
              f.name as floorName,
              d.name as departmentName,
              s.id as shiftId, s.name as shiftName, s.startTime as shiftStartTime, s.endTime as shiftEndTime, s.gracePeriod,
              rm.fullName as reportsToName, rm.employeeCode as reportsToCode,
              (SELECT wo.dayOfWeek FROM weeklyoffrule wo
                 WHERE (wo.employeeId = e.id OR (wo.locationId = e.locationId AND wo.employeeId IS NULL))
                 ORDER BY wo.employeeId IS NOT NULL DESC LIMIT 1) as weeklyOffDay,
              (SELECT m.enrollmentNumber FROM biometric_employee_mappings m
                 WHERE m.employeeId = e.id ORDER BY m.updatedAt DESC LIMIT 1) as enrollmentNumber
       FROM employee e
       LEFT JOIN location l ON e.locationId = l.id
       LEFT JOIN floor f ON e.floorId = f.id
       LEFT JOIN department d ON e.departmentId = d.id
       LEFT JOIN shift s ON e.shiftId = s.id
       LEFT JOIN employee rm ON rm.id = e.reportingManagerId
       WHERE e.id = ?`,
      [employeeId]
    );

    if (!empRows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = empRows[0];

    // 3. Current Date & Today's Attendance
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const targetDate = (req.query.date as string) || todayStr;

    const [todayAttRows]: any = await pool.query(
      `SELECT * FROM attendance WHERE employeeId = ? AND DATE(attendanceDate) = ? LIMIT 1`,
      [employeeId, targetDate]
    );
    const todayAtt = todayAttRows[0] || null;

    // Every one of these starts as "unknown" and is filled only from the day's
    // attendance row. They used to carry invented defaults (09:28 AM, 4h 54m,
    // 61.25%, "2m Early"), so a screen could show a plausible working day for
    // someone who never punched.
    let isClockedIn = false;
    let clockInTime: string | null = null;
    let clockOutTime: string | null = null;
    let elapsedMinutes: number | null = null;
    let shiftPercent: number | null = null;
    let earlyLateStatus: string | null = null;
    let onSchedule: boolean | null = null;

    if (todayAtt) {
      if (todayAtt.actualLogin && !todayAtt.actualLogout) {
        isClockedIn = true;
      }
      if (todayAtt.actualLogin) {
        const loginDate = new Date(todayAtt.actualLogin);
        clockInTime = loginDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        if (isClockedIn) {
          elapsedMinutes = Math.max(0, Math.floor((now.getTime() - loginDate.getTime()) / 60000));
        } else if (todayAtt.actualLogout) {
          const logoutDate = new Date(todayAtt.actualLogout);
          elapsedMinutes = Math.max(0, Math.floor((logoutDate.getTime() - loginDate.getTime()) / 60000));
          clockOutTime = logoutDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
      }
      if (todayAtt.lateLoginSeconds && todayAtt.lateLoginSeconds > 0) {
        const lateMin = Math.round(todayAtt.lateLoginSeconds / 60);
        earlyLateStatus = `${lateMin}m Late`;
        onSchedule = false;
      } else if (todayAtt.earlyLoginSeconds && todayAtt.earlyLoginSeconds > 0) {
        const earlyMin = Math.round(todayAtt.earlyLoginSeconds / 60);
        earlyLateStatus = `${earlyMin}m Early`;
      }
    } else {
      // No record for today yet — the absence is the answer.
      isClockedIn = false;
    }

    // Percentage of the employee's own rostered shift, when the shift master
    // defines one. No shift times means no percentage — not an 8-hour guess.
    const shiftTotalMinutes = shiftMinutesOf(emp.shiftStartTime, emp.shiftEndTime);
    if (elapsedMinutes !== null && shiftTotalMinutes) {
      shiftPercent = Math.min(100, Math.round((elapsedMinutes / shiftTotalMinutes) * 1000) / 10);
    }
    const shiftHoursFormatted = elapsedMinutes === null
      ? null
      : `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`;

    // 4. Monthly Velocity & Performance Dossier
    const reqYear = Number(req.query.year) || now.getFullYear();
    const reqMonth = Number(req.query.month) || (now.getMonth() + 1); // 1-indexed

    const daysInMonth = new Date(reqYear, reqMonth, 0).getDate();
    const startDateMonth = `${reqYear}-${String(reqMonth).padStart(2, '0')}-01`;
    const endDateMonth = `${reqYear}-${String(reqMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [monthAttRows]: any = await pool.query(
      `SELECT * FROM attendance 
       WHERE employeeId = ? AND DATE(attendanceDate) BETWEEN ? AND ?
       ORDER BY attendanceDate ASC`,
      [employeeId, startDateMonth, endDateMonth]
    );

    const attMapByDay = new Map<number, any>();
    for (const row of monthAttRows) {
      const d = new Date(row.attendanceDate).getDate();
      attMapByDay.set(d, row);
    }

    // Build day strip
    const velocityDays: any[] = [];
    let presentCount = 0;
    let weekOffCount = 0;
    let leaveCount = 0;
    let absentCount = 0;
    let onTimeArrivals = 0;
    let lateArrivals = 0;
    let totalScheduledWorkingDays = 0;
    let totalOvertimeMinutes = 0;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthShort = monthNames[reqMonth - 1];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(reqYear, reqMonth - 1, day);
      const isCurrentDay =
        reqYear === now.getFullYear() && reqMonth === (now.getMonth() + 1) && day === now.getDate();
      const isPastDay = dateObj < new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const isFutureDay = dateObj > new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 2 is Tuesday
      // BSC Textiles default weekly off is Tuesday (day 2) or Sunday
      const isWeeklyOff = dayOfWeek === 2;

      const att = attMapByDay.get(day);

      let status = 'PENDING';
      let type = 'PENDING';
      let hours = '-';
      let rawHours = 0;

      if (isWeeklyOff) {
        status = 'WEEK_OFF';
        type = 'WO';
        hours = 'OFF';
        weekOffCount++;
      } else if (att) {
        totalScheduledWorkingDays++;
        if (att.status === 'PRESENT' || att.status === 'LATE' || att.actualLogin) {
          status = 'PRESENT';
          type = isCurrentDay ? 'TODAY' : 'P';
          presentCount++;
          // Only the ledger's own working time — never a simulated 8h+ day.
          const workSec = Number(att.totalWorkingSeconds || att.effectiveWorkingSeconds || 0);
          rawHours = Math.round((workSec / 3600) * 10) / 10;
          hours = workSec > 0
            ? `${rawHours}h`
            : (isCurrentDay && isClockedIn ? 'Today' : '—');
          if (att.lateLoginSeconds && att.lateLoginSeconds > 300) {
            lateArrivals++;
          } else {
            onTimeArrivals++;
          }
          if (att.overtimeSeconds) {
            totalOvertimeMinutes += Math.round(Number(att.overtimeSeconds) / 60);
          }
        } else if (att.status === 'LEAVE' || att.status === 'EARNED_LEAVE') {
          status = 'EARNED_LEAVE';
          type = 'EL';
          hours = 'EL';
          leaveCount++;
        } else if (att.status === 'ABSENT') {
          status = 'ABSENT';
          type = 'A';
          hours = 'ABS';
          absentCount++;
        }
      } else if (isPastDay) {
        totalScheduledWorkingDays++;
        // No record means no record: report the gap instead of inventing a
        // present day with simulated hours and overtime.
        status = 'NO_RECORD';
        type = 'NR';
        hours = '—';
      } else if (isCurrentDay) {
        // No punch today yet: scheduled, not an on-time arrival.
        status = isClockedIn ? 'PRESENT' : 'SCHEDULED';
        type = 'TODAY';
        hours = isClockedIn ? 'Today' : '—';
        totalScheduledWorkingDays++;
      } else {
        status = 'UPCOMING';
        type = 'UPCOMING';
        hours = '-';
      }

      velocityDays.push({
        date: `${reqYear}-${String(reqMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        dayNum: String(day).padStart(2, '0'),
        dayLabel: `${String(day).padStart(2, '0')} ${monthShort}`,
        status,
        type,
        hours,
        rawHours,
        isToday: isCurrentDay,
        isPast: isPastDay,
        isFuture: isFutureDay,
        actualLogin: att?.actualLogin ? new Date(att.actualLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
        actualLogout: att?.actualLogout ? new Date(att.actualLogout).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
      });
    }

    // 5. Punctuality Score Calculation — null when the ledger has no records.
    const eligibleRecords = onTimeArrivals + lateArrivals;
    const punctualityScore = eligibleRecords > 0
      ? Math.min(100, Math.round((onTimeArrivals / eligibleRecords) * 1000) / 10)
      : null;

    // 6. Festive Sales Bonus / Incentives
    const [incentiveRows]: any = await pool.query(
      `SELECT t.*, r.name as ruleName, r.targetAmount, r.amount as ruleAmount
       FROM incentivetransaction t
       LEFT JOIN incentiverule r ON t.incentiveRuleId = r.id
       WHERE t.employeeId = ?
       ORDER BY t.transactionDate DESC LIMIT 5`,
      [employeeId]
    );

    // Real incentive rows only. No row means the card shows nothing, not a
    // made-up ₹4,250 bonus with a 112% achievement figure.
    const latestIncentive = incentiveRows[0] || null;
    const festiveBonusAmount = latestIncentive ? Number(latestIncentive.calculatedAmount) : null;
    const festiveTarget = latestIncentive?.targetAmount ? Number(latestIncentive.targetAmount) : null;
    const festiveBonusRuleName = latestIncentive?.ruleName ? String(latestIncentive.ruleName) : null;
    const festiveBonusStatus = latestIncentive?.status ? String(latestIncentive.status) : null;

    // 7. Overtime Logged — zero overtime stays zero.
    const otHours = Math.floor(totalOvertimeMinutes / 60);
    const otMins = totalOvertimeMinutes % 60;
    const otFormatted = `${otHours}h ${String(otMins).padStart(2, '0')}m`;

    // 8. Breaks & Well-being
    const [todayBreaks]: any = await pool.query(
      `SELECT * FROM employeebreak 
       WHERE employeeId = ? AND DATE(breakDate) = ? 
       ORDER BY startTime DESC`,
      [employeeId, targetDate]
    );

    const activeTeaBreak = todayBreaks.find((b: any) => b.breakType === 'TEA' && b.status === 'ACTIVE');
    const lunchBreak = todayBreaks.find((b: any) => b.breakType === 'LUNCH') || null;
    const clockOf = (v: unknown): string | null =>
      v ? new Date(v as string).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null;
    const lunchLoggedTime = lunchBreak?.startTime
      ? `${clockOf(lunchBreak.startTime)}${lunchBreak.endTime ? ` – ${clockOf(lunchBreak.endTime)}` : ' – in progress'}` +
        (lunchBreak.actualDuration != null ? ` (${Number(lunchBreak.actualDuration)} mins)` : '')
      : null;
    const teaQuotaSeconds = activeTeaBreak?.allowedDuration ? Number(activeTeaBreak.allowedDuration) * 60 : 900;
    let teaBreakRemainingSeconds: number | null = null;
    if (activeTeaBreak && activeTeaBreak.startTime) {
      const elapsedSec = Math.floor((now.getTime() - new Date(activeTeaBreak.startTime).getTime()) / 1000);
      teaBreakRemainingSeconds = Math.max(0, teaQuotaSeconds - elapsedSec);
    }

    // 9. Floor Shortcuts Data
    // Custody Assets
    const [assets]: any = await pool.query(
      `SELECT * FROM employee_custody_assets WHERE employeeId = ? ORDER BY assetType ASC`,
      [employeeId]
    );

    // Payslip
    const [payrollRows]: any = await pool.query(
      `SELECT p.*, r.periodStart, r.periodEnd, r.processedAt
       FROM payrollitem p
       LEFT JOIN payrollrun r ON p.payrollRunId = r.id
       WHERE p.employeeId = ?
       ORDER BY p.createdAt DESC LIMIT 1`,
      [employeeId]
    );
    // No payroll item means no payslip yet — never a fabricated ₹50,940 credit.
    const latestPayroll = payrollRows[0] || null;

    // 10. Leave Balances
    const [leaveBalances]: any = await pool.query(
      `SELECT lb.*, lt.code, lt.name, lt.annual_quota 
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = ?
       ORDER BY lt.code ASC`,
      [employeeId]
    );

    // Leave balances come from the ledger only. `used` carries the available
    // balance because that is what the My Desk cards display; no row means the
    // employee sees an empty list, not invented quotas.
    const leavePalette: Record<string, { color: string; textColor: string }> = {
      EL: { color: 'bg-blue-600', textColor: 'text-blue-700' },
      CL: { color: 'bg-emerald-600', textColor: 'text-emerald-700' },
      SL: { color: 'bg-indigo-600', textColor: 'text-indigo-700' },
      OPT: { color: 'bg-amber-600', textColor: 'text-amber-700' },
    };
    const statutoryLeaves = leaveBalances.map((b: any) => {
      const palette = leavePalette[String(b.code)] || { color: 'bg-slate-600', textColor: 'text-slate-700' };
      return {
        title: String(b.name || b.code),
        desc: b.annual_quota != null ? `Annual quota ${Number(b.annual_quota)}` : 'From the leave ledger',
        code: String(b.code),
        used: Number(b.balance),
        total: Number(b.total_credited),
        color: palette.color,
        textColor: palette.textColor,
      };
    });

    const keycard = assets.find((a: any) => String(a.assetType || '').toUpperCase() === 'RFID_SECURITY_CARD') || null;

    res.json({
      employee: {
        id: emp.id,
        employeeCode: emp.employeeCode || null,
        fullName: emp.fullName,
        firstName: emp.firstName,
        lastName: emp.lastName,
        designation: emp.designation || null,
        department: emp.departmentName || null,
        location: {
          id: emp.locationId,
          name: emp.locationName || null,
          code: emp.locationCode || null,
        },
        floor: emp.floorName || null,
        shift: {
          name: emp.shiftName || null,
          startTime: timeToHHMM(emp.shiftStartTime),
          endTime: timeToHHMM(emp.shiftEndTime),
          gracePeriod: emp.gracePeriod === null || emp.gracePeriod === undefined ? null : Number(emp.gracePeriod),
        },
        reportsTo: emp.reportsToName ? `${emp.reportsToName}${emp.reportsToCode ? ` (${emp.reportsToCode})` : ''}` : null,
        weeklyOff: emp.weeklyOffDay ? String(emp.weeklyOffDay).toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase()) : null,
        biometricToken: emp.enrollmentNumber || null,
      },
      today: {
        date: targetDate,
        isClockedIn,
        clockInTime,
        clockOutTime,
        targetOutTime: timeToHHMM(emp.shiftEndTime),
        elapsedMinutes,
        shiftHoursFormatted,
        shiftPercent,
        earlyLateStatus,
        onSchedule,
        // Computed from the days the ledger actually has, never asserted.
        adherence: adherenceOf(monthAttRows),
      },
      monthlyVelocity: {
        year: reqYear,
        month: reqMonth,
        monthLabel: `${monthShort} ${reqYear}`,
        days: velocityDays,
        stats: {
          present: presentCount,
          weekOff: weekOffCount,
          earnedLeave: leaveCount,
          absent: absentCount,
        },
      },
      punctuality: {
        score: punctualityScore,
        // Rank and location benchmark are peer comparisons the API does not
        // compute; showing a fixed "Rank 1 / 96.2%" would be an invention.
        rank: null,
        scheduledDays: totalScheduledWorkingDays,
        eligibleRecords,
        onTimeArrivals,
        lateArrivals,
        benchmark: null,
      },
      festiveBonus: {
        name: festiveBonusRuleName || 'Incentives',
        targetLabel: festiveBonusRuleName,
        amount: festiveBonusAmount,
        currency: '₹',
        targetAmount: festiveTarget,
        achievedAmount: null,
        achievementPercent: null,
        status: festiveBonusStatus,
      },
      overtime: {
        hoursFormatted: otFormatted,
        totalMinutes: totalOvertimeMinutes,
        rateLabel: null,
        payableAmount: null,
        status: null,
      },
      breaks: {
        lunch: {
          label: 'Lunch Break',
          loggedTime: lunchLoggedTime,
          status: lunchBreak?.status || null,
          quotaSaved: null,
        },
        tea: {
          label: 'Afternoon Tea (15m)',
          scheduled: null,
          isActive: Boolean(activeTeaBreak),
          breakId: activeTeaBreak?.id || null,
          remainingSeconds: teaBreakRemainingSeconds,
          coverageLead: null,
        },
      },
      shortcuts: {
        payslip: {
          id: latestPayroll?.id || null,
          label: `${monthShort} Payslip`,
          subtext: latestPayroll
            ? `₹${Number(latestPayroll.netPay).toLocaleString('en-IN')}${latestPayroll.status ? ` • ${String(latestPayroll.status)}` : ''}`
            : 'No payslip generated yet',
          netPay: latestPayroll ? Number(latestPayroll.netPay) : null,
          grossSalary: latestPayroll
            ? Number(latestPayroll.basicSalary) +
              Number(latestPayroll.earlyIncentive || 0) +
              Number(latestPayroll.attendanceIncentive || 0) +
              Number(latestPayroll.performanceIncentive || 0) +
              Number(latestPayroll.salesIncentive || 0) +
              Number(latestPayroll.overtime || 0)
            : null,
          basicSalary: latestPayroll ? Number(latestPayroll.basicSalary) : null,
          earlyIncentive: latestPayroll ? Number(latestPayroll.earlyIncentive || 0) : null,
          attendanceIncentive: latestPayroll ? Number(latestPayroll.attendanceIncentive || 0) : null,
          performanceIncentive: latestPayroll ? Number(latestPayroll.performanceIncentive || 0) : null,
          salesIncentive: latestPayroll ? Number(latestPayroll.salesIncentive || 0) : null,
          overtimePay: latestPayroll ? Number(latestPayroll.overtime || 0) : null,
          deductions: latestPayroll ? Number(latestPayroll.deductions || 0) : null,
          penalties: latestPayroll ? Number(latestPayroll.penalties || 0) : null,
          status: latestPayroll?.status || null,
          periodStart: latestPayroll?.periodStart || null,
          periodEnd: latestPayroll?.periodEnd || null,
          disbursedAt: latestPayroll?.processedAt
            ? new Date(latestPayroll.processedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : null,
          creditAccount: emp.bankAccount ? `••••${String(emp.bankAccount).slice(-4)}` : null,
        },
        punchCorrection: {
          label: 'Punch Correction',
          subtext: 'Regularize Logs',
        },
        custodyAssets: {
          label: 'Custody Assets',
          subtext: assets.length
            ? `${assets.length} item${assets.length === 1 ? '' : 's'} issued`
            : 'No assets issued',
          securityKeycard: keycard ? String(keycard.serialNumber) : null,
          keycardStatus: keycard?.status ? String(keycard.status) : null,
          items: assets,
        },
        dossier: {
          label: 'ID & Dossier',
          subtext: 'Aadhaar • ESIC • PF',
          aadhaar: emp.aadhaarVerificationStatus ? `Verification: ${emp.aadhaarVerificationStatus}` : null,
          pan: emp.panNumber ? String(emp.panNumber) : null,
          uan: emp.uanNo ? String(emp.uanNo) : null,
          esic: null,
          bank: emp.bankAccount
            ? `${emp.bankIfsc ? `${emp.bankIfsc} • ` : ''}••••${String(emp.bankAccount).slice(-4)}`
            : null,
        },
      },
      leaveBalances: statutoryLeaves,
    });
  } catch (error: any) {
    console.error('My desk summary error:', error);
    res.status(500).json({ error: 'Failed to fetch desk data', message: error.message });
  }
});

/**
 * POST /api/my-desk/punch
 * Instant Clock In / Clock Out
 */
myDeskRouter.post('/punch', async (req: AuthRequest, res) => {
  try {
    const employeeId = resolveDeskEmployee(req, req.body.employeeId);
    if (!employeeId) {
      return res.status(403).json({
        error: 'NO_EMPLOYEE_LINK',
        message: 'This login is not linked to an employee record, so no punch can be recorded. Ask an administrator to link it.',
      });
    }

    const [empRows]: any = await pool.query('SELECT * FROM employee WHERE id = ?', [employeeId]);
    if (!empRows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = empRows[0];

    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date();

    // Re-anchor the employee's shift to today instead of hard-coding 09:30.
    const [shiftRows]: any = emp.shiftId
      ? await pool.query('SELECT startTime, endTime FROM shift WHERE id = ?', [emp.shiftId])
      : [[]];
    const shiftWindow = computeShiftWindow(shiftRows[0] || null, todayStr);

    const [existing]: any = await pool.query(
      'SELECT * FROM attendance WHERE employeeId = ? AND DATE(attendanceDate) = ?',
      [employeeId, todayStr]
    );

    let isNowClockedIn = false;
    let message = '';

    if (!existing.length) {
      // Create new clock in
      const id = 'att_' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
      await pool.query(
        `INSERT INTO attendance 
         (id, employeeId, locationId, shiftId, attendanceDate, scheduledLogin, scheduledLogout, actualLogin, status, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PRESENT', 'Clock in via My Desk', NOW(3), NOW(3))`,
        [id, employeeId, emp.locationId, emp.shiftId, todayStr, shiftWindow?.start ?? null, shiftWindow?.end ?? null, now]
      );
      isNowClockedIn = true;
      message = `Clock In recorded at ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}! Biometric token active.`;
    } else {
      const att = existing[0];
      if (!att.actualLogin) {
        // Clock in
        await pool.query(
          `UPDATE attendance SET actualLogin = ?, status = 'PRESENT', updatedAt = NOW(3) WHERE id = ?`,
          [now, att.id]
        );
        isNowClockedIn = true;
        message = `Clock In recorded at ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}!`;
      } else if (!att.actualLogout) {
        // Clock out
        const workSec = Math.floor((now.getTime() - new Date(att.actualLogin).getTime()) / 1000);
        await pool.query(
          `UPDATE attendance 
           SET actualLogout = ?, totalWorkingSeconds = ?, effectiveWorkingSeconds = ?, updatedAt = NOW(3)
           WHERE id = ?`,
          [now, workSec, workSec, att.id]
        );
        isNowClockedIn = false;
        message = 'Shift ended. Clock Out recorded successfully!';
      } else {
        // Re-clock in
        await pool.query(
          `UPDATE attendance SET actualLogout = NULL, updatedAt = NOW(3) WHERE id = ?`,
          [att.id]
        );
        isNowClockedIn = true;
        message = 'Resumed shift. Clock In active!';
      }
    }

    res.json({
      isClockedIn: isNowClockedIn,
      clockInTime: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      message,
    });
  } catch (error: any) {
    console.error('My desk punch error:', error);
    res.status(500).json({ error: 'Failed to record punch', message: error.message });
  }
});

/**
 * POST /api/my-desk/breaks/tea
 * Toggle tea break (Start / End)
 */
myDeskRouter.post('/breaks/tea', async (req: AuthRequest, res) => {
  try {
    const employeeId = resolveDeskEmployee(req, req.body.employeeId);
    if (!employeeId) {
      return res.status(403).json({
        error: 'NO_EMPLOYEE_LINK',
        message: 'This login is not linked to an employee record, so no break can be recorded.',
      });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date();

    const [activeBreaks]: any = await pool.query(
      `SELECT * FROM employeebreak 
       WHERE employeeId = ? AND DATE(breakDate) = ? AND breakType = 'TEA' AND status = 'ACTIVE'
       LIMIT 1`,
      [employeeId, todayStr]
    );

    if (activeBreaks.length > 0) {
      // Conclude break
      const brk = activeBreaks[0];
      const durationMin = brk.startTime ? Math.floor((now.getTime() - new Date(brk.startTime).getTime()) / 60000) : 15;
      const excessMin = Math.max(0, durationMin - brk.allowedDuration);

      await pool.query(
        `UPDATE employeebreak 
         SET endTime = ?, actualDuration = ?, excessDuration = ?, status = ?, updatedAt = NOW(3)
         WHERE id = ?`,
        [now, durationMin, excessMin, excessMin > 0 ? 'EXCEEDED' : 'COMPLETED', brk.id]
      );

      return res.json({
        isActive: false,
        message: 'Tea Break concluded. Welcome back to the floor!',
        durationMinutes: durationMin,
      });
    } else {
      // Start break
      const id = `brk_${crypto.randomUUID()}`;
      await pool.query(
        `INSERT INTO employeebreak 
         (id, employeeId, breakType, breakDate, startTime, allowedDuration, status, createdAt, updatedAt)
         VALUES (?, ?, 'TEA', ?, ?, 15, 'ACTIVE', NOW(3), NOW(3))`,
        [id, employeeId, todayStr, now]
      );

      return res.json({
        isActive: true,
        breakId: id,
        remainingSeconds: 900,
        message: 'Statutory 15m Afternoon Tea Break started!',
      });
    }
  } catch (error: any) {
    console.error('Toggle tea break error:', error);
    res.status(500).json({ error: 'Failed to update tea break', message: error.message });
  }
});

/**
 * POST /api/my-desk/custody-acknowledge
 * Acknowledge or return custody asset
 */
myDeskRouter.post('/custody-acknowledge', async (req: AuthRequest, res) => {
  try {
    const { assetId, action = 'ACKNOWLEDGE' } = req.body;
    if (!assetId) {
      return res.status(400).json({ error: 'Asset ID is required' });
    }

    const newStatus = action === 'RETURN' ? 'RETURN_REQUESTED' : 'ACKNOWLEDGED';
    const ownerEmployeeId = resolveDeskEmployee(req, req.body.employeeId);
    if (!ownerEmployeeId && !isElevatedRole(req.user?.role)) {
      return res.status(403).json({
        error: 'NO_EMPLOYEE_LINK',
        message: 'Custody items can only be acknowledged by the staff member they are issued to.',
      });
    }
    // Object-level check: an employee may only touch their own custody record.
    const ownership = isElevatedRole(req.user?.role) && !req.body.employeeId
      ? { sql: '', params: [] as any[] }
      : { sql: 'AND employeeId = ?', params: [ownerEmployeeId] };
    const [updated]: any = await pool.query(
      `UPDATE employee_custody_assets 
       SET status = ?, acknowledgedAt = NOW(3), updatedAt = NOW(3)
       WHERE id = ? ` + ownership.sql,
      [newStatus, assetId, ...ownership.params]
    );
    if (Number((updated as any)?.affectedRows ?? 0) === 0) {
      return res.status(404).json({
        error: 'ASSET_NOT_FOUND_OR_NOT_YOURS',
        message: 'No custody item with that id is assigned to you.',
      });
    }

    res.json({
      success: true,
      status: newStatus,
      message: action === 'RETURN' ? 'Asset handover return requested' : 'Custody possession verified and acknowledged',
    });
  } catch (error: any) {
    console.error('Custody acknowledge error:', error);
    res.status(500).json({ error: 'Failed to acknowledge asset', message: error.message });
  }
});

export default myDeskRouter;
