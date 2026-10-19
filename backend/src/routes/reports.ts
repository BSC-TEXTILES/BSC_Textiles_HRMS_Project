import { Router } from 'express';
import { prisma } from '../index.js';
import { pool } from '../nativeDb.js';
import { dbDate } from '../utils/dates.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { cacheService } from '../services/cacheService.js';

const router = Router();

router.use(authenticate);

router.get('/dashboard-summary', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    let locationId = getScopedLocationId(req.user, req.query.locationId);
    if (locationId === 'all') locationId = undefined;

    const departmentId = req.query.departmentId && req.query.departmentId !== 'all' ? String(req.query.departmentId) : undefined;
    const shiftId = req.query.shiftId && req.query.shiftId !== 'all' ? String(req.query.shiftId) : undefined;
    const dateParam = req.query.date ? String(req.query.date) : undefined;

    const cacheKey = `dashboard:summary:${locationId || 'all'}:${departmentId || 'all'}:${shiftId || 'all'}:${dateParam || 'today'}`;
    const cached = cacheService.get<any>(cacheKey);
    if (cached) {
      if (req.headers['if-none-match'] === cached.etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=5');
      return res.json(cached.data);
    }

    const today = dateParam ? new Date(dateParam) : new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const latestAttendance = await prisma.attendance.findFirst({
      orderBy: { attendanceDate: 'desc' },
      select: { attendanceDate: true },
    });
    const targetDate = dateParam ? new Date(dateParam) : latestAttendance?.attendanceDate;

    const employeeWhere: any = { status: 'ACTIVE' };
    const attendanceWhere: any = targetDate ? { attendanceDate: targetDate } : {};
    const faceWhere: any = { verifiedAt: { gte: today, lt: tomorrow } };
    const qrWhere: any = { scannedAt: { gte: today, lt: tomorrow } };
    const incentiveWhere: any = { transactionDate: { gte: today, lt: tomorrow } };
    const penaltyWhere: any = { transactionDate: { gte: today, lt: tomorrow } };
    const observationWhere: any = { status: { in: ['OPEN', 'IN_PROGRESS'] } };
    const streamWhere: any = { status: 'LIVE' };
    const sellingPointWhere: any = { status: true };

    if (locationId) {
      employeeWhere.locationId = locationId;
      attendanceWhere.locationId = locationId;
      faceWhere.locationId = locationId;
      qrWhere.locationId = locationId;
      incentiveWhere.employee = { ...incentiveWhere.employee, locationId };
      penaltyWhere.employee = { ...penaltyWhere.employee, locationId };
      observationWhere.locationId = locationId;
      streamWhere.locationId = locationId;
      sellingPointWhere.locationId = locationId;
    }

    // Executive dashboards filter by the company's standard department list, whose
    // entries are names/codes rather than department row ids, so resolve here.
    // An unmatched name resolves to no ids at all — which is the honest answer:
    // no employee in the master belongs to that department yet.
    const deptTokens =
      !departmentId || departmentId === 'all' || departmentId === 'ALL'
        ? []
        : String(departmentId).split(',').map((s) => s.trim()).filter(Boolean);
    if (deptTokens.length) {
      const wanted = deptTokens.map((t) => t.toLowerCase());
      const allDepartments = await prisma.department.findMany({
        select: { id: true, name: true, code: true },
      });
      const deptIds = allDepartments
        .filter((d: any) =>
          wanted.includes(String(d.id).toLowerCase()) ||
          wanted.includes(String(d.name || '').toLowerCase()) ||
          wanted.includes(String(d.code || '').toLowerCase())
        )
        .map((d: any) => d.id);
      employeeWhere.departmentId = { in: deptIds };
      attendanceWhere.employee = { ...(attendanceWhere.employee || {}), departmentId: { in: deptIds } };
      incentiveWhere.employee = { ...(incentiveWhere.employee || {}), departmentId: { in: deptIds } };
      penaltyWhere.employee = { ...(penaltyWhere.employee || {}), departmentId: { in: deptIds } };
    }

    if (shiftId) {
      if (shiftId.includes(',')) {
        const idList = shiftId.split(',').map((s: string) => s.trim()).filter(Boolean);
        employeeWhere.shiftId = { in: idList };
        attendanceWhere.shiftId = { in: idList };
      } else {
        employeeWhere.shiftId = shiftId;
        attendanceWhere.shiftId = shiftId;
      }
    }

    const [
      totalEmployees,
      attendance,
      faceVerified,
      faceFailed,
      faceAvg,
      qrSuccess,
      qrFailed,
      incentive,
      penalty,
      attendanceAgg,
      openObservations,
      criticalObservations,
      liveStreams,
      activeSellingPoints,
    ] = await Promise.all([
      prisma.employee.count({ where: employeeWhere }),
      prisma.attendance.groupBy({
        by: ['status'],
        where: attendanceWhere,
        _count: { _all: true },
      }),
      prisma.faceVerification.count({ where: { ...faceWhere, result: 'VERIFIED' } }),
      prisma.faceVerification.count({ where: { ...faceWhere, result: 'FAILED' } }),
      prisma.faceVerification.aggregate({ where: faceWhere, _avg: { matchPercentage: true } }),
      prisma.qRScanRecord.count({ where: { ...qrWhere, result: 'SUCCESS' } }),
      prisma.qRScanRecord.count({ where: { ...qrWhere, result: { not: 'SUCCESS' } } }),
      prisma.incentiveTransaction.aggregate({ where: incentiveWhere, _sum: { calculatedAmount: true } }),
      prisma.penaltyTransaction.aggregate({ where: penaltyWhere, _sum: { calculatedAmount: true } }),
      prisma.attendance.aggregate({
        where: attendanceWhere,
        _sum: { earlyLoginIncentive: true, overtimeIncentive: true, lateLoginPenalty: true },
      }),
      prisma.observation.count({ where: observationWhere }),
      prisma.observation.count({ where: { ...observationWhere, level: 'CRITICAL' } }),
      prisma.liveStream.count({ where: streamWhere }),
      prisma.sellingPoint.count({ where: sellingPointWhere }),
    ]);

    // On Lunch / Tea cards count ACTIVE break sessions (source of truth) via fast groupBy
    const activeBreaks = await prisma.employeeBreak.groupBy({
      by: ['breakType'],
      where: {
        status: 'ACTIVE',
        breakDate: dbDate(),
        ...(locationId ? { employee: { locationId } } : {}),
      },
      _count: { _all: true },
    });
    let onLunch = 0;
    let onTeaBreak = 0;
    for (const b of activeBreaks) {
      if (b.breakType === 'LUNCH') onLunch = b._count._all;
      if (b.breakType === 'TEA') onTeaBreak = b._count._all;
    }

    const statusCounts: Record<string, number> = {};
    for (const g of attendance) {
      statusCounts[g.status] = g._count._all;
    }

    const checkedInStatuses = [
      'PRESENT', 'EARLY', 'LATE', 'OVERTIME', 'LEFT_STORE', 'FACE_VERIFIED',
      'FACE_VERIFICATION_FAILED', 'ON_LUNCH', 'ON_TEA_BREAK', 'ON_OTHER_BREAK',
    ];
    const countStatus = (status: string) => statusCounts[status] || 0;
    let present = 0;
    for (const st of checkedInStatuses) {
      present += (statusCounts[st] || 0);
    }
    const weeklyOff = countStatus('WEEKLY_OFF');
    const absent = Math.max(totalEmployees - present - weeklyOff, 0);

    const attAgg: any = attendanceAgg || {};

    const result = {
      totalEmployees,
      present,
      absent,
      late: countStatus('LATE'),
      onLunch,
      onTeaBreak,
      weeklyOff,
      overtime: countStatus('OVERTIME'),
      faceVerified,
      faceFailed,
      avgFaceMatch: Number(faceAvg._avg.matchPercentage || 0),
      qrScans: qrSuccess + qrFailed,
      failedQrScans: qrFailed,
      incentiveToday: Number(attAgg._sum?.earlyLoginIncentive || 0) + Number(attAgg._sum?.overtimeIncentive || 0) + Number(incentive._sum.calculatedAmount || 0),
      penaltyToday: Number(attAgg._sum?.lateLoginPenalty || 0) + Number(penalty._sum.calculatedAmount || 0),
      openObservations,
      criticalObservations,
      liveStreams,
      activeSellingPoints,
    };

    const etag = cacheService.set(cacheKey, result, 5_000); // 5-second TTL
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=5');
    res.json(result);
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to get dashboard summary' });
  }
});

