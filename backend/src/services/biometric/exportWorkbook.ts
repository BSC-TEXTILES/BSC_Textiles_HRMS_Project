/**
 * Server-side exports for the biometric ops section.
 *
 * Five report kinds share one query layer:
 *   complete     — the full punch log, flat;
 *   floor-wise   — one sheet per device floor;
 *   section-wise — one sheet per device section;
 *   device-wise  — one sheet per terminal;
 *   mismatch     — the mismatch queue with expected/received snapshots.
 *
 * Every file is generated on the server, carries company + title + generated-at
 * header rows, column widths and Excel-recognised date strings, and streams in
 * chunks so a 10k+ row export never buffers the whole dataset in memory.
 * CSV is a single flat table (a sheet-per-group concept does not exist there;
 * the group column is included instead, and the file name says so).
 */

import { Response } from 'express';
import ExcelJS from 'exceljs';
import { pool } from '../../nativeDb.js';
import { loadGlobalSettings } from './settings.js';
import { wallTimeToInstant, formatWallString, fromUtcMysqlString, deviceCalendarDate } from './timeCodec.js';
import { listMismatchRecords, MISMATCH_TYPE_LABELS, MismatchListFilters, MismatchRecordRow } from './mismatch.js';

export type ExportKind = 'complete' | 'floor-wise' | 'section-wise' | 'device-wise' | 'mismatch';
export type ExportFormat = 'xlsx' | 'csv';

export interface OpsExportFilters {
  from?: string;
  to?: string;
  locationCode?: string;
  deviceId?: string;
  serialNumber?: string;
  floorId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeQuery?: string;
  status?: 'matched' | 'mismatched' | 'unsynced' | 'all';
  mappingStatus?: string;
  verifyMethod?: string;
  mismatchStatus?: string;
  mismatchTypes?: string[];
  severity?: string;
  /** Internal: restrict one worksheet to a single group without re-resolving ids. */
  groupKind?: 'floor' | 'section' | 'device';
  groupLabel?: string;
}

interface PunchExportRow {
  serialNumber: string;
  deviceName: string;
  deviceId: string | null;
  floorName: string;
  sectionName: string;
  locationCode: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  enrollmentNumber: string;
  attendanceDate: string;
  punchTimeLocal: string;
  timezone: string;
  punchTimeUtc: string;
  punchType: string;
  direction: string;
  verifyMethod: string;
  status: string;
  source: string;
}

const COMPANY_NAME = 'BSC Textiles Pvt Ltd';
const PAGE_SIZE = 2000;

function dayBoundary(dateYmd: string, endOfDay: boolean, timeZone: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const [h, mi, s] = (endOfDay ? '23:59:59' : '00:00:00').split(':').map(Number);
  const instant = wallTimeToInstant({ year: y, month: m, day: d, hour: h, minute: mi, second: s, ms: endOfDay ? 999 : 0 }, timeZone);
  return formatWallString(instant, 'UTC', true);
}

function directionOf(punchType: string): string {
  if (punchType === 'CHECK_IN') return 'IN';
  if (punchType === 'CHECK_OUT') return 'OUT';
  if (punchType === 'MIDDLE') return 'MIDDLE';
  return '—';
}

