import { query } from '../pool.js';

export interface FaceVerificationRow {
  id: string;
  employeeId: string;
  locationId: string;
  deviceId: string | null;
  verifiedAt: Date;
  matchPercentage: number;
  threshold: number;
  result: 'VERIFIED' | 'FAILED';
  purpose: string | null;
}

export class FaceRepository {
  static async logVerification(
    id: string,
    employeeId: string,
    locationId: string,
    matchPercentage: number,
    threshold: number,
    result: 'VERIFIED' | 'FAILED',
    purpose: string = 'attendance',
    deviceId?: string
  ): Promise<void> {
    await query(
      `INSERT INTO FaceVerification (id, employeeId, locationId, deviceId, matchPercentage, threshold, result, purpose, verifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [id, employeeId, locationId, deviceId || null, matchPercentage, threshold, result, purpose]
    );
  }

  static async getRecentLogs(employeeId: string, limit: number = 10): Promise<FaceVerificationRow[]> {
    return query<FaceVerificationRow>(
      `SELECT * FROM FaceVerification
       WHERE employeeId = ?
       ORDER BY verifiedAt DESC
       LIMIT ?`,
      [employeeId, limit]
    );
  }
}