// ---------------------------------------------------------------------------
// HR Command Center — real aggregates only. Every figure is computed from the
// database; where the schema has no source for a metric the field is null (or
// an empty list) and the UI must render “—”. Nothing here is simulated.
// ---------------------------------------------------------------------------

const ATTENDANCE_PRESENT_STATUSES = [
  'PRESENT', 'EARLY', 'LATE', 'OVERTIME', 'LEFT_STORE', 'FACE_VERIFIED',
  'FACE_VERIFICATION_FAILED', 'ON_LUNCH', 'ON_TEA_BREAK', 'ON_OTHER_BREAK',
];

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Resolve department query tokens (ids/names/codes, comma separated) to row ids. */
async function resolveDepartmentIds(token?: string): Promise<{ given: boolean; ids: string[] }> {
  if (!token || token === 'all' || token === 'ALL') return { given: false, ids: [] };
  const wanted = String(token).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allDepartments = await prisma.department.findMany({ select: { id: true, name: true, code: true } });
  const ids = allDepartments
    .filter((d: any) =>
      wanted.includes(String(d.id).toLowerCase()) ||
      wanted.includes(String(d.name || '').toLowerCase()) ||
      wanted.includes(String(d.code || '').toLowerCase())
    )
    .map((d: any) => d.id);
  return { given: true, ids };
}