function buildPunchWhere(filters: OpsExportFilters, timeZone: string): { where: string; params: any[] } {
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.from) {
    where.push('r.punchTimeUtc >= ?');
    params.push(dayBoundary(filters.from, false, timeZone));
  }
  if (filters.to) {
    where.push('r.punchTimeUtc <= ?');
    params.push(dayBoundary(filters.to, true, timeZone));
  }
  if (filters.locationCode && filters.locationCode !== 'ALL') {
    where.push("(d.locationCode = ? OR r.serialNumber IN (SELECT serialNumber FROM biometric_devices WHERE locationCode = ?))");
    params.push(filters.locationCode, filters.locationCode);
  }
  if (filters.deviceId) { where.push('r.deviceId = ?'); params.push(filters.deviceId); }
  if (filters.serialNumber) { where.push('r.serialNumber = ?'); params.push(filters.serialNumber); }
  if (filters.floorId) { where.push('d.floorId = ?'); params.push(filters.floorId); }
  if (filters.sectionId) { where.push('d.sectionId = ?'); params.push(filters.sectionId); }
  if (filters.departmentId) { where.push('e.departmentId = ?'); params.push(filters.departmentId); }
  if (filters.employeeQuery) {
    const like = `%${filters.employeeQuery.trim()}%`;
    where.push('(e.employeeCode LIKE ? OR e.fullName LIKE ? OR r.enrollmentNumber LIKE ? OR r.normalizedId LIKE ?)');
    params.push(like, like, like, like);
  }
  if (filters.mappingStatus) { where.push('r.mappingStatus = ?'); params.push(filters.mappingStatus); }
  if (filters.verifyMethod) { where.push('r.verifyModeLabel = ?'); params.push(filters.verifyMethod); }
  if (filters.groupKind && filters.groupLabel) {
    const groupExpr = filters.groupKind === 'floor'
      ? "COALESCE(f.name, 'Unassigned floor')"
      : filters.groupKind === 'section'
        ? "COALESCE(s.name, 'Unassigned section')"
        : "COALESCE(d.name, 'Unregistered terminal')";
    where.push(`${groupExpr} = ?`);
    params.push(filters.groupLabel);
  }

  switch (filters.status) {
    case 'matched':
      where.push("r.mappingStatus = 'MAPPED' AND r.syncStatus = 'PROCESSED'");
      break;
    case 'mismatched':
      where.push("(r.mappingStatus IN ('UNMAPPED','AMBIGUOUS') OR EXISTS (SELECT 1 FROM biometric_mismatch_records mm WHERE mm.punchId = r.id))");
      break;
    case 'unsynced':
      where.push("r.syncStatus <> 'PROCESSED'");
      break;
    default:
      break;
  }

  return { where: where.join(' AND '), params };
}

const PUNCH_SELECT = `
  SELECT r.id, r.serialNumber, r.enrollmentNumber, r.normalizedId, r.punchTimeUtc, r.rawTimezone,
         r.punchType, r.verifyModeLabel, r.mappingStatus, r.syncStatus, r.source,
         e.employeeCode, e.fullName AS employeeName,
         dep.name AS departmentName,
         COALESCE(d.name, 'Unregistered terminal') AS deviceName,
         d.id AS deviceId, d.locationCode,
         f.name AS floorName, s.name AS sectionName,
         EXISTS (SELECT 1 FROM biometric_mismatch_records mm WHERE mm.punchId = r.id) AS hasMismatch
    FROM biometric_raw_punches r
    LEFT JOIN biometric_devices d ON d.id = r.deviceId
    LEFT JOIN floor f ON f.id = d.floorId
    LEFT JOIN section s ON s.id = d.sectionId
    LEFT JOIN employee e ON e.id = r.employeeId
    LEFT JOIN department dep ON dep.id = e.departmentId`;

function mapPunchRow(row: any, fallbackTimeZone: string): PunchExportRow {
  const zone = row.rawTimezone || fallbackTimeZone;
  const instant = fromUtcMysqlString(row.punchTimeUtc);
  const punchType = row.punchType || '';
  const hasMismatch = Boolean(Number(row.hasMismatch ?? 0));

  let status = 'Matched';
  if (hasMismatch) status = 'Mismatch';
  else if (row.mappingStatus === 'UNMAPPED') status = 'Unknown User';
  else if (row.mappingStatus === 'AMBIGUOUS') status = 'ID Mismatch';
  else if (row.syncStatus !== 'PROCESSED') status = 'Not Synced';

  return {
    serialNumber: row.serialNumber ?? '',
    deviceName: row.deviceName ?? 'Unregistered terminal',
    deviceId: row.deviceId ?? null,
    floorName: row.floorName ?? '—',
    sectionName: row.sectionName ?? '—',
    locationCode: row.locationCode ?? '—',
    employeeCode: row.employeeCode ?? '',
    employeeName: row.employeeName ?? '',
    departmentName: row.departmentName ?? '',
    enrollmentNumber: row.enrollmentNumber ?? '',
    attendanceDate: instant ? deviceCalendarDate(instant, zone) : '',
    punchTimeLocal: instant ? formatWallString(instant, zone, false) : '',
    timezone: zone,
    punchTimeUtc: instant ? instant.toISOString() : '',
    punchType,
    direction: directionOf(punchType),
    verifyMethod: row.verifyModeLabel || 'Unknown',
    status,
    source: row.source ?? '',
  };
}

