/**
 * Attendance report read model with the filters HR actually asks for — date
 * range, employee, verification mode, device — plus CSV and Excel export.
 *
 * Rows are punch-level: one line per event the terminal recorded, joined to the
 * employee and device, carrying both the UTC instant and the display time in the
 * device's own timezone. Exporting only the UTC column is how a report ends up
 * claiming someone arrived at 03:42.
 */

import { Response } from 'express';
import ExcelJS from 'exceljs';
import { pool } from '../../nativeDb.js';
import { loadGlobalSettings } from './settings.js';
import { fromUtcMysqlString, formatWallString, formatWallString12, wallTimeToInstant, deviceCalendarDate } from './timeCodec.js';

export interface ReportFilters {
  from?: string;            // YYYY-MM-DD, inclusive, in `timeZone`
  to?: string;              // YYYY-MM-DD, inclusive, in `timeZone`
  employeeId?: string;
  employeeCode?: string;
  employeeQuery?: string;   // matches code, name, or device id
  employeeRange?: '1601-1610' | string;
  verifyMethod?: string[];  // labels from verify_mode_mapping
  serialNumber?: string;
  deviceId?: string;
  locationCode?: string;
  mappingStatus?: string[];
  limit?: number;
  offset?: number;
  timeZone?: string;
}

export interface ReportRow {
  id: string;
  employeeCode: string | null;
  employeeName: string | null;
  designation?: string | null;
  departmentName?: string | null;
  gender?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  enrollmentNumber: string;
  deviceName: string;
  serialNumber: string;
  locationCode: string | null;
  locationName?: string | null;
  punchTimeUtc: string;
  punchTimeLocal: string;
  attendanceDate: string;
  timezone: string;
  punchType: string;
  verifyMethod: string;
  rawVerifyType: number | null;
  rawPunchState: number | null;
  matchValue: number | null;
  workCode: string | null;
  photoUrl: string | null;
  photoMissingReason: string | null;
  mappingStatus: string;
  source: string;
  syncStatus: string;
}

const COLUMNS: Array<{ key: keyof ReportRow; header: string }> = [
  { key: 'employeeCode', header: 'Employee Code' },
  { key: 'employeeName', header: 'Employee Name' },
  { key: 'designation', header: 'Designation' },
  { key: 'departmentName', header: 'Department' },
  { key: 'enrollmentNumber', header: 'Device User ID' },
  { key: 'attendanceDate', header: 'Date' },
  { key: 'punchTimeLocal', header: 'Time (device zone)' },
  { key: 'timezone', header: 'Timezone' },
  { key: 'punchTimeUtc', header: 'Time (UTC)' },
  { key: 'punchType', header: 'Punch Type' },
  { key: 'verifyMethod', header: 'Mode' },
  { key: 'rawVerifyType', header: 'Raw Verify Code' },
  { key: 'rawPunchState', header: 'Raw Punch State' },
  { key: 'matchValue', header: 'Match %' },
  { key: 'deviceName', header: 'Device' },
  { key: 'serialNumber', header: 'Device Serial' },
  { key: 'locationCode', header: 'Location' },
  { key: 'workCode', header: 'Work Code' },
  { key: 'photoUrl', header: 'Photo' },
  { key: 'mappingStatus', header: 'Mapping' },
  { key: 'source', header: 'Source' },
  { key: 'syncStatus', header: 'Status' },
];

export const ALLOWED_DAV_RANGE_CODES = [
  '1601', '1602', '1603', '1604', '1605',
  '1606', '1607', '1608', '1609', '1610',
];

export const MB160_DAV_1601_1610_COLUMNS: Array<{ key: keyof ReportRow | 'store'; header: string }> = [
  { key: 'employeeCode', header: 'Employee Number' },
  { key: 'employeeName', header: 'Employee Name' },
  { key: 'designation', header: 'Designation' },
  { key: 'departmentName', header: 'Department' },
  { key: 'locationCode', header: 'Store' },
  { key: 'deviceName', header: 'Terminal Name' },
  { key: 'serialNumber', header: 'Device Serial Number' },
  { key: 'attendanceDate', header: 'Attendance Date' },
  { key: 'punchTimeLocal', header: 'Attendance Time (IST)' },
  { key: 'punchType', header: 'Punch Direction' },
  { key: 'verifyMethod', header: 'Verification Mode' },
  { key: 'syncStatus', header: 'Synchronization Status' },
];

/** A calendar day edge in `timeZone`, rendered as the UTC wall string that
 *  punchTimeUtc stores, so the comparison never depends on the DB session zone. */
function dayBoundary(dateYmd: string, endOfDay: boolean, timeZone: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const [h, mi, s] = (endOfDay ? '23:59:59' : '00:00:00').split(':').map(Number);
  const instant = wallTimeToInstant({ year: y, month: m, day: d, hour: h, minute: mi, second: s, ms: endOfDay ? 999 : 0 }, timeZone);
  return formatWallString(instant, 'UTC', true);
}

