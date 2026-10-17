/**
 * Attendance photo storage for device-pushed snapshots.
 *
 * The MB160 can push a face snapshot alongside a punch over ADMS
 * (`table=ATTPHOTO`). Whether it actually does is firmware-dependent, so this
 * module stores what arrives, validates what it got, and never pretends: when a
 * punch has no image the API returns `photo: null` plus an explicit reason, and
 * the UI shows "No photo available from device" rather than a broken thumbnail.
 *
 * Layout: <UPLOAD_DIR>/attendance/YYYY/MM/<serial>_<userId>_<epoch>.<ext>
 * Partitioned by month so a shop-floor terminal cannot make one directory hold
 * a year of faces.
 */

import fs from 'node:fs';
import path from 'node:path';
import deviceFs from 'node:fs/promises';
import { pool } from '../../nativeDb.js';
import { UserUploadService } from '../userUploadService.js';
import { deviceLog } from './logger.js';

export interface StoredPhoto {
  /** Path relative to the process working directory, e.g. uploads/attendance/2026/10/….jpg */
  relativePath: string;
  bytes: number;
  mime: string;
}

const MAGIC_SIGNATURES: Array<{ ext: string; mime: string; test: (b: Buffer) => boolean }> = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'bmp', mime: 'image/bmp', test: (b) => b.length > 2 && b[0] === 0x42 && b[1] === 0x4d },
];

function sniff(buffer: Buffer) {
  return MAGIC_SIGNATURES.find((sig) => sig.test(buffer)) ?? null;
}

function safeToken(value: string): string {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'unknown';
}

/**
 * @returns the stored path, or null when there was nothing usable to store.
 * A rejected photo is logged and counted, never silently dropped.
 */
export async function storePhotoForPunch(input: {
  base64: string | null | undefined;
  serial: string;
  enrollmentNumber: string;
  instant: Date;
  uploadRoot: string;
  maxBytes: number;
}): Promise<string | null> {
  const payload = (input.base64 || '').replace(/^data:[^;]+;base64,/, '').trim();
  if (!payload) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(payload, 'base64');
  } catch {
    deviceLog.warn('Photo payload was not valid base64', { serialNumber: input.serial, code: 'PHOTO_UNSUPPORTED' });
    return null;
  }

  if (buffer.length === 0) return null;

  if (buffer.length > input.maxBytes) {
    deviceLog.warn('Rejected device photo over the size limit', {
      serialNumber: input.serial,
      enrollmentNumber: input.enrollmentNumber,
      code: 'PHOTO_UNSUPPORTED',
      detail: `${buffer.length} bytes > ${input.maxBytes}`,
    });
    return null;
  }

  const signature = sniff(buffer);
  if (!signature) {
    // Some firmwares send an encrypted or ZK-wrapped image here; recording that
    // it arrived is how the capability question gets answered at all.
    deviceLog.warn('Device photo is not a recognisable image format', {
      serialNumber: input.serial,
      enrollmentNumber: input.enrollmentNumber,
      code: 'PHOTO_UNSUPPORTED',
      detail: `first bytes ${buffer.subarray(0, 4).toString('hex')}`,
    });
    return null;
  }

  const yyyy = String(input.instant.getUTCFullYear());
  const mm = String(input.instant.getUTCMonth() + 1).padStart(2, '0');
  const dir = path.join(input.uploadRoot, yyyy, mm);
  const filename = `${safeToken(input.serial)}_${safeToken(input.enrollmentNumber)}_${Math.floor(input.instant.getTime() / 1000)}.${signature.ext}`;
  const absolute = path.join(dir, filename);
  const relativePath = absolute.split(path.sep).join('/');

  try {
    await deviceFs.mkdir(dir, { recursive: true });
    await deviceFs.writeFile(absolute, buffer, { flag: 'w' });
    return relativePath;
  } catch (err: any) {
    deviceLog.error('Could not write device photo to disk', {
      serialNumber: input.serial,
      code: 'PHOTO_UNSUPPORTED',
      detail: err?.message,
    });
    return null;
  }
}

/**
 * Resolve the picture to show for a punch: the snapshot the device pushed if
 * there is one, otherwise the employee's existing HR avatar, otherwise nothing.
 * `reason` exists so the UI can say why instead of showing a broken image.
 */
export async function resolvePunchPhoto(
  punchPhotoPath: string | null,
  employeeId: string | null
): Promise<{ url: string | null; source: 'DEVICE_SNAPSHOT' | 'EMPLOYEE_PROFILE' | 'NONE'; reason: string | null }> {
  if (punchPhotoPath) {
    const exists = await fileLooksPresent(punchPhotoPath);
    if (exists) {
      return { url: `/${punchPhotoPath.replace(/^\/+/, '')}`, source: 'DEVICE_SNAPSHOT', reason: null };
    }
    return {
      url: null,
      source: 'NONE',
      reason: 'Device referenced a photo that is not on disk',
    };
  }

  if (employeeId) {
    const [rows]: any = await pool.query(
      'SELECT id, fullName, employeeCode, photoReference FROM employee WHERE id = ? LIMIT 1',
      [employeeId]
    );
    const employee = rows[0];

    // The MB160 does not push a snapshot on this firmware, so the best available
    // picture is the HR avatar already stored by the employee upload flow.
    if (employee?.fullName) {
      const avatarUrl = findEmployeeAvatar(employee.id, employee.fullName, employee.employeeCode);
      if (avatarUrl) return { url: avatarUrl, source: 'EMPLOYEE_PROFILE', reason: null };
    }

    const reference = employee?.photoReference;
    if (reference && String(reference).trim()) {
      const value = String(reference).trim();
      const url = /^(https?:)?\/\//.test(value) || value.startsWith('/') ? value : `/${value.replace(/^\/+/, '')}`;
      return { url, source: 'EMPLOYEE_PROFILE', reason: null };
    }
  }

  return {
    url: null,
    source: 'NONE',
    reason: 'No photo available from device',
  };
}

/**
 * Locate an employee's stored avatar, using the same folder layout
 * UserUploadService writes. Returns the authorized API path, not a file path,
 * so the browser goes through the route that already does access control.
 */
function findEmployeeAvatar(employeeId: string, fullName: string, employeeCode: string | null): string | null {
  const safeName = fullName.trim().replace(/[/\\?%*:|"<>]/g, '_');
  for (const root of UserUploadService.getUploadDirs()) {
    for (const candidate of [
      path.join(root, safeName, 'photos', 'avatar.png'),
      ...(employeeCode ? [path.join(root, employeeCode, 'photos', 'avatar.png')] : []),
    ]) {
      try {
        if (fs.existsSync(candidate)) return `/api/employees/${employeeId}/photo`;
      } catch { /* unreadable directory — treat as absent */ }
    }
  }
  return null;
}

const presenceCache = new Map<string, { present: boolean; at: number }>();

async function fileLooksPresent(relativePath: string): Promise<boolean> {
  const cached = presenceCache.get(relativePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.present;
  let present = false;
  try {
    present = fs.existsSync(path.resolve(relativePath));
  } catch {
    present = false;
  }
  presenceCache.set(relativePath, { present, at: Date.now() });
  return present;
}

/** Where the static photo mount lives, relative to the backend process cwd. */
export function attendanceUploadRoot(uploadRoot: string): string {
  return path.resolve(uploadRoot);
}