async function countPunchRows(filters: OpsExportFilters, timeZone: string): Promise<number> {
  const { where, params } = buildPunchWhere(filters, timeZone);
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM biometric_raw_punches r
       LEFT JOIN biometric_devices d ON d.id = r.deviceId
       LEFT JOIN floor f ON f.id = d.floorId
       LEFT JOIN section s ON s.id = d.sectionId
       LEFT JOIN employee e ON e.id = r.employeeId
      WHERE ${where}`,
    params
  );
  return Number(rows[0]?.total ?? 0);
}

async function fetchPunchChunk(filters: OpsExportFilters, timeZone: string, offset: number): Promise<PunchExportRow[]> {
  const { where, params } = buildPunchWhere(filters, timeZone);
  const [rows]: any = await pool.query(
    `${PUNCH_SELECT}
      WHERE ${where}
      ORDER BY r.punchTimeUtc ASC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params
  );
  return rows.map((row: any) => mapPunchRow(row, timeZone));
}

interface GroupDefinition {
  key: string;
  label: string;
}

async function listGroups(filters: OpsExportFilters, timeZone: string, kind: ExportKind): Promise<GroupDefinition[]> {
  const { where, params } = buildPunchWhere(filters, timeZone);
  const column = kind === 'floor-wise'
    ? "COALESCE(f.name, 'Unassigned floor')"
    : kind === 'section-wise'
      ? "COALESCE(s.name, 'Unassigned section')"
      : "COALESCE(d.name, 'Unregistered terminal')";
  const [rows]: any = await pool.query(
    `SELECT DISTINCT ${column} AS groupName
       FROM biometric_raw_punches r
       LEFT JOIN biometric_devices d ON d.id = r.deviceId
       LEFT JOIN floor f ON f.id = d.floorId
       LEFT JOIN section s ON s.id = d.sectionId
       LEFT JOIN employee e ON e.id = r.employeeId
      WHERE ${where}
      ORDER BY groupName`,
    params
  );
  return rows.map((row: any) => ({ key: String(row.groupName ?? '—'), label: String(row.groupName ?? '—') }));
}

function filterSummary(filters: OpsExportFilters, kind: ExportKind): string {
  const parts: string[] = [];
  if (filters.from) parts.push(`from ${filters.from}`);
  if (filters.to) parts.push(`to ${filters.to}`);
  if (filters.locationCode && filters.locationCode !== 'ALL') parts.push(`location ${filters.locationCode}`);
  if (filters.deviceId) parts.push(`device ${filters.deviceId}`);
  if (filters.floorId) parts.push(`floor ${filters.floorId}`);
  if (filters.sectionId) parts.push(`section ${filters.sectionId}`);
  if (filters.departmentId) parts.push(`department ${filters.departmentId}`);
  if (filters.employeeQuery) parts.push(`search "${filters.employeeQuery}"`);
  if (filters.status && filters.status !== 'all') parts.push(`status ${filters.status}`);
  if (filters.mismatchStatus && filters.mismatchStatus !== 'ALL') parts.push(`mismatch status ${filters.mismatchStatus}`);
  if (filters.mismatchTypes?.length) parts.push(`types ${filters.mismatchTypes.join('|')}`);
  return parts.length > 0 ? parts.join(', ') : `all data (${kind})`;
}

