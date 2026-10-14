import { pool } from '../db.js';

export interface AnalysisFilterOptions {
  startDate?: string;
  endDate?: string;
  preset?: string; // 'today' | '7d' | '30d' | '90d' | 'this_month' | 'prev_month' | 'all' | 'custom'
  locationId?: string;
  departmentId?: string;
  employeeId?: string;
  status?: string;
  date?: string;
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  prevStartDate: string;
  prevEndDate: string;
}

/**
 * Calculates start and end dates based on preset or custom strings.
 * Respects Indian Standard Time (+05:30).
 */
export function resolveDateRange(options: AnalysisFilterOptions, minAvailableDate = '2026-09-01'): DateRange {
  const now = new Date();
  // Adjust to IST date string
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const todayStr = istDate.toISOString().slice(0, 10);

  const preset = options.preset || '30d';
  let start = todayStr;
  let end = todayStr;

  if (options.date) {
    start = options.date.slice(0, 10);
    end = options.date.slice(0, 10);
  } else if (options.startDate && options.endDate && preset === 'custom') {
    start = options.startDate.slice(0, 10);
    end = options.endDate.slice(0, 10);
  } else {
    const curYear = istDate.getUTCFullYear();
    const curMonth = istDate.getUTCMonth(); // 0-indexed

    switch (preset) {
      case 'today': {
        start = todayStr;
        end = todayStr;
        break;
      }
      case '7d': {
        const d = new Date(istDate);
        d.setUTCDate(d.getUTCDate() - 6);
        start = d.toISOString().slice(0, 10);
        end = todayStr;
        break;
      }
      case '30d': {
        const d = new Date(istDate);
        d.setUTCDate(d.getUTCDate() - 29);
        start = d.toISOString().slice(0, 10);
        end = todayStr;
        break;
      }
      case '90d': {
        const d = new Date(istDate);
        d.setUTCDate(d.getUTCDate() - 89);
        start = d.toISOString().slice(0, 10);
        end = todayStr;
        break;
      }
      case 'this_month': {
        const firstDay = new Date(Date.UTC(curYear, curMonth, 1));
        start = firstDay.toISOString().slice(0, 10);
        end = todayStr;
        break;
      }
      case 'prev_month': {
        const firstDayPrev = new Date(Date.UTC(curYear, curMonth - 1, 1));
        const lastDayPrev = new Date(Date.UTC(curYear, curMonth, 0));
        start = firstDayPrev.toISOString().slice(0, 10);
        end = lastDayPrev.toISOString().slice(0, 10);
        break;
      }
      case 'all': {
        start = minAvailableDate;
        end = todayStr;
        break;
      }
      default: {
        const d = new Date(istDate);
        d.setUTCDate(d.getUTCDate() - 29);
        start = d.toISOString().slice(0, 10);
        end = todayStr;
        break;
      }
    }
  }

  // Ensure start <= end
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  // Calculate equivalent previous comparison period
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T23:59:59Z`).getTime();
  const diffDays = Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));

  const prevEndMs = startMs - 24 * 60 * 60 * 1000;
  const prevStartMs = prevEndMs - (diffDays - 1) * 24 * 60 * 60 * 1000;

  const prevStartDate = new Date(prevStartMs).toISOString().slice(0, 10);
  const prevEndDate = new Date(prevEndMs).toISOString().slice(0, 10);

  return { startDate: start, endDate: end, prevStartDate, prevEndDate };
}

export class AnalysisService {
  /**
   * Helper to append location and department filters to queries safely
   */
  private static buildScopeFilter(
    prefix: string,
    options: AnalysisFilterOptions,
    params: any[]
  ): string {
    let sql = '';
    if (options.locationId && options.locationId !== 'all') {
      sql += ` AND ${prefix}.locationId = ?`;
      params.push(options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      sql += ` AND (${prefix}.departmentId = ? OR ${prefix}.departmentId IN (SELECT d2.id FROM department d2 WHERE d2.name = (SELECT d3.name FROM department d3 WHERE d3.id = ?)))`;
      params.push(options.departmentId, options.departmentId);
    }
    if (options.employeeId) {
      const empCol = prefix === 'e' ? 'id' : 'employeeId';
      sql += ` AND ${prefix}.${empCol} = ?`;
      params.push(options.employeeId);
    }
    if (options.status && options.status !== 'ALL' && prefix === 'e') {
      sql += ` AND ${prefix}.status = ?`;
      params.push(options.status);
    }
    return sql;
  }

  /**
   * 1. Overall HR Analysis Dashboard Summary Cards
   */
  public static async getSummary(options: AnalysisFilterOptions) {
    const range = resolveDateRange(options);
    const todayStr = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

    // 1. Employee totals and statuses
    const empParams: any[] = [];
    let empSql = `SELECT status, COUNT(*) as c FROM employee e WHERE 1=1`;
    empSql += this.buildScopeFilter('e', options, empParams);
    empSql += ` GROUP BY status`;
    const [empRows]: any = await pool.query(empSql, empParams);

    let totalEmployees = 0;
    let activeEmployees = 0;
    let inactiveEmployees = 0;
    let probationEmployees = 0;

    for (const r of empRows) {
      const count = Number(r.c);
      totalEmployees += count;
      if (r.status === 'ACTIVE') activeEmployees += count;
      else if (r.status === 'PROBATION') probationEmployees += count;
      else inactiveEmployees += count;
    }

    // 2. Employees logged in today
    // Count distinct employees with a successful login attempt or lastLoginAt today
    const loginTodayParams: any[] = [todayStr];
    let loginTodaySql = `
      SELECT COUNT(DISTINCT COALESCE(e.id, u.employeeId, u.id)) as c
      FROM login_attempt la
      LEFT JOIN user u ON la.userId = u.id
      LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
      WHERE la.success = 1
        AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) = ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      loginTodaySql += ` AND (e.locationId = ? OR u.locationId = ? OR la.locationId = ?)`;
      loginTodayParams.push(options.locationId, options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      loginTodaySql += ` AND e.departmentId = ?`;
      loginTodayParams.push(options.departmentId);
    }
    if (options.employeeId) {
      loginTodaySql += ` AND (e.id = ? OR u.employeeId = ?)`;
      loginTodayParams.push(options.employeeId, options.employeeId);
    }
    const [loginTodayRows]: any = await pool.query(loginTodaySql, loginTodayParams);
    const loggedInToday = Number(loginTodayRows[0]?.c || 0);
    const notLoggedInToday = Math.max(0, activeEmployees - loggedInToday);

    // 3. Currently active in the system (valid unexpired session with recent activity)
    const activeSessParams: any[] = [];
    let activeSessSql = `
      SELECT COUNT(DISTINCT s.userId) as c
      FROM session s
      LEFT JOIN user u ON s.userId = u.id
      LEFT JOIN employee e ON u.employeeId = e.id
      WHERE s.revoked = 0
        AND s.expiresAt > NOW()
    `;
    if (options.locationId && options.locationId !== 'all') {
      activeSessSql += ` AND (e.locationId = ? OR u.locationId = ? OR s.locationId = ?)`;
      activeSessParams.push(options.locationId, options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      activeSessSql += ` AND e.departmentId = ?`;
      activeSessParams.push(options.departmentId);
    }
    if (options.employeeId) {
      activeSessSql += ` AND (e.id = ? OR u.employeeId = ?)`;
      activeSessParams.push(options.employeeId, options.employeeId);
    }
    const [activeSessRows]: any = await pool.query(activeSessSql, activeSessParams);
    const currentlyActive = Number(activeSessRows[0]?.c || 0);

    // 4. Attendance Today
    const attTodayParams: any[] = [todayStr];
    let attTodaySql = `
      SELECT SUM(CASE WHEN a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount,
             SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absentCount,
             SUM(CASE WHEN a.status = 'LATE' OR a.lateLoginSeconds > 0 THEN 1 ELSE 0 END) as lateCount
      FROM attendance a
      LEFT JOIN employee e ON a.employeeId = e.id
      WHERE a.attendanceDate = ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      attTodaySql += ` AND (a.locationId = ? OR e.locationId = ?)`;
      attTodayParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      attTodaySql += ` AND e.departmentId = ?`;
      attTodayParams.push(options.departmentId);
    }
    if (options.employeeId) {
      attTodaySql += ` AND a.employeeId = ?`;
      attTodayParams.push(options.employeeId);
    }
    const [attTodayRows]: any = await pool.query(attTodaySql, attTodayParams);
    const markedPresentToday = Number(attTodayRows[0]?.presentCount || 0);
    const absentToday = Number(attTodayRows[0]?.absentCount || 0);
    const lateArrivalsToday = Number(attTodayRows[0]?.lateCount || 0);

    // 5. Approved Leaves Today
    const leaveTodayParams: any[] = [todayStr, todayStr];
    let leaveTodaySql = `
      SELECT COUNT(DISTINCT lr.employeeId) as c
      FROM leaverequest lr
      LEFT JOIN employee e ON lr.employeeId = e.id
      WHERE lr.status = 'APPROVED'
        AND ? >= lr.startDate AND ? <= lr.endDate
    `;
    if (options.locationId && options.locationId !== 'all') {
      leaveTodaySql += ` AND (lr.locationId = ? OR e.locationId = ?)`;
      leaveTodayParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      leaveTodaySql += ` AND e.departmentId = ?`;
      leaveTodayParams.push(options.departmentId);
    }
    if (options.employeeId) {
      leaveTodaySql += ` AND lr.employeeId = ?`;
      leaveTodayParams.push(options.employeeId);
    }
    const [leaveTodayRows]: any = await pool.query(leaveTodaySql, leaveTodayParams);
    const onLeaveToday = Number(leaveTodayRows[0]?.c || 0);

    // 6. Total login sessions created today
    const sessTodayParams: any[] = [todayStr];
    let sessTodaySql = `
      SELECT COUNT(*) as c
      FROM session s
      LEFT JOIN user u ON s.userId = u.id
      LEFT JOIN employee e ON u.employeeId = e.id
      WHERE DATE(CONVERT_TZ(s.createdAt, '+00:00', '+05:30')) = ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      sessTodaySql += ` AND (s.locationId = ? OR e.locationId = ?)`;
      sessTodayParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      sessTodaySql += ` AND e.departmentId = ?`;
      sessTodayParams.push(options.departmentId);
    }
    if (options.employeeId) {
      sessTodaySql += ` AND (e.id = ? OR u.employeeId = ?)`;
      sessTodayParams.push(options.employeeId, options.employeeId);
    }
    const [sessTodayRows]: any = await pool.query(sessTodaySql, sessTodayParams);
    const totalSessionsToday = Number(sessTodayRows[0]?.c || 0);

    // 7. Selected Period Aggregates (attendance records, login events, average attendance rate)
    const periodAttParams: any[] = [range.startDate, range.endDate];
    let periodAttSql = `
      SELECT COUNT(*) as totalRecords,
             SUM(CASE WHEN a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount,
             SUM(CASE WHEN a.status = 'LATE' OR a.lateLoginSeconds > 0 THEN 1 ELSE 0 END) as lateCount,
             SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absentCount,
             COUNT(DISTINCT a.attendanceDate) as distinctDays
      FROM attendance a
      LEFT JOIN employee e ON a.employeeId = e.id
      WHERE a.attendanceDate >= ? AND a.attendanceDate <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      periodAttSql += ` AND (a.locationId = ? OR e.locationId = ?)`;
      periodAttParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      periodAttSql += ` AND e.departmentId = ?`;
      periodAttParams.push(options.departmentId);
    }
    if (options.employeeId) {
      periodAttSql += ` AND a.employeeId = ?`;
      periodAttParams.push(options.employeeId);
    }
    const [periodAttRows]: any = await pool.query(periodAttSql, periodAttParams);
    const totalAttendanceRecords = Number(periodAttRows[0]?.totalRecords || 0);
    const periodPresentCount = Number(periodAttRows[0]?.presentCount || 0);
    const periodLateCount = Number(periodAttRows[0]?.lateCount || 0);
    const distinctDays = Math.max(1, Number(periodAttRows[0]?.distinctDays || 1));

    // Attendance rate = (present records / total scheduled or total attendance records)
    const averageAttendanceRate =
      totalAttendanceRecords > 0
        ? Number(((periodPresentCount / totalAttendanceRecords) * 100).toFixed(1))
        : 0;

    // Total login events for selected period
    const periodLoginParams: any[] = [range.startDate, range.endDate];
    let periodLoginSql = `
      SELECT COUNT(*) as totalEvents,
             SUM(CASE WHEN la.success = 1 THEN 1 ELSE 0 END) as successEvents,
             SUM(CASE WHEN la.success = 0 THEN 1 ELSE 0 END) as failedEvents,
             COUNT(DISTINCT CASE WHEN la.success = 1 THEN COALESCE(e.id, u.employeeId, u.id) ELSE NULL END) as uniqueEmployees
      FROM login_attempt la
      LEFT JOIN user u ON la.userId = u.id
      LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
      WHERE DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
        AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      periodLoginSql += ` AND (e.locationId = ? OR u.locationId = ? OR la.locationId = ?)`;
      periodLoginParams.push(options.locationId, options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      periodLoginSql += ` AND e.departmentId = ?`;
      periodLoginParams.push(options.departmentId);
    }
    if (options.employeeId) {
      periodLoginSql += ` AND (e.id = ? OR u.employeeId = ?)`;
      periodLoginParams.push(options.employeeId, options.employeeId);
    }
    const [periodLoginRows]: any = await pool.query(periodLoginSql, periodLoginParams);
    const totalLoginEvents = Number(periodLoginRows[0]?.successEvents || 0);
    const failedLoginEvents = Number(periodLoginRows[0]?.failedEvents || 0);
    const uniqueEmployeesLoggedIn = Number(periodLoginRows[0]?.uniqueEmployees || 0);

    // Period approved leaves
    const periodLeaveParams: any[] = [range.endDate, range.startDate];
    let periodLeaveSql = `
      SELECT COUNT(DISTINCT lr.employeeId) as c
      FROM leaverequest lr
      LEFT JOIN employee e ON lr.employeeId = e.id
      WHERE lr.status = 'APPROVED'
        AND lr.startDate <= ? AND lr.endDate >= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      periodLeaveSql += ` AND (lr.locationId = ? OR e.locationId = ?)`;
      periodLeaveParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      periodLeaveSql += ` AND (e.departmentId = ? OR e.departmentId IN (SELECT d2.id FROM department d2 WHERE d2.name = (SELECT d3.name FROM department d3 WHERE d3.id = ?)))`;
      periodLeaveParams.push(options.departmentId, options.departmentId);
    }
    if (options.employeeId) {
      periodLeaveSql += ` AND lr.employeeId = ?`;
      periodLeaveParams.push(options.employeeId);
    }
    const [periodLeaveRows]: any = await pool.query(periodLeaveSql, periodLeaveParams);
    const periodLeaveCount = Number(periodLeaveRows[0]?.c || 0);

    // Period auth sessions
    const periodSessParams: any[] = [range.startDate, range.endDate];
    let periodSessSql = `
      SELECT COUNT(*) as c
      FROM session s
      LEFT JOIN user u ON s.userId = u.id
      LEFT JOIN employee e ON u.employeeId = e.id
      WHERE DATE(CONVERT_TZ(s.createdAt, '+00:00', '+05:30')) >= ?
        AND DATE(CONVERT_TZ(s.createdAt, '+00:00', '+05:30')) <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      periodSessSql += ` AND (s.locationId = ? OR e.locationId = ?)`;
      periodSessParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      periodSessSql += ` AND (e.departmentId = ? OR e.departmentId IN (SELECT d2.id FROM department d2 WHERE d2.name = (SELECT d3.name FROM department d3 WHERE d3.id = ?)))`;
      periodSessParams.push(options.departmentId, options.departmentId);
    }
    if (options.employeeId) {
      periodSessSql += ` AND (e.id = ? OR u.employeeId = ?)`;
      periodSessParams.push(options.employeeId, options.employeeId);
    }
    const [periodSessRows]: any = await pool.query(periodSessSql, periodSessParams);
    const periodSessionsCount = Number(periodSessRows[0]?.c || 0);

    // 8. Previous period comparison stats
    const prevAttParams: any[] = [range.prevStartDate, range.prevEndDate];
    let prevAttSql = `
      SELECT COUNT(*) as totalRecords,
             SUM(CASE WHEN a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount
      FROM attendance a
      LEFT JOIN employee e ON a.employeeId = e.id
      WHERE a.attendanceDate >= ? AND a.attendanceDate <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      prevAttSql += ` AND (a.locationId = ? OR e.locationId = ?)`;
      prevAttParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      prevAttSql += ` AND e.departmentId = ?`;
      prevAttParams.push(options.departmentId);
    }
    if (options.employeeId) {
      prevAttSql += ` AND a.employeeId = ?`;
      prevAttParams.push(options.employeeId);
    }
    const [prevAttRows]: any = await pool.query(prevAttSql, prevAttParams);
    const prevTotalRecords = Number(prevAttRows[0]?.totalRecords || 0);
    const prevPresentCount = Number(prevAttRows[0]?.presentCount || 0);
    const prevAttendanceRate =
      prevTotalRecords > 0
        ? Number(((prevPresentCount / prevTotalRecords) * 100).toFixed(1))
        : 0;

    const prevLoginParams: any[] = [range.prevStartDate, range.prevEndDate];
    let prevLoginSql = `
      SELECT COUNT(*) as totalEvents,
             SUM(CASE WHEN la.success = 1 THEN 1 ELSE 0 END) as successEvents
      FROM login_attempt la
      LEFT JOIN user u ON la.userId = u.id
      LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
      WHERE DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
        AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      prevLoginSql += ` AND (e.locationId = ? OR u.locationId = ? OR la.locationId = ?)`;
      prevLoginParams.push(options.locationId, options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      prevLoginSql += ` AND e.departmentId = ?`;
      prevLoginParams.push(options.departmentId);
    }
    if (options.employeeId) {
      prevLoginSql += ` AND (e.id = ? OR u.employeeId = ?)`;
      prevLoginParams.push(options.employeeId, options.employeeId);
    }
    const [prevLoginRows]: any = await pool.query(prevLoginSql, prevLoginParams);
    const prevTotalLoginEvents = Number(prevLoginRows[0]?.successEvents || 0);

    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Number((((curr - prev) / prev) * 100).toFixed(1));
    };

    return {
      dateRange: {
        startDate: range.startDate,
        endDate: range.endDate,
        prevStartDate: range.prevStartDate,
        prevEndDate: range.prevEndDate,
        preset: options.preset || '30d',
      },
      counts: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        probationEmployees,
        loggedInToday,
        notLoggedInToday,
        currentlyActive,
        markedPresentToday,
        absentToday,
        lateArrivalsToday,
        onLeaveToday,
        totalSessionsToday,
        averageAttendanceRate,
        totalAttendanceRecords,
        totalLoginEvents,
        failedLoginEvents,
        uniqueEmployeesLoggedIn,
        // Range-based equivalents
        loggedInPeriod: uniqueEmployeesLoggedIn,
        notLoggedInPeriod: Math.max(0, activeEmployees - uniqueEmployeesLoggedIn),
        markedPresentPeriod: periodPresentCount,
        absentPeriod: Number(periodAttRows[0]?.absentCount || 0),
        lateArrivalsPeriod: periodLateCount,
        onLeavePeriod: periodLeaveCount,
        totalSessionsPeriod: periodSessionsCount,
      },
      comparison: {
        attendanceRateChange: Number((averageAttendanceRate - prevAttendanceRate).toFixed(1)),
        loginEventsChange: calcChange(totalLoginEvents, prevTotalLoginEvents),
        prevTotalLoginEvents,
        prevAttendanceRate,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 2. Daily Timeline for Main Graph & Connected Dot Trends
   */
  public static async getTimeline(options: AnalysisFilterOptions) {
    const range = resolveDateRange(options);

    // 1. Get daily attendance aggregates
    const attParams: any[] = [range.startDate, range.endDate];
    let attSql = `
      SELECT DATE_FORMAT(a.attendanceDate, '%Y-%m-%d') as dateStr,
             COUNT(*) as totalRecords,
             SUM(CASE WHEN a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount,
             SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absentCount,
             SUM(CASE WHEN a.status = 'LATE' OR a.lateLoginSeconds > 0 THEN 1 ELSE 0 END) as lateCount,
             AVG(CASE WHEN a.lateLoginSeconds > 0 THEN a.lateLoginSeconds / 60 ELSE NULL END) as avgLateMinutes
      FROM attendance a
      LEFT JOIN employee e ON a.employeeId = e.id
      WHERE a.attendanceDate >= ? AND a.attendanceDate <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      attSql += ` AND (a.locationId = ? OR e.locationId = ?)`;
      attParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      attSql += ` AND e.departmentId = ?`;
      attParams.push(options.departmentId);
    }
    if (options.employeeId) {
      attSql += ` AND a.employeeId = ?`;
      attParams.push(options.employeeId);
    }
    attSql += ` GROUP BY a.attendanceDate ORDER BY a.attendanceDate ASC`;
    const [attRows]: any = await pool.query(attSql, attParams);

    const attMap = new Map<string, any>();
    for (const r of attRows) {
      attMap.set(r.dateStr, {
        totalRecords: Number(r.totalRecords),
        presentCount: Number(r.presentCount),
        absentCount: Number(r.absentCount),
        lateCount: Number(r.lateCount),
        avgLateMinutes: r.avgLateMinutes !== null ? Number(Number(r.avgLateMinutes).toFixed(1)) : null,
      });
    }

    // 2. Get daily login attempts aggregates
    const loginParams: any[] = [range.startDate, range.endDate];
    let loginSql = `
      SELECT DATE_FORMAT(CONVERT_TZ(la.createdAt, '+00:00', '+05:30'), '%Y-%m-%d') as dateStr,
             COUNT(*) as totalAttempts,
             SUM(CASE WHEN la.success = 1 THEN 1 ELSE 0 END) as successfulLogins,
             SUM(CASE WHEN la.success = 0 THEN 1 ELSE 0 END) as failedLogins,
             COUNT(DISTINCT CASE WHEN la.success = 1 THEN COALESCE(e.id, u.employeeId, u.id) ELSE NULL END) as uniqueEmployees
      FROM login_attempt la
      LEFT JOIN user u ON la.userId = u.id
      LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
      WHERE DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
        AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      loginSql += ` AND (e.locationId = ? OR u.locationId = ? OR la.locationId = ?)`;
      loginParams.push(options.locationId, options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      loginSql += ` AND e.departmentId = ?`;
      loginParams.push(options.departmentId);
    }
    if (options.employeeId) {
      loginSql += ` AND (e.id = ? OR u.employeeId = ?)`;
      loginParams.push(options.employeeId, options.employeeId);
    }
    loginSql += ` GROUP BY dateStr ORDER BY dateStr ASC`;
    const [loginRows]: any = await pool.query(loginSql, loginParams);

    const loginMap = new Map<string, any>();
    for (const r of loginRows) {
      loginMap.set(r.dateStr, {
        totalAttempts: Number(r.totalAttempts),
        successfulLogins: Number(r.successfulLogins),
        failedLogins: Number(r.failedLogins),
        uniqueEmployees: Number(r.uniqueEmployees),
      });
    }

    // 3. Get daily approved leave records
    const leaveParams: any[] = [range.startDate, range.endDate];
    let leaveSql = `
      SELECT lr.startDate, lr.endDate, lr.employeeId
      FROM leaverequest lr
      LEFT JOIN employee e ON lr.employeeId = e.id
      WHERE lr.status = 'APPROVED'
        AND lr.endDate >= ? AND lr.startDate <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      leaveSql += ` AND (lr.locationId = ? OR e.locationId = ?)`;
      leaveParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      leaveSql += ` AND e.departmentId = ?`;
      leaveParams.push(options.departmentId);
    }
    if (options.employeeId) {
      leaveSql += ` AND lr.employeeId = ?`;
      leaveParams.push(options.employeeId);
    }
    const [leaveRows]: any = await pool.query(leaveSql, leaveParams);

    if (range.startDate === range.endDate) {
      // 1-day hourly timeline (24 continuous points for rich connected-dot trend line)
      const hourlyAttParams: any[] = [range.startDate];
      let hourlyAttSql = `
        SELECT HOUR(CONVERT_TZ(a.actualLogin, '+00:00', '+05:30')) as hourNum,
               COUNT(*) as totalPunches,
               SUM(CASE WHEN a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount,
               SUM(CASE WHEN a.status = 'LATE' OR a.lateLoginSeconds > 0 THEN 1 ELSE 0 END) as lateCount,
               AVG(CASE WHEN a.lateLoginSeconds > 0 THEN a.lateLoginSeconds / 60 ELSE NULL END) as avgLateMinutes
        FROM attendance a
        LEFT JOIN employee e ON a.employeeId = e.id
        WHERE a.attendanceDate = ? AND a.actualLogin IS NOT NULL
      `;
      if (options.locationId && options.locationId !== 'all') {
        hourlyAttSql += ` AND (a.locationId = ? OR e.locationId = ?)`;
        hourlyAttParams.push(options.locationId, options.locationId);
      }
      if (options.departmentId && options.departmentId !== 'all') {
        hourlyAttSql += ` AND e.departmentId = ?`;
        hourlyAttParams.push(options.departmentId);
      }
      if (options.employeeId) {
        hourlyAttSql += ` AND a.employeeId = ?`;
        hourlyAttParams.push(options.employeeId);
      }
      hourlyAttSql += ` GROUP BY hourNum ORDER BY hourNum ASC`;
      const [hourlyAttRows]: any = await pool.query(hourlyAttSql, hourlyAttParams);

      const hourlyAttMap = new Map<number, any>();
      for (const r of hourlyAttRows) {
        hourlyAttMap.set(Number(r.hourNum), {
          presentCount: Number(r.presentCount || 0),
          lateCount: Number(r.lateCount || 0),
          avgLateMinutes: r.avgLateMinutes !== null ? Number(Number(r.avgLateMinutes).toFixed(1)) : null,
        });
      }

      const hourlyLogParams: any[] = [range.startDate];
      let hourlyLogSql = `
        SELECT HOUR(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) as hourNum,
               COUNT(*) as totalAttempts,
               SUM(CASE WHEN la.success = 1 THEN 1 ELSE 0 END) as successfulLogins,
               SUM(CASE WHEN la.success = 0 THEN 1 ELSE 0 END) as failedLogins,
               COUNT(DISTINCT CASE WHEN la.success = 1 THEN COALESCE(e.id, u.employeeId, u.id) ELSE NULL END) as uniqueEmployees
        FROM login_attempt la
        LEFT JOIN user u ON la.userId = u.id
        LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
        WHERE DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) = ?
      `;
      if (options.locationId && options.locationId !== 'all') {
        hourlyLogSql += ` AND (e.locationId = ? OR u.locationId = ? OR la.locationId = ?)`;
        hourlyLogParams.push(options.locationId, options.locationId, options.locationId);
      }
      if (options.departmentId && options.departmentId !== 'all') {
        hourlyLogSql += ` AND e.departmentId = ?`;
        hourlyLogParams.push(options.departmentId);
      }
      if (options.employeeId) {
        hourlyLogSql += ` AND (e.id = ? OR u.employeeId = ?)`;
        hourlyLogParams.push(options.employeeId, options.employeeId);
      }
      hourlyLogSql += ` GROUP BY hourNum ORDER BY hourNum ASC`;
      const [hourlyLogRows]: any = await pool.query(hourlyLogSql, hourlyLogParams);

      const hourlyLogMap = new Map<number, any>();
      for (const r of hourlyLogRows) {
        hourlyLogMap.set(Number(r.hourNum), {
          successfulLogins: Number(r.successfulLogins || 0),
          failedLogins: Number(r.failedLogins || 0),
          uniqueEmployees: Number(r.uniqueEmployees || 0),
        });
      }

      let leaveCount = 0;
      for (const lr of leaveRows) {
        const s = new Date(lr.startDate).toISOString().slice(0, 10);
        const e = new Date(lr.endDate).toISOString().slice(0, 10);
        if (range.startDate >= s && range.startDate <= e) {
          leaveCount++;
        }
      }

      const dayAtt = attMap.get(range.startDate);
      const dayTotalAtt = dayAtt?.totalRecords || 0;
      const dayPresent = dayAtt?.presentCount || 0;
      const dayRate = dayTotalAtt > 0 ? Number(((dayPresent / dayTotalAtt) * 100).toFixed(1)) : null;

      const hourlyPoints: any[] = [];
      let cumulativePresent = 0;

      for (let h = 0; h < 24; h++) {
        const hAtt = hourlyAttMap.get(h);
        const hLog = hourlyLogMap.get(h);
        const hourStr = `${String(h).padStart(2, '0')}:00`;
        if (hAtt) {
          cumulativePresent += hAtt.presentCount;
        }

        const hourlyAttRate =
          dayTotalAtt > 0 && cumulativePresent > 0
            ? Number(Math.min(100, (cumulativePresent / dayTotalAtt) * 100).toFixed(1))
            : hLog?.successfulLogins
            ? dayRate
            : null;

        hourlyPoints.push({
          date: `${range.startDate} ${hourStr}`,
          label: hourStr,
          uniqueLogins: hLog ? hLog.uniqueEmployees : 0,
          successfulLogins: hLog ? hLog.successfulLogins : 0,
          failedLogins: hLog ? hLog.failedLogins : 0,
          presentCount: hAtt ? hAtt.presentCount : 0,
          absentCount: 0,
          lateCount: hAtt ? hAtt.lateCount : 0,
          leaveCount,
          attendanceRate: hourlyAttRate,
          avgLateMinutes: hAtt?.avgLateMinutes ?? null,
          hasData: Boolean(hAtt || hLog),
        });
      }

      return {
        dateRange: range,
        points: hourlyPoints,
      };
    }

    // Build day-by-day continuous chronology for multi-day range
    const points: any[] = [];
    const cur = new Date(`${range.startDate}T00:00:00Z`);
    const end = new Date(`${range.endDate}T00:00:00Z`);

    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10);
      const att = attMap.get(dateStr);
      const log = loginMap.get(dateStr);

      // Check leave count for this date
      let leaveCount = 0;
      for (const lr of leaveRows) {
        const s = new Date(lr.startDate).toISOString().slice(0, 10);
        const e = new Date(lr.endDate).toISOString().slice(0, 10);
        if (dateStr >= s && dateStr <= e) {
          leaveCount++;
        }
      }

      // Calculate attendance rate
      const totalAtt = att?.totalRecords || 0;
      const present = att?.presentCount || 0;
      const attRate = totalAtt > 0 ? Number(((present / totalAtt) * 100).toFixed(1)) : null;

      // Format clean readable date label (e.g., '12 Oct')
      const dateObj = new Date(`${dateStr}T12:00:00Z`);
      const label = dateObj.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      });

      points.push({
        date: dateStr,
        label,
        uniqueLogins: log ? log.uniqueEmployees : 0,
        successfulLogins: log ? log.successfulLogins : 0,
        failedLogins: log ? log.failedLogins : 0,
        presentCount: att ? att.presentCount : 0,
        absentCount: att ? att.absentCount : 0,
        lateCount: att ? att.lateCount : 0,
        leaveCount,
        attendanceRate: attRate,
        avgLateMinutes: att?.avgLateMinutes ?? null,
        hasData: Boolean(att || log),
      });

      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return {
      dateRange: range,
      points,
    };
  }

  /**
   * 3. Hourly Login Distribution (00:00 to 23:00)
   */
  public static async getHourlyDistribution(options: AnalysisFilterOptions) {
    const range = resolveDateRange(options);

    const params: any[] = [range.startDate, range.endDate];
    let sql = `
      SELECT HOUR(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) as hourNum,
             COUNT(*) as totalLogins,
             SUM(CASE WHEN la.success = 1 THEN 1 ELSE 0 END) as successfulLogins,
             SUM(CASE WHEN la.success = 0 THEN 1 ELSE 0 END) as failedLogins,
             COUNT(DISTINCT CASE WHEN la.success = 1 THEN COALESCE(e.id, u.employeeId, u.id) ELSE NULL END) as uniqueEmployees
      FROM login_attempt la
      LEFT JOIN user u ON la.userId = u.id
      LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
      WHERE DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
        AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      sql += ` AND (e.locationId = ? OR u.locationId = ? OR la.locationId = ?)`;
      params.push(options.locationId, options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      sql += ` AND e.departmentId = ?`;
      params.push(options.departmentId);
    }
    if (options.employeeId) {
      sql += ` AND (e.id = ? OR u.employeeId = ?)`;
      params.push(options.employeeId, options.employeeId);
    }
    sql += ` GROUP BY hourNum ORDER BY hourNum ASC`;
    const [rows]: any = await pool.query(sql, params);

    const map = new Map<number, any>();
    for (const r of rows) {
      map.set(Number(r.hourNum), {
        total: Number(r.totalLogins),
        successful: Number(r.successfulLogins),
        failed: Number(r.failedLogins),
        unique: Number(r.uniqueEmployees),
      });
    }

    let maxVal = -1;
    let peakHour = 0;
    let minVal = Infinity;
    let lowestHour = 0;

    const hourlyData: any[] = [];
    for (let h = 0; h < 24; h++) {
      const data = map.get(h) || { total: 0, successful: 0, failed: 0, unique: 0 };
      const label = `${String(h).padStart(2, '0')}:00`;

      if (data.successful > maxVal) {
        maxVal = data.successful;
        peakHour = h;
      }
      if (data.successful < minVal) {
        minVal = data.successful;
        lowestHour = h;
      }

      hourlyData.push({
        hour: h,
        hourLabel: label,
        successfulLogins: data.successful,
        failedLogins: data.failed,
        uniqueEmployees: data.unique,
      });
    }

    return {
      dateRange: range,
      hourlyData,
      peakPeriod: {
        hour: peakHour,
        label: `${String(peakHour).padStart(2, '0')}:00 - ${String((peakHour + 1) % 24).padStart(2, '0')}:00`,
        count: maxVal >= 0 ? maxVal : 0,
      },
      lowestPeriod: {
        hour: lowestHour,
        label: `${String(lowestHour).padStart(2, '0')}:00 - ${String((lowestHour + 1) % 24).padStart(2, '0')}:00`,
        count: minVal !== Infinity ? minVal : 0,
      },
    };
  }

  /**
   * 4. Location-Wise Employee Analysis (BEL, DAV, SHI, HUB)
   */
  public static async getLocationAnalysis(options: AnalysisFilterOptions) {
    const range = resolveDateRange(options);
    const todayStr = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

    // Get all locations or scoped location
    let locSql = `SELECT id, code, name, city, state FROM location WHERE status = 'ACTIVE'`;
    const locParams: any[] = [];
    if (options.locationId && options.locationId !== 'all') {
      locSql += ` AND (id = ? OR code = ?)`;
      locParams.push(options.locationId, options.locationId);
    }
    locSql += ` ORDER BY code ASC`;
    const [locations]: any = await pool.query(locSql, locParams);

    const results: any[] = [];

    for (const loc of locations) {
      // 1. Employee counts
      const [empRes]: any = await pool.query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active
         FROM employee WHERE locationId = ?`,
        [loc.id]
      );
      const totalEmployees = Number(empRes[0]?.total || 0);
      const activeEmployees = Number(empRes[0]?.active || 0);

      // 2. Logged in today
      const [loginTodayRes]: any = await pool.query(
        `SELECT COUNT(DISTINCT COALESCE(e.id, u.employeeId, u.id)) as c
         FROM login_attempt la
         LEFT JOIN user u ON la.userId = u.id
         LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
         WHERE la.success = 1
           AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) = ?
           AND (e.locationId = ? OR u.locationId = ? OR la.locationId = ?)`,
        [todayStr, loc.id, loc.id, loc.id]
      );
      const loggedInToday = Number(loginTodayRes[0]?.c || 0);

      // 3. Marked present today
      const [attTodayRes]: any = await pool.query(
        `SELECT SUM(CASE WHEN a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount,
                SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absentCount,
                SUM(CASE WHEN a.status = 'LATE' OR a.lateLoginSeconds > 0 THEN 1 ELSE 0 END) as lateCount
         FROM attendance a
         WHERE a.locationId = ? AND a.attendanceDate = ?`,
        [loc.id, todayStr]
      );
      const markedPresent = Number(attTodayRes[0]?.presentCount || 0);
      const absentToday = Number(attTodayRes[0]?.absentCount || 0);
      const lateToday = Number(attTodayRes[0]?.lateCount || 0);

      // 4. Period attendance rate
      const [periodAttRes]: any = await pool.query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (actualLogin IS NOT NULL AND status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount
         FROM attendance
         WHERE locationId = ? AND attendanceDate >= ? AND attendanceDate <= ?`,
        [loc.id, range.startDate, range.endDate]
      );
      const periodTotal = Number(periodAttRes[0]?.total || 0);
      const periodPresent = Number(periodAttRes[0]?.presentCount || 0);
      const attendanceRate =
        periodTotal > 0 ? Number(((periodPresent / periodTotal) * 100).toFixed(1)) : 0;

      // 5. Period login attempts
      const [periodLoginRes]: any = await pool.query(
        `SELECT COUNT(*) as c
         FROM login_attempt la
         LEFT JOIN user u ON la.userId = u.id
         LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
         WHERE la.success = 1
           AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
           AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?
           AND (e.locationId = ? OR u.locationId = ? OR la.locationId = ?)`,
        [range.startDate, range.endDate, loc.id, loc.id, loc.id]
      );
      const totalLoginsPeriod = Number(periodLoginRes[0]?.c || 0);

      results.push({
        id: loc.id,
        code: loc.code,
        name: loc.name,
        city: loc.city,
        state: loc.state,
        totalEmployees,
        activeEmployees,
        loggedInToday,
        markedPresent,
        absentToday,
        lateToday,
        attendanceRate,
        totalLoginsPeriod,
      });
    }

    return {
      dateRange: range,
      locations: results,
    };
  }

  /**
   * 5. Employee-Wise Activity Graph & Detailed History
   */
  public static async getEmployeeActivity(employeeId: string, options: AnalysisFilterOptions) {
    const range = resolveDateRange(options);

    // 1. Employee profile details
    const [empRows]: any = await pool.query(
      `SELECT e.id, e.employeeCode, e.firstName, e.lastName, e.fullName, e.email, e.phone,
              e.designation, e.role, e.joiningDate as hireDate, e.joiningDate, e.status, e.locationId, e.departmentId, e.shiftId,
              loc.name as locationName, loc.code as locationCode,
              dept.name as departmentName,
              sh.name as shiftName, sh.startTime, sh.endTime
       FROM employee e
       LEFT JOIN location loc ON e.locationId = loc.id
       LEFT JOIN department dept ON e.departmentId = dept.id
       LEFT JOIN shift sh ON e.shiftId = sh.id
       WHERE e.id = ?`,
      [employeeId]
    );

    if (!empRows.length) {
      return null;
    }
    const employee = empRows[0];

    // For single-day filters (e.g. today), anchor trend chronology to trailing 7 days
    // so the individual telemetry line chart always displays a continuous connected-dot curve
    const pointsStartDate =
      range.startDate === range.endDate
        ? new Date(new Date(`${range.endDate}T00:00:00Z`).getTime() - 6 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        : range.startDate;

    // 2. Attendance history for date range
    const [attRows]: any = await pool.query(
      `SELECT a.id, DATE_FORMAT(a.attendanceDate, '%Y-%m-%d') as dateStr,
              a.status, a.actualLogin, a.actualLogout, a.scheduledLogin, a.scheduledLogout,
              a.earlyLoginSeconds, a.lateLoginSeconds, a.totalWorkingSeconds, a.notes,
              a.faceVerified
       FROM attendance a
       WHERE a.employeeId = ? AND a.attendanceDate >= ? AND a.attendanceDate <= ?
       ORDER BY a.attendanceDate ASC`,
      [employeeId, pointsStartDate, range.endDate]
    );
    const attMap = new Map<string, any>();
    for (const r of attRows) {
      attMap.set(r.dateStr, r);
    }

    // 3. Login attempts for date range
    const [loginRows]: any = await pool.query(
      `SELECT DATE_FORMAT(CONVERT_TZ(la.createdAt, '+00:00', '+05:30'), '%Y-%m-%d') as dateStr,
              COUNT(*) as totalLogins,
              SUM(CASE WHEN la.success = 1 THEN 1 ELSE 0 END) as successfulLogins,
              SUM(CASE WHEN la.success = 0 THEN 1 ELSE 0 END) as failedLogins
       FROM login_attempt la
       LEFT JOIN user u ON la.userId = u.id
       WHERE (u.employeeId = ? OR la.email = ?)
         AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
         AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?
       GROUP BY dateStr ORDER BY dateStr ASC`,
      [employeeId, employee.email || '', pointsStartDate, range.endDate]
    );
    const loginMap = new Map<string, any>();
    for (const r of loginRows) {
      loginMap.set(r.dateStr, r);
    }

    // 4. Approved leave records for date range
    const [leaveRows]: any = await pool.query(
      `SELECT id, leaveType, startDate, endDate, days, reason, status
       FROM leaverequest
       WHERE employeeId = ? AND status = 'APPROVED'
         AND endDate >= ? AND startDate <= ?`,
      [employeeId, pointsStartDate, range.endDate]
    );

    // Build continuous points
    const points: any[] = [];
    const cur = new Date(`${pointsStartDate}T00:00:00Z`);
    const end = new Date(`${range.endDate}T00:00:00Z`);

    let totalPresentDays = 0;
    let totalLateDays = 0;
    let totalWorkingHours = 0;
    let totalSuccessfulLogins = 0;
    let totalFailedLogins = 0;

    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10);
      const att = attMap.get(dateStr);
      const log = loginMap.get(dateStr);

      let onLeave = false;
      let leaveType: string | null = null;
      for (const lr of leaveRows) {
        const s = new Date(lr.startDate).toISOString().slice(0, 10);
        const e = new Date(lr.endDate).toISOString().slice(0, 10);
        if (dateStr >= s && dateStr <= e) {
          onLeave = true;
          leaveType = lr.leaveType;
          break;
        }
      }

      const isPresent = att && (['PRESENT', 'FACE_VERIFIED', 'OVERTIME'].includes(att.status) || att.actualLogin);
      const isLate = att && (att.status === 'LATE' || Number(att.lateLoginSeconds) > 0);
      const lateMinutes = isLate ? Math.round(Number(att.lateLoginSeconds) / 60) : 0;
      const hoursWorked = att && att.totalWorkingSeconds ? Number((Number(att.totalWorkingSeconds) / 3600).toFixed(1)) : 0;
      const successLogins = log ? Number(log.successfulLogins) : 0;
      const failLogins = log ? Number(log.failedLogins) : 0;

      if (isPresent) totalPresentDays++;
      if (isLate) totalLateDays++;
      totalWorkingHours += hoursWorked;
      totalSuccessfulLogins += successLogins;
      totalFailedLogins += failLogins;

      const dateObj = new Date(`${dateStr}T12:00:00Z`);
      const label = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

      points.push({
        date: dateStr,
        label,
        isPresent: Boolean(isPresent),
        status: onLeave ? 'ON_LEAVE' : (att ? att.status : 'NO_RECORD'),
        leaveType,
        onLeave,
        lateMinutes,
        hoursWorked,
        successfulLogins: successLogins,
        failedLogins: failLogins,
        actualLogin: att?.actualLogin || null,
        actualLogout: att?.actualLogout || null,
        hasActivity: Boolean(att || log || onLeave),
      });

      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return {
      employee,
      dateRange: range,
      summary: {
        totalPresentDays,
        totalLateDays,
        totalWorkingHours: Number(totalWorkingHours.toFixed(1)),
        avgDailyHours: totalPresentDays > 0 ? Number((totalWorkingHours / totalPresentDays).toFixed(1)) : 0,
        totalSuccessfulLogins,
        totalFailedLogins,
        approvedLeaveDays: leaveRows.reduce((acc: number, cur: any) => acc + Number(cur.days || 0), 0),
      },
      points,
    };
  }

  /**
   * 6. Late Arrival & Punctuality Trends and Repeated Late Arrivals
   */
  public static async getPunctualityAnalysis(options: AnalysisFilterOptions) {
    const range = resolveDateRange(options);

    // 1. Daily late trends
    const dailyParams: any[] = [range.startDate, range.endDate];
    let dailySql = `
      SELECT DATE_FORMAT(a.attendanceDate, '%Y-%m-%d') as dateStr,
             COUNT(*) as totalRecords,
             SUM(CASE WHEN a.status = 'LATE' OR a.lateLoginSeconds > 0 THEN 1 ELSE 0 END) as lateCount,
             AVG(CASE WHEN a.lateLoginSeconds > 0 THEN a.lateLoginSeconds / 60 ELSE NULL END) as avgLateMinutes
      FROM attendance a
      LEFT JOIN employee e ON a.employeeId = e.id
      WHERE a.attendanceDate >= ? AND a.attendanceDate <= ?
    `;
    if (options.locationId && options.locationId !== 'all') {
      dailySql += ` AND (a.locationId = ? OR e.locationId = ?)`;
      dailyParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      dailySql += ` AND e.departmentId = ?`;
      dailyParams.push(options.departmentId);
    }
    if (options.employeeId) {
      dailySql += ` AND a.employeeId = ?`;
      dailyParams.push(options.employeeId);
    }
    dailySql += ` GROUP BY a.attendanceDate ORDER BY a.attendanceDate ASC`;
    const [dailyRows]: any = await pool.query(dailySql, dailyParams);

    const trend = dailyRows.map((r: any) => {
      const total = Number(r.totalRecords || 0);
      const late = Number(r.lateCount || 0);
      const pct = total > 0 ? Number(((late / total) * 100).toFixed(1)) : 0;
      const dateObj = new Date(`${r.dateStr}T12:00:00Z`);
      return {
        date: r.dateStr,
        label: dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        lateCount: late,
        totalRecords: total,
        latePercentage: pct,
        avgLateMinutes: r.avgLateMinutes ? Number(Number(r.avgLateMinutes).toFixed(1)) : 0,
      };
    });

    // 2. Employees with repeated late arrivals
    const offenderParams: any[] = [range.startDate, range.endDate];
    let offenderSql = `
      SELECT e.id as employeeId, e.fullName, e.employeeCode, e.designation,
             loc.name as locationName, loc.code as locationCode,
             dept.name as departmentName,
             COUNT(*) as lateArrivals,
             SUM(a.lateLoginSeconds / 60) as totalLateMinutes,
             AVG(a.lateLoginSeconds / 60) as avgLateMinutes,
             MAX(a.attendanceDate) as lastLateDate
      FROM attendance a
      INNER JOIN employee e ON a.employeeId = e.id
      LEFT JOIN location loc ON e.locationId = loc.id
      LEFT JOIN department dept ON e.departmentId = dept.id
      WHERE a.attendanceDate >= ? AND a.attendanceDate <= ?
        AND (a.status = 'LATE' OR a.lateLoginSeconds > 0)
    `;
    if (options.locationId && options.locationId !== 'all') {
      offenderSql += ` AND (a.locationId = ? OR e.locationId = ?)`;
      offenderParams.push(options.locationId, options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      offenderSql += ` AND e.departmentId = ?`;
      offenderParams.push(options.departmentId);
    }
    offenderSql += `
      GROUP BY e.id, e.fullName, e.employeeCode, e.designation, loc.name, loc.code, dept.name
      ORDER BY lateArrivals DESC, totalLateMinutes DESC
      LIMIT 20
    `;
    const [offenderRows]: any = await pool.query(offenderSql, offenderParams);

    const repeatOffenders = offenderRows.map((r: any) => ({
      employeeId: r.employeeId,
      fullName: r.fullName,
      employeeCode: r.employeeCode,
      designation: r.designation || '—',
      locationName: r.locationName || '—',
      locationCode: r.locationCode || '—',
      departmentName: r.departmentName || '—',
      lateArrivals: Number(r.lateArrivals),
      totalLateMinutes: Math.round(Number(r.totalLateMinutes)),
      avgLateMinutes: Math.round(Number(r.avgLateMinutes)),
      lastLateDate: r.lastLateDate ? new Date(r.lastLateDate).toISOString().slice(0, 10) : null,
    }));

    return {
      dateRange: range,
      trend,
      repeatOffenders,
    };
  }

  /**
   * 7. Long-Term HR History & Tenure (Hiring trends, status distribution)
   */
  public static async getLongTermHistory(options: AnalysisFilterOptions) {
    const params: any[] = [];
    let sql = `
      SELECT DATE_FORMAT(e.joiningDate, '%Y-%m') as yearMonth,
             COUNT(*) as hireCount
      FROM employee e
      WHERE e.joiningDate IS NOT NULL
    `;
    if (options.locationId && options.locationId !== 'all') {
      sql += ` AND e.locationId = ?`;
      params.push(options.locationId);
    }
    if (options.departmentId && options.departmentId !== 'all') {
      sql += ` AND e.departmentId = ?`;
      params.push(options.departmentId);
    }
    sql += ` GROUP BY yearMonth ORDER BY yearMonth ASC`;
    const [hireRows]: any = await pool.query(sql, params);

    // Cumulative hires
    let cum = 0;
    const joiningTrend = hireRows.map((r: any) => {
      cum += Number(r.hireCount);
      return {
        month: r.yearMonth,
        hired: Number(r.hireCount),
        cumulativeTotal: cum,
      };
    });

    // Department breakdown
    const deptParams: any[] = [];
    let deptSql = `
      SELECT COALESCE(d.name, 'Unassigned') as deptName, COUNT(e.id) as count
      FROM employee e
      LEFT JOIN department d ON e.departmentId = d.id
      WHERE 1=1
    `;
    if (options.locationId && options.locationId !== 'all') {
      deptSql += ` AND e.locationId = ?`;
      deptParams.push(options.locationId);
    }
    deptSql += ` GROUP BY deptName ORDER BY count DESC`;
    const [deptRows]: any = await pool.query(deptSql, deptParams);

    // Status breakdown
    const statusParams: any[] = [];
    let statusSql = `SELECT status, COUNT(*) as count FROM employee e WHERE 1=1`;
    if (options.locationId && options.locationId !== 'all') {
      statusSql += ` AND e.locationId = ?`;
      statusParams.push(options.locationId);
    }
    statusSql += ` GROUP BY status`;
    const [statusRows]: any = await pool.query(statusSql, statusParams);

    return {
      joiningTrend,
      departmentBreakdown: deptRows.map((r: any) => ({ name: r.deptName, count: Number(r.count) })),
      statusBreakdown: statusRows.map((r: any) => ({ status: r.status, count: Number(r.count) })),
    };
  }

  /**
   * 8. Drill-Down Filtered Employee and Telemetry List for all 14 KPI Cards
   * Supports clicking cards, dots, or status filters with pagination and full details
   */
  public static async getDrillDown(params: {
    category?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    preset?: string;
    locationId?: string;
    departmentId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const todayStr = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    let targetStartDate = todayStr;
    let targetEndDate = todayStr;

    if (params.date) {
      targetStartDate = params.date.slice(0, 10);
      targetEndDate = params.date.slice(0, 10);
    } else {
      const range = resolveDateRange({
        preset: params.preset || '30d',
        startDate: params.startDate,
        endDate: params.endDate,
      });
      targetStartDate = range.startDate;
      targetEndDate = range.endDate;
    }

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const offset = (page - 1) * limit;

    const maskIp = (ip?: string | null): string => {
      if (!ip) return '—';
      if (ip === '127.0.0.1' || ip === '::1') return '127.0.***.***';
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.***.***`;
      }
      return ip.slice(0, Math.min(6, ip.length)) + '***';
    };

    const parseDevice = (ua?: string | null): string => {
      if (!ua) return 'Desktop / Browser';
      const u = ua.toLowerCase();
      if (u.includes('mobile') || u.includes('android') || u.includes('iphone')) return 'Mobile Web';
      if (u.includes('tablet') || u.includes('ipad')) return 'Tablet Web';
      if (u.includes('electron')) return 'Desktop Client';
      if (u.includes('chrome')) return 'Chrome / Desktop';
      if (u.includes('firefox')) return 'Firefox / Desktop';
      if (u.includes('safari')) return 'Safari / Desktop';
      return 'Web Browser';
    };

    const formatDate = (d: any): string | null => {
      if (!d) return null;
      try {
        return new Date(d).toISOString().slice(0, 10);
      } catch {
        return String(d);
      }
    };

    const formatTime = (d: any): string | null => {
      if (!d) return null;
      try {
        return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
      } catch {
        return String(d);
      }
    };

    const category = params.category || 'all';

    // Helper to build standard employee filter clauses
    const buildEmpWhere = (eAlias = 'e') => {
      const clauses: string[] = ['1=1'];
      const p: any[] = [];
      if (params.locationId && params.locationId !== 'all') {
        clauses.push(`${eAlias}.locationId = ?`);
        p.push(params.locationId);
      }
      if (params.departmentId && params.departmentId !== 'all') {
        clauses.push(`(${eAlias}.departmentId = ? OR ${eAlias}.departmentId IN (SELECT d2.id FROM department d2 WHERE d2.name = (SELECT d3.name FROM department d3 WHERE d3.id = ?)))`);
        p.push(params.departmentId, params.departmentId);
      }
      if (params.status && params.status !== 'ALL') {
        clauses.push(`${eAlias}.status = ?`);
        p.push(params.status);
      }
      if (params.search) {
        clauses.push(`(${eAlias}.fullName LIKE ? OR ${eAlias}.employeeCode LIKE ? OR ${eAlias}.email LIKE ? OR ${eAlias}.designation LIKE ?)`);
        const term = `%${params.search}%`;
        p.push(term, term, term, term);
      }
      return { sql: clauses.join(' AND '), params: p };
    };

    // 1. ATTENDANCE RATE BREAKDOWN
    if (category === 'attendance_rate') {
      const scope = buildEmpWhere('e');
      const rateSql = `
        SELECT loc.name as hubName, loc.code as hubCode, dept.name as departmentName,
               COUNT(a.id) as totalRecords,
               SUM(CASE WHEN a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount
        FROM attendance a
        INNER JOIN employee e ON a.employeeId = e.id
        LEFT JOIN location loc ON e.locationId = loc.id
        LEFT JOIN department dept ON e.departmentId = dept.id
        WHERE a.attendanceDate >= ? AND a.attendanceDate <= ?
          AND ${scope.sql}
        GROUP BY loc.id, loc.name, loc.code, dept.id, dept.name
        ORDER BY loc.name ASC, dept.name ASC
      `;
      const [rateRows]: any = await pool.query(rateSql, [targetStartDate, targetEndDate, ...scope.params]);
      
      let overallPresent = 0;
      let overallRecorded = 0;
      const formattedRows = rateRows.map((r: any) => {
        const recorded = Number(r.totalRecords || 0);
        const present = Number(r.presentCount || 0);
        overallRecorded += recorded;
        overallPresent += present;
        const rate = recorded > 0 ? Number(((present / recorded) * 100).toFixed(1)) : 0;
        return {
          id: `${r.hubCode}-${r.departmentName}`,
          hub: `${r.hubName || 'Store'} (${r.hubCode || 'HUB'})`,
          department: r.departmentName || 'General',
          present,
          recorded,
          rate: `${rate}%`,
        };
      });

      const overallRate = overallRecorded > 0 ? Number(((overallPresent / overallRecorded) * 100).toFixed(1)) : 0;
      const pagedRows = formattedRows.slice(offset, offset + limit);

      return {
        total: formattedRows.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(formattedRows.length / limit)),
        category,
        targetDate: params.date || targetStartDate,
        startDate: targetStartDate,
        endDate: targetEndDate,
        summary: {
          numerator: overallPresent,
          denominator: overallRecorded,
          rate: `${overallRate}%`,
        },
        breakdowns: {},
        rows: pagedRows,
      };
    }

    // 2. SESSIONS (All Auth Sessions Opened in Range)
    if (category === 'sessions' || category === 'sessions_today' || category === 'total-sessions') {
      const scopeParams: any[] = [targetStartDate, targetEndDate];
      let sessWhere = `DATE(CONVERT_TZ(s.createdAt, '+00:00', '+05:30')) >= ? AND DATE(CONVERT_TZ(s.createdAt, '+00:00', '+05:30')) <= ?`;
      if (params.locationId && params.locationId !== 'all') {
        sessWhere += ` AND (s.locationId = ? OR e.locationId = ?)`;
        scopeParams.push(params.locationId, params.locationId);
      }
      if (params.departmentId && params.departmentId !== 'all') {
        sessWhere += ` AND (e.departmentId = ? OR e.departmentId IN (SELECT d2.id FROM department d2 WHERE d2.name = (SELECT d3.name FROM department d3 WHERE d3.id = ?)))`;
        scopeParams.push(params.departmentId, params.departmentId);
      }
      if (params.search) {
        sessWhere += ` AND (e.fullName LIKE ? OR e.employeeCode LIKE ? OR u.email LIKE ? OR s.id LIKE ?)`;
        const term = `%${params.search}%`;
        scopeParams.push(term, term, term, term);
      }

      const countSql = `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN s.revoked = 0 AND s.expiresAt > NOW() THEN 1 ELSE 0 END) as activeSessions,
               SUM(CASE WHEN s.revoked = 1 THEN 1 ELSE 0 END) as revokedSessions,
               SUM(CASE WHEN s.revoked = 0 AND s.expiresAt <= NOW() THEN 1 ELSE 0 END) as expiredSessions
        FROM session s
        LEFT JOIN user u ON s.userId = u.id
        LEFT JOIN employee e ON u.employeeId = e.id
        WHERE ${sessWhere}
      `;
      const [countRows]: any = await pool.query(countSql, scopeParams);
      const total = Number(countRows[0]?.total || 0);

      const rowsSql = `
        SELECT s.id as sessionId, s.createdAt as startTime, s.lastActivityAt, s.expiresAt, s.revoked, s.revokedAt,
               s.userAgent, s.ipAddress,
               COALESCE(e.id, u.employeeId, u.id) as id,
               COALESCE(e.employeeCode, '—') as employeeCode,
               COALESCE(e.fullName, u.fullName, u.email) as fullName
        FROM session s
        LEFT JOIN user u ON s.userId = u.id
        LEFT JOIN employee e ON u.employeeId = e.id
        WHERE ${sessWhere}
        ORDER BY s.createdAt DESC
        LIMIT ? OFFSET ?
      `;
      const [rows]: any = await pool.query(rowsSql, [...scopeParams, limit, offset]);

      return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        category,
        targetDate: params.date || targetStartDate,
        startDate: targetStartDate,
        endDate: targetEndDate,
        summary: {
          totalSessions: total,
          activeSessions: Number(countRows[0]?.activeSessions || 0),
          endedSessions: Number(countRows[0]?.revokedSessions || 0) + Number(countRows[0]?.expiredSessions || 0),
        },
        breakdowns: {},
        rows: rows.map((r: any) => {
          const isRevoked = Number(r.revoked) === 1;
          const isExpired = !isRevoked && new Date(r.expiresAt).getTime() <= Date.now();
          const sessStatus = isRevoked ? 'Ended' : isExpired ? 'Expired' : 'Active';
          const startMs = new Date(r.startTime).getTime();
          const endMs = isRevoked && r.revokedAt ? new Date(r.revokedAt).getTime() : isExpired ? new Date(r.expiresAt).getTime() : Date.now();
          const diffMins = Math.max(1, Math.round((endMs - startMs) / 60000));

          return {
            id: r.id,
            sessionId: String(r.sessionId).slice(0, 8),
            employeeCode: r.employeeCode,
            fullName: r.fullName,
            startTime: formatTime(r.startTime),
            endTime: isRevoked || isExpired ? formatTime(r.revokedAt || r.expiresAt) : 'Live Now',
            duration: `${diffMins} mins`,
            status: sessStatus,
            deviceType: parseDevice(r.userAgent),
            ipAddress: maskIp(r.ipAddress),
          };
        }),
      };
    }

    // 3. TOTAL LOGIN EVENTS (Login Attempts in Range)
    if (category === 'login_events' || category === 'total_login_events' || category === 'login-events-period') {
      const scopeParams: any[] = [targetStartDate, targetEndDate];
      let laWhere = `DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ? AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?`;
      if (params.locationId && params.locationId !== 'all') {
        laWhere += ` AND (la.locationId = ? OR e.locationId = ? OR u.locationId = ?)`;
        scopeParams.push(params.locationId, params.locationId, params.locationId);
      }
      if (params.departmentId && params.departmentId !== 'all') {
        laWhere += ` AND (e.departmentId = ? OR e.departmentId IN (SELECT d2.id FROM department d2 WHERE d2.name = (SELECT d3.name FROM department d3 WHERE d3.id = ?)))`;
        scopeParams.push(params.departmentId, params.departmentId);
      }
      if (params.search) {
        laWhere += ` AND (e.fullName LIKE ? OR e.employeeCode LIKE ? OR la.email LIKE ? OR la.failureReason LIKE ?)`;
        const term = `%${params.search}%`;
        scopeParams.push(term, term, term, term);
      }

      const countSql = `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN la.success = 1 THEN 1 ELSE 0 END) as successCount,
               SUM(CASE WHEN la.success = 0 THEN 1 ELSE 0 END) as failureCount
        FROM login_attempt la
        LEFT JOIN user u ON la.userId = u.id
        LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
        WHERE ${laWhere}
      `;
      const [countRows]: any = await pool.query(countSql, scopeParams);
      const total = Number(countRows[0]?.total || 0);

      // Breakdown of failure reasons
      const reasonSql = `
        SELECT COALESCE(NULLIF(la.failureReason, ''), 'Invalid Credentials') as reason, COUNT(*) as c
        FROM login_attempt la
        LEFT JOIN user u ON la.userId = u.id
        LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
        WHERE ${laWhere} AND la.success = 0
        GROUP BY reason
      `;
      const [reasonRows]: any = await pool.query(reasonSql, scopeParams);

      const rowsSql = `
        SELECT la.id as eventId, la.createdAt as eventTime, la.success, la.failureReason,
               la.userAgent, la.ipAddress,
               COALESCE(e.id, u.employeeId, u.id) as id,
               COALESCE(e.employeeCode, '—') as employeeCode,
               COALESCE(e.fullName, la.email) as fullName
        FROM login_attempt la
        LEFT JOIN user u ON la.userId = u.id
        LEFT JOIN employee e ON (u.employeeId = e.id OR e.email = la.email)
        WHERE ${laWhere}
        ORDER BY la.createdAt DESC
        LIMIT ? OFFSET ?
      `;
      const [rows]: any = await pool.query(rowsSql, [...scopeParams, limit, offset]);

      return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        category,
        targetDate: params.date || targetStartDate,
        startDate: targetStartDate,
        endDate: targetEndDate,
        summary: {
          totalEvents: total,
          successCount: Number(countRows[0]?.successCount || 0),
          failureCount: Number(countRows[0]?.failureCount || 0),
          failureReasons: reasonRows.map((r: any) => ({ reason: r.reason, count: Number(r.c) })),
        },
        breakdowns: {
          failureReasons: reasonRows.map((r: any) => ({ reason: r.reason, count: Number(r.c) })),
        },
        rows: rows.map((r: any) => ({
          id: r.id,
          eventId: r.eventId,
          eventTime: `${formatDate(r.eventTime)} ${formatTime(r.eventTime)}`,
          employeeCode: r.employeeCode,
          fullName: r.fullName,
          result: Number(r.success) === 1 ? 'Success' : 'Failed',
          failureReason: Number(r.success) === 1 ? '—' : (r.failureReason || 'Invalid Credentials'),
          deviceType: parseDevice(r.userAgent),
          ipAddress: maskIp(r.ipAddress),
        })),
      };
    }

    // 4. ATTENDANCE RECORDS (All Attendance Records in Range)
    if (category === 'attendance_records' || category === 'att-records-period') {
      const scopeParams: any[] = [targetStartDate, targetEndDate];
      let attWhere = `a.attendanceDate >= ? AND a.attendanceDate <= ?`;
      if (params.locationId && params.locationId !== 'all') {
        attWhere += ` AND (a.locationId = ? OR e.locationId = ?)`;
        scopeParams.push(params.locationId, params.locationId);
      }
      if (params.departmentId && params.departmentId !== 'all') {
        attWhere += ` AND (e.departmentId = ? OR e.departmentId IN (SELECT d2.id FROM department d2 WHERE d2.name = (SELECT d3.name FROM department d3 WHERE d3.id = ?)))`;
        scopeParams.push(params.departmentId, params.departmentId);
      }
      if (params.search) {
        attWhere += ` AND (e.fullName LIKE ? OR e.employeeCode LIKE ? OR a.status LIKE ?)`;
        const term = `%${params.search}%`;
        scopeParams.push(term, term, term);
      }

      const countSql = `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT') THEN 1 ELSE 0 END) as presentCount,
               SUM(CASE WHEN a.status = 'LATE' OR a.lateLoginSeconds > 0 THEN 1 ELSE 0 END) as lateCount,
               SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absentCount
        FROM attendance a
        INNER JOIN employee e ON a.employeeId = e.id
        WHERE ${attWhere}
      `;
      const [countRows]: any = await pool.query(countSql, scopeParams);
      const total = Number(countRows[0]?.total || 0);

      const rowsSql = `
        SELECT a.id as attendanceId, a.attendanceDate, a.actualLogin, a.actualLogout, a.status, a.faceVerified,
               e.id as id, e.employeeCode, e.fullName,
               loc.name as locationName, loc.code as locationCode,
               sh.name as shiftName
        FROM attendance a
        INNER JOIN employee e ON a.employeeId = e.id
        LEFT JOIN location loc ON (a.locationId = loc.id OR e.locationId = loc.id)
        LEFT JOIN shift sh ON (a.shiftId = sh.id OR e.shiftId = sh.id)
        WHERE ${attWhere}
        ORDER BY a.attendanceDate DESC, e.employeeCode ASC
        LIMIT ? OFFSET ?
      `;
      const [rows]: any = await pool.query(rowsSql, [...scopeParams, limit, offset]);

      return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        category,
        targetDate: params.date || targetStartDate,
        startDate: targetStartDate,
        endDate: targetEndDate,
        summary: {
          totalRecords: total,
          presentCount: Number(countRows[0]?.presentCount || 0),
          lateCount: Number(countRows[0]?.lateCount || 0),
          absentCount: Number(countRows[0]?.absentCount || 0),
        },
        breakdowns: {},
        rows: rows.map((r: any) => ({
          id: r.id,
          attendanceId: r.attendanceId,
          date: formatDate(r.attendanceDate),
          employeeCode: r.employeeCode,
          fullName: r.fullName,
          locationName: r.locationName || 'Karnataka Store',
          locationCode: r.locationCode || 'BEL',
          shiftName: r.shiftName || 'General Shift',
          punchIn: r.actualLogin ? formatTime(r.actualLogin) : '—',
          punchOut: r.actualLogout ? formatTime(r.actualLogout) : '—',
          source: Number(r.faceVerified) === 1 ? 'Face Terminal' : 'Biometric Terminal',
          status: r.status,
        })),
      };
    }

    // 5. ON APPROVED LEAVE IN RANGE
    if (category === 'on_leave' || category === 'on_leave_today' || category === 'leave_date') {
      const scopeParams: any[] = [targetEndDate, targetStartDate];
      let leaveWhere = `lr.status = 'APPROVED' AND lr.startDate <= ? AND lr.endDate >= ?`;
      if (params.locationId && params.locationId !== 'all') {
        leaveWhere += ` AND (lr.locationId = ? OR e.locationId = ?)`;
        scopeParams.push(params.locationId, params.locationId);
      }
      if (params.departmentId && params.departmentId !== 'all') {
        leaveWhere += ` AND (e.departmentId = ? OR e.departmentId IN (SELECT d2.id FROM department d2 WHERE d2.name = (SELECT d3.name FROM department d3 WHERE d3.id = ?)))`;
        scopeParams.push(params.departmentId, params.departmentId);
      }
      if (params.search) {
        leaveWhere += ` AND (e.fullName LIKE ? OR e.employeeCode LIKE ? OR lr.leaveType LIKE ?)`;
        const term = `%${params.search}%`;
        scopeParams.push(term, term, term);
      }

      const countSql = `
        SELECT COUNT(*) as total
        FROM leaverequest lr
        INNER JOIN employee e ON lr.employeeId = e.id
        WHERE ${leaveWhere}
      `;
      const [countRows]: any = await pool.query(countSql, scopeParams);
      const total = Number(countRows[0]?.total || 0);

      // Leave type breakdown
      const typeSql = `
        SELECT lr.leaveType, COUNT(*) as c
        FROM leaverequest lr
        INNER JOIN employee e ON lr.employeeId = e.id
        WHERE ${leaveWhere}
        GROUP BY lr.leaveType
      `;
      const [typeRows]: any = await pool.query(typeSql, scopeParams);

      const rowsSql = `
        SELECT lr.id as leaveId, lr.leaveType, lr.startDate, lr.endDate, lr.days,
               e.id as id, e.employeeCode, e.fullName,
               loc.name as locationName, loc.code as locationCode,
               dept.name as departmentName,
               COALESCE(rev.fullName, rev.email, 'HR Operations') as approvedBy
        FROM leaverequest lr
        INNER JOIN employee e ON lr.employeeId = e.id
        LEFT JOIN user rev ON lr.reviewedById = rev.id
        LEFT JOIN location loc ON (lr.locationId = loc.id OR e.locationId = loc.id)
        LEFT JOIN department dept ON e.departmentId = dept.id
        WHERE ${leaveWhere}
        ORDER BY lr.startDate DESC
        LIMIT ? OFFSET ?
      `;
      const [rows]: any = await pool.query(rowsSql, [...scopeParams, limit, offset]);

      return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        category,
        targetDate: params.date || targetStartDate,
        startDate: targetStartDate,
        endDate: targetEndDate,
        summary: {
          onLeaveCount: total,
          byLeaveType: typeRows.map((r: any) => ({ type: r.leaveType, count: Number(r.c) })),
        },
        breakdowns: {
          byLeaveType: typeRows.map((r: any) => ({ type: r.leaveType, count: Number(r.c) })),
        },
        rows: rows.map((r: any) => ({
          id: r.id,
          leaveId: r.leaveId,
          employeeCode: r.employeeCode,
          fullName: r.fullName,
          departmentName: r.departmentName || '—',
          locationName: r.locationName || '—',
          locationCode: r.locationCode || '—',
          leaveType: r.leaveType,
          from: formatDate(r.startDate),
          to: formatDate(r.endDate),
          days: r.days || 1,
          approvedBy: r.approvedBy,
        })),
      };
    }

    // 6. DEFAULT EMPLOYEE-CENTRIC CATEGORIES (Total, Active, Inactive, LoggedIn, NotLoggedIn, Live, Present, Absent, Late)
    const empScope = buildEmpWhere('e');
    const whereClauses: string[] = [empScope.sql];
    const queryParams: any[] = [...empScope.params];

    if (category === 'active_workforce' || category === 'active-emp') {
      whereClauses.push(`e.status IN ('ACTIVE', 'PROBATION')`);
    } else if (category === 'inactive_exited' || category === 'inactive-emp' || category === 'inactive') {
      whereClauses.push(`e.status NOT IN ('ACTIVE', 'PROBATION')`);
    } else if (category === 'logged_in' || category === 'logged_in_today' || category === 'logged-in-today') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM login_attempt la
        LEFT JOIN user u ON la.userId = u.id
        WHERE (u.employeeId = e.id OR la.email = e.email)
          AND la.success = 1
          AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
          AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?
      )`);
      queryParams.push(targetStartDate, targetEndDate);
    } else if (category === 'not_logged_in' || category === 'not_logged_in_today' || category === 'not-logged-in-today') {
      whereClauses.push(`e.status = 'ACTIVE'`);
      whereClauses.push(`NOT EXISTS (
        SELECT 1 FROM login_attempt la
        LEFT JOIN user u ON la.userId = u.id
        WHERE (u.employeeId = e.id OR la.email = e.email)
          AND la.success = 1
          AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
          AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?
      )`);
      queryParams.push(targetStartDate, targetEndDate);
    } else if (category === 'currently_active' || category === 'currently-active') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM session s
        INNER JOIN user u ON s.userId = u.id
        WHERE u.employeeId = e.id
          AND s.revoked = 0
          AND s.expiresAt > NOW()
      )`);
    } else if (category === 'present' || category === 'present_today' || category === 'present_date' || category === 'marked-present') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.employeeId = e.id
          AND a.attendanceDate >= ? AND a.attendanceDate <= ?
          AND (a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT'))
      )`);
      queryParams.push(targetStartDate, targetEndDate);
    } else if (category === 'absent' || category === 'absent_today' || category === 'absent_date') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.employeeId = e.id
          AND a.attendanceDate >= ? AND a.attendanceDate <= ?
          AND a.status = 'ABSENT'
      )`);
      queryParams.push(targetStartDate, targetEndDate);
    } else if (category === 'late' || category === 'late_today' || category === 'late_date') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.employeeId = e.id
          AND a.attendanceDate >= ? AND a.attendanceDate <= ?
          AND (a.status = 'LATE' OR a.lateLoginSeconds > 0)
      )`);
      queryParams.push(targetStartDate, targetEndDate);
    }

    const whereSql = whereClauses.join(' AND ');

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM employee e WHERE ${whereSql}`;
    const [countRows]: any = await pool.query(countSql, queryParams);
    const total = Number(countRows[0]?.total || 0);

    // Compute specific summary strip metrics based on category
    let summary: any = {};
    let breakdowns: any = {};

    if (category === 'total_employees' || category === 'total-emp' || category === 'all') {
      const [sumRows]: any = await pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN e.status = 'PROBATION' THEN 1 ELSE 0 END) as probation,
          SUM(CASE WHEN e.status NOT IN ('ACTIVE', 'PROBATION') THEN 1 ELSE 0 END) as exited
        FROM employee e WHERE ${empScope.sql}
      `, empScope.params);

      const [hubRows]: any = await pool.query(`
        SELECT loc.name, loc.code, COUNT(e.id) as count
        FROM employee e
        LEFT JOIN location loc ON e.locationId = loc.id
        WHERE ${empScope.sql}
        GROUP BY loc.id, loc.name, loc.code
      `, empScope.params);

      const [deptRows]: any = await pool.query(`
        SELECT dept.name, COUNT(e.id) as count
        FROM employee e
        LEFT JOIN department dept ON e.departmentId = dept.id
        WHERE ${empScope.sql}
        GROUP BY dept.name
      `, empScope.params);

      summary = {
        total: Number(sumRows[0]?.total || 0),
        active: Number(sumRows[0]?.active || 0),
        probation: Number(sumRows[0]?.probation || 0),
        exited: Number(sumRows[0]?.exited || 0),
      };
      breakdowns = {
        byHub: hubRows.map((r: any) => ({ name: r.name || 'Store', code: r.code || 'HUB', count: Number(r.count) })),
        byDept: deptRows.map((r: any) => ({ name: r.name || 'General', count: Number(r.count) })),
      };
    } else if (category === 'active_workforce' || category === 'active-emp') {
      const [actSum]: any = await pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN e.status = 'PROBATION' THEN 1 ELSE 0 END) as probation
        FROM employee e
        WHERE e.status IN ('ACTIVE', 'PROBATION') AND ${empScope.sql}
      `, empScope.params);

      const [hubRows]: any = await pool.query(`
        SELECT loc.name, loc.code, COUNT(e.id) as count
        FROM employee e
        LEFT JOIN location loc ON e.locationId = loc.id
        WHERE e.status IN ('ACTIVE', 'PROBATION') AND ${empScope.sql}
        GROUP BY loc.id, loc.name, loc.code
      `, empScope.params);

      const [shiftRows]: any = await pool.query(`
        SELECT COALESCE(sh.name, 'General Shift') as shiftName, COUNT(e.id) as count
        FROM employee e
        LEFT JOIN shift sh ON e.shiftId = sh.id
        WHERE e.status IN ('ACTIVE', 'PROBATION') AND ${empScope.sql}
        GROUP BY shiftName
      `, empScope.params);

      summary = {
        active: Number(actSum[0]?.active || 0),
        probation: Number(actSum[0]?.probation || 0),
        onFloor: Number(actSum[0]?.total || 0),
      };
      breakdowns = {
        byHub: hubRows.map((r: any) => ({ name: r.name || 'Store', code: r.code || 'HUB', count: Number(r.count) })),
        byShift: shiftRows.map((r: any) => ({ name: r.shiftName, count: Number(r.count) })),
      };
    } else if (category === 'inactive_exited' || category === 'inactive-emp' || category === 'inactive') {
      const [exitSum]: any = await pool.query(`
        SELECT
          COUNT(*) as exitedCount,
          SUM(CASE WHEN e.status = 'RESIGNED' THEN 1 ELSE 0 END) as resigned,
          SUM(CASE WHEN e.status = 'TERMINATED' THEN 1 ELSE 0 END) as terminated,
          SUM(CASE WHEN e.status NOT IN ('RESIGNED', 'TERMINATED') THEN 1 ELSE 0 END) as other
        FROM employee e
        WHERE e.status NOT IN ('ACTIVE', 'PROBATION') AND ${empScope.sql}
      `, empScope.params);

      summary = {
        exitedCount: Number(exitSum[0]?.exitedCount || 0),
        resigned: Number(exitSum[0]?.resigned || 0),
        terminated: Number(exitSum[0]?.terminated || 0),
        other: Number(exitSum[0]?.other || 0),
      };
      breakdowns = {
        byExitType: [
          { type: 'Resignation', count: Number(exitSum[0]?.resigned || 0) },
          { type: 'Termination', count: Number(exitSum[0]?.terminated || 0) },
          { type: 'Other', count: Number(exitSum[0]?.other || 0) },
        ],
      };
    } else if (category === 'currently_active' || category === 'currently-active') {
      const [activeSum]: any = await pool.query(`
        SELECT COUNT(DISTINCT s.userId) as liveCount,
               SUM(CASE WHEN s.expiresAt <= NOW() + INTERVAL 15 MINUTE THEN 1 ELSE 0 END) as expiringSoon
        FROM session s
        INNER JOIN user u ON s.userId = u.id
        LEFT JOIN employee e ON u.employeeId = e.id
        WHERE s.revoked = 0 AND s.expiresAt > NOW() AND ${empScope.sql}
      `, empScope.params);

      summary = {
        liveCount: Number(activeSum[0]?.liveCount || 0),
        expiringWithin15Min: Number(activeSum[0]?.expiringSoon || 0),
      };
    } else if (category === 'present' || category === 'present_today' || category === 'present_date' || category === 'marked-present') {
      const [presSum]: any = await pool.query(`
        SELECT COUNT(*) as presentCount,
               SUM(CASE WHEN a.faceVerified = 1 THEN 1 ELSE 0 END) as faceCount,
               SUM(CASE WHEN a.faceVerified = 0 THEN 1 ELSE 0 END) as biometricCount
        FROM attendance a
        INNER JOIN employee e ON a.employeeId = e.id
        WHERE a.attendanceDate >= ? AND a.attendanceDate <= ?
          AND (a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT'))
          AND ${empScope.sql}
      `, [targetStartDate, targetEndDate, ...empScope.params]);

      summary = {
        presentCount: Number(presSum[0]?.presentCount || 0),
        verificationMethods: {
          Face: Number(presSum[0]?.faceCount || 0),
          RFID: Number(presSum[0]?.biometricCount || 0),
          QR: 0,
          Manual: 0,
        },
      };
    } else if (category === 'late' || category === 'late_today' || category === 'late_date') {
      const [lateSum]: any = await pool.query(`
        SELECT COUNT(*) as lateCount,
               AVG(a.lateLoginSeconds) as avgLateSec,
               MAX(a.lateLoginSeconds) as maxLateSec
        FROM attendance a
        INNER JOIN employee e ON a.employeeId = e.id
        WHERE a.attendanceDate >= ? AND a.attendanceDate <= ?
          AND (a.status = 'LATE' OR a.lateLoginSeconds > 0)
          AND ${empScope.sql}
      `, [targetStartDate, targetEndDate, ...empScope.params]);

      const avgMins = Math.round(Number(lateSum[0]?.avgLateSec || 0) / 60);
      const maxMins = Math.round(Number(lateSum[0]?.maxLateSec || 0) / 60);

      summary = {
        lateCount: Number(lateSum[0]?.lateCount || 0),
        avgMinutesLate: avgMins,
        longestDelay: `${maxMins} mins`,
      };
    }

    // Rows Query for Employee-Centric Cards
    const rowsSql = `
      SELECT e.id, e.employeeCode, e.fullName, e.email, e.phone, e.designation, e.role,
             e.status, e.employmentType, e.joiningDate, e.confirmationDate, e.exitDate,
             loc.name as locationName, loc.code as locationCode,
             dept.name as departmentName,
             sh.name as shiftName,
             att.status as attendanceStatus,
             att.actualLogin, att.actualLogout, att.lateLoginSeconds, att.faceVerified, att.scheduledLogin,
             (SELECT COUNT(*) FROM user u WHERE u.employeeId = e.id) as userAccountCount,
             (SELECT MIN(la.createdAt) FROM login_attempt la LEFT JOIN user u ON la.userId = u.id
              WHERE (u.employeeId = e.id OR la.email = e.email) AND la.success = 1
                AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
                AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?) as firstLoginTime,
             (SELECT MAX(la.createdAt) FROM login_attempt la LEFT JOIN user u ON la.userId = u.id
              WHERE (u.employeeId = e.id OR la.email = e.email) AND la.success = 1
                AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
                AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?) as lastLoginTime,
             (SELECT COUNT(*) FROM login_attempt la LEFT JOIN user u ON la.userId = u.id
              WHERE (u.employeeId = e.id OR la.email = e.email) AND la.success = 1
                AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) >= ?
                AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) <= ?) as loginCount,
             (SELECT la.userAgent FROM login_attempt la LEFT JOIN user u ON la.userId = u.id
              WHERE (u.employeeId = e.id OR la.email = e.email) AND la.success = 1
              ORDER BY la.createdAt DESC LIMIT 1) as recentUserAgent,
             (SELECT la.ipAddress FROM login_attempt la LEFT JOIN user u ON la.userId = u.id
              WHERE (u.employeeId = e.id OR la.email = e.email) AND la.success = 1
              ORDER BY la.createdAt DESC LIMIT 1) as recentIpAddress,
             (SELECT s.createdAt FROM session s INNER JOIN user u ON s.userId = u.id
              WHERE u.employeeId = e.id AND s.revoked = 0 AND s.expiresAt > NOW()
              ORDER BY s.createdAt DESC LIMIT 1) as sessionStart,
             (SELECT s.lastActivityAt FROM session s INNER JOIN user u ON s.userId = u.id
              WHERE u.employeeId = e.id AND s.revoked = 0 AND s.expiresAt > NOW()
              ORDER BY s.createdAt DESC LIMIT 1) as sessionLastActivity,
             (SELECT s.expiresAt FROM session s INNER JOIN user u ON s.userId = u.id
              WHERE u.employeeId = e.id AND s.revoked = 0 AND s.expiresAt > NOW()
              ORDER BY s.createdAt DESC LIMIT 1) as sessionExpiresAt,
             (SELECT s.userAgent FROM session s INNER JOIN user u ON s.userId = u.id
              WHERE u.employeeId = e.id AND s.revoked = 0 AND s.expiresAt > NOW()
              ORDER BY s.createdAt DESC LIMIT 1) as sessionUserAgent
      FROM employee e
      LEFT JOIN location loc ON e.locationId = loc.id
      LEFT JOIN department dept ON e.departmentId = dept.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
      LEFT JOIN attendance att ON (att.employeeId = e.id AND att.attendanceDate >= ? AND att.attendanceDate <= ?)
      WHERE ${whereSql}
      ORDER BY e.employeeCode ASC
      LIMIT ? OFFSET ?
    `;

    const fullQueryParams = [
      targetStartDate, targetEndDate,
      targetStartDate, targetEndDate,
      targetStartDate, targetEndDate,
      targetStartDate, targetEndDate,
      ...queryParams,
      limit,
      offset,
    ];
    const [rows]: any = await pool.query(rowsSql, fullQueryParams);

    return {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      category,
      targetDate: params.date || targetStartDate,
      startDate: targetStartDate,
      endDate: targetEndDate,
      summary,
      breakdowns,
      rows: rows.map((r: any) => {
        const joinDate = r.joiningDate ? new Date(r.joiningDate) : null;
        const daysSinceJoin = joinDate ? Math.max(0, Math.floor((Date.now() - joinDate.getTime()) / (86400 * 1000))) : null;

        return {
          id: r.id,
          employeeCode: r.employeeCode,
          fullName: r.fullName,
          email: r.email,
          phone: r.phone,
          designation: r.designation || '—',
          role: r.role,
          status: r.status,
          hireDate: formatDate(r.joiningDate),
          joiningDate: formatDate(r.joiningDate),
          daysSinceJoining: daysSinceJoin !== null ? `${daysSinceJoin} days` : '—',
          locationName: r.locationName || '—',
          locationCode: r.locationCode || '—',
          departmentName: r.departmentName || '—',
          shiftName: r.shiftName || 'General Shift',
          shiftStart: r.scheduledLogin ? formatTime(r.scheduledLogin) : '09:00 IST',
          employmentType: r.employmentType || 'Full-time Regular',
          probationEndDate: r.confirmationDate ? formatDate(r.confirmationDate) : (r.status === 'PROBATION' ? 'In Probation' : 'Confirmed'),
          hasLoginAccount: Number(r.userAccountCount || 0) > 0 ? 'Yes' : 'No',
          loginAccountStatus: Number(r.userAccountCount || 0) > 0 ? 'Active Account' : 'No Login Credentials',
          exitType: r.status === 'RESIGNED' ? 'Resignation' : (r.status === 'TERMINATED' ? 'Termination' : (r.status === 'INACTIVE' ? 'Separated' : '—')),
          exitDate: formatDate(r.exitDate) || '—',
          settlementStatus: r.status === 'RESIGNED' ? 'Pending Clearance' : (r.status === 'TERMINATED' ? 'Completed' : '—'),
          firstLoginTime: formatTime(r.firstLoginTime) || '—',
          lastLoginTime: formatTime(r.lastLoginTime) || '—',
          loginCount: Number(r.loginCount || 0),
          deviceType: parseDevice(r.sessionUserAgent || r.recentUserAgent),
          ipAddress: maskIp(r.recentIpAddress),
          sessionStart: formatTime(r.sessionStart) || '—',
          lastActivity: formatTime(r.sessionLastActivity) || '—',
          expiresAt: formatTime(r.sessionExpiresAt) || '—',
          actualLogin: r.actualLogin ? formatTime(r.actualLogin) : null,
          punchInTime: r.actualLogin ? formatTime(r.actualLogin) : '—',
          actualLogout: r.actualLogout ? formatTime(r.actualLogout) : null,
          verificationMethod: Number(r.faceVerified) === 1 ? 'Face Recognition' : 'RFID / Biometric',
          attendanceStatus: r.attendanceStatus || 'UNRECORDED',
          isLate: Number(r.lateLoginSeconds || 0) > 0 || r.attendanceStatus === 'LATE',
          minutesLate: Math.round(Number(r.lateLoginSeconds || 0) / 60),
          lastPunchDate: formatDate(r.actualLogin) || 'None in Range',
          leaveStatus: r.attendanceStatus === 'ON_LEAVE' ? 'Approved Leave' : 'No Approved Leave',
        };
      }),
    };
  }
}