export async function buildAttendanceReport(filters: ReportFilters): Promise<{
  rows: ReportRow[];
  total: number;
  timeZone: string;
  appliedFilters: ReportFilters;
}> {
  const settings = await loadGlobalSettings();
  const timeZone = filters.timeZone || settings.defaultTimezone;

  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.employeeRange === '1601-1610') {
    where.push(`e.employeeCode IN (${ALLOWED_DAV_RANGE_CODES.map(() => '?').join(',')})`);
    params.push(...ALLOWED_DAV_RANGE_CODES);
    where.push("r.mappingStatus = 'MAPPED'");
  }
  if (filters.employeeCode) {
    where.push('e.employeeCode = ?');
    params.push(filters.employeeCode.trim());
  }
  if (filters.from) {
    where.push('r.punchTimeUtc >= ?');
    params.push(dayBoundary(filters.from, false, timeZone));
  }
  if (filters.to) {
    where.push('r.punchTimeUtc <= ?');
    params.push(dayBoundary(filters.to, true, timeZone));
  }
  if (filters.employeeId) {
    where.push('r.employeeId = ?');
    params.push(filters.employeeId);
  }
  if (filters.employeeQuery) {
    where.push('(e.employeeCode LIKE ? OR e.fullName LIKE ? OR r.enrollmentNumber LIKE ? OR r.normalizedId LIKE ?)');
    const like = `%${filters.employeeQuery.trim()}%`;
    params.push(like, like, like, like);
  }
  if (filters.verifyMethod && filters.verifyMethod.length > 0) {
    where.push(`r.verifyModeLabel IN (${filters.verifyMethod.map(() => '?').join(',')})`);
    params.push(...filters.verifyMethod);
  }
  if (filters.serialNumber) {
    where.push('r.serialNumber = ?');
    params.push(filters.serialNumber);
  }
  if (filters.deviceId) {
    where.push('r.deviceId = ?');
    params.push(filters.deviceId);
  }
  if (filters.locationCode && filters.locationCode !== 'ALL') {
    where.push('d.locationCode = ?');
    params.push(filters.locationCode);
  }
  if (filters.mappingStatus && filters.mappingStatus.length > 0) {
    where.push(`r.mappingStatus IN (${filters.mappingStatus.map(() => '?').join(',')})`);
    params.push(...filters.mappingStatus);
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 1000, 1), 10_000);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) AS total
       FROM biometric_raw_punches r
       LEFT JOIN biometric_devices d ON r.deviceId = d.id
       LEFT JOIN employee e ON e.id = r.employeeId
      WHERE ${where.join(' AND ')}`,
    params
  );

  const [rows]: any = await pool.query(
    `SELECT r.id, r.serialNumber, r.enrollmentNumber, r.normalizedId, r.punchTime, r.punchTimeUtc,
            r.rawTimezone, r.punchType, r.verifyMode, r.rawVerifyType, r.rawPunchState,
            r.verifyModeLabel, r.workCode, r.matchValue, r.photoPath, r.mappingStatus,
            r.syncStatus, r.source, r.employeeId,
            e.employeeCode, e.fullName AS employeeName, e.designation, e.gender, e.phone, e.photoReference,
            dept.name AS departmentName,
            COALESCE(d.name, 'Unregistered terminal') AS deviceName,
            COALESCE(d.locationCode, loc.code, 'DAV') AS locationCode,
            COALESCE(loc.name, 'Davanagere Mega Store') AS locationName
       FROM biometric_raw_punches r
       LEFT JOIN biometric_devices d ON r.deviceId = d.id
       LEFT JOIN employee e ON e.id = r.employeeId
       LEFT JOIN department dept ON dept.id = e.departmentId
       LEFT JOIN location loc ON (loc.id = e.locationId OR loc.code = d.locationCode)
      WHERE ${where.join(' AND ')}
      ORDER BY r.punchTimeUtc DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const mapped: ReportRow[] = rows.map((row: any) => {
    const zone = row.rawTimezone || timeZone;
    const instant = fromUtcMysqlString(row.punchTimeUtc)
      ?? (row.punchTime instanceof Date ? row.punchTime : null);

    const avatarUrl = row.photoReference
      ? (String(row.photoReference).startsWith('http') || String(row.photoReference).startsWith('/')
          ? String(row.photoReference)
          : `/${String(row.photoReference).replace(/^\/+/, '')}`)
      : null;

    const photoUrl = row.photoPath
      ? (String(row.photoPath).startsWith('http') || String(row.photoPath).startsWith('/')
          ? String(row.photoPath)
          : `/${String(row.photoPath).replace(/^\/+/, '')}`)
      : null;

    return {
      id: row.id,
      employeeCode: row.employeeCode ?? null,
      employeeName: row.employeeName ?? null,
      designation: row.designation ?? null,
      departmentName: row.departmentName ?? null,
      gender: row.gender ?? null,
      phone: row.phone ?? null,
      avatarUrl,
      enrollmentNumber: row.enrollmentNumber,
      deviceName: row.deviceName,
      serialNumber: row.serialNumber,
      locationCode: row.locationCode ?? null,
      locationName: row.locationName ?? null,
      punchTimeUtc: instant ? instant.toISOString() : '',
      punchTimeLocal: instant ? formatWallString12(instant, zone) : '',
      attendanceDate: instant ? deviceCalendarDate(instant, zone) : '',
      timezone: zone,
      punchType: row.punchType,
      verifyMethod: row.verifyModeLabel || 'Unknown',
      rawVerifyType: row.rawVerifyType === null ? null : Number(row.rawVerifyType),
      rawPunchState: row.rawPunchState === null ? null : Number(row.rawPunchState),
      matchValue: row.matchValue === null ? null : Number(row.matchValue),
      workCode: row.workCode ?? null,
      photoUrl,
      photoMissingReason: photoUrl ? null : 'No photo available from device',
      mappingStatus: row.mappingStatus,
      source: row.source,
      syncStatus: row.syncStatus,
    };
  });

  return { rows: mapped, total: Number(countRows[0]?.total ?? mapped.length), timeZone, appliedFilters: filters };
}

