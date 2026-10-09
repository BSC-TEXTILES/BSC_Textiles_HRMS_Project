import { query } from '../pool.js';

export interface IncentiveRuleRow {
  id: string;
  locationId: string | null;
  name: string;
  incentiveType: string;
  calculationType: string;
  amount: number | null;
  percentage: number | null;
  targetAmount: number | null;
  status: string;
}

export class IncentiveRepository {
  static async listActiveRules(locationId: string): Promise<IncentiveRuleRow[]> {
    return query<IncentiveRuleRow>(
      `SELECT id, locationId, name, incentiveType, calculationType, amount, percentage, targetAmount, status
       FROM IncentiveRule WHERE locationId = ? AND status = 'ACTIVE'`,
      [locationId]
    );
  }

  static async grantIncentive(
    id: string,
    employeeId: string,
    ruleId: string,
    amount: number,
    date: string,
    breakdown: unknown
  ): Promise<void> {
    await query(
      `INSERT INTO IncentiveTransaction (id, employeeId, incentiveRuleId, transactionDate, calculationBasis, calculatedAmount, calculationDetails, status)
       VALUES (?, ?, ?, ?, 'MANUAL_GRANT', ?, ?, 'APPROVED')`,
      [id, employeeId, ruleId, date, amount, JSON.stringify(breakdown ?? {})]
    );
  }
}
