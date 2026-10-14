import { pool } from '../db.js';

export interface AnalysisFilterOptions {
  startDate?: string;
  endDate?: string;
  preset?: string; // 'today' | '7d' | '30d' | '90d' | 'this_month' | 'prev_month' | 'all' | 'custom'
  locationId?: string;
  departmentId?: string;
  employeeId?: string;
  status?: string;
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

  if (options.startDate && options.endDate && preset === 'custom') {
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
      sql += ` AND ${prefix}.departmentId = ?`;
      params.push(options.departmentId);
    }
    if (options.employeeId) {
      const empCol = prefix === 'e' ? 'id' : 'employeeId';
      sql += ` AND ${prefix}.${empCol} = ?`;
      params.push(options.employeeId);
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
   * 8. Drill-Down Filtered Employee List
   * Supports clicking cards, dots, or status filters with pagination and full details
   */
  public static async getDrillDown(params: {
    category?: string; // 'logged_in_today' | 'not_logged_in_today' | 'currently_active' | 'present_today' | 'absent_today' | 'late_today' | 'on_leave_today' | 'all'
    date?: string;
    locationId?: string;
    departmentId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const todayStr = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const targetDate = params.date ? params.date.slice(0, 10) : todayStr;
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const offset = (page - 1) * limit;

    const queryParams: any[] = [];
    let whereClauses: string[] = ['1=1'];

    if (params.locationId && params.locationId !== 'all') {
      whereClauses.push(`e.locationId = ?`);
      queryParams.push(params.locationId);
    }
    if (params.departmentId && params.departmentId !== 'all') {
      whereClauses.push(`e.departmentId = ?`);
      queryParams.push(params.departmentId);
    }
    if (params.status && params.status !== 'ALL') {
      whereClauses.push(`e.status = ?`);
      queryParams.push(params.status);
    }
    if (params.search) {
      whereClauses.push(`(e.fullName LIKE ? OR e.employeeCode LIKE ? OR e.email LIKE ? OR e.designation LIKE ?)`);
      const term = `%${params.search}%`;
      queryParams.push(term, term, term, term);
    }

    // Category-specific filters
    const category = params.category || 'all';

    if (category === 'logged_in_today') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM login_attempt la
        LEFT JOIN user u ON la.userId = u.id
        WHERE (u.employeeId = e.id OR la.email = e.email)
          AND la.success = 1
          AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) = ?
      )`);
      queryParams.push(targetDate);
    } else if (category === 'not_logged_in_today') {
      whereClauses.push(`e.status = 'ACTIVE'`);
      whereClauses.push(`NOT EXISTS (
        SELECT 1 FROM login_attempt la
        LEFT JOIN user u ON la.userId = u.id
        WHERE (u.employeeId = e.id OR la.email = e.email)
          AND la.success = 1
          AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) = ?
      )`);
      queryParams.push(targetDate);
    } else if (category === 'currently_active') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM session s
        INNER JOIN user u ON s.userId = u.id
        WHERE u.employeeId = e.id
          AND s.revoked = 0
          AND s.expiresAt > NOW()
      )`);
    } else if (category === 'present_today' || category === 'present_date') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.employeeId = e.id
          AND a.attendanceDate = ?
          AND (a.status IN ('PRESENT', 'FACE_VERIFIED', 'OVERTIME') OR (a.actualLogin IS NOT NULL AND a.status != 'ABSENT'))
      )`);
      queryParams.push(targetDate);
    } else if (category === 'absent_today' || category === 'absent_date') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.employeeId = e.id
          AND a.attendanceDate = ?
          AND a.status = 'ABSENT'
      )`);
      queryParams.push(targetDate);
    } else if (category === 'late_today' || category === 'late_date') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.employeeId = e.id
          AND a.attendanceDate = ?
          AND (a.status = 'LATE' OR a.lateLoginSeconds > 0)
      )`);
      queryParams.push(targetDate);
    } else if (category === 'on_leave_today' || category === 'leave_date') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM leaverequest lr
        WHERE lr.employeeId = e.id
          AND lr.status = 'APPROVED'
          AND ? >= lr.startDate AND ? <= lr.endDate
      )`);
      queryParams.push(targetDate, targetDate);
    }

    const whereSql = whereClauses.join(' AND ');

    // Count query
    const countSql = `
      SELECT COUNT(*) as total
      FROM employee e
      WHERE ${whereSql}
    `;
    const [countRows]: any = await pool.query(countSql, queryParams);
    const total = Number(countRows[0]?.total || 0);

    // Rows query
    const rowsSql = `
      SELECT e.id, e.employeeCode, e.fullName, e.email, e.phone, e.designation, e.role,
             e.status, e.joiningDate as hireDate, e.joiningDate, e.locationId, e.departmentId, e.shiftId,
             loc.name as locationName, loc.code as locationCode,
             dept.name as departmentName,
             sh.name as shiftName,
             att.status as attendanceStatus,
             att.actualLogin, att.actualLogout, att.lateLoginSeconds,
             (SELECT COUNT(*) FROM login_attempt la
              LEFT JOIN user u ON la.userId = u.id
              WHERE (u.employeeId = e.id OR la.email = e.email)
                AND la.success = 1
                AND DATE(CONVERT_TZ(la.createdAt, '+00:00', '+05:30')) = ?) as loginsToday,
             (SELECT COUNT(*) FROM session s
              INNER JOIN user u ON s.userId = u.id
              WHERE u.employeeId = e.id AND s.revoked = 0 AND s.expiresAt > NOW()) as activeSessions
      FROM employee e
      LEFT JOIN location loc ON e.locationId = loc.id
      LEFT JOIN department dept ON e.departmentId = dept.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
      LEFT JOIN attendance att ON (att.employeeId = e.id AND att.attendanceDate = ?)
      WHERE ${whereSql}
      ORDER BY e.employeeCode ASC
      LIMIT ? OFFSET ?
    `;

    const fullQueryParams = [targetDate, targetDate, ...queryParams, limit, offset];
    const [rows]: any = await pool.query(rowsSql, fullQueryParams);

    return {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      category,
      targetDate,
      rows: rows.map((r: any) => ({
        id: r.id,
        employeeCode: r.employeeCode,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        designation: r.designation || '—',
        role: r.role,
        status: r.status,
        hireDate: r.hireDate ? new Date(r.hireDate).toISOString().slice(0, 10) : null,
        locationName: r.locationName || '—',
        locationCode: r.locationCode || '—',
        departmentName: r.departmentName || '—',
        shiftName: r.shiftName || '—',
        attendanceStatus: r.attendanceStatus || 'UNRECORDED',
        actualLogin: r.actualLogin ? new Date(r.actualLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
        actualLogout: r.actualLogout ? new Date(r.actualLogout).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
        isLate: Number(r.lateLoginSeconds || 0) > 0 || r.attendanceStatus === 'LATE',
        lateMinutes: Math.round(Number(r.lateLoginSeconds || 0) / 60),
        loginsToday: Number(r.loginsToday || 0),
        isOnline: Number(r.activeSessions || 0) > 0,
      })),
    };
  }
}
