import { query, queryOne } from '../pool.js';

export interface QRCodeRow {
  id: string;
  token: string;
  type: 'EMPLOYEE' | 'DAILY';
  employeeId: string;
  locationId: string;
  validFrom: Date;
  validTo: Date;
  isConsumed: boolean;
  consumedAt: Date | null;
  consumedBy: string | null;
  purpose: string | null;
}

export class QRCodeRepository {
  static async findValidToken(token: string): Promise<QRCodeRow | null> {
    return queryOne<QRCodeRow>(
      `SELECT * FROM QRCode
       WHERE token = ? AND isConsumed = FALSE AND validFrom <= NOW(3) AND validTo >= NOW(3)
       LIMIT 1`,
      [token]
    );
  }

  static async getActiveByEmployee(employeeId: string, date: string = new Date().toISOString().slice(0, 10)): Promise<QRCodeRow | null> {
    return queryOne<QRCodeRow>(
      `SELECT * FROM QRCode
       WHERE employeeId = ? AND type = 'DAILY' AND DATE(validFrom) = ? AND isConsumed = FALSE
       ORDER BY validFrom DESC LIMIT 1`,
      [employeeId, date]
    );
  }

  static async createDailyToken(
    id: string,
    employeeId: string,
    locationId: string,
    token: string,
    validFrom: Date,
    validTo: Date
  ): Promise<void> {
    await query(
      `INSERT INTO QRCode (id, token, type, employeeId, locationId, validFrom, validTo, isConsumed, purpose)
       VALUES (?, ?, 'DAILY', ?, ?, ?, ?, FALSE, 'ATTENDANCE_CHECK_IN')`,
      [id, token, employeeId, locationId, validFrom, validTo]
    );
  }

  static async consumeToken(tokenId: string, consumedBy: string): Promise<boolean> {
    const result: any = await query(
      `UPDATE QRCode SET isConsumed = TRUE, consumedAt = NOW(3), consumedBy = ?, updatedAt = NOW(3)
       WHERE id = ? AND isConsumed = FALSE`,
      [consumedBy, tokenId]
    );
    return result.affectedRows > 0;
  }

  static async recordScan(
    id: string,
    qrCodeId: string,
    employeeId: string,
    scannerId: string,
    locationId: string,
    purpose: string,
    result: string,
    failureReason?: string,
    ipAddress?: string
  ): Promise<void> {
    await query(
      `INSERT INTO QRScanRecord (id, qrCodeId, employeeId, scannerId, locationId, purpose, result, failureReason, ipAddress)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, qrCodeId, employeeId, scannerId, locationId, purpose, result, failureReason || null, ipAddress || null]
    );
  }
}