const PUNCH_COLUMNS: Array<{ header: string; width: number; value: (row: PunchExportRow) => string }> = [
  { header: 'Device ID', width: 16, value: (r) => r.deviceId ?? '—' },
  { header: 'Device Name', width: 30, value: (r) => r.deviceName },
  { header: 'Serial Number', width: 18, value: (r) => r.serialNumber },
  { header: 'Floor', width: 14, value: (r) => r.floorName },
  { header: 'Section', width: 22, value: (r) => r.sectionName },
  { header: 'Location', width: 10, value: (r) => r.locationCode },
  { header: 'Employee Code', width: 14, value: (r) => r.employeeCode },
  { header: 'Employee Name', width: 24, value: (r) => r.employeeName },
  { header: 'Department', width: 22, value: (r) => r.departmentName },
  { header: 'Device User ID', width: 14, value: (r) => r.enrollmentNumber },
  { header: 'Date', width: 12, value: (r) => r.attendanceDate },
  { header: 'Time (device zone)', width: 19, value: (r) => r.punchTimeLocal },
  { header: 'Timezone', width: 14, value: (r) => r.timezone },
  { header: 'Time (UTC)', width: 24, value: (r) => r.punchTimeUtc },
  { header: 'Punch Type', width: 12, value: (r) => r.punchType },
  { header: 'Direction', width: 10, value: (r) => r.direction },
  { header: 'Verification Mode', width: 18, value: (r) => r.verifyMethod },
  { header: 'Status', width: 14, value: (r) => r.status },
  { header: 'Source', width: 14, value: (r) => r.source },
];

