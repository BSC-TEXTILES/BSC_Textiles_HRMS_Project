import { query } from '../pool.js';

export interface IncentiveRuleRow {
  id: string;
  location_id: string;
  name: string;
  type: string;
  rate_type: string;
  rate_value: number;
  threshold: number | null;
  cap_amount: number | null;
  is_active: boolean;
}

export class IncentiveRepository {
  static async listActiveRules(locationId: string): Promise<IncentiveRuleRow[]> {
    return query<IncentiveRuleRow>(
      `SELECT * FROM incentive_rules WHERE location_id = ? AND is_active = TRUE`,
      [locationId]
    );
  }

  static async grantIncentive(
    id: string,
    employeeId: string,
    ruleId: string,
    amount: number,
    date: string,
    breakdown: any
  ): Promise<void> {
    await query(
      `INSERT INTO incentive_grants (id, employee_id, rule_id, amount, granted_date, breakdown)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, employeeId, ruleId, amount, date, JSON.stringify(breakdown)]
    );
  }
}
