/**
 * SettlementCalculationService: OOP service encapsulating F&F mathematical formulas
 * Transparent, policy-driven formulas without arbitrary hardcoding.
 */
export interface SettlementInput {
  baseMonthlySalary: number;
  lastWorkingDay: string;
  resignationDate: string;
  noticePeriodDays: number;
  unpaidSalaryDays: number;
  encashableLeaveDays: number;
  incentivesOrBonus?: number;
  otherEarnings?: number;
  dateOfJoining?: string | Date | null;
  noticePeriodServedDays?: number;
  salaryAdvanceRecovery?: number;
  loanBalanceRecovery?: number;
  assetDamageRecovery?: number;
  otherDeductions?: number;
}

export interface SettlementBreakdownResult {
  unpaidSalaryAmount: number;
  leaveEncashmentAmount: number;
  gratuityAmount: number;
  bonusIncentiveAmount: number;
  otherEarnings: number;
  totalEarnings: number;

  noticeShortfallDays: number;
  noticeRecoveryAmount: number;
  salaryAdvanceRecovery: number;
  loanBalanceRecovery: number;
  assetDamageRecovery: number;
  statutoryDeductions: number;
  otherDeductions: number;
  totalDeductions: number;

  netPayable: number;
  breakdown: Record<string, any>;
}

export class SettlementCalculationService {
  /**
   * Calculate transparent Full & Final settlement breakdown
   */
  public calculate(input: SettlementInput): SettlementBreakdownResult {
    const monthlySalary = Math.max(0, Number(input.baseMonthlySalary || 0));
    const dailyWageRate = Math.round((monthlySalary / 30) * 100) / 100;

    // 1. Unpaid salary for working days in last month
    const unpaidSalaryDays = Math.max(0, Number(input.unpaidSalaryDays || 0));
    const unpaidSalaryAmount = Math.round(dailyWageRate * unpaidSalaryDays * 100) / 100;

    // 2. Leave Encashment
    const leaveDays = Math.max(0, Number(input.encashableLeaveDays || 0));
    const leaveEncashmentAmount = Math.round(dailyWageRate * leaveDays * 100) / 100;

    // 3. Gratuity Calculation (Payment of Gratuity Act: 15 * Last Drawn / 26 * Completed Years, min 5 years)
    let completedYears = 0;
    let gratuityAmount = 0;
    if (input.dateOfJoining && input.lastWorkingDay) {
      const joinDate = new Date(input.dateOfJoining);
      const exitDate = new Date(input.lastWorkingDay);
      const diffMs = exitDate.getTime() - joinDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      completedYears = Math.floor(diffDays / 365.25);
      if (completedYears >= 5) {
        gratuityAmount = Math.round(((15 * monthlySalary) / 26) * completedYears * 100) / 100;
      }
    }

    // 4. Incentives, commissions & bonus
    const bonusIncentiveAmount = Math.max(0, Number(input.incentivesOrBonus || 0));
    const otherEarnings = Math.max(0, Number(input.otherEarnings || 0));

    const totalEarnings = Math.round(
      (unpaidSalaryAmount + leaveEncashmentAmount + gratuityAmount + bonusIncentiveAmount + otherEarnings) * 100
    ) / 100;

    // 5. Notice Period Shortfall Recovery
    const requiredNoticeDays = Math.max(0, Number(input.noticePeriodDays || 30));
    const servedNoticeDays = input.noticePeriodServedDays !== undefined
      ? Math.max(0, Number(input.noticePeriodServedDays))
      : requiredNoticeDays;
    const noticeShortfallDays = Math.max(0, requiredNoticeDays - servedNoticeDays);
    const noticeRecoveryAmount = Math.round(dailyWageRate * noticeShortfallDays * 100) / 100;

    // 6. Advances, loans and recoveries
    const salaryAdvanceRecovery = Math.max(0, Number(input.salaryAdvanceRecovery || 0));
    const loanBalanceRecovery = Math.max(0, Number(input.loanBalanceRecovery || 0));
    const assetDamageRecovery = Math.max(0, Number(input.assetDamageRecovery || 0));

    // 7. Statutory Deductions (Standard PF 12% on basic wage + PT ₹200)
    const pfDeduction = Math.round(Math.min(1800, unpaidSalaryAmount * 0.12) * 100) / 100;
    const professionalTax = unpaidSalaryAmount > 15000 ? 200 : 0;
    const statutoryDeductions = Math.round((pfDeduction + professionalTax) * 100) / 100;

    const otherDeductions = Math.max(0, Number(input.otherDeductions || 0));

    const totalDeductions = Math.round(
      (noticeRecoveryAmount + salaryAdvanceRecovery + loanBalanceRecovery + assetDamageRecovery + statutoryDeductions + otherDeductions) * 100
    ) / 100;

    const netPayable = Math.round((totalEarnings - totalDeductions) * 100) / 100;

    const breakdown = {
      baseMonthlySalary: monthlySalary,
      dailyWageRate,
      unpaidSalary: {
        days: unpaidSalaryDays,
        rate: dailyWageRate,
        total: unpaidSalaryAmount,
      },
      leaveEncashment: {
        days: leaveDays,
        rate: dailyWageRate,
        total: leaveEncashmentAmount,
      },
      gratuity: {
        completedYears,
        eligible: completedYears >= 5,
        formula: '15 * last_drawn_salary / 26 * completed_years (Min 5 Years Required)',
        total: gratuityAmount,
      },
      noticePeriod: {
        requiredDays: requiredNoticeDays,
        servedDays: servedNoticeDays,
        shortfallDays: noticeShortfallDays,
        recoveryTotal: noticeRecoveryAmount,
      },
      recoveries: {
        salaryAdvance: salaryAdvanceRecovery,
        loanBalance: loanBalanceRecovery,
        assetDamage: assetDamageRecovery,
      },
      statutory: {
        providentFund: pfDeduction,
        professionalTax,
        total: statutoryDeductions,
      },
      summary: {
        totalEarnings,
        totalDeductions,
        netPayable,
      },
    };

    return {
      unpaidSalaryAmount,
      leaveEncashmentAmount,
      gratuityAmount,
      bonusIncentiveAmount,
      otherEarnings,
      totalEarnings,
      noticeShortfallDays,
      noticeRecoveryAmount,
      salaryAdvanceRecovery,
      loanBalanceRecovery,
      assetDamageRecovery,
      statutoryDeductions,
      otherDeductions,
      totalDeductions,
      netPayable,
      breakdown,
    };
  }
}