const MISMATCH_COLUMNS: Array<{ header: string; width: number; value: (row: MismatchRecordRow) => string }> = [
  { header: 'Type', width: 18, value: (r) => MISMATCH_TYPE_LABELS[r.mismatchType] ?? r.mismatchType },
  { header: 'Severity', width: 10, value: (r) => r.severity },
  { header: 'Status', width: 10, value: (r) => r.status },
  { header: 'Device ID', width: 16, value: (r) => r.deviceId ?? '—' },
  { header: 'Device Name', width: 28, value: (r) => r.deviceName ?? '—' },
  { header: 'Serial Number', width: 18, value: (r) => r.serialNumber ?? '—' },
  { header: 'Floor', width: 14, value: (r) => r.floorName ?? '—' },
  { header: 'Section', width: 20, value: (r) => r.sectionName ?? '—' },
  { header: 'Location', width: 10, value: (r) => r.locationCode ?? '—' },
  { header: 'Employee Code', width: 14, value: (r) => r.employeeCode ?? '—' },
  { header: 'Employee Name', width: 24, value: (r) => r.employeeName ?? '—' },
  { header: 'Biometric ID', width: 14, value: (r) => r.biometricId ?? '—' },
  { header: 'Expected', width: 46, value: (r) => JSON.stringify(r.expected ?? {}) },
  { header: 'Received', width: 46, value: (r) => JSON.stringify(r.received ?? {}) },
  { header: 'Occurrences', width: 12, value: (r) => String(r.occurrenceCount) },
  { header: 'First Detected', width: 24, value: (r) => r.firstDetectedAt ?? '' },
  { header: 'Last Detected', width: 24, value: (r) => r.lastDetectedAt ?? '' },
  { header: 'Resolution', width: 18, value: (r) => r.resolutionAction ?? '' },
  { header: 'Resolved By', width: 20, value: (r) => r.resolvedById ?? '' },
  { header: 'Resolved At', width: 24, value: (r) => r.resolvedAt ?? '' },
  { header: 'Remark', width: 30, value: (r) => r.remark ?? '' },
  { header: 'Details', width: 60, value: (r) => r.details ?? '' },
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function setDownloadHeaders(res: Response, filename: string, format: ExportFormat): void {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  } else {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
}

function exportFilename(kind: ExportKind, format: ExportFormat): string {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const suffix = format === 'csv' && (kind === 'floor-wise' || kind === 'section-wise' || kind === 'device-wise') ? '-flat' : '';
  return `biometric-${kind}${suffix}-${stamp}.${format}`;
}

function headerRows(title: string, summary: string): string[][] {
  return [
    [COMPANY_NAME],
    [title],
    [`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`],
    [`Filters: ${summary}`],
    [],
  ];
}

// ─── Punch log exports ───────────────────────────────────────────────────────

async function streamPunchCsv(res: Response, filters: OpsExportFilters, timeZone: string, title: string, filename: string): Promise<number> {
  setDownloadHeaders(res, filename, 'csv');
  res.write('\uFEFF');
  for (const line of headerRows(title, filterSummary(filters, 'complete'))) res.write(`${line.map(csvEscape).join(',')}\r\n`);
  res.write(`${PUNCH_COLUMNS.map((c) => csvEscape(c.header)).join(',')}\r\n`);

  let offset = 0;
  let written = 0;
  for (;;) {
    const chunk = await fetchPunchChunk(filters, timeZone, offset);
    if (chunk.length === 0) break;
    for (const row of chunk) {
      res.write(`${PUNCH_COLUMNS.map((c) => csvEscape(c.value(row))).join(',')}\r\n`);
    }
    written += chunk.length;
    offset += PAGE_SIZE;
    if (chunk.length < PAGE_SIZE) break;
  }
  res.end();
  return written;
}

async function streamPunchXlsx(
  res: Response,
  filters: OpsExportFilters,
  timeZone: string,
  kind: ExportKind,
  filename: string
): Promise<number> {
  setDownloadHeaders(res, filename, 'xlsx');
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  workbook.created = new Date();

  const addSheet = async (name: string, groupFilters: OpsExportFilters, subtitle: string) => {
    const sheet = workbook.addWorksheet(name.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 6 }],
    });
    for (const line of headerRows(subtitle, filterSummary(filters, kind))) {
      sheet.addRow(line).commit();
    }
    const headerRow = sheet.addRow(PUNCH_COLUMNS.map((c) => c.header));
    headerRow.font = { bold: true };
    headerRow.commit();
    sheet.columns = PUNCH_COLUMNS.map((c) => ({ width: c.width }));

    let offset = 0;
    let count = 0;
    for (;;) {
      const chunk = await fetchPunchChunk(groupFilters, timeZone, offset);
      if (chunk.length === 0) break;
      for (const row of chunk) {
        sheet.addRow(PUNCH_COLUMNS.map((c) => c.value(row))).commit();
        count++;
      }
      offset += PAGE_SIZE;
      if (chunk.length < PAGE_SIZE) break;
    }
    sheet.commit();
    return count;
  };

  let total = 0;
  if (kind === 'complete') {
    total = await addSheet('Attendance Log', filters, 'Biometric Attendance — Complete Log');
  } else {
    const groups = await listGroups(filters, timeZone, kind);
    if (groups.length === 0) {
      await addSheet('No data', filters, 'Biometric Attendance — No data for the selected filters');
    }
    const used = new Set<string>();
    for (const group of groups) {
      let name = group.label.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Group';
      while (used.has(name)) name = `${name.slice(0, 29)}_${used.size}`;
      used.add(name);
      const groupFilters: OpsExportFilters = { ...filters, groupKind: kind === 'floor-wise' ? 'floor' : kind === 'section-wise' ? 'section' : 'device', groupLabel: group.label };
      total += await addSheet(name, groupFilters, `Biometric Attendance — ${kind === 'floor-wise' ? 'Floor' : kind === 'section-wise' ? 'Section' : 'Device'}: ${group.label}`);
    }
  }

  await workbook.commit();
  return total;
}

// ─── Mismatch export ─────────────────────────────────────────────────────────