/** Sanitize value for CSV and prevent spreadsheet formula injection. */
export function sanitizeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Neutralize formula injection if string starts with =, +, -, @, \t, or \r
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 escaping with formula injection defense. */
export function toCsv(
  rows: ReportRow[],
  columns: Array<{ key: any; header: string }> = COLUMNS
): string {
  const header = columns.map((c) => sanitizeCsvField(c.header)).join(',');
  const body = rows.map((row) =>
    columns
      .map((c) => {
        let val: any = (row as any)[c.key];
        if (c.key === 'locationCode' && (!val || val === 'DAV')) {
          val = 'DAV - Davanagere';
        }
        return sanitizeCsvField(val);
      })
      .join(',')
  );
  return [header, ...body].join('\r\n');
}

export function sendCsv(res: Response, csv: string, filename: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  // BOM so Excel opens Indian names and the ₹ sign without mangling them.
  res.send(`\uFEFF${csv}`);
}

/** Builds a styled ExcelJS workbook for attendance reports with formula-injection guard. */
export function buildXlsxWorkbook(
  rows: ReportRow[],
  meta: { filterSummary: string },
  columns: Array<{ key: any; header: string }> = COLUMNS
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Attendance');

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: String(c.key),
    width: Math.max(14, c.header.length + 4),
  }));

  sheet.getRow(1).font = { bold: true, color: { argb: 'FF1E293B' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  for (const row of rows) {
    sheet.addRow(
      columns.map((c) => {
        let val: any = (row as any)[c.key];
        if (c.key === 'locationCode' && (!val || val === 'DAV')) {
          val = 'DAV - Davanagere';
        }
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && /^[=+\-@\t\r]/.test(val)) {
          return `'${val}`;
        }
        return val;
      })
    );
  }

  const notes = workbook.addWorksheet('About');
  notes.getCell('A1').value = 'BSC Textiles HRMS — Biometric Attendance Report';
  notes.getCell('A2').value = `Generated: ${new Date().toISOString()}`;
  notes.getCell('A3').value = `Filters: ${meta.filterSummary}`;
  notes.getCell('A4').value = 'Times are shown in the timezone the recording device is configured for; the UTC column is also included.';
  notes.getCell('A5').value = 'An empty Photo column means this firmware did not push a snapshot for that punch.';

  return workbook;
}

/** Generates an XLSX file buffer for attendance report rows. */
export async function buildXlsxBuffer(
  rows: ReportRow[],
  meta: { filterSummary: string },
  columns: Array<{ key: any; header: string }> = COLUMNS
): Promise<Buffer> {
  const workbook = buildXlsxWorkbook(rows, meta, columns);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function sendXlsx(
  res: Response,
  rows: ReportRow[],
  filename: string,
  meta: { filterSummary: string },
  columns: Array<{ key: any; header: string }> = COLUMNS
): Promise<void> {
  const workbook = buildXlsxWorkbook(rows, meta, columns);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export function describeFilters(filters: ReportFilters, timeZone: string): string {
  const parts: string[] = [`timezone=${timeZone}`];
  if (filters.from) parts.push(`from=${filters.from}`);
  if (filters.to) parts.push(`to=${filters.to}`);
  if (filters.employeeId) parts.push(`employee=${filters.employeeId}`);
  if (filters.employeeQuery) parts.push(`search="${filters.employeeQuery}"`);
  if (filters.verifyMethod?.length) parts.push(`mode=${filters.verifyMethod.join('|')}`);
  if (filters.serialNumber) parts.push(`serial=${filters.serialNumber}`);
  if (filters.deviceId) parts.push(`device=${filters.deviceId}`);
  if (filters.locationCode) parts.push(`location=${filters.locationCode}`);
  return parts.join(' ');
}

export { COLUMNS as REPORT_COLUMNS };