router.get('/hr-command-center', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    let locationId = getScopedLocationId(req.user, req.query.locationId);
    if (locationId === 'all') locationId = undefined;
    const dept = await resolveDepartmentIds(req.query.departmentId ? String(req.query.departmentId) : undefined);

    const q = async (sql: string, params: any[] = []): Promise<any[]> => {
      const [rows]: any = await pool.query(sql, params);
      return rows || [];
    };

    const qSafe = async (sql: string, params: any[] = []): Promise<any[]> => {
      try {
        const [rows]: any = await pool.query(sql, params);
        return rows || [];
      } catch (err: any) {
        if (err?.code === 'ER_NO_SUCH_TABLE') {
          return [];
        }
        throw err;
      }
    };

    const empScope = (alias: string) => {
      const parts: string[] = [];
      const params: any[] = [];
      if (locationId) { parts.push(`\`${alias}\`.locationId = ?`); params.push(locationId); }
      if (dept.given) {
        parts.push(dept.ids.length ? `\`${alias}\`.departmentId IN (${dept.ids.map(() => '?').join(',')})` : '1 = 0');
        if (dept.ids.length) params.push(...dept.ids);
      }
      return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
    };
    const es = empScope('e');

    const latestAttendance = await prisma.attendance.findFirst({
      orderBy: { attendanceDate: 'desc' },
      select: { attendanceDate: true },
    });
    const targetDate = req.query.date ? new Date(String(req.query.date)) : latestAttendance?.attendanceDate || dbDate();
    const targetYmd = ymdUtc(dbDate(targetDate));
    const todayYmd = ymdUtc(dbDate());
    const targetMonth = Number(targetYmd.slice(5, 7));
    const targetDay = Number(targetYmd.slice(8, 10));
    const monthStart = new Date(Date.UTC(Number(targetYmd.slice(0, 4)), targetMonth - 1, 1));
    const monthEndExclusive = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const nowUtc = dbDate();
    const dayOfWeek = nowUtc.getUTCDay();
    const weekStart = addUtcDays(nowUtc, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    const weekEndExclusive = addUtcDays(weekStart, 7);

    const leaveOverlap = `DATE(la.start_date) <= ? AND DATE(la.end_date) >= ?`;
    const pendingStatuses = ATTENDANCE_PRESENT_STATUSES.map(() => '?').join(',');

    const [
      headcountRows, presentRows, weeklyOffRows, lateRows, onLeaveRows, returnTomorrowRows,
      newJoinerRows, faceVerifiedRows,
      locRows, headcountByLoc, presentByLoc,
      deptDistRows,
      leaveMonthRows, leaveTodayByTypeRows, pendingLeaveRows, upcomingLeaveRows,
      correctionRows, docsPendingRows, syncFailureRows, probationRows, resignationsRows, fnfRows,
      missingKycRows, bankPendingRows, pfEsiRows,
      joiningWeekRows, assetsPendingRows, lastRunRows, candidateRows, interviewTodayRows,
      birthdayRows, birthdayNameRows, upcomingHolidayRows,
    ] = await Promise.all([
      q(`SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE'${es.sql}`, es.params),
      q(
        `SELECT COUNT(*) c FROM attendance a JOIN employee e ON e.id = a.employeeId
         WHERE DATE(a.attendanceDate) = ? AND a.status IN (${pendingStatuses})${es.sql}`,
        [targetYmd, ...ATTENDANCE_PRESENT_STATUSES, ...es.params]
      ),
      q(
        `SELECT COUNT(*) c FROM attendance a JOIN employee e ON e.id = a.employeeId
         WHERE DATE(a.attendanceDate) = ? AND a.status = 'WEEKLY_OFF'${es.sql}`,
        [targetYmd, ...es.params]
      ),
      q(
        `SELECT COUNT(*) c FROM attendance a JOIN employee e ON e.id = a.employeeId
         WHERE DATE(a.attendanceDate) = ? AND a.status = 'LATE'${es.sql}`,
        [targetYmd, ...es.params]
      ),
      q(
        `SELECT COUNT(DISTINCT la.employee_id) c FROM leave_applications la JOIN employee e ON e.id = la.employee_id
         WHERE la.status = 'APPROVED' AND ${leaveOverlap}${es.sql}`,
        [targetYmd, targetYmd, ...es.params]
      ),
      q(
        `SELECT COUNT(DISTINCT la.employee_id) c FROM leave_applications la JOIN employee e ON e.id = la.employee_id
         WHERE la.status = 'APPROVED' AND ${leaveOverlap} AND DATE(la.end_date) = ?${es.sql}`,
        [targetYmd, targetYmd, targetYmd, ...es.params]
      ),
      q(
        `SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE'
         AND e.joiningDate >= ? AND e.joiningDate < ?${es.sql}`,
        [monthStart, monthEndExclusive, ...es.params]
      ),
      q(
        `SELECT COUNT(*) c FROM faceverification f JOIN employee e ON e.id = f.employeeId
         WHERE DATE(f.verifiedAt) = ? AND f.result = 'VERIFIED'${es.sql}`,
        [targetYmd, ...es.params]
      ),
      q(`SELECT id, name, code FROM location ORDER BY name ASC`),
      q(
        `SELECT e.locationId, COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE'${es.sql} GROUP BY e.locationId`,
        es.params
      ),
      q(
        `SELECT a.locationId, COUNT(*) c FROM attendance a JOIN employee e ON e.id = a.employeeId
         WHERE DATE(a.attendanceDate) = ? AND a.status IN (${pendingStatuses})${es.sql}
         GROUP BY a.locationId`,
        [targetYmd, ...ATTENDANCE_PRESENT_STATUSES, ...es.params]
      ),
      q(
        `SELECT d.name AS name, COUNT(*) c FROM employee e LEFT JOIN department d ON d.id = e.departmentId
         WHERE e.status = 'ACTIVE'${es.sql} GROUP BY d.name ORDER BY c DESC`,
        es.params
      ),
      q(
        `SELECT la.start_date, la.end_date FROM leave_applications la JOIN employee e ON e.id = la.employee_id
         WHERE la.status = 'APPROVED' AND la.start_date < ? AND la.end_date >= ?${es.sql}`,
        [monthEndExclusive, monthStart, ...es.params]
      ),
      q(
        `SELECT lt.name AS name, COUNT(DISTINCT la.employee_id) c
         FROM leave_applications la
         JOIN leave_types lt ON lt.id = la.leave_type_id
         JOIN employee e ON e.id = la.employee_id
         WHERE la.status = 'APPROVED' AND ${leaveOverlap}${es.sql}
         GROUP BY lt.name`,
        [targetYmd, targetYmd, ...es.params]
      ),
      q(
        `SELECT COUNT(*) c FROM leave_applications la JOIN employee e ON e.id = la.employee_id
         WHERE la.status = 'PENDING'${es.sql}`,
        es.params
      ),
      q(
        `SELECT COUNT(*) c FROM leave_applications la JOIN employee e ON e.id = la.employee_id
         WHERE la.status = 'PENDING' AND la.start_date > ? AND la.start_date <= ?${es.sql}`,
        [nowUtc, weekEndExclusive, ...es.params]
      ),
      q(
        `SELECT COUNT(*) c FROM attendancecorrection c WHERE c.status = 'PENDING'${locationId ? ' AND c.locationId = ?' : ''}`,
        locationId ? [locationId] : []
      ),
      q(
        `SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE'
         AND (e.documentStatus IS NULL OR e.documentStatus NOT IN ('VERIFIED','COMPLETE','APPROVED'))${es.sql}`,
        es.params
      ),
      q(`SELECT COUNT(*) c FROM biometric_devices WHERE isActive = 1 AND consecutiveFailures > 0`),
      q(
        `SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE' AND e.employmentType = 'PROBATION'
         AND e.confirmationDate IS NOT NULL AND e.confirmationDate <= DATE_ADD(?, INTERVAL 30 DAY)${es.sql}`,
        [nowUtc, ...es.params]
      ),
      q(
        `SELECT COUNT(*) c FROM employee_exits x JOIN employee e ON e.id = x.employee_id
         WHERE x.status NOT IN ('PAID','COMPLETED','REJECTED','CANCELLED','WITHDRAWN')${es.sql}`,
        es.params
      ),
      q(
        `SELECT COUNT(*) c FROM fnf_settlements f JOIN employee e ON e.id = f.employee_id
         WHERE f.status NOT IN ('PAID','COMPLETED','REJECTED','CANCELLED')${es.sql}`,
        es.params
      ),
      q(
        `SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE'
         AND (e.panNumber IS NULL OR e.aadhaarVerificationStatus IS NULL OR e.aadhaarVerificationStatus <> 'VERIFIED')${es.sql}`,
        es.params
      ),
      q(
        `SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE' AND e.bankAccount IS NULL${es.sql}`,
        es.params
      ),
      q(
        `SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE'
         AND (e.pfNo IS NULL OR e.esiNo IS NULL)${es.sql}`,
        es.params
      ),
      q(
        `SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE'
         AND e.joiningDate >= ? AND e.joiningDate < ?${es.sql}`,
        [weekStart, weekEndExclusive, ...es.params]
      ),
      q(
        `SELECT COUNT(*) c FROM employee_custody_assets ca JOIN employee e ON e.id = ca.employeeId
         WHERE ca.acknowledgedAt IS NULL AND ca.returnedAt IS NULL${es.sql}`,
        es.params
      ),
      q(`SELECT id, status, periodStart, periodEnd FROM payrollrun ORDER BY periodStart DESC, createdAt DESC LIMIT 1`),
      qSafe(`SELECT COUNT(*) c FROM candidate`),
      qSafe(`SELECT COUNT(*) c FROM interview WHERE DATE(scheduledAt) = ?`, [todayYmd]),
      q(
        `SELECT COUNT(*) c FROM employee e WHERE e.status = 'ACTIVE'
         AND MONTH(e.dateOfBirth) = ? AND DAY(e.dateOfBirth) = ?${es.sql}`,
        [targetMonth, targetDay, ...es.params]
      ),
      q(
        `SELECT e.fullName FROM employee e WHERE e.status = 'ACTIVE'
         AND MONTH(e.dateOfBirth) = ? AND DAY(e.dateOfBirth) = ?${es.sql} LIMIT 5`,
        [targetMonth, targetDay, ...es.params]
      ),
      q(
        `SELECT name, date FROM holiday WHERE date >= ?${locationId ? ' AND (locationId IS NULL OR locationId = ?)' : ''} ORDER BY date ASC LIMIT 5`,
        locationId ? [nowUtc, locationId] : [nowUtc]
      ),
    ]);

    const num = (rows: any[]) => Number(rows?.[0]?.c || 0);
    const headcount = num(headcountRows);
    const present = num(presentRows);
    const weeklyOff = num(weeklyOffRows);
    const absent = Math.max(headcount - present - weeklyOff, 0);
    const onLeave = num(onLeaveRows);

    const hcByLoc = new Map<string, number>();
    for (const r of headcountByLoc) hcByLoc.set(String(r.locationId), Number(r.c));
    const presByLoc = new Map<string, number>();
    for (const r of presentByLoc) presByLoc.set(String(r.locationId), Number(r.c));
    const hubCoverage = locRows
      .map((l: any) => {
        const hc = hcByLoc.get(String(l.id)) || 0;
        const pres = presByLoc.get(String(l.id)) || 0;
        return {
          locationId: String(l.id),
          name: String(l.name),
          code: l.code ? String(l.code) : null,
          headcount: hc,
          present: pres,
          coveragePct: hc > 0 ? Math.round((pres / hc) * 1000) / 10 : null,
        };
      })
      .filter((h: any) => h.headcount > 0 || h.present > 0);

    const trendMonths: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      trendMonths.push({ label: start.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), start, end });
    }
    const trend = await Promise.all(
      trendMonths.map(async (m) => {
        const [joinRows, exitRows, hcRows] = await Promise.all([
          q(`SELECT COUNT(*) c FROM employee e WHERE e.joiningDate >= ? AND e.joiningDate < ?${es.sql}`, [m.start, m.end, ...es.params]),
          q(
            `SELECT COUNT(*) c FROM employee_exits x JOIN employee e ON e.id = x.employee_id
             WHERE COALESCE(x.last_working_day, x.resignation_date) >= ? AND COALESCE(x.last_working_day, x.resignation_date) < ?${es.sql}`,
            [m.start, m.end, ...es.params]
          ),
          q(
            `SELECT COUNT(*) c FROM employee e
             WHERE e.joiningDate < ? AND (e.exitDate IS NULL OR e.exitDate >= ?)${es.sql}`,
            [m.end, m.end, ...es.params]
          ),
        ]);
        return { month: m.label, joinings: num(joinRows), exits: num(exitRows), headcount: num(hcRows) };
      })
    );

    const daysWithLeave: Record<string, number> = {};
    for (const row of leaveMonthRows) {
      let d = dbDate(new Date(row.start_date));
      const end = dbDate(new Date(row.end_date));
      if (d.getTime() < monthStart.getTime()) d = monthStart;
      while (d.getTime() < monthEndExclusive.getTime() && d.getTime() <= end.getTime()) {
        const key = ymdUtc(d);
        daysWithLeave[key] = (daysWithLeave[key] || 0) + 1;
        d = addUtcDays(d, 1);
      }
    }

    const lastRun = lastRunRows[0] || null;
    let payslipCount = 0;
    if (lastRun?.id) {
      const pr = await q(`SELECT COUNT(*) c FROM payrollitem WHERE payrollRunId = ?`, [lastRun.id]);
      payslipCount = num(pr);
    }

    const result = {
      date: targetYmd,
      kpis: {
        headcount,
        present,
        absent,
        unplannedAbsent: Math.max(absent - onLeave, 0),
        onLeave,
        returnTomorrow: num(returnTomorrowRows),
        newJoiners: num(newJoinerRows),
        late: num(lateRows),
        lateRate: present > 0 ? Math.round((num(lateRows) / present) * 1000) / 10 : null,
        attendanceRate: headcount > 0 ? Math.round((present / headcount) * 1000) / 10 : null,
        faceVerified: num(faceVerifiedRows),
      },
      hubs: hubCoverage,
      trend,
      departments: deptDistRows.map((r: any) => ({
        name: r.name || 'Unassigned',
        count: Number(r.c),
        pct: headcount > 0 ? Math.round((Number(r.c) / headcount) * 1000) / 10 : null,
      })),
      leave: {
        onLeaveTodayByType: leaveTodayByTypeRows.map((r: any) => ({ name: String(r.name), count: Number(r.c) })),
        calendarMonth: targetYmd.slice(0, 7),
        daysWithLeave: Object.entries(daysWithLeave).map(([date, count]) => ({ date, count })),
        pendingRequests: num(pendingLeaveRows),
        upcomingRequests: num(upcomingLeaveRows),
      },
      actionCenter: {
        leaveRequestsPending: num(pendingLeaveRows),
        correctionsPending: num(correctionRows),
        documentsPending: num(docsPendingRows),
        biometricSyncFailures: num(syncFailureRows),
        probationReviewsDue: num(probationRows),
        resignationsPending: num(resignationsRows),
        fnfPending: num(fnfRows),
      },
      compliance: {
        missingKyc: num(missingKycRows),
        bankPending: num(bankPendingRows),
        pfEsiPending: num(pfEsiRows),
      },
      onboarding: {
        joiningThisWeek: num(joiningWeekRows),
        documentsPending: num(docsPendingRows),
        assetsPending: num(assetsPendingRows),
      },
      payrollReadiness: {
        runStatus: lastRun?.status || null,
        periodStart: lastRun?.periodStart || null,
        periodEnd: lastRun?.periodEnd || null,
        payslipCount,
        coveragePct: headcount > 0 ? Math.round((payslipCount / headcount) * 1000) / 10 : null,
      },
      recruitment: {
        activeCandidates: num(candidateRows),
        interviewsToday: num(interviewTodayRows),
      },
      engagements: {
        birthdaysToday: { count: num(birthdayRows), names: birthdayNameRows.map((r: any) => String(r.fullName)) },
        upcomingHolidays: upcomingHolidayRows.map((r: any) => ({ name: String(r.name), date: ymdUtc(new Date(r.date)) })),
      },
    };

    res.json(result);
  } catch (error: any) {
    console.error('HR command center error:', error);
    res.status(500).json({ error: 'Failed to build the HR command center', message: error?.message });
  }
});