async function fetchAllMismatches(filters: OpsExportFilters): Promise<MismatchRecordRow[]> {
  const listFilters: MismatchListFilters = {
    status: filters.mismatchStatus ?? 'OPEN',
    types: filters.mismatchTypes,
    severities: filters.severity ? [filters.severity] : undefined,
    locationCode: filters.locationCode,
    deviceId: filters.deviceId,
    serialNumber: filters.serialNumber,
    floorId: filters.floorId,
    sectionId: filters.sectionId,
    departmentId: filters.departmentId,
    employeeQuery: filters.employeeQuery,
    from: filters.from,
    to: filters.to,
    limit: 500,
    page: 1,
  };
  const all: MismatchRecordRow[] = [];
  for (;;) {
    const page = await listMismatchRecords(listFilters);
    all.push(...page.rows);
    if (all.length >= page.total || page.rows.length === 0) break;
    listFilters.page = (listFilters.page ?? 1) + 1;
  }
  return all;
}

async function streamMismatchCsv(res: Response, filters: OpsExportFilters, filename: string): Promise<number> {
  setDownloadHeaders(res, filename, 'csv');
  res.write('\uFEFF');
  for (const line of headerRows('Biometric Mismatch Report', filterSummary(filters, 'mismatch'))) {
    res.write(`${line.map(csvEscape).join(',')}\r\n`);
  }
  res.write(`${MISMATCH_COLUMNS.map((c) => csvEscape(c.header)).join(',')}\r\n`);

  const rows = await fetchAllMismatches(filters);
  let written = 0;
  const CHUNK = 500;
  for (let index = 0; index < rows.length; index += CHUNK) {
    for (const row of rows.slice(index, index + CHUNK)) {
      res.write(`${MISMATCH_COLUMNS.map((c) => csvEscape(c.value(row))).join(',')}\r\n`);
      written++;
    }
  }
  res.end();
  return written;
}

async function streamMismatchXlsx(res: Response, filters: OpsExportFilters, filename: string): Promise<number> {
  setDownloadHeaders(res, filename, 'xlsx');
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Mismatches', { views: [{ state: 'frozen', ySplit: 6 }] });
  for (const line of headerRows('Biometric Mismatch Report', filterSummary(filters, 'mismatch'))) {
    sheet.addRow(line).commit();
  }
  const headerRow = sheet.addRow(MISMATCH_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.commit();
  sheet.columns = MISMATCH_COLUMNS.map((c) => ({ width: c.width }));

  const rows = await fetchAllMismatches(filters);
  for (const row of rows) {
    sheet.addRow(MISMATCH_COLUMNS.map((c) => c.value(row))).commit();
  }
  sheet.commit();
  await workbook.commit();
  return rows.length;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runOpsExport(params: {
  res: Response;
  kind: ExportKind;
  format: ExportFormat;
  filters: OpsExportFilters;
}): Promise<{ kind: ExportKind; format: ExportFormat; rows: number }> {
  const settings = await loadGlobalSettings();
  const timeZone = settings.defaultTimezone;
  const filename = exportFilename(params.kind, params.format);

  if (params.kind === 'mismatch') {
    const rows = params.format === 'csv'
      ? await streamMismatchCsv(params.res, params.filters, filename)
      : await streamMismatchXlsx(params.res, params.filters, filename);
    return { kind: params.kind, format: params.format, rows };
  }

  const title = params.kind === 'complete'
    ? 'Biometric Attendance — Complete Log'
    : `Biometric Attendance — ${params.kind === 'floor-wise' ? 'Floor-wise' : params.kind === 'section-wise' ? 'Section-wise' : 'Device-wise'}`;

  const rows = params.format === 'csv'
    ? await streamPunchCsv(params.res, params.filters, timeZone, title, filename)
    : await streamPunchXlsx(params.res, params.filters, timeZone, params.kind, filename);

  return { kind: params.kind, format: params.format, rows };
}

export async function countOpsExportRows(filters: OpsExportFilters): Promise<number> {
  const settings = await loadGlobalSettings();
  return countPunchRows(filters, settings.defaultTimezone);
}
