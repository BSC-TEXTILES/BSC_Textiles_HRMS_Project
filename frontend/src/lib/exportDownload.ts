import api from './api';

/**
 * Shared download helper for the Attendance Excel Download endpoints
 * (`GET /attendance/exports/:kind`).
 *
 * Lives in one place because three screens offer the same download: the export
 * page itself, the statutory register, and any future attendance view. A blob
 * response that turns out to be an error JSON has to be read back into text
 * before the message can be shown, which is exactly the part each caller used to
 * get wrong.
 */

export type AttendanceExportKind = 'monthly' | 'annual' | 'punches';

export async function downloadAttendanceExport(
  kind: AttendanceExportKind,
  params: Record<string, string | number | undefined | null>,
  fallbackFilename: string
): Promise<string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    query[key] = String(value);
  }

  const { data, headers } = await api.get(`/attendance/exports/${kind}`, {
    params: query,
    responseType: 'blob',
  });

  const disposition = String(headers?.['content-disposition'] || '');
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || fallbackFilename;

  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data as BlobPart]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return filename;
}

/** Turns a failed export request into the message the server actually sent. */
export async function describeExportError(err: any): Promise<string> {
  const status = err?.response?.status;
  const payload = err?.response?.data;
  let detail: string | null = null;
  if (payload instanceof Blob) {
    try {
      const parsed = JSON.parse(await payload.text());
      detail = parsed?.error || parsed?.message || null;
    } catch {
      detail = null;
    }
  } else if (payload && typeof payload === 'object') {
    detail = payload.error || payload.message || null;
  }

  if (status === 403) return detail || 'Your role is not allowed to export attendance.';
  if (status === 429) return detail || 'Too many downloads in one minute — try again shortly.';
  if (status === 400) return detail || 'The selected period or filters were rejected.';
  return detail || 'Export failed. The filters were rejected or the server could not build the file.';
}