router.get('/kpi-details', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const type = String(req.query.type || '');
    let locationId = getScopedLocationId(req.user, req.query.locationId);
    if (locationId === 'all') locationId = undefined;
    const dept = await resolveDepartmentIds(req.query.departmentId ? String(req.query.departmentId) : undefined);

    const q = async (sql: string, params: any[] = []): Promise<any[]> => {
      const [rows]: any = await pool.query(sql, params);
      return rows || [];
    };
    const empScope = (alias: string) => {
      const parts: string[] = [];
      const params: any[] = [];
      if (locationId) { parts.push(`\`${alias}\`.locationId = ?`); params.push(locationId); }
      if (dept.given) {
        parts.push(dept.ids.length ? `\`${alias}\`.departmentId IN (${dept.ids.map(() => '?').join(',')})` : '1 = 0');
        if (dept.ids.length) params.push(...dept.ids);
      }
      return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
    };

    const latestAttendance = await prisma.attendance.findFirst({
      orderBy: { attendanceDate: 'desc' },
      select: { attendanceDate: true },
    });
    const targetDate = req.query.date ? new Date(String(req.query.date)) : latestAttendance?.attendanceDate || dbDate();
    const targetYmd = ymdUtc(dbDate(targetDate));

    const clock = (v: unknown): string | null =>
      v ? new Date(v as string).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : null;

    const es = empScope('e');
    let rows: any[] = [];

    if (type === 'headcount') {
      rows = await q(
        `SELECT e.employeeCode, e.fullName, e.designation, d.name AS department, l.name AS locationName, e.joiningDate
         FROM employee e
         LEFT JOIN department d ON d.id = e.departmentId
         LEFT JOIN location l ON l.id = e.locationId
         WHERE e.status = 'ACTIVE'${es.sql}
         ORDER BY e.fullName ASC LIMIT 500`,
        es.params
      );
      rows = rows.map((r) => ({ ...r, joiningDate: r.joiningDate ? ymdUtc(new Date(r.joiningDate)) : null }));
    } else if (type === 'present' || type === 'late') {
      const statusFilter = type === 'late' ? `a.status = 'LATE'` : `a.status IN (${ATTENDANCE_PRESENT_STATUSES.map(() => '?').join(',')})`;
      const params = type === 'late' ? [] : [...ATTENDANCE_PRESENT_STATUSES];
      rows = await q(
        `SELECT e.employeeCode, e.fullName, d.name AS department, a.status, a.actualLogin, a.actualLogout,
                a.totalWorkingSeconds, a.lateLoginSeconds, a.overtimeSeconds
         FROM attendance a
         JOIN employee e ON e.id = a.employeeId
         LEFT JOIN department d ON d.id = e.departmentId
         WHERE DATE(a.attendanceDate) = ? AND ${statusFilter}${es.sql}
         ORDER BY a.actualLogin ASC LIMIT 500`,
        [targetYmd, ...params, ...es.params]
      );
      rows = rows.map((r) => ({
        employeeCode: r.employeeCode,
        fullName: r.fullName,
        department: r.department,
        status: r.status,
        login: clock(r.actualLogin),
        logout: clock(r.actualLogout),
        workedMinutes: r.totalWorkingSeconds != null ? Math.round(Number(r.totalWorkingSeconds) / 60) : null,
        lateMinutes: r.lateLoginSeconds != null ? Math.round(Number(r.lateLoginSeconds) / 60) : null,
      }));
    } else if (type === 'absent') {
      rows = await q(
        `SELECT e.employeeCode, e.fullName, d.name AS department, l.name AS locationName
         FROM employee e
         LEFT JOIN department d ON d.id = e.departmentId
         LEFT JOIN location l ON l.id = e.locationId
         WHERE e.status = 'ACTIVE'${es.sql}
           AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.employeeId = e.id AND DATE(a.attendanceDate) = ?)
           AND NOT EXISTS (
             SELECT 1 FROM leave_applications la
             WHERE la.employee_id = e.id AND la.status = 'APPROVED'
               AND DATE(la.start_date) <= ? AND DATE(la.end_date) >= ?
           )
         ORDER BY e.fullName ASC LIMIT 500`,
        [...es.params, targetYmd, targetYmd, targetYmd]
      );
    } else if (type === 'leave') {
      rows = await q(
        `SELECT e.employeeCode, e.fullName, d.name AS department, lt.name AS leaveType,
                la.start_date, la.end_date, la.status, la.days_count, la.reason
         FROM leave_applications la
         JOIN employee e ON e.id = la.employee_id
         JOIN leave_types lt ON lt.id = la.leave_type_id
         LEFT JOIN department d ON d.id = e.departmentId
         WHERE la.status = 'APPROVED' AND DATE(la.start_date) <= ? AND DATE(la.end_date) >= ?${es.sql}
         ORDER BY la.start_date ASC LIMIT 500`,
        [targetYmd, targetYmd, ...es.params]
      );
      rows = rows.map((r) => ({
        ...r,
        startDate: r.start_date ? ymdUtc(new Date(r.start_date)) : null,
        endDate: r.end_date ? ymdUtc(new Date(r.end_date)) : null,
        start_date: undefined,
        end_date: undefined,
      }));
    } else if (type === 'face_verified') {
      rows = await q(
        `SELECT e.employeeCode, e.fullName, d.name AS department, f.matchPercentage, f.verifiedAt, f.result
         FROM faceverification f
         JOIN employee e ON e.id = f.employeeId
         LEFT JOIN department d ON d.id = e.departmentId
         WHERE DATE(f.verifiedAt) = ? AND f.result = 'VERIFIED'${es.sql}
         ORDER BY f.verifiedAt DESC LIMIT 500`,
        [targetYmd, ...es.params]
      );
      rows = rows.map((r) => ({
        employeeCode: r.employeeCode,
        fullName: r.fullName,
        department: r.department,
        matchPercentage: r.matchPercentage != null ? Number(r.matchPercentage) : null,
        verifiedAt: clock(r.verifiedAt),
      }));
    } else {
      return res.status(400).json({ error: 'Unknown KPI detail type' });
    }

    res.json({ type, date: targetYmd, total: rows.length, rows });
  } catch (error: any) {
    console.error('KPI details error:', error);
    res.status(500).json({ error: 'Failed to load KPI details', message: error?.message });
  }
});

