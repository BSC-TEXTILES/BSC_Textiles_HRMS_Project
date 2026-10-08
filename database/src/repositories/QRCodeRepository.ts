import { query, queryOne } from '../pool.js';

export interface QRCodeRow {
  id: string;
  employee_id: string;
  token: string;
  valid_date: string;
  is_active: boolean;
  expires_at: Date;
  created_at: Date;
}

export class QRCodeRepository {
  static async findValidToken(token: string): Promise<QRCodeRow | null> {
    return queryOne<QRCodeRow>(
      `SELECT * FROM qr_codes 
       WHERE token = ? AND is_active = TRUE AND valid_date = CURDATE() AND expires_at > NOW(3)
       LIMIT 1`,
      [token]
    );
  }

  static async getActiveByEmployee(employeeId: string): Promise<QRCodeRow | null> {
    return queryOne<QRCodeRow>(
      `SELECT * FROM qr_codes 
       WHERE employee_id = ? AND valid_date = CURDATE() AND is_active = TRUE
       LIMIT 1`,
      [employeeId]
    );
  }

  static async createToken(
    id: string,
    employeeId: string,
    token: string,
    validDate: string,
    expiresAt: Date
  ): Promise<void> {
    await query(
      `INSERT INTO qr_codes (id, employee_id, token, valid_date, is_active, expires_at)
       VALUES (?, ?, ?, ?, TRUE, ?)`,
      [id, employeeId, token, validDate, expiresAt]
    );
  }

  static async recordScan(
    id: string,
    qrCodeId: string,
    employeeId: string,
    scannerUserId: string,
    locationId: string,
    scanType: string,
    isValid: boolean,
    rejectionReason?: string
  ): Promise<void> {
    await query(
      `INSERT INTO qr_scan_records (id, qr_code_id, employee_id, scanner_user_id, location_id, scan_type, is_valid, rejection_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, qrCodeId, employeeId, scannerUserId, locationId, scanType, isValid, rejectionReason || null]
    );
  }
}
