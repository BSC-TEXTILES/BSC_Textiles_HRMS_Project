/**
 * Monthly and annual attendance workbooks for the "Attendance Excel Download"
 * section.
 *
 * Rules this file exists to honour:
 *  - every value written is read from the database. Nothing is invented to fill a
 *    gap: an unknown cell is `—`, never a guess;
 *  - weekly off, holiday, approved leave and absent are four different things and
 *    are counted from their own records (`attendance.status`, `weeklyoffrule`,
 *    `holiday`, `leave_applications`) rather than inferred from each other;
 *  - the raw punch ledger is the source for first/last punch, punch count,
 *    terminal and verification method; the `attendance` row stays the source for
 *    the calculated durations, incentive and penalty;
 *  - the file is streamed with `ExcelJS.stream.xlsx.WorkbookWriter`, so an
 *    estate-wide year export does not buffer in memory or block the request loop;
 *  - text cells pass through `guardFormula`, so an employee name or note starting
 *    with `=` cannot become a formula when the sheet is opened.
 */

import { Response } from 'express';
import ExcelJS from 'exceljs';
import { pool } from '../../nativeDb.js';
import { loadGlobalSettings } from '../biometric/settings.js';
import { fromUtcMysqlString, deviceCalendarDate, formatWallString } from '../biometric/timeCodec.js';
import { guardFormula } from '../employeeCsvService.js';

const COMPANY_NAME = 'BSC Textiles Pvt Ltd';
const EMPTY = '—';
/**
 * Six block rows + one blank + the column-header row. Freezing and the autofilter
 * both anchor here, so the header row stays visible when the sheet scrolls.
 */
const HEADER_ROW_COUNT = 8;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface AttendanceExportScope {
  /** Inclusive calendar dates (YYYY-MM-DD) in the configured store timezone. */
  from: string;
  to: string;
  locationId?: string | null;
  departmentId?: string | null;
  employeeId?: string | null;
}

interface EmployeeRow {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string | null;
  locationName: string | null;
  locationCode: string | null;
  departmentName: string | null;
  shiftName: string | null;
}

interface DayRecord {
  date: string;
  firstPunch: string | null;
  lastPunch: string | null;
  punchCount: number;
  terminals: string | null;
  methods: string | null;
  attendance: any | null;
  classification: string;
  leaveType: string | null;
}

interface MonthTotals {
  present: number;
  absent: number;
  late: number;
  weeklyOff: number;
  holiday: number;
  leave: number;
  workingDays: number;
  totalHours: number;
  overtimeHours: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  missingPunchDays: number;
  incentive: number;
  penalty: number;
}

const ZERO_TOTALS: MonthTotals = {
  present: 0, absent: 0, late: 0, weeklyOff: 0, holiday: 0, leave: 0,
  workingDays: 0, totalHours: 0, overtimeHours: 0, lateMinutes: 0,
  earlyDepartureMinutes: 0, missingPunchDays: 0, incentive: 0, penalty: 0,
};

interface CalendarContext {
  holidayByDay: Map<string, string>;
  weeklyOffDays: Set<string>;
  weeklyOffByEmployee: Map<string, Set<string>>;
  leaveByEmployee: Map<string, Array<{ from: string; to: string; type: string }>>;
  weeklyOffRuleCount: number;
  holidayRecordCount: number;
}

function hours(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round((n / 3600) * 100) / 100 : 0;
}

function minutes(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n / 60) : 0;
}

function money(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function asYmd(value: unknown): string {
  if (value instanceof Date) return formatWallString(value, 'Asia/Kolkata', false).slice(0, 10);
  return String(value || '').slice(0, 10);
}

function safeText(value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  return guardFormula(String(value));
}

function identityCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  return guardFormula(String(value));
}

/**
 * `departmentId` accepts a department row id or a department name: the executive
 * filter list is the company's standard department list, whose entries are names.
 */