router.get('/attendance-summary', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, shiftId, departmentId } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    const where: any = targetLocationId ? { locationId: targetLocationId } : {};
    if (startDate || endDate) {
      where.attendanceDate = {};
      if (startDate) where.attendanceDate.gte = new Date(String(startDate));
      if (endDate) where.attendanceDate.lte = new Date(String(endDate));
    }
    if (shiftId) where.shiftId = shiftId;
    if (departmentId) where.employee = { departmentId };
    
    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, department: { select: { name: true } }, shift: { select: { name: true } } } },
      },
      orderBy: { attendanceDate: 'asc' },
    });
    
    // Group by employee
    const summary = attendances.reduce((acc: any, a: any) => {
      const key = a.employeeId;
      if (!acc[key]) {
        acc[key] = {
          employeeCode: a.employee?.employeeCode || '',
          employeeName: a.employee?.fullName || '',
          department: a.employee?.department?.name || 'Retail Store',
          totalDays: 0,
          present: 0,
          absent: 0,
          late: 0,
          early: 0,
          overtime: 0,
          totalWorkingHours: 0,
          totalEarlyIncentive: 0,
          totalLatePenalty: 0,
        };
      }
      acc[key].totalDays++;
      switch (a.status) {
        case 'PRESENT': acc[key].present++; break;
        case 'ABSENT': acc[key].absent++; break;
        case 'LATE': acc[key].late++; break;
        case 'EARLY': acc[key].early++; break;
        case 'OVERTIME': acc[key].overtime++; break;
      }
      acc[key].totalWorkingHours = Math.round(((acc[key].totalWorkingHours || 0) + (a.totalWorkingSeconds / 3600)) * 10) / 10;
      acc[key].totalEarlyIncentive += Number(a.earlyLoginIncentive || 0);
      acc[key].totalLatePenalty += Number(a.lateLoginPenalty || 0);
      return acc;
    }, {} as Record<string, any>);
    
    res.json({ summary: Object.values(summary), data: Object.values(summary) });
  } catch (error) {
    console.error('Attendance summary report error:', error);
    res.status(500).json({ error: 'Failed to generate attendance summary' });
  }
});

