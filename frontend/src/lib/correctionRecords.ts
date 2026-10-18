/**
 * Punch-correction (regularization) records.
 *
 * The queue is the server's `attendancecorrection` table, read through
 * GET /attendance/corrections. This module only types and normalises those rows —
 * no correction request, employee, store, shift or punch is ever seeded here.
 */

/** The only statuses `attendancecorrection.status` can hold. */
export type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * A regularization request exactly as GET /attendance/corrections returns it
 * (the `attendancecorrection` columns joined with the employee, location and
 * department names). Fields the API does not send are absent by design.
 */
export interface CorrectionRecord {
  id: string;
  employeeId: string | null;
  /** Real employee code from the join; '' when the row carries none. */
  empCode: string;
  name: string;
  role: string;
  dept: string;
  hub: string;
  attendanceDate: string;
  originalLogin: string | null;
  originalLogout: string | null;
  requestedLogin: string | null;
  requestedLogout: string | null;
  reason: string;
  status: CorrectionStatus;
  reviewNote: string;
  reviewedById: string | null;
  appliedAt: string | null;
  createdAt: string;
}

function isValidStatus(value: unknown): value is CorrectionStatus {
  return value === 'PENDING' || value === 'APPROVED' || value === 'REJECTED';
}

/** `YYYY-MM-DD` in local time from a Date / ISO string / DATE column. */
export function correctionDateKey(value: unknown): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Wall-clock text for a stored datetime, or null when nothing was recorded. */
export function correctionTimeText(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Full date + time text for a stored datetime, or null when absent. */
export function correctionStampText(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Maps one API row to the view model. Unknown values stay empty, never guessed. */
export function mapCorrectionRow(c: any): CorrectionRecord {
  return {
    id: String(c?.id ?? ''),
    employeeId: c?.employeeId ? String(c.employeeId) : null,
    empCode: c?.employeeCode || '',
    name: c?.employeeName || '',
    role: c?.designation || '',
    dept: c?.departmentName || '',
    hub: c?.locationName || '',
    attendanceDate: correctionDateKey(c?.attendanceDate),
    originalLogin: correctionTimeText(c?.originalLogin),
    originalLogout: correctionTimeText(c?.originalLogout),
    requestedLogin: correctionTimeText(c?.requestedLogin),
    requestedLogout: correctionTimeText(c?.requestedLogout),
    reason: c?.reason || '',
    status: isValidStatus(c?.status) ? c.status : 'PENDING',
    reviewNote: c?.reviewNote || '',
    reviewedById: c?.reviewedById ? String(c.reviewedById) : null,
    appliedAt: correctionStampText(c?.appliedAt),
    createdAt: c?.createdAt ? String(c.createdAt) : '',
  };
}

/** Raw datetime values kept for the edit form's datetime-local inputs. */
export function correctionInputValue(value: unknown): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
