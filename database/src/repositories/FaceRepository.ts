import { query } from '../pool.js';

export interface FaceVerificationLogRow {
  id: string;
  employee_id: string;
  location_id: string;
  match_confidence: number;
  threshold_used: number;
  status: 'VERIFIED' | 'FAILED';
  captured_image_url: string | null;
  verified_at: Date;
}

export class FaceRepository {
  static async logVerification(
    id: string,
    employeeId: string,
    locationId: string,
    confidence: number,
    threshold: number,
    status: 'VERIFIED' | 'FAILED',
    imageUrl?: string
  ): Promise<void> {
    await query(
      `INSERT INTO face_verification_logs 
       (id, employee_id, location_id, match_confidence, threshold_used, status, captured_image_url, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [id, employeeId, locationId, confidence, threshold, status, imageUrl || null]
    );
  }

  static async getRecentLogs(employeeId: string, limit: number = 10): Promise<FaceVerificationLogRow[]> {
    return query<FaceVerificationLogRow>(
      `SELECT * FROM face_verification_logs 
       WHERE employee_id = ? 
       ORDER BY verified_at DESC 
       LIMIT ?`,
      [employeeId, limit]
    );
  }
}