router.get('/employee-performance', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, employeeId, startDate, endDate } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { locationId: targetLocationId } : {};
    if (employeeId) where.employeeId = employeeId;
    if (startDate || endDate) {
      where.attendanceDate = {};
      if (startDate) where.attendanceDate.gte = new Date(String(startDate));
      if (endDate) where.attendanceDate.lte = new Date(String(endDate));
    }
    
    const attendances = await prisma.attendance.findMany({
      where,
      include: { employee: { select: { id: true, employeeCode: true, fullName: true } } },
    });
    
    const performance = attendances.reduce((acc: any, a: any) => {
      const key = a.employeeId;
      if (!acc[key]) {
        acc[key] = { employee: a.employee, punctuality: 0, attendance: 0, overtime: 0, incentives: 0 };
      }
      const total = acc[key].punctuality + (a.status === 'PRESENT' || a.status === 'EARLY' ? 1 : 0);
      const count = acc[key].attendance + 1;
      acc[key].punctuality = total / count * 100;
      acc[key].attendance = count;
      if (a.status === 'OVERTIME') acc[key].overtime++;
      acc[key].incentives += Number(a.earlyLoginIncentive) + Number(a.overtimeIncentive);
      return acc;
    }, {} as Record<string, any>);
    
    res.json({ performance: Object.values(performance) });
  } catch (error) {
    console.error('Employee performance report error:', error);
    res.status(500).json({ error: 'Failed to generate employee performance' });
  }
});

