export interface User {
  id: string;
  email: string;
  role: string;
  employeeId?: string;
  locationId?: string;
  employeeCode?: string;
  fullName?: string;
}

export interface EmployeeProfile {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone?: string;
  designation?: string;
  departmentName?: string;
  locationName?: string;
  joiningDate?: string;
  status: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  shiftName?: string;
  shiftTiming?: string;
  bankAccount?: string;
  pan?: string;
  uan?: string;
}

export interface LeaveBalance {
  leave_type_id: string;
  leave_code: string;
  leave_name: string;
  total_entitlement: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
}

export interface LeaveApplication {
  id: string;
  leave_type_code: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  is_half_day: boolean;
  half_day_session?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  rejection_reason?: string;
  created_at: string;
  employee_name?: string;
  employee_code?: string;
}

export interface PayslipSummary {
  id: string;
  period_start: string;
  period_end: string;
  basic_salary: number;
  allowances: number;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  run_status: string;
  employee_code: string;
  employee_name: string;
}

export interface SettlementStatus {
  id: string;
  exit_type: string;
  status: string;
  resignation_date?: string;
  last_working_date?: string;
  clearanceTasks: Array<{
    id: string;
    department_name: string;
    task_name: string;
    status: string;
  }>;
  settlement?: {
    id: string;
    status: string;
    net_payable: number;
    payment_reference?: string;
    payment_date?: string;
  };
}