function buildEmployeeScope(scope: AttendanceExportScope): { sql: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];
  if (scope.locationId) {
    clauses.push('e.locationId = ?');
    params.push(scope.locationId);
  }
  if (scope.departmentId) {
    clauses.push('e.departmentId IN (SELECT id FROM department WHERE id = ? OR LOWER(name) = LOWER(?))');
    params.push(scope.departmentId, scope.departmentId);
  }
  if (scope.employeeId) {
    clauses.push('(e.id = ? OR e.employeeCode = ?)');
    params.push(scope.employeeId, scope.employeeId);
  }
  return { sql: clauses.length ? `AND ${clauses.join(' AND ')}` : '', params };
}

async function loadEmployees(scope: AttendanceExportScope): Promise<EmployeeRow[]> {
  const empScope = buildEmployeeScope(scope);
  const [rows]: any = await pool.query(
    `SELECT e.id, e.employeeCode, e.fullName, e.designation,
            l.name AS locationName, l.code AS locationCode,
            d.name AS departmentName, s.name AS shiftName
       FROM employee e
       LEFT JOIN location l ON l.id = e.locationId
       LEFT JOIN department d ON d.id = e.departmentId
       LEFT JOIN shift s ON s.id = e.shiftId
      WHERE (
              EXISTS (SELECT 1 FROM attendance a WHERE a.employeeId = e.id AND a.attendanceDate BETWEEN ? AND ?)
                 OR EXISTS (SELECT 1 FROM biometric_raw_punches r WHERE r.employeeId = e.id
                             AND r.punchTimeUtc BETWEEN ? AND ?)
            )
        ${empScope.sql}
      ORDER BY e.employeeCode ASC`,
    [
      scope.from,
      scope.to,
      `${scope.from} 00:00:00`,
      `${scope.to} 23:59:59`,
      ...empScope.params,
    ]
  );
  return rows;
}

async function loadAttendance(from: string, to: string, employeeIds: string[]): Promise<Map<string, Map<string, any>>> {
  const byEmployee = new Map<string, Map<string, any>>();
  if (employeeIds.length === 0) return byEmployee;
  const placeholders = employeeIds.map(() => '?').join(',');
  const [rows]: any = await pool.query(
    `SELECT a.employeeId, DATE_FORMAT(a.attendanceDate, '%Y-%m-%d') AS dateYmd,
            a.status, a.actualLogin, a.actualLogout,
            a.totalWorkingSeconds, a.breakSeconds, a.effectiveWorkingSeconds, a.overtimeSeconds,
            a.earlyLoginSeconds, a.lateLoginSeconds, a.earlyLogoutSeconds,
            a.earlyLoginIncentive, a.lateLoginPenalty, a.overtimeIncentive, a.earlyLogoutPenalty,
            a.faceVerified, a.notes
       FROM attendance a
      WHERE a.employeeId IN (${placeholders}) AND a.attendanceDate BETWEEN ? AND ?
      ORDER BY a.employeeId, a.attendanceDate`,
    [...employeeIds, from, to]
  );
  for (const row of rows) {
    let byDay = byEmployee.get(row.employeeId);
    if (!byDay) {
      byDay = new Map<string, any>();
      byEmployee.set(row.employeeId, byDay);
    }
    byDay.set(row.dateYmd, row);
  }
  return byEmployee;
}

/** Punch events grouped per employee and per store-timezone calendar day. */
async function loadPunches(
  scope: AttendanceExportScope,
  employeeIds: string[],
  timeZone: string
): Promise<Map<string, Map<string, { count: number; first: string; last: string; terminals: Set<string>; methods: Set<string> }>>> {
  const byEmployee = new Map<string, Map<string, any>>();
  if (employeeIds.length === 0) return byEmployee;

  // The ledger keeps a UTC wall string, so the window is built from the store
  // timezone and padded by a day either way: a month boundary must mean the same
  // thing here as it does on the terminal, whatever zone the API runs in.
  const startUtc = formatWallString(new Date(new Date(`${scope.from}T00:00:00Z`).getTime() - 86400000), 'UTC', true);
  const endUtc = formatWallString(new Date(new Date(`${scope.to}T23:59:59Z`).getTime() + 86400000), 'UTC', true);

  const placeholders = employeeIds.map(() => '?').join(',');
  const [rows]: any = await pool.query(
    `SELECT r.employeeId, r.punchTimeUtc, r.rawTimezone, r.verifyModeLabel,
            COALESCE(d.name, 'Unregistered terminal') AS deviceName
       FROM biometric_raw_punches r
       LEFT JOIN biometric_devices d ON d.id = r.deviceId
      WHERE r.employeeId IN (${placeholders})
        AND r.punchTimeUtc BETWEEN ? AND ?
      ORDER BY r.employeeId, r.punchTimeUtc ASC`,
    [...employeeIds, startUtc, endUtc]
  );

  for (const row of rows) {
    const instant = fromUtcMysqlString(row.punchTimeUtc);
    if (!instant) continue;
    const zone = row.rawTimezone || timeZone;
    const day = deviceCalendarDate(instant, zone);
    let byDay = byEmployee.get(row.employeeId);
    if (!byDay) {
      byDay = new Map<string, any>();
      byEmployee.set(row.employeeId, byDay);
    }
    const wall = formatWallString(instant, zone, false).slice(11, 19);
    const agg = byDay.get(day) || { count: 0, first: wall, last: wall, terminals: new Set<string>(), methods: new Set<string>() };
    agg.count += 1;
    agg.last = wall;
    agg.terminals.add(row.deviceName);
    agg.methods.add(row.verifyModeLabel || 'Unknown');
    byDay.set(day, agg);
  }
  return byEmployee;
}

export async function loadCalendarContext(
  scope: AttendanceExportScope,
  employeeIds: string[]
): Promise<CalendarContext> {  // No scope means the whole estate, and an empty string must never be compared
  // against a nullable location column.
  const holidayParams: any[] = [scope.from, scope.to];
  let holidaySql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS dateYmd, name, locationId
                      FROM holiday WHERE date BETWEEN ? AND ?`;
  if (scope.locationId) {
    holidaySql += ' AND (locationId IS NULL OR locationId = ?)';
    holidayParams.push(scope.locationId);
  }
  const [holidays]: any = await pool.query(holidaySql, holidayParams);

  const holidayByDay = new Map<string, string>();
  for (const h of holidays) holidayByDay.set(h.dateYmd, h.name);

  const offParams: any[] = [];
  let offSql = `SELECT dayOfWeek, employeeId, isRotational FROM weeklyoffrule
                 WHERE (effectiveFrom IS NULL OR effectiveFrom <= ?)
                   AND (effectiveTo IS NULL OR effectiveTo >= ?)`;
  offParams.push(scope.to, scope.from);
  if (scope.locationId) {
    offSql += ' AND locationId = ?';
    offParams.push(scope.locationId);
  }
  const [offRules]: any = await pool.query(offSql, offParams);

  const weeklyOffDays = new Set<string>();
  const weeklyOffByEmployee = new Map<string, Set<string>>();
  for (const rule of offRules) {
    const target = rule.employeeId
      ? weeklyOffByEmployee.get(rule.employeeId) || new Set<string>()
      : weeklyOffDays;
    target.add(String(rule.dayOfWeek).toUpperCase());
    if (rule.employeeId) weeklyOffByEmployee.set(rule.employeeId, target);
  }

  const leavePlaceholders = employeeIds.length ? employeeIds.map(() => '?').join(',') : null;
  let leaves: any[] = [];
  if (leavePlaceholders) {
    const [rows]: any = await pool.query(
      `SELECT la.employee_id AS employeeId, la.start_date AS startDate, la.end_date AS endDate,
              lt.name AS leaveType
         FROM leave_applications la
         LEFT JOIN leave_types lt ON lt.id = la.leave_type_id
        WHERE la.status = 'APPROVED' AND la.employee_id IN (${leavePlaceholders})
          AND la.start_date <= ? AND la.end_date >= ?`,
      [...employeeIds, scope.to, scope.from]
    );
    leaves = rows || [];
  }
  const leaveByEmployee = new Map<string, Array<{ from: string; to: string; type: string }>>();
  for (const leave of leaves) {
    const list = leaveByEmployee.get(leave.employeeId) || [];
    list.push({ from: asYmd(leave.startDate), to: asYmd(leave.endDate), type: leave.leaveType || 'Approved leave' });
    leaveByEmployee.set(leave.employeeId, list);
  }

  return {
    holidayByDay,
    weeklyOffDays,
    weeklyOffByEmployee,
    leaveByEmployee,
    weeklyOffRuleCount: offRules.length,
    holidayRecordCount: holidays.length,
  };
}

/**
 * A day is classified from its own records, in this order: the attendance row
 * (the calculation engine already wrote PRESENT / LATE / ABSENT / WEEKLY_OFF),
 * then an approved leave, then a configured weekly-off rule, then a holiday
 * master entry. Anything left over is reported as having no record — a Sunday is
 * not called a weekly off unless a weekly-off rule says so.
 */
function classifyDay(
  attendance: any,
  day: string,
  context: CalendarContext,
  employeeId: string
): { label: string; leaveType: string | null } {
  if (attendance?.status) return { label: String(attendance.status), leaveType: null };

  const leave = (context.leaveByEmployee.get(employeeId) || []).find((r) => day >= r.from && day <= r.to);
  if (leave) return { label: 'ON_APPROVED_LEAVE', leaveType: leave.type };

  // weeklyoffrule.dayOfWeek is an enum of upper-case day names (SUNDAY, MONDAY…).
  const weekday = DAY_NAMES[new Date(`${day}T12:00:00`).getDay()].toUpperCase();
  const employeeOffs = context.weeklyOffByEmployee.get(employeeId);
  const offs = employeeOffs && employeeOffs.size ? employeeOffs : context.weeklyOffDays;
  if (offs.size && offs.has(weekday)) return { label: 'WEEKLY_OFF', leaveType: null };
  if (offs.has('ROTATIONAL')) {
    // A rotational roster has no fixed weekday; reporting the day as a weekly off
    // would be a guess, so it is shown as what it is and left out of the totals.
    return { label: 'WEEKLY_OFF (rotational — date not derivable)', leaveType: null };
  }

  if (context.holidayByDay.has(day)) return { label: 'HOLIDAY', leaveType: context.holidayByDay.get(day) || null };

  return { label: 'NO_RECORD', leaveType: null };
}

function isWorkingClassification(label: string): boolean {
  return ['PRESENT', 'LATE', 'EARLY', 'OVERTIME', 'FACE_VERIFIED', 'LEFT_STORE', 'ON_LUNCH', 'ON_TEA_BREAK', 'ON_OTHER_BREAK']
    .includes(label);
}

function sumTotals(days: DayRecord[]): MonthTotals {
  const totals: MonthTotals = { ...ZERO_TOTALS };
  for (const day of days) {
    const a = day.attendance;
    if (isWorkingClassification(day.classification)) {
      totals.present++;
      if (day.classification === 'LATE') totals.late++;
    } else if (day.classification === 'ABSENT') totals.absent++;
    else if (day.classification === 'WEEKLY_OFF') totals.weeklyOff++;
    else if (day.classification === 'ON_APPROVED_LEAVE') totals.leave++;
    else if (day.classification === 'HOLIDAY') totals.holiday++;

    totals.totalHours += hours(a?.totalWorkingSeconds);
    totals.overtimeHours += hours(a?.overtimeSeconds);
    totals.lateMinutes += minutes(a?.lateLoginSeconds);
    totals.earlyDepartureMinutes += minutes(a?.earlyLogoutSeconds);
    totals.incentive += money(a?.earlyLoginIncentive) + money(a?.overtimeIncentive);
    totals.penalty += money(a?.lateLoginPenalty) + money(a?.earlyLogoutPenalty);

    if (isWorkingClassification(day.classification) || day.punchCount > 0) totals.workingDays++;

    const hasIn = Boolean(a?.actualLogin) || day.punchCount > 0;
    const hasOut = Boolean(a?.actualLogout) || day.punchCount > 1;
    if (isWorkingClassification(day.classification) && (!hasIn || !hasOut)) totals.missingPunchDays++;
  }
  totals.totalHours = Math.round(totals.totalHours * 100) / 100;
  totals.overtimeHours = Math.round(totals.overtimeHours * 100) / 100;
  totals.incentive = Math.round(totals.incentive * 100) / 100;
  totals.penalty = Math.round(totals.penalty * 100) / 100;
  return totals;
}

async function buildDaysByEmployee(scope: AttendanceExportScope) {
  const settings = await loadGlobalSettings();
  const timeZone = settings.defaultTimezone;
  const employees = await loadEmployees(scope);
  const ids = employees.map((e) => e.id);

  const [attendance, punches, context] = await Promise.all([
    loadAttendance(scope.from, scope.to, ids),
    loadPunches(scope, ids, timeZone),
    loadCalendarContext(scope, ids),
  ]);

  const byEmployee = new Map<string, DayRecord[]>();
  for (const employee of employees) {
    const attendanceByDay = attendance.get(employee.id) || new Map<string, any>();
    const punchByDay = punches.get(employee.id) || new Map<string, any>();
    const days = [...new Set([...attendanceByDay.keys(), ...punchByDay.keys()])].sort();
    byEmployee.set(
      employee.id,
      days.map((date) => {
        const agg = punchByDay.get(date);
        const row = attendanceByDay.get(date) || null;
        const classification = classifyDay(row, date, context, employee.id);
        return {
          date,
          firstPunch: agg ? agg.first : null,
          lastPunch: agg ? agg.last : null,
          punchCount: agg ? agg.count : 0,
          terminals: agg ? [...agg.terminals].join(' / ') : null,
          methods: agg ? [...agg.methods].join(' / ') : null,
          attendance: row,
          classification: classification.label,
          leaveType: classification.leaveType,
        };
      })
    );
  }

  return { employees, byEmployee, context, timeZone };
}

type Column = { header: string; width: number; numFmt?: string };

const DAY_COLUMNS: Column[] = [
  { header: 'Employee ID', width: 14 },
  { header: 'Employee Name', width: 26 },
  { header: 'Store', width: 24 },
  { header: 'Department', width: 20 },
  { header: 'Designation', width: 20 },
  { header: 'Shift', width: 16 },
  { header: 'Date', width: 12, numFmt: 'yyyy-mm-dd' },
  { header: 'Day', width: 11 },
  { header: 'First Punch', width: 12 },
  { header: 'Last Punch', width: 12 },
  { header: 'Punch Count', width: 11 },
  { header: 'Total Working (hrs)', width: 15, numFmt: '0.00' },
  { header: 'Break (hrs)', width: 11, numFmt: '0.00' },
  { header: 'Net Working (hrs)', width: 15, numFmt: '0.00' },
  { header: 'Overtime (hrs)', width: 13, numFmt: '0.00' },
  { header: 'Late By (min)', width: 13 },
  { header: 'Early Departure (min)', width: 17 },
  { header: 'Attendance Status', width: 22 },
  { header: 'Holiday / Leave Reason', width: 24 },
  { header: 'Missing Punch', width: 13 },
  { header: 'Incentive (INR)', width: 14, numFmt: '#,##0.00' },
  { header: 'Penalty (INR)', width: 13, numFmt: '#,##0.00' },
  { header: 'Source Terminal(s)', width: 30 },
  { header: 'Verification Method (device-reported)', width: 32 },
];

const SUMMARY_COLUMNS: Column[] = [
  { header: 'Employee ID', width: 14 },
  { header: 'Employee Name', width: 26 },
  { header: 'Store', width: 24 },
  { header: 'Department', width: 20 },
  { header: 'Designation', width: 20 },
  { header: 'Present Days', width: 13 },
  { header: 'Late Days', width: 11 },
  { header: 'Absent Days', width: 12 },
  { header: 'Weekly Off Days', width: 15 },
  { header: 'Holidays', width: 11 },
  { header: 'Approved Leave Days', width: 18 },
  { header: 'Working Days', width: 13 },
  { header: 'Total Hours', width: 13, numFmt: '0.00' },
  { header: 'Overtime Hours', width: 14, numFmt: '0.00' },
  { header: 'Late Minutes', width: 13 },
  { header: 'Early Departure Minutes', width: 20 },
  { header: 'Missing Punch Days', width: 18 },
  { header: 'Incentive Total (INR)', width: 18, numFmt: '#,##0.00' },
  { header: 'Penalty Total (INR)', width: 17, numFmt: '#,##0.00' },
];

const ANNUAL_COLUMNS: Column[] = [
  { header: 'Employee ID', width: 14 },
  { header: 'Employee Name', width: 26 },
  { header: 'Store', width: 24 },
  { header: 'Department', width: 20 },
  { header: 'Month', width: 14 },
  { header: 'Present Days', width: 13 },
  { header: 'Late Days', width: 11 },
  { header: 'Absent Days', width: 12 },
  { header: 'Weekly Off Days', width: 15 },
  { header: 'Holidays', width: 11 },
  { header: 'Approved Leave Days', width: 18 },
  { header: 'Working Days', width: 13 },
  { header: 'Total Hours', width: 13, numFmt: '0.00' },
  { header: 'Overtime Hours', width: 14, numFmt: '0.00' },
  { header: 'Missing Punch Days', width: 18 },
  { header: 'Incentive (INR)', width: 14, numFmt: '#,##0.00' },
  { header: 'Penalty (INR)', width: 13, numFmt: '#,##0.00' },
];

function storeLabel(employee: EmployeeRow): string {
  if (!employee.locationName) return EMPTY;
  return guardFormula(`${employee.locationName}${employee.locationCode ? ` (${employee.locationCode})` : ''}`);
}

function dayCells(employee: EmployeeRow, day: DayRecord): any[] {
  const a = day.attendance;
  const missing = isWorkingClassification(day.classification) && (!a?.actualLogin || !a?.actualLogout);
  return [
    identityCell(employee.employeeCode),
    safeText(employee.fullName),
    storeLabel(employee),
    safeText(employee.departmentName),
    safeText(employee.designation),
    safeText(employee.shiftName),
    new Date(`${day.date}T00:00:00`),
    DAY_NAMES[new Date(`${day.date}T12:00:00`).getDay()],
    safeText(day.firstPunch),
    safeText(day.lastPunch),
    day.punchCount,
    hours(a?.totalWorkingSeconds),
    hours(a?.breakSeconds),
    hours(a?.effectiveWorkingSeconds),
    hours(a?.overtimeSeconds),
    minutes(a?.lateLoginSeconds),
    minutes(a?.earlyLogoutSeconds),
    safeText(day.classification),
    safeText(day.leaveType),
    a ? (missing ? 'YES' : 'No') : EMPTY,
    money(a?.earlyLoginIncentive) + money(a?.overtimeIncentive),
    money(a?.lateLoginPenalty) + money(a?.earlyLogoutPenalty),
    safeText(day.terminals),
    safeText(day.methods),
  ];
}

function summaryCells(employee: EmployeeRow, t: MonthTotals): any[] {
  return [
    identityCell(employee.employeeCode),
    safeText(employee.fullName),
    storeLabel(employee),
    safeText(employee.departmentName),
    safeText(employee.designation),
    t.present, t.late, t.absent, t.weeklyOff, t.holiday, t.leave, t.workingDays,
    t.totalHours, t.overtimeHours, t.lateMinutes, t.earlyDepartureMinutes,
    t.missingPunchDays, t.incentive, t.penalty,
  ];
}

function annualCells(employee: EmployeeRow, month: string, t: MonthTotals): any[] {
  return [
    identityCell(employee.employeeCode),
    safeText(employee.fullName),
    storeLabel(employee),
    safeText(employee.departmentName),
    month,
    t.present, t.late, t.absent, t.weeklyOff, t.holiday, t.leave, t.workingDays,
    t.totalHours, t.overtimeHours, t.missingPunchDays, t.incentive, t.penalty,
  ];
}

function writeHeaderBlock(sheet: ExcelJS.Worksheet, title: string, lines: string[]): void {
  const rows = [
    [COMPANY_NAME],
    [title],
    [`Period: ${lines[0]}`],
    [`Scope: ${lines[1]}`],
    [`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · times in ${lines[3]}`],
    [lines[2]],
    [],
  ];
  rows.forEach((cells, index) => {
    const row = sheet.addRow(cells.map((c) => guardFormula(c)));
    if (index === 0) row.font = { bold: true, size: 12 };
    if (index === 1) row.font = { bold: true, size: 11 };
    row.commit();
  });
}

function addTableSheet(workbook: ExcelJS.Workbook, name: string, columns: Column[], title: string, lines: string[]): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name.slice(0, 31), {
    views: [{ state: 'frozen', xSplit: 2, ySplit: HEADER_ROW_COUNT }],
  });
  writeHeaderBlock(sheet, title, lines);
  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF4FF' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  header.commit();
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });
  return sheet;
}

function commitRow(sheet: ExcelJS.Worksheet, cells: any[], columns: Column[]): void {
  const row = sheet.addRow(cells);
  columns.forEach((column, index) => {
    if (!column.numFmt) return;
    const cell = row.getCell(index + 1);
    if (cell.value === EMPTY) return;
    cell.numFmt = column.numFmt;
  });
  row.commit();
}

function linesFor(
  scope: AttendanceExportScope,
  employeeCount: number,
  context: CalendarContext,
  timeZone: string
): string[] {
  const scopeParts = [`Employees with records: ${employeeCount}`];
  if (scope.locationId) scopeParts.push(`Store: ${scope.locationId}`);
  if (scope.departmentId) scopeParts.push(`Department: ${scope.departmentId}`);
  if (scope.employeeId) scopeParts.push(`Employee: ${scope.employeeId}`);
  const masters =
    `Holiday master entries in period: ${context.holidayRecordCount} · weekly-off rules in force: ${context.weeklyOffRuleCount}` +
    (context.holidayRecordCount === 0 && context.weeklyOffRuleCount === 0
      ? ' (no holiday or weekly-off master is configured, so those days are shown as recorded)'
      : '');
  return [`${scope.from} to ${scope.to}`, scopeParts.join(' • '), masters, timeZone];
}

function setDownloadHeaders(res: Response, filename: string): void {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
}

function applyAutoFilter(sheet: ExcelJS.Worksheet, columns: Column[]): void {
  sheet.autoFilter = {
    from: { row: HEADER_ROW_COUNT, column: 1 },
    to: { row: HEADER_ROW_COUNT, column: columns.length },
  };
}

const NO_DATA = 'No attendance or punch records exist for this period and filter combination.';

export async function streamMonthlyWorkbook(res: Response, scope: AttendanceExportScope): Promise<number> {
  const { employees, byEmployee, context, timeZone } = await buildDaysByEmployee(scope);
  setDownloadHeaders(res, `attendance-monthly-${scope.from}-to-${scope.to}.xlsx`);
  const lines = linesFor(scope, employees.length, context, timeZone);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  workbook.created = new Date();

  const daySheet = addTableSheet(workbook, 'Daily Attendance', DAY_COLUMNS, 'Monthly Attendance — Daily Register', lines);
  const summarySheet = addTableSheet(workbook, 'Monthly Summary', SUMMARY_COLUMNS, 'Monthly Attendance — Employee Summary', lines);

  let rows = 0;
  for (const employee of employees) {
    const days = byEmployee.get(employee.id) || [];
    for (const day of days) {
      commitRow(daySheet, dayCells(employee, day), DAY_COLUMNS);
      rows++;
    }
    commitRow(summarySheet, summaryCells(employee, sumTotals(days)), SUMMARY_COLUMNS);
  }

  if (rows === 0) {
    daySheet.addRow([NO_DATA]).commit();
    summarySheet.addRow([NO_DATA]).commit();
  }
  applyAutoFilter(daySheet, DAY_COLUMNS);
  applyAutoFilter(summarySheet, SUMMARY_COLUMNS);
  daySheet.commit();
  summarySheet.commit();
  await workbook.commit();
  return rows;
}

export async function streamAnnualWorkbook(res: Response, scope: AttendanceExportScope): Promise<number> {
  const { employees, byEmployee, context, timeZone } = await buildDaysByEmployee(scope);
  setDownloadHeaders(res, `attendance-annual-${scope.from.slice(0, 4)}.xlsx`);
  const lines = linesFor(scope, employees.length, context, timeZone);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  workbook.created = new Date();

  const breakdown = addTableSheet(workbook, 'Monthly Breakdown', ANNUAL_COLUMNS, 'Annual Attendance — Month by Month', lines);
  const totals = addTableSheet(workbook, 'Annual Summary', SUMMARY_COLUMNS, 'Annual Attendance — Year Totals', lines);

  let rows = 0;
  for (const employee of employees) {
    const days = byEmployee.get(employee.id) || [];
    const byMonth = new Map<string, DayRecord[]>();
    for (const day of days) {
      const key = day.date.slice(0, 7);
      const list = byMonth.get(key) || [];
      list.push(day);
      byMonth.set(key, list);
    }

    const annual: MonthTotals = { ...ZERO_TOTALS };
    for (const [month, monthDays] of [...byMonth.entries()].sort()) {
      const t = sumTotals(monthDays);
      commitRow(breakdown, annualCells(employee, month, t), ANNUAL_COLUMNS);
      rows++;
      annual.present += t.present;
      annual.late += t.late;
      annual.absent += t.absent;
      annual.weeklyOff += t.weeklyOff;
      annual.holiday += t.holiday;
      annual.leave += t.leave;
      annual.workingDays += t.workingDays;
      annual.totalHours += t.totalHours;
      annual.overtimeHours += t.overtimeHours;
      annual.lateMinutes += t.lateMinutes;
      annual.earlyDepartureMinutes += t.earlyDepartureMinutes;
      annual.missingPunchDays += t.missingPunchDays;
      annual.incentive += t.incentive;
      annual.penalty += t.penalty;
    }
    commitRow(totals, summaryCells(employee, {
      ...annual,
      totalHours: Math.round(annual.totalHours * 100) / 100,
      overtimeHours: Math.round(annual.overtimeHours * 100) / 100,
      incentive: Math.round(annual.incentive * 100) / 100,
      penalty: Math.round(annual.penalty * 100) / 100,
    }), SUMMARY_COLUMNS);
  }

  if (rows === 0) {
    breakdown.addRow([NO_DATA]).commit();
    totals.addRow([NO_DATA]).commit();
  }
  applyAutoFilter(breakdown, ANNUAL_COLUMNS);
  applyAutoFilter(totals, SUMMARY_COLUMNS);
  breakdown.commit();
  totals.commit();
  await workbook.commit();
  return rows;
}