router.get(['/incentive-summary', '/incentives-summary'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, incentiveRuleId } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { employee: { locationId: targetLocationId } } : {};
    if (incentiveRuleId) where.incentiveRuleId = incentiveRuleId;
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = new Date(String(startDate));
      if (endDate) where.transactionDate.lte = new Date(String(endDate));
    }
    
    const transactions = await prisma.incentiveTransaction.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true } },
        incentiveRule: { select: { id: true, name: true, incentiveType: true } },
      },
      orderBy: { transactionDate: 'desc' },
    });
    
    const records = transactions.map((t: any) => ({
      employeeCode: t.employee?.employeeCode || '',
      employeeName: t.employee?.fullName || '',
      rule: t.incentiveRule?.name || 'Daily Performance',
      type: t.incentiveRule?.incentiveType || 'EARLY_LOGIN',
      amount: `₹${Number(t.calculatedAmount || 0)}`,
      date: t.transactionDate ? new Date(t.transactionDate).toLocaleDateString() : '',
    }));

    res.json({ summary: records, records, data: records });
  } catch (error) {
    console.error('Incentive summary report error:', error);
    res.status(500).json({ error: 'Failed to generate incentive summary' });
  }
});

router.get('/break-analysis', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, breakType } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { employee: { locationId: targetLocationId } } : {};
    if (breakType) where.breakType = breakType;
    if (startDate || endDate) {
      where.breakDate = {};
      if (startDate) where.breakDate.gte = new Date(String(startDate));
      if (endDate) where.breakDate.lte = new Date(String(endDate));
    }
    
    const breaks = await prisma.employeeBreak.findMany({
      where,
      include: { employee: { select: { id: true, employeeCode: true, fullName: true } } },
    });
    
    const analysis = breaks.reduce((acc: any, b: any) => {
      const key = b.breakType;
      if (!acc[key]) {
        acc[key] = { total: 0, completed: 0, exceeded: 0, avgDuration: 0, totalExcess: 0 };
      }
      acc[key].total++;
      if (b.status === 'COMPLETED') acc[key].completed++;
      if (b.status === 'EXCEEDED') acc[key].exceeded++;
      if (b.actualDuration) acc[key].avgDuration = (acc[key].avgDuration * (acc[key].total - 1) + b.actualDuration) / acc[key].total;
      if (b.exceededDuration) acc[key].totalExcess += b.exceededDuration;
      return acc;
    }, {} as Record<string, any>);
    
    res.json({ analysis });
  } catch (error) {
    console.error('Break analysis report error:', error);
    res.status(500).json({ error: 'Failed to generate break analysis' });
  }
});

router.get(['/face-verification-stats', '/face-verification-accuracy'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { locationId: targetLocationId } : {};
    if (startDate || endDate) {
      where.verifiedAt = {};
      if (startDate) where.verifiedAt.gte = new Date(String(startDate));
      if (endDate) where.verifiedAt.lte = new Date(String(endDate));
    }
    
    const [verified, failed, avgMatch, logs] = await Promise.all([
      prisma.faceVerification.count({ where: { ...where, result: 'VERIFIED' } }),
      prisma.faceVerification.count({ where: { ...where, result: 'FAILED' } }),
      prisma.faceVerification.aggregate({ where: { ...where, result: 'VERIFIED' }, _avg: { matchPercentage: true } }),
      prisma.faceVerification.findMany({
        where,
        take: 50,
        orderBy: { verifiedAt: 'desc' },
        include: {
          employee: { select: { employeeCode: true, fullName: true } },
          location: { select: { name: true, code: true } },
        },
      }),
    ]);

    const records = logs.map((v: any) => ({
      employeeCode: v.employee?.employeeCode || '',
      employeeName: v.employee?.fullName || '',
      location: v.location?.name || 'Retail Flagship',
      matchPercentage: `${Number(v.matchPercentage)}%`,
      status: v.result,
      verifiedAt: v.verifiedAt ? new Date(v.verifiedAt).toLocaleTimeString() : '',
    }));
    
    res.json({
      verified,
      failed,
      total: verified + failed,
      successRate: verified + failed > 0 ? (verified / (verified + failed)) * 100 : 0,
      averageMatchPercentage: avgMatch._avg?.matchPercentage || 0,
      records,
      rows: records,
      data: records,
    });
  } catch (error) {
    console.error('Face verification stats error:', error);
    res.status(500).json({ error: 'Failed to get face verification stats' });
  }
});

router.get(['/qr-scan-analytics', '/qr-scans-summary'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, purpose } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { locationId: targetLocationId } : {};
    if (purpose) where.purpose = purpose;
    if (startDate || endDate) {
      where.scannedAt = {};
      if (startDate) where.scannedAt.gte = new Date(String(startDate));
      if (endDate) where.scannedAt.lte = new Date(String(endDate));
    }
    
    const [success, failed, byPurpose, scanLogs] = await Promise.all([
      prisma.qRScanRecord.count({ where: { ...where, result: 'SUCCESS' } }),
      prisma.qRScanRecord.count({ where: { ...where, result: { not: 'SUCCESS' } } }),
      prisma.qRScanRecord.groupBy({ by: ['purpose'], where, _count: true }),
      prisma.qRScanRecord.findMany({
        where,
        take: 50,
        orderBy: { scannedAt: 'desc' },
        include: {
          employee: { select: { employeeCode: true, fullName: true } },
        },
      }),
    ]);

    const records = scanLogs.map((s: any) => ({
      employeeCode: s.employee?.employeeCode || '',
      employeeName: s.employee?.fullName || '',
      purpose: s.purpose,
      result: s.result,
      scannedAt: s.scannedAt ? new Date(s.scannedAt).toLocaleTimeString() : '',
    }));
    
    res.json({
      success,
      failed,
      total: success + failed,
      successRate: success + failed > 0 ? (success / (success + failed)) * 100 : 0,
      byPurpose,
      records,
      scans: records,
      rows: records,
      data: records,
    });
  } catch (error) {
    console.error('QR scan analytics error:', error);
    res.status(500).json({ error: 'Failed to get QR scan analytics' });
  }
});

router.get('/selling-point-performance', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const sellingPoints = await prisma.sellingPoint.findMany({
      where: targetLocationId ? { locationId: targetLocationId, status: true } : { status: true },
      include: {
        _count: { select: { employees: true, qrScanRecords: true } },
        incentiveRule: true,
      },
    });
    
    const performance = sellingPoints.map((sp: any) => ({
      ...sp,
      employeeCount: sp._count.employees,
      scanCount: sp._count.qrScanRecords,
      performanceScore: sp.performanceScore || 0,
    }));
    
    res.json({ performance });
  } catch (error) {
    console.error('Selling point performance error:', error);
    res.status(500).json({ error: 'Failed to get selling point performance' });
  }
});

export default router;