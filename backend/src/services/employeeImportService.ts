/**
 * Bulk Employee Import — schema, validation, preview, execution and reporting.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the CSV contract:
 *   `IMPORT_COLUMNS` drives the downloadable sample template, the backend
 *   validator, the preview payload AND the employee CSV export, so the template
 *   can never drift from what the backend actually accepts.
 *
 * Design principles
 * -----------------
 *  - Nothing is written to `employee` until the user has validated the preview
 *    and explicitly confirmed the import.
 *  - Updates are non-destructive: blank cells preserve existing values.
 *  - Employee IDs are never changed by an import. Legacy/test identifiers are
 *    reported, never silently overwritten.
 *  - Matching prioritises the Employee ID, then legacy code, verified mobile
 *    number and email. Employees are NEVER merged on name similarity.
 *  - All writes happen in a single database transaction; a database-level
 *    failure rolls the whole batch back so no half-imported state survives.
 */
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { prisma, pool } from '../db.js';
import { shardManager } from '../core/sharding/ShardConnectionManager.js';
import { DatabaseBackupService } from './databaseBackupService.js';
import {
  parseCsv,
  toCsv,
  normalizeHeader,
  normalizePhone,
  normalizeEmail,
  guardFormula,
} from './employeeCsvService.js';
import {
  allocateEmployeeId,
  classifyEmployeeCode,
  getEmployeeIdPolicy,
  matchesActiveFormat,
  EmployeeIdPolicy,
} from './employeeIdService.js';

export type ImportMode = 'new' | 'update' | 'upsert' | 'replace_roster';
export type RowAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';

export interface ImportColumn {
  key: string;
  label: string;
  group: 'identification' | 'contact' | 'work_allocation' | 'hr_payroll' | 'attendance_biometric' | 'administrative';
  /** 'required' columns must be present in the file; 'new' = required when creating an employee. */
  presence: 'required' | 'new' | 'optional';
  description: string;
  example: string;
  /** Lands in a real `employee` column (documented mapping). */
  dbColumn: string;
  /** Masked in exports for users without statutory/bank visibility rights. */
  sensitive?: boolean;
  /** Computed from other columns — accepted for round-tripping but never written. */
  readOnly?: boolean;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  // ── Employee identification ────────────────────────────────────────────────
  { key: 'employee_id', label: 'Employee ID', group: 'identification', presence: 'optional', dbColumn: 'employee.employeeCode', description: 'Official unique Employee ID (digits only, 1-30 characters). Used to match existing employees. Auto-generated when blank.', example: '000123' },
  { key: 'employee_code', label: 'Employee Code (Legacy)', group: 'identification', presence: 'optional', dbColumn: 'employee.legacyEmployeeCode', description: 'Pre-existing / legacy identifier kept alongside the official Employee ID. Never overwrites it.', example: '1372' },
  { key: 'first_name', label: 'First Name', group: 'identification', presence: 'new', dbColumn: 'employee.firstName', description: 'Given name. Required for new employees.', example: 'Anitha' },
  { key: 'middle_name', label: 'Middle Name', group: 'identification', presence: 'optional', dbColumn: 'employee.middleName', description: 'Middle name, if any.', example: 'Raghavendra' },
  { key: 'last_name', label: 'Last Name', group: 'identification', presence: 'new', dbColumn: 'employee.lastName', description: 'Family name. Required for new employees.', example: 'Naik' },
  { key: 'full_name', label: 'Full Name', group: 'identification', presence: 'optional', dbColumn: 'employee.fullName', description: 'Display name. Derived from first + middle + last when blank.', example: 'Anitha Raghavendra Naik' },
  { key: 'designation', label: 'Designation', group: 'identification', presence: 'optional', dbColumn: 'employee.designation', description: 'Job title.', example: 'Sales Executive' },
  { key: 'role', label: 'Role', group: 'identification', presence: 'optional', dbColumn: 'employee.role', description: 'HRMS role. One of: SUPER_ADMIN, ADMIN, HR_MANAGER, HR_EXECUTIVE, PAYROLL_MANAGER, LOCATION_MANAGER, FLOOR_MANAGER, DEPARTMENT_MANAGER, TEAM_LEAD, SALES_EMPLOYEE, TEA_BREAK_MANAGER, T_SHOP_OWNER, HR_AUDITOR, EMPLOYEE.', example: 'SALES_EMPLOYEE' },
  { key: 'employment_type', label: 'Employment Type', group: 'identification', presence: 'optional', dbColumn: 'employee.employmentType', description: 'FULL_TIME, PART_TIME, CONTRACT, PROBATION or INTERN.', example: 'FULL_TIME' },
  { key: 'employment_status', label: 'Employment Status', group: 'identification', presence: 'optional', dbColumn: 'employee.status', description: 'ACTIVE, INACTIVE, ON_LEAVE or TERMINATED. Reactivating a closed employee needs HR authorisation.', example: 'ACTIVE' },

  // ── Contact information ────────────────────────────────────────────────────
  { key: 'mobile_number', label: 'Mobile Number', group: 'contact', presence: 'optional', dbColumn: 'employee.phone', description: 'Primary mobile, 10 digits or +91 format. Secondary matching key when Employee ID is blank.', example: '+91 98450 12345' },
  { key: 'alternate_mobile_number', label: 'Alternate Mobile', group: 'contact', presence: 'optional', dbColumn: 'employee.alternatePhone', description: 'Secondary contact number.', example: '9845012346' },
  { key: 'email', label: 'Email', group: 'contact', presence: 'optional', dbColumn: 'employee.email', description: 'Unique email address. Secondary matching key when Employee ID is blank.', example: 'anitha.naik@bsctextiles.in' },
  { key: 'emergency_contact_name', label: 'Emergency Contact Name', group: 'contact', presence: 'optional', dbColumn: 'employee.emergencyContactName', description: 'Name of the emergency contact person.', example: 'Raghavendra Naik' },
  { key: 'emergency_contact_number', label: 'Emergency Contact Number', group: 'contact', presence: 'optional', dbColumn: 'employee.emergencyContactNumber', description: 'Emergency contact phone number.', example: '9845012399' },
  { key: 'current_address', label: 'Current Address', group: 'contact', presence: 'optional', dbColumn: 'employee.currentAddress', description: 'Present residential address.', example: '45 Tilakwadi Main Road, Belagavi' },
  { key: 'permanent_address', label: 'Permanent Address', group: 'contact', presence: 'optional', dbColumn: 'employee.permanentAddress', description: 'Permanent residential address.', example: 'House 12, Hukkeri, Belagavi' },
  { key: 'city', label: 'City', group: 'contact', presence: 'optional', dbColumn: 'employee.city', description: 'City of residence.', example: 'Belagavi' },
  { key: 'state', label: 'State', group: 'contact', presence: 'optional', dbColumn: 'employee.state', description: 'State of residence.', example: 'Karnataka' },
  { key: 'pincode', label: 'Pincode', group: 'contact', presence: 'optional', dbColumn: 'employee.pincode', description: '6-digit postal code.', example: '590006' },

  // ── Store and work allocation ──────────────────────────────────────────────
  { key: 'location_code', label: 'Location Code', group: 'work_allocation', presence: 'new', dbColumn: 'employee.locationId ← location.code', description: 'Store / hub code: BEL, DAV, SHI or HUB. Required. Must be a location you are authorised for.', example: 'BEL' },
  { key: 'location_name', label: 'Location Name', group: 'work_allocation', presence: 'optional', dbColumn: '(validated against location.name)', description: 'Optional cross-check of the location code.', example: 'Belagavi Head Store' },
  { key: 'department', label: 'Department', group: 'work_allocation', presence: 'optional', dbColumn: 'employee.departmentId ← department.code|name', description: 'Department code or name within the location (e.g. SALES, OPS, HR).', example: 'SALES' },
  { key: 'floor', label: 'Floor', group: 'work_allocation', presence: 'optional', dbColumn: 'employee.floorId ← floor.name|number', description: 'Floor name or number within the location (e.g. Ground Floor, 0).', example: 'Ground Floor' },
  { key: 'section', label: 'Section', group: 'work_allocation', presence: 'optional', dbColumn: 'employee.sectionId ← section.code|name', description: 'Section code or name (e.g. Silk Sarees, BEL-SEC-1).', example: 'Silk Sarees' },
  { key: 'shift_id', label: 'Shift Code', group: 'work_allocation', presence: 'optional', dbColumn: 'employee.shiftId ← shift.code', description: 'Shift code within the location: GENERAL, MORNING, EVENING or NIGHT.', example: 'GENERAL' },
  { key: 'shift_name', label: 'Shift Name', group: 'work_allocation', presence: 'optional', dbColumn: 'employee.shiftId ← shift.name', description: 'Shift name within the location (alternative to shift_id).', example: 'General Shift' },
  { key: 'reporting_manager_employee_id', label: 'Reporting Manager Employee ID', group: 'work_allocation', presence: 'optional', dbColumn: 'employee.reportingManagerId ← employee.id', description: 'Employee ID of the reporting manager.', example: '000003' },
  { key: 'joining_date', label: 'Joining Date', group: 'work_allocation', presence: 'new', dbColumn: 'employee.joiningDate', description: 'Date of joining (YYYY-MM-DD or DD/MM/YYYY). Required for new employees.', example: '2026-01-15' },
  { key: 'confirmation_date', label: 'Confirmation Date', group: 'work_allocation', presence: 'optional', dbColumn: 'employee.confirmationDate', description: 'Date of confirmation after probation.', example: '2026-07-15' },
  { key: 'employee_category', label: 'Employee Category', group: 'work_allocation', presence: 'optional', dbColumn: 'employee.employeeCategory', description: 'STAFF, WORKER, MANAGEMENT or CONTRACT.', example: 'STAFF' },

  // ── HR and payroll references ──────────────────────────────────────────────
  { key: 'date_of_birth', label: 'Date of Birth', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.dateOfBirth', description: 'Date of birth (YYYY-MM-DD).', example: '1996-04-12' },
  { key: 'gender', label: 'Gender', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.gender', description: 'MALE, FEMALE or OTHER (M/F/O also accepted).', example: 'FEMALE' },
  { key: 'payroll_employee_code', label: 'Payroll Employee Code', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.payrollEmployeeCode', description: 'Code used by the payroll provider, if different from the Employee ID.', example: 'PAY-0036' },
  { key: 'pf_applicable', label: 'PF Applicable', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.pfApplicable', description: 'TRUE/FALSE (YES/NO or 1/0 also accepted).', example: 'TRUE' },
  { key: 'uan_number', label: 'UAN Number', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.uanNo', description: 'Universal Account Number.', example: '101234567890' },
  { key: 'esi_applicable', label: 'ESI Applicable', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.esiApplicable', description: 'TRUE/FALSE (YES/NO or 1/0 also accepted).', example: 'FALSE' },
  { key: 'esi_number', label: 'ESI Number', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.esiNo', description: 'ESI registration number.', example: '3109284719' },
  { key: 'bank_account_reference', label: 'Bank Account Reference', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.bankAccount', description: 'Bank account reference. Masked in exports for unauthorised users.', example: 'XXXX4819', sensitive: true },
  { key: 'ifsc_code', label: 'IFSC Code', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.bankIfsc', description: 'Bank branch IFSC.', example: 'SBIN0001248' },
  { key: 'pan_number', label: 'PAN Number', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.panNumber', description: 'PAN. Masked in exports for unauthorised users.', example: 'ABZPP4912K', sensitive: true },
  { key: 'aadhaar_verification_status', label: 'Aadhaar Verification Status', group: 'hr_payroll', presence: 'optional', dbColumn: 'employee.aadhaarVerificationStatus', description: 'Status only — NOT_VERIFIED, PENDING, VERIFIED or REJECTED. Never put an Aadhaar number in this file.', example: 'VERIFIED' },

  // ── Attendance and biometric references ────────────────────────────────────
  { key: 'biometric_enrollment_status', label: 'Biometric Enrollment Status', group: 'attendance_biometric', presence: 'optional', dbColumn: '(computed from faceProfileId)', description: 'ENROLLED or NOT_ENROLLED. Read-only: derived from the employee face profile.', example: 'NOT_ENROLLED', readOnly: true },
  { key: 'biometric_device_employee_id', label: 'Biometric Device Employee ID', group: 'attendance_biometric', presence: 'optional', dbColumn: 'employee.biometricDeviceEmployeeId', description: 'Employee number programmed into the biometric device.', example: 'BIO-1372' },
  { key: 'attendance_eligibility', label: 'Attendance Eligibility', group: 'attendance_biometric', presence: 'optional', dbColumn: 'employee.attendanceEligible', description: 'TRUE/FALSE — whether the employee punches attendance.', example: 'TRUE' },

  // ── Additional administrative fields ───────────────────────────────────────
  { key: 'employee_photo_reference', label: 'Employee Photo Reference', group: 'administrative', presence: 'optional', dbColumn: 'employee.photoReference', description: 'Reference or path to the on-file photograph.', example: '/uploads/anitha_naik/photos/avatar.png' },
  { key: 'employee_document_status', label: 'Employee Document Status', group: 'administrative', presence: 'optional', dbColumn: 'employee.documentStatus', description: 'COMPLETE, PENDING or PARTIAL.', example: 'PENDING' },
  { key: 'remarks', label: 'Remarks', group: 'administrative', presence: 'optional', dbColumn: 'employee.remarks', description: 'Free-text HR remarks.', example: 'Referred by floor supervisor' },
];

export const IMPORT_COLUMN_KEYS = IMPORT_COLUMNS.map((c) => c.key);
const REQUIRED_HEADERS = IMPORT_COLUMNS.filter((c) => c.presence === 'required').map((c) => c.key);
const NEW_REQUIRED = IMPORT_COLUMNS.filter((c) => c.presence === 'new').map((c) => c.key);

const VALID_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER', 'LOCATION_MANAGER',
  'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SALES_EMPLOYEE', 'TEA_BREAK_MANAGER',
  'T_SHOP_OWNER', 'HR_AUDITOR', 'EMPLOYEE',
];
const VALID_EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'PROBATION', 'INTERN'];
const VALID_CATEGORIES = ['STAFF', 'WORKER', 'MANAGEMENT', 'CONTRACT'];
const VALID_DOC_STATUSES = ['COMPLETE', 'PENDING', 'PARTIAL'];
const VALID_AADHAAR_STATUS = ['NOT_VERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'];

/** employment_status aliases accepted from spreadsheets → canonical DB status. */
const STATUS_ALIASES: Record<string, { status: string; warning?: string }> = {
  ACTIVE: { status: 'ACTIVE' },
  A: { status: 'ACTIVE' },
  CURRENT: { status: 'ACTIVE' },
  ON_LEAVE: { status: 'ON_LEAVE' },
  ONLEAVE: { status: 'ON_LEAVE' },
  LEAVE: { status: 'ON_LEAVE' },
  INACTIVE: { status: 'INACTIVE' },
  SUSPENDED: { status: 'INACTIVE', warning: 'SUSPENDED mapped to INACTIVE' },
  TERMINATED: { status: 'TERMINATED' },
  TERMINATE: { status: 'TERMINATED' },
  LEFT: { status: 'TERMINATED', warning: 'LEFT mapped to TERMINATED' },
  RESIGNED: { status: 'TERMINATED', warning: 'RESIGNED mapped to TERMINATED' },
  EXITED: { status: 'TERMINATED', warning: 'EXITED mapped to TERMINATED' },
  RETIRED: { status: 'TERMINATED', warning: 'RETIRED mapped to TERMINATED' },
  PROBATION: { status: 'ACTIVE', warning: 'PROBATION mapped to ACTIVE (no separate probation status exists)' },
};

const CLOSED_STATUSES = new Set(['INACTIVE', 'TERMINATED']);

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportActor {
  userId: string;
  userName: string;
  role: string;
  /** NULL/undefined = organisation-wide (elevated roles only). */
  locationId?: string | null;
  permissions: string[];
}

export interface ReferenceData {
  locations: Array<{ id: string; code: string; name: string }>;
  departments: Array<{ id: string; code: string; name: string; locationId: string }>;
  floors: Array<{ id: string; name: string; floorNumber: number; locationId: string }>;
  sections: Array<{ id: string; code: string; name: string; locationId: string }>;
  shifts: Array<{ id: string; code: string; name: string; locationId: string; status: string }>;
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
  significant?: boolean;
  restricted?: boolean;
}

export interface PreviewRow {
  rowNumber: number;
  employeeId: string;
  employeeIdKind: string;
  employeeName: string;
  mobile: string;
  email: string;
  designation: string;
  role: string;
  locationCode: string;
  department: string;
  floor: string;
  shift: string;
  employmentStatus: string;
  action: RowAction;
  matchedEmployeeId?: string;
  matchedByName?: string;
  changes: FieldChange[];
  errors: string[];
  warnings: string[];
}

export interface ImportSummary {
  totalRows: number;
  validNew: number;
  existingUpdates: number;
  duplicates: number;
  missingOrInvalidIds: number;
  invalidReferenceValues: number;
  needsAttention: number;
  cannotImport: number;
  skipped: number;
  absentActiveCount?: number;
}

export interface AbsentActiveEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  locationCode: string;
  designation: string;
  action: 'DEACTIVATE_ON_REPLACE';
}

export interface PreviewResult {
  batchRef: string;
  fileName: string;
  fileHash: string;
  mode: ImportMode;
  policy: EmployeeIdPolicy;
  columns: ImportColumn[];
  unknownColumns: string[];
  missingRequiredColumns: string[];
  fileErrors: string[];
  rows: PreviewRow[];
  summary: ImportSummary;
  duplicateFileWarning: string | null;
  absentActiveEmployees?: AbsentActiveEmployee[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ELEVATED = new Set(['SUPER_ADMIN', 'ADMIN']);
const HR_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER']);

export function canImport(actor: ImportActor): boolean {
  if (actor.role === 'SUPER_ADMIN') return true;
  if (ELEVATED.has(actor.role)) return true;
  if (!HR_ROLES.has(actor.role)) return false;
  return actor.permissions.includes('ADD') || actor.permissions.includes('EDIT');
}

export function canViewSensitive(actor: ImportActor): boolean {
  return ELEVATED.has(actor.role) || ['HR_MANAGER', 'PAYROLL_MANAGER'].includes(actor.role);
}

/** Rows outside the actor's location scope are rejected server-side. */
function isLocationAllowed(actor: ImportActor, locationId: string): boolean {
  if (ELEVATED.has(actor.role)) return true;
  return !actor.locationId || actor.locationId === locationId;
}

function boolish(raw: any): boolean | null {
  const v = String(raw ?? '').trim().toUpperCase();
  if (['TRUE', 'T', 'YES', 'Y', '1'].includes(v)) return true;
  if (['FALSE', 'F', 'NO', 'N', '0'].includes(v)) return false;
  return null;
}

function parseDateValue(raw: any): Date | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return safeDate(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); // DD/MM/YYYY (Indian convention)
  if (m) return safeDate(+m[3], +m[2], +m[1]);
  m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/); // DD/MM/YY
  if (m) return safeDate(2000 + +m[3], +m[2], +m[1]);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

function isoDate(value: any): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function normalizeRole(raw: any): string | null {
  const v = String(raw ?? '').trim().toUpperCase().replace(/[\s\-]+/g, '_');
  if (!v) return null;
  if (VALID_ROLES.includes(v)) return v;
  const compact = v.replace(/_/g, '');
  return VALID_ROLES.find((r) => r.replace(/_/g, '') === compact) || null;
}

function maskValue(value: string): string {
  if (!value) return '';
  const s = String(value);
  return s.length > 4 ? `XXXX${s.slice(-4)}` : 'XXXX';
}

/** Detect cells a spreadsheet would treat as a formula — kept literal, but flagged. */
function formulaWarning(key: string, value: string): string | null {
  if (value && /^[=+@\t\r]/.test(value)) {
    return `"${key}" starts with a spreadsheet formula character; the value is stored as plain text`;
  }
  if (value && /^-(?!\d)/.test(value)) {
    return `"${key}" starts with '-'; the value is stored as plain text`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample template (generated FROM the import schema — never hand-maintained)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Downloadable sample template.
 *
 * Contains the exact headers the backend accepts plus three illustrative
 * employees. Sensitive identity/banking/statutory values are deliberately
 * fictitious placeholders — no real Aadhaar, PAN or bank data is included.
 */
export async function buildTemplateCsv(): Promise<string> {
  const policy = await getEmployeeIdPolicy().catch(() => null);
  const previewId = (n: number) =>
    policy ? `${policy.prefix}${String(n).padStart(policy.padding, '0')}` : String(n).padStart(6, '0');

  const header = IMPORT_COLUMNS.map((c) => c.key);

  const sample1: Record<string, string> = {
    employee_id: '',
    employee_code: '',
    first_name: 'Anitha',
    middle_name: 'Raghavendra',
    last_name: 'Naik',
    full_name: '',
    designation: 'Sales Executive',
    role: 'SALES_EMPLOYEE',
    employment_type: 'FULL_TIME',
    employment_status: 'ACTIVE',
    mobile_number: '+91 98450 12345',
    alternate_mobile_number: '+91 98450 12346',
    email: 'anitha.naik@bsctextiles.in',
    emergency_contact_name: 'Raghavendra Naik',
    emergency_contact_number: '+91 98450 12399',
    current_address: '45 Tilakwadi Main Road, Belagavi',
    permanent_address: 'House 12, Hukkeri, Belagavi',
    city: 'Belagavi',
    state: 'Karnataka',
    pincode: '590006',
    location_code: 'BEL',
    location_name: 'Belagavi Head Store',
    department: 'SALES',
    floor: 'Ground Floor',
    section: 'Silk Sarees',
    shift_id: 'GENERAL',
    shift_name: '',
    reporting_manager_employee_id: '',
    joining_date: '2026-01-15',
    confirmation_date: '2026-07-15',
    employee_category: 'STAFF',
    date_of_birth: '1996-04-12',
    gender: 'FEMALE',
    payroll_employee_code: 'PAY-0036',
    pf_applicable: 'TRUE',
    uan_number: '101234567890',
    esi_applicable: 'FALSE',
    esi_number: '',
    bank_account_reference: 'XXXX4819',
    ifsc_code: 'SBIN0001248',
    pan_number: 'ABZPP4912K',
    aadhaar_verification_status: 'VERIFIED',
    biometric_enrollment_status: 'NOT_ENROLLED',
    biometric_device_employee_id: '',
    
    attendance_eligibility: 'TRUE',
    employee_photo_reference: '',
    employee_document_status: 'PENDING',
    remarks: 'Example row 1 — new employee, leave employee_id blank to auto-generate',
  };

  const sample2: Record<string, string> = {
    employee_id: previewId(37),
    employee_code: '',
    first_name: 'Manoj',
    middle_name: '',
    last_name: 'Kulkarni',
    full_name: '',
    designation: 'Floor Supervisor',
    role: 'FLOOR_MANAGER',
    employment_type: 'FULL_TIME',
    employment_status: 'ACTIVE',
    mobile_number: '+91 98860 55521',
    alternate_mobile_number: '',
    email: 'manoj.kulkarni@bsctextiles.in',
    emergency_contact_name: 'Sunita Kulkarni',
    emergency_contact_number: '+91 98860 55599',
    current_address: '22 Saraswathi Nagar, Davanagere',
    permanent_address: '22 Saraswathi Nagar, Davanagere',
    city: 'Davanagere',
    state: 'Karnataka',
    pincode: '577004',
    location_code: 'DAV',
    location_name: 'Davanagere Mega Store',
    department: 'OPS',
    floor: 'First Floor',
    section: 'Mens Wear',
    shift_id: '',
    shift_name: 'Evening Shift',
    reporting_manager_employee_id: '',
    joining_date: '15/03/2024',
    confirmation_date: '15/09/2024',
    employee_category: 'STAFF',
    date_of_birth: '1990-11-02',
    gender: 'MALE',
    payroll_employee_code: '',
    pf_applicable: 'YES',
    uan_number: '',
    esi_applicable: 'NO',
    esi_number: '',
    bank_account_reference: '',
    ifsc_code: '',
    pan_number: '',
    aadhaar_verification_status: 'PENDING',
    biometric_enrollment_status: 'ENROLLED',
    biometric_device_employee_id: 'BIO-0037',
    
    attendance_eligibility: 'TRUE',
    employee_photo_reference: '',
    employee_document_status: 'COMPLETE',
    remarks: 'Example row 2 — existing employee being updated by Employee ID',
  };

  const sample3: Record<string, string> = {
    employee_id: '',
    employee_code: '1402',
    first_name: 'Shruthi',
    middle_name: '',
    last_name: 'Patil',
    full_name: 'Shruthi Patil',
    designation: 'HR Executive',
    role: 'HR_EXECUTIVE',
    employment_type: 'CONTRACT',
    employment_status: 'ON_LEAVE',
    mobile_number: '+91 98765 43210',
    alternate_mobile_number: '',
    email: 'shruthi.patil@bsctextiles.in',
    emergency_contact_name: 'Ganesh Patil',
    emergency_contact_number: '+91 98765 43211',
    current_address: '7 Shivaji Road, Shivamogga',
    permanent_address: '7 Shivaji Road, Shivamogga',
    city: 'Shivamogga',
    state: 'Karnataka',
    pincode: '577201',
    location_code: 'SHI',
    location_name: 'Shivamogga Flagship',
    department: 'HR',
    floor: '0',
    section: '',
    shift_id: 'MORNING',
    shift_name: '',
    reporting_manager_employee_id: '',
    joining_date: '2025-06-01',
    confirmation_date: '',
    employee_category: 'STAFF',
    date_of_birth: '1998-07-23',
    gender: 'FEMALE',
    payroll_employee_code: '',
    pf_applicable: 'TRUE',
    uan_number: '',
    esi_applicable: 'TRUE',
    esi_number: '',
    bank_account_reference: '',
    ifsc_code: '',
    pan_number: '',
    aadhaar_verification_status: 'NOT_VERIFIED',
    biometric_enrollment_status: 'NOT_ENROLLED',
    biometric_device_employee_id: '',
    
    attendance_eligibility: 'FALSE',
    employee_photo_reference: '',
    employee_document_status: 'PENDING',
    remarks: 'Example row 3 — legacy employee_code kept, new official ID will be generated',
  };

  const rows = [header, ...[sample1, sample2, sample3].map((s) => IMPORT_COLUMNS.map((c) => s[c.key] ?? ''))];

  // A short legend explaining mandatory vs optional columns, appended as
  // comment lines prefixed with '#' (the importer skips '#' lines).
  const legend = [
    '',
    '# BSC TEXTILES — BULK EMPLOYEE IMPORT TEMPLATE',
    '# ---------------------------------------------------------------------------',
    '# MANDATORY for every row        : location_code',
    '# MANDATORY for NEW employees    : first_name, last_name, joining_date',
    '# Optional matching key          : employee_id (matches an existing employee;',
    `#   leave blank to create a new employee — an ID such as ${IMPORT_COLUMNS[0].example} is generated for you)`,
    `# Accepted locations             : ${await locationLegend()}`,
    '# Accepted departments           : SALES, OPS, HR, FIN, INV, CS (by code or name)',
    '# Accepted shifts                : GENERAL, MORNING, EVENING, NIGHT (by code or name)',
    '# Accepted floors                : Ground Floor, First Floor, Second Floor, Third Floor (or 0-3)',
    '# Accepted roles                 : ' + VALID_ROLES.join(', '),
    '# Accepted employment_status     : ACTIVE, INACTIVE, ON_LEAVE, TERMINATED',
    '# Dates                          : YYYY-MM-DD or DD/MM/YYYY',
    '# Blank cells                    : keep the existing value (they do NOT clear fields)',
    '# Do NOT put Aadhaar numbers, passwords or other secrets in this file.',
    '# Save the file as CSV (UTF-8). Values beginning with = + - @ are stored as plain text.',
  ];

  // The legend is appended as raw '#' comment lines (not CSV fields) so it
  // stays human-readable in any editor and is skipped by the importer.
  return `${toCsv(rows)}\r\n${legend.join('\r\n')}`;
}

/**
 * Build a professionally styled Microsoft Excel (.xlsx) workbook.
 *
 * Includes:
 *  - Sheet 1 ("Employee Import Data"): Royal Cobalt Blue header (#1346A1), white text,
 *    auto-fitted column widths, frozen top row, explicit text formatting on all cells
 *    (preventing scientific notation on phone numbers and codes).
 *  - Sheet 2 ("📘 Instructions & Guidelines"): Complete field lookup guide, accepted store
 *    hub codes (BEL, DAV, SHI), department codes, shifts, roles, and mandatory rules.
 */
export async function buildTemplateExcel(): Promise<Buffer> {
  const policy = await getEmployeeIdPolicy().catch(() => null);
  const previewId = (n: number) =>
    policy ? `${policy.prefix}${String(n).padStart(policy.padding, '0')}` : String(n).padStart(6, '0');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BSC Textiles HRMS Platform';
  workbook.lastModifiedBy = 'BSC Textiles HRMS Platform';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 1: Data Entry Grid
  // ───────────────────────────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet('Employee Import Data', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }],
    properties: { defaultRowHeight: 22 },
  });

  // Calculate clean, wide columns so no header is cut off
  sheet.columns = IMPORT_COLUMNS.map((col) => {
    const rawLen = Math.max(col.key.length, col.label.length);
    const colWidth = Math.min(Math.max(rawLen + 6, 18), 38);
    return {
      header: col.key,
      key: col.key,
      width: colWidth,
    };
  });

  // Style Header Row (Row 1)
  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1346A1' }, // Royal Cobalt Blue
    };
    cell.font = {
      name: 'Segoe UI',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: false,
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0E357E' } },
      bottom: { style: 'medium', color: { argb: 'FF0E357E' } },
      left: { style: 'thin', color: { argb: 'FF2563EB' } },
      right: { style: 'thin', color: { argb: 'FF2563EB' } },
    };
  });

  // Sample data records
  const sample1: Record<string, string> = {
    employee_id: '',
    employee_code: '',
    first_name: 'Anitha',
    middle_name: 'Raghavendra',
    last_name: 'Naik',
    full_name: '',
    designation: 'Sales Executive',
    role: 'SALES_EMPLOYEE',
    employment_type: 'FULL_TIME',
    employment_status: 'ACTIVE',
    mobile_number: '+91 98450 12345',
    alternate_mobile_number: '+91 98450 12346',
    email: 'anitha.naik@bsctextiles.in',
    emergency_contact_name: 'Raghavendra Naik',
    emergency_contact_number: '+91 98450 12399',
    current_address: '45 Tilakwadi Main Road, Belagavi',
    permanent_address: 'House 12, Hukkeri, Belagavi',
    city: 'Belagavi',
    state: 'Karnataka',
    pincode: '590006',
    location_code: 'BEL',
    location_name: 'Belagavi Head Store',
    department: 'SALES',
    floor: 'Ground Floor',
    section: 'Silk Sarees',
    shift_id: 'GENERAL',
    shift_name: '',
    reporting_manager_employee_id: '',
    joining_date: '2026-01-15',
    confirmation_date: '2026-07-15',
    employee_category: 'STAFF',
    date_of_birth: '1996-04-12',
    gender: 'FEMALE',
    payroll_employee_code: 'PAY-0036',
    pf_applicable: 'TRUE',
    uan_number: '101234567890',
    esi_applicable: 'FALSE',
    esi_number: '',
    bank_account_reference: 'XXXX4819',
    ifsc_code: 'SBIN0001248',
    pan_number: 'ABZPP4912K',
    aadhaar_verification_status: 'VERIFIED',
    biometric_enrollment_status: 'NOT_ENROLLED',
    biometric_device_employee_id: '',
    
    attendance_eligibility: 'TRUE',
    employee_photo_reference: '',
    employee_document_status: 'PENDING',
    remarks: 'Sample 1: New employee — leave employee_id blank to auto-generate',
  };

  const sample2: Record<string, string> = {
    employee_id: previewId(37),
    employee_code: '',
    first_name: 'Manoj',
    middle_name: '',
    last_name: 'Kulkarni',
    full_name: '',
    designation: 'Floor Supervisor',
    role: 'FLOOR_MANAGER',
    employment_type: 'FULL_TIME',
    employment_status: 'ACTIVE',
    mobile_number: '+91 98860 55521',
    alternate_mobile_number: '',
    email: 'manoj.kulkarni@bsctextiles.in',
    emergency_contact_name: 'Sunita Kulkarni',
    emergency_contact_number: '+91 98860 55599',
    current_address: '22 Saraswathi Nagar, Davanagere',
    permanent_address: '22 Saraswathi Nagar, Davanagere',
    city: 'Davanagere',
    state: 'Karnataka',
    pincode: '577004',
    location_code: 'DAV',
    location_name: 'Davanagere Mega Store',
    department: 'OPS',
    floor: 'First Floor',
    section: 'Mens Wear',
    shift_id: '',
    shift_name: 'Evening Shift',
    reporting_manager_employee_id: '',
    joining_date: '15/03/2024',
    confirmation_date: '15/09/2024',
    employee_category: 'STAFF',
    date_of_birth: '1990-11-02',
    gender: 'MALE',
    payroll_employee_code: '',
    pf_applicable: 'YES',
    uan_number: '',
    esi_applicable: 'NO',
    esi_number: '',
    bank_account_reference: '',
    ifsc_code: '',
    pan_number: '',
    aadhaar_verification_status: 'PENDING',
    biometric_enrollment_status: 'ENROLLED',
    biometric_device_employee_id: 'BIO-0037',
    
    attendance_eligibility: 'TRUE',
    employee_photo_reference: '',
    employee_document_status: 'COMPLETE',
    remarks: 'Sample 2: Existing employee updated by employee_id',
  };

  const sample3: Record<string, string> = {
    employee_id: '',
    employee_code: '1402',
    first_name: 'Shruthi',
    middle_name: '',
    last_name: 'Patil',
    full_name: 'Shruthi Patil',
    designation: 'HR Executive',
    role: 'HR_EXECUTIVE',
    employment_type: 'CONTRACT',
    employment_status: 'ON_LEAVE',
    mobile_number: '+91 98765 43210',
    alternate_mobile_number: '',
    email: 'shruthi.patil@bsctextiles.in',
    emergency_contact_name: 'Ganesh Patil',
    emergency_contact_number: '+91 98765 43211',
    current_address: '7 Shivaji Road, Shivamogga',
    permanent_address: '7 Shivaji Road, Shivamogga',
    city: 'Shivamogga',
    state: 'Karnataka',
    pincode: '577201',
    location_code: 'SHI',
    location_name: 'Shivamogga Flagship',
    department: 'HR',
    floor: '0',
    section: '',
    shift_id: 'MORNING',
    shift_name: '',
    reporting_manager_employee_id: '',
    joining_date: '2025-06-01',
    confirmation_date: '',
    employee_category: 'STAFF',
    date_of_birth: '1998-07-23',
    gender: 'FEMALE',
    payroll_employee_code: '',
    pf_applicable: 'TRUE',
    uan_number: '',
    esi_applicable: 'TRUE',
    esi_number: '',
    bank_account_reference: '',
    ifsc_code: '',
    pan_number: '',
    aadhaar_verification_status: 'NOT_VERIFIED',
    biometric_enrollment_status: 'NOT_ENROLLED',
    biometric_device_employee_id: '',
    
    attendance_eligibility: 'FALSE',
    employee_photo_reference: '',
    employee_document_status: 'PENDING',
    remarks: 'Sample 3: Legacy code match, new official ID assigned',
  };

  const sampleRows = [sample1, sample2, sample3];
  sampleRows.forEach((s, idx) => {
    const rowValues = IMPORT_COLUMNS.map((col) => s[col.key] ?? '');
    const addedRow = sheet.addRow(rowValues);
    addedRow.height = 22;
    addedRow.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10 };
      // Explicit text format: Excel will NEVER turn numbers into scientific notation (e.g. 9.85E+09)
      cell.numFmt = '@';
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      if (idx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 2: Instructions & Lookup Codes (The formatted "side" guide)
  // ───────────────────────────────────────────────────────────────────────────
  const guideSheet = workbook.addWorksheet('📘 Instructions & Guidelines', {
    views: [{ state: 'normal' }],
  });
  guideSheet.getColumn(1).width = 24;
  guideSheet.getColumn(2).width = 32;
  guideSheet.getColumn(3).width = 45;
  guideSheet.getColumn(4).width = 38;

  // Banner
  const titleRow = guideSheet.addRow(['BSC TEXTILES — BULK WORKFORCE IMPORT SPECIFICATION']);
  titleRow.height = 36;
  guideSheet.mergeCells('A1:D1');
  const titleCell = guideSheet.getCell('A1');
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1346A1' },
  };
  titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  guideSheet.addRow([]);

  // Section 1: Overview
  const sec1 = guideSheet.addRow(['1. CORE IMPORT RULES & WORKFLOW']);
  sec1.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1346A1' } };
  guideSheet.addRow(['Rule', 'Requirement', 'Description', 'Notes']);
  const s1Header = guideSheet.lastRow!;
  s1Header.font = { bold: true };
  guideSheet.addRow(['Mandatory for ALL rows', 'location_code', 'Store retail hub code (e.g. BEL, DAV, SHI)', 'Rows outside authorized hub are rejected']);
  guideSheet.addRow(['Mandatory for NEW staff', 'first_name, last_name, joining_date', 'Basic identity and date of joining', 'Required when employee_id is left blank']);
  guideSheet.addRow(['Auto ID Allocation', 'employee_id blank', 'System automatically allocates next sequential ID', 'Format: numeric, zero-padded sequential counter']);
  guideSheet.addRow(['Updates & Upserts', 'employee_id or legacy employee_code', 'Matches existing employee record to update', 'Blank cells preserve existing values']);
  guideSheet.addRow(['Phone Numbers', 'mobile_number, emergency_contact_number', '10 digits (e.g. 9845012345 or +91 98450 12345)', 'Stored as exact text to prevent scientific notation']);

  guideSheet.addRow([]);

  // Section 2: Store Locations
  const sec2 = guideSheet.addRow(['2. KARNATAKA STORE HUBS (location_code)']);
  sec2.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1346A1' } };
  guideSheet.addRow(['Location Code', 'Store Location Name', 'Region / State', 'Status']);
  guideSheet.lastRow!.font = { bold: true };
  guideSheet.addRow(['BEL', 'Belagavi Head Store', 'Belagavi, Karnataka', 'ACTIVE']);
  guideSheet.addRow(['DAV', 'Davanagere Mega Store', 'Davanagere, Karnataka', 'ACTIVE']);
  guideSheet.addRow(['SHI', 'Shivamogga Flagship', 'Shivamogga, Karnataka', 'ACTIVE']);

  guideSheet.addRow([]);

  // Section 3: Departments & Shifts
  const sec3 = guideSheet.addRow(['3. DEPARTMENTS, SHIFTS & FLOORS']);
  sec3.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1346A1' } };
  guideSheet.addRow(['Category', 'Accepted Codes / Values', 'Description', 'Example']);
  guideSheet.lastRow!.font = { bold: true };
  guideSheet.addRow(['Departments', 'SALES, OPS, HR, FIN, INV, CS', 'Retail, Operations, HR, Finance, Inventory, Support', 'SALES']);
  guideSheet.addRow(['Shifts', 'GENERAL, MORNING, EVENING, NIGHT', 'Assigned work shift', 'GENERAL']);
  guideSheet.addRow(['Floors', 'Ground Floor, First Floor, Second Floor, Third Floor (or 0, 1, 2, 3)', 'Store floor location', 'Ground Floor']);

  guideSheet.addRow([]);

  // Section 4: Valid Roles
  const sec4 = guideSheet.addRow(['4. WORKFORCE ROLES (role)']);
  sec4.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1346A1' } };
  guideSheet.addRow(['Role Code', 'Title / Function', 'Access Level', 'Example']);
  guideSheet.lastRow!.font = { bold: true };
  VALID_ROLES.forEach((r) => {
    guideSheet.addRow([r, r.replace(/_/g, ' '), 'Workforce Role', r]);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as any);
}

/**
 * Convert an uploaded Excel workbook buffer into standard RFC 4180 CSV text.
 * Reads the first worksheet and preserves text formatting so phone numbers and
 * employee codes are never parsed into scientific notation.
 */
export async function excelToCsv(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) {
    throw new Error('The uploaded Excel workbook contains no active worksheets.');
  }

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const rowValues: string[] = [];
    const cellCount = row.cellCount;
    for (let c = 1; c <= cellCount; c++) {
      const cell = row.getCell(c);
      let val = '';
      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === 'object' && 'text' in cell.value) {
          val = String(cell.value.text);
        } else if (cell.value instanceof Date) {
          val = cell.value.toISOString().slice(0, 10);
        } else {
          val = String(cell.value);
        }
      }
      rowValues.push(val);
    }
    if (rowValues.some((v) => v.trim() !== '')) {
      rows.push(rowValues);
    }
  });

  return toCsv(rows, { guardFormulas: false });
}

async function locationLegend(): Promise<string> {
  try {
    const rows: any[] = await prisma.$queryRaw(`SELECT code, name FROM location WHERE status = 'ACTIVE' ORDER BY code`);
    return (rows || []).map((r) => `${r.code} (${r.name})`).join(', ');
  } catch {
    return 'BEL, DAV, SHI, HUB';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference & existing-employee loading
// ─────────────────────────────────────────────────────────────────────────────

export async function loadReferenceData(): Promise<ReferenceData> {
  const [locations, departments, floors, sections, shifts]: any[][] = await Promise.all([
    prisma.$queryRaw(`SELECT id, code, name FROM location WHERE status <> 'ARCHIVED'`),
    prisma.$queryRaw(`SELECT id, code, name, locationId FROM department`),
    prisma.$queryRaw(`SELECT id, name, floorNumber, locationId FROM floor`),
    prisma.$queryRaw(`SELECT id, code, name, locationId FROM section`),
    prisma.$queryRaw(`SELECT id, code, name, locationId, status FROM shift`),
  ]);
  return {
    locations: locations || [],
    departments: departments || [],
    floors: floors || [],
    sections: sections || [],
    shifts: shifts || [],
  };
}

interface ExistingEmployee {
  id: string;
  employeeCode: string;
  legacyEmployeeCode: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  locationId: string;
  fullName: string;
  role: string;
  designation: string | null;
  departmentId: string | null;
  floorId: string | null;
  sectionId: string | null;
  shiftId: string | null;
  faceProfileId: string | null;
  row: any;
}

async function loadExistingEmployees(): Promise<{
  all: ExistingEmployee[];
  byCode: Map<string, ExistingEmployee>;
  byLegacy: Map<string, ExistingEmployee>;
  byEmail: Map<string, ExistingEmployee[]>;
  byPhone: Map<string, ExistingEmployee[]>;
}> {
  const all: any[] = await prisma.$queryRaw(`SELECT * FROM employee`);
  const byCode = new Map<string, ExistingEmployee>();
  const byLegacy = new Map<string, ExistingEmployee>();
  const byEmail = new Map<string, ExistingEmployee[]>();
  const byPhone = new Map<string, ExistingEmployee[]>();

  for (const row of all || []) {
    const emp: ExistingEmployee = {
      id: row.id,
      employeeCode: String(row.employeeCode || ''),
      legacyEmployeeCode: row.legacyEmployeeCode || null,
      email: row.email || null,
      phone: row.phone || null,
      status: row.status || 'ACTIVE',
      locationId: row.locationId,
      fullName: row.fullName || '',
      role: row.role || 'EMPLOYEE',
      designation: row.designation || null,
      departmentId: row.departmentId || null,
      floorId: row.floorId || null,
      sectionId: row.sectionId || null,
      shiftId: row.shiftId || null,
      faceProfileId: row.faceProfileId || null,
      row,
    };
    byCode.set(emp.employeeCode.toLowerCase(), emp);
    if (emp.legacyEmployeeCode) byLegacy.set(String(emp.legacyEmployeeCode).toLowerCase(), emp);
    const em = normalizeEmail(emp.email);
    if (em) {
      if (!byEmail.has(em)) byEmail.set(em, []);
      byEmail.get(em)!.push(emp);
    }
    const ph = normalizePhone(emp.phone);
    if (ph && ph.length >= 10) {
      if (!byPhone.has(ph)) byPhone.set(ph, []);
      byPhone.get(ph)!.push(emp);
    }
  }

  return { all: all || [], byCode, byLegacy, byEmail, byPhone };
}

// -----------------------------------------------------------------------------
// Validation & preview
// -----------------------------------------------------------------------------

export interface PreviewOptions {
  mode: ImportMode;
  fileName: string;
  actor: ImportActor;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IFSC_RE = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
const PAN_RE = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;

/** Recent batch hashes, used to warn about re-importing the identical file. */
async function findRecentDuplicate(fileHash: string, mode: ImportMode): Promise<string | null> {
  try {
    const rows: any[] = await prisma.$queryRaw(
      `SELECT batch_ref, created_at, status FROM employee_import_batch
       WHERE file_hash = ? AND mode = ? AND status IN ('COMPLETED','COMPLETED_WITH_ERRORS')
       ORDER BY created_at DESC LIMIT 1`,
      [fileHash, mode]
    );
    if (rows && rows.length > 0) {
      const when = rows[0].created_at ? new Date(rows[0].created_at).toLocaleString('en-IN') : 'an earlier time';
      return `This exact file was already imported (${rows[0].batch_ref} on ${when}). Re-running is safe � existing employees are updated, never duplicated.`;
    }
  } catch {
    /* history table unavailable */
  }
  return null;
}

export async function validateAndPreview(csvText: string, options: PreviewOptions): Promise<PreviewResult> {
  const { mode, fileName, actor } = options;
  const policy = await getEmployeeIdPolicy();
  const fileHash = crypto.createHash('sha256').update(csvText || '', 'utf8').digest('hex');
  const batchRef = `IMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const fileErrors: string[] = [];
  const parsed = parseCsv(csvText ?? '');

  // Locate the header row (skips blank lines and '#' legend lines).
  let headerIdx = -1;
  for (let i = 0; i < parsed.length; i++) {
    const first = (parsed[i][0] ?? '').trim();
    if (!first || first.startsWith('#')) continue;
    headerIdx = i;
    break;
  }

  if (headerIdx === -1) {
    return {
      batchRef, fileName, fileHash, mode, policy,
      columns: IMPORT_COLUMNS, unknownColumns: [], missingRequiredColumns: REQUIRED_HEADERS,
      fileErrors: ['The file does not contain a header row. Download the sample template and keep its first row.'],
      rows: [], summary: emptySummary(0), duplicateFileWarning: null,
    };
  }

  const headerCells = parsed[headerIdx];
  const columnIndex = new Map<string, number>();
  const unknownColumns: string[] = [];
  headerCells.forEach((cell, idx) => {
    const key = normalizeHeader(cell);
    if (!key) return;
    if (IMPORT_COLUMN_KEYS.includes(key)) {
      if (!columnIndex.has(key)) columnIndex.set(key, idx);
    } else {
      unknownColumns.push(String(cell).trim());
    }
  });

  const missingRequiredColumns = REQUIRED_HEADERS.filter((k) => !columnIndex.has(k));
  if (missingRequiredColumns.length > 0) {
    fileErrors.push(
      `Missing required column(s): ${missingRequiredColumns.join(', ')}. Download the sample template for the exact header names.`
    );
  }
  if (unknownColumns.length > 0) {
    fileErrors.push(
      `Unrecognised column(s) ignored: ${unknownColumns.join(', ')}. These are not part of the supported import schema.`
    );
  }

  const ref = await loadReferenceData();
  const store = await loadExistingEmployees();
  const userEmails = await loadUserEmails();

  const get = (row: string[], key: string): string => {
    const idx = columnIndex.get(key);
    if (idx === undefined) return '';
    return String(row[idx] ?? '').trim();
  };

  const locationCodes = ref.locations.map((l) => l.code).join(', ') || 'BEL, DAV, SHI, HUB';

  // In-file duplicate tracking.
  const seenIds = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const seenPhones = new Map<string, number>();

  const rows: PreviewRow[] = [];

  for (let i = headerIdx + 1; i < parsed.length; i++) {
    const raw = parsed[i];
    const rowNumber = i + 1;
    if (raw.every((c) => !String(c ?? '').trim())) continue;
    if ((raw[0] ?? '').trim().startsWith('#')) continue;

    const errors: string[] = [];
    const warnings: string[] = [];
    const changes: FieldChange[] = [];
    let invalidReference = false;
    let idProblem = false;
    let inFileDuplicate = false;

    const v = {
      employeeId: get(raw, 'employee_id'),
      employeeCode: get(raw, 'employee_code'),
      firstName: get(raw, 'first_name'),
      middleName: get(raw, 'middle_name'),
      lastName: get(raw, 'last_name'),
      fullName: get(raw, 'full_name'),
      designation: get(raw, 'designation'),
      role: get(raw, 'role'),
      employmentType: get(raw, 'employment_type'),
      employmentStatus: get(raw, 'employment_status'),
      mobile: get(raw, 'mobile_number'),
      altMobile: get(raw, 'alternate_mobile_number'),
      email: get(raw, 'email'),
      ecName: get(raw, 'emergency_contact_name'),
      ecNumber: get(raw, 'emergency_contact_number'),
      currentAddress: get(raw, 'current_address'),
      permanentAddress: get(raw, 'permanent_address'),
      city: get(raw, 'city'),
      state: get(raw, 'state'),
      pincode: get(raw, 'pincode'),
      locationCode: get(raw, 'location_code'),
      locationName: get(raw, 'location_name'),
      department: get(raw, 'department'),
      floor: get(raw, 'floor'),
      section: get(raw, 'section'),
      shiftId: get(raw, 'shift_id'),
      shiftName: get(raw, 'shift_name'),
      managerId: get(raw, 'reporting_manager_employee_id'),
      joiningDate: get(raw, 'joining_date'),
      confirmationDate: get(raw, 'confirmation_date'),
      category: get(raw, 'employee_category'),
      dob: get(raw, 'date_of_birth'),
      gender: get(raw, 'gender'),
      payrollCode: get(raw, 'payroll_employee_code'),
      pfApplicable: get(raw, 'pf_applicable'),
      uan: get(raw, 'uan_number'),
      esiApplicable: get(raw, 'esi_applicable'),
      esiNumber: get(raw, 'esi_number'),
      bankAccount: get(raw, 'bank_account_reference'),
      ifsc: get(raw, 'ifsc_code'),
      pan: get(raw, 'pan_number'),
      aadhaarStatus: get(raw, 'aadhaar_verification_status'),
      bioDeviceId: get(raw, 'biometric_device_employee_id'),
      attendanceEligible: get(raw, 'attendance_eligibility'),
      photoRef: get(raw, 'employee_photo_reference'),
      docStatus: get(raw, 'employee_document_status'),
      remarks: get(raw, 'remarks'),
    };

    // -- Spreadsheet-formula guard (values stay literal, HR is warned) --------
    for (const col of IMPORT_COLUMNS) {
      const cell = get(raw, col.key);
      if (col.readOnly) continue;
      const fw = formulaWarning(col.key, cell);
      if (fw) warnings.push(fw);
    }

    // -- Name resolution ------------------------------------------------------
    if (!v.firstName && v.fullName) {
      const parts = v.fullName.replace(/\s+/g, ' ').trim().split(' ');
      v.firstName = parts[0];
      if (!v.lastName && parts.length > 1) v.lastName = parts.slice(1).join(' ');
    } else if (!v.fullName && (v.firstName || v.lastName)) {
      v.fullName = [v.firstName, v.middleName, v.lastName].filter(Boolean).join(' ');
    }

    // -- Location -------------------------------------------------------------
    let location: ReferenceData['locations'][number] | null = null;
    if (!v.locationCode) {
      errors.push('location_code is required for every row');
      invalidReference = true;
    } else {
      const needle = v.locationCode.toLowerCase();
      location =
        ref.locations.find((l) => l.code.toLowerCase() === needle) ||
        ref.locations.find((l) => l.id === v.locationCode) ||
        ref.locations.find((l) => l.name.toLowerCase() === needle) ||
        null;
      if (!location) {
        errors.push(`Unknown location_code "${v.locationCode}". Valid codes: ${locationCodes}`);
        invalidReference = true;
      } else if (!isLocationAllowed(actor, location.id)) {
        errors.push(`You are not authorised to import employees for location "${location.code}"`);
        invalidReference = true;
      } else if (v.locationName && v.locationName.toLowerCase() !== location.name.toLowerCase()) {
        warnings.push(
          `location_name "${v.locationName}" does not match location ${location.code} ("${location.name}"); the code wins`
        );
      }
    }

    // -- Department / floor / section / shift (scoped to the location) --------
    let departmentId: string | null = null;
    let floorId: string | null = null;
    let sectionId: string | null = null;
    let shiftId: string | null = null;

    if (location) {
      if (v.department) {
        const nd = v.department.toLowerCase();
        const found =
          ref.departments.find((d) => d.locationId === location!.id && (d.code.toLowerCase() === nd || d.name.toLowerCase() === nd)) || null;
        if (found) departmentId = found.id;
        else {
          const elsewhere = ref.departments.find((d) => d.code.toLowerCase() === nd || d.name.toLowerCase() === nd);
          errors.push(
            elsewhere
              ? `Department "${v.department}" does not exist at location ${location.code}`
              : `Unknown department "${v.department}". Valid: ${ref.departments.filter((d) => d.locationId === location!.id).map((d) => d.code).join(', ') || 'SALES, OPS, HR, FIN, INV, CS'}`
          );
          invalidReference = true;
        }
      }
      if (v.floor) {
        const nf = v.floor.toLowerCase().replace(/\s*floor\s*$/, '').trim();
        const found =
          ref.floors.find((f) => f.locationId === location!.id && f.name.toLowerCase() === v.floor!.toLowerCase()) ||
          ref.floors.find((f) => f.locationId === location!.id && String(f.floorNumber) === v.floor!.trim()) ||
          ref.floors.find((f) => f.locationId === location!.id && String(f.floorNumber) === nf) ||
          null;
        if (found) floorId = found.id;
        else {
          errors.push(`Unknown floor "${v.floor}" at location ${location.code}`);
          invalidReference = true;
        }
      }
      if (v.section) {
        const ns = v.section.toLowerCase();
        const found =
          ref.sections.find((s) => s.locationId === location!.id && (s.code.toLowerCase() === ns || s.name.toLowerCase() === ns)) || null;
        if (found) sectionId = found.id;
        else {
          errors.push(`Unknown section "${v.section}" at location ${location.code}`);
          invalidReference = true;
        }
      }
      if (v.shiftId || v.shiftName) {
        const nc = v.shiftId.toLowerCase();
        const nn = v.shiftName.toLowerCase();
        const found =
          (v.shiftId && ref.shifts.find((s) => s.locationId === location!.id && s.code.toLowerCase() === nc)) ||
          (v.shiftName && ref.shifts.find((s) => s.locationId === location!.id && s.name.toLowerCase() === nn)) ||
          null;
        if (found) shiftId = found.id;
        else {
          errors.push(
            `Unknown shift "${v.shiftId || v.shiftName}" at location ${location.code}. Valid: ${ref.shifts.filter((s) => s.locationId === location!.id).map((s) => s.code).join(', ') || 'GENERAL, MORNING, EVENING, NIGHT'}`
          );
          invalidReference = true;
        }
      }
    }

    // -- Enumerations & scalars -----------------------------------------------
    let role: string | null = null;
    if (v.role) {
      role = normalizeRole(v.role);
      if (!role) {
        errors.push(`Unknown role "${v.role}". Valid roles: ${VALID_ROLES.join(', ')}`);
        invalidReference = true;
      }
    }

    let status: string | null = null;
    if (v.employmentStatus) {
      const alias = STATUS_ALIASES[v.employmentStatus.toUpperCase().replace(/[\s\-]+/g, '_')];
      if (alias) {
        status = alias.status;
        if (alias.warning) warnings.push(alias.warning);
      } else {
        errors.push(`Unknown employment_status "${v.employmentStatus}". Valid: ACTIVE, INACTIVE, ON_LEAVE, TERMINATED`);
        invalidReference = true;
      }
    }

    if (v.employmentType && !VALID_EMPLOYMENT_TYPES.includes(v.employmentType.toUpperCase().replace(/[\s\-]+/g, '_'))) {
      warnings.push(`Unknown employment_type "${v.employmentType}"; expected ${VALID_EMPLOYMENT_TYPES.join(', ')}`);
    }
    if (v.category && !VALID_CATEGORIES.includes(v.category.toUpperCase().replace(/[\s\-]+/g, '_'))) {
      warnings.push(`Unknown employee_category "${v.category}"; expected ${VALID_CATEGORIES.join(', ')}`);
    }
    if (v.docStatus && !VALID_DOC_STATUSES.includes(v.docStatus.toUpperCase())) {
      warnings.push(`Unknown employee_document_status "${v.docStatus}"; expected ${VALID_DOC_STATUSES.join(', ')}`);
    }
    if (v.aadhaarStatus && !VALID_AADHAAR_STATUS.includes(v.aadhaarStatus.toUpperCase().replace(/[\s\-]+/g, '_'))) {
      warnings.push(`Unknown aadhaar_verification_status "${v.aadhaarStatus}"; expected ${VALID_AADHAAR_STATUS.join(', ')}`);
    }
    if (/^\d{4}\s?\d{4}\s?\d{4}$/.test(v.aadhaarStatus) || /\b\d{12}\b/.test(v.aadhaarStatus)) {
      errors.push('aadhaar_verification_status must be a STATUS (VERIFIED/PENDING/�) � never an Aadhaar number');
      idProblem = true;
    }

    if (v.gender) {
      const g = v.gender.toUpperCase();
      if (!['MALE', 'FEMALE', 'OTHER', 'M', 'F', 'O'].includes(g)) {
        warnings.push(`Unknown gender "${v.gender}"; expected MALE, FEMALE or OTHER`);
      }
    }

    if (v.pincode && !/^\d{6}$/.test(v.pincode)) {
      errors.push(`pincode "${v.pincode}" must be exactly 6 digits`);
    }
    if (v.ifsc && !IFSC_RE.test(v.ifsc.toUpperCase())) {
      warnings.push(`ifsc_code "${v.ifsc}" does not look like a valid IFSC (e.g. SBIN0001248)`);
    }
    if (v.pan && !PAN_RE.test(v.pan.toUpperCase())) {
      warnings.push(`pan_number "${v.pan}" does not look like a valid PAN (e.g. ABZPP4912K)`);
    }

    const phone = normalizePhone(v.mobile);
    if (v.mobile && phone.length !== 10) {
      errors.push(`mobile_number "${v.mobile}" must contain exactly 10 digits`);
      invalidReference = true;
    }
    if (v.altMobile && normalizePhone(v.altMobile).length !== 10) {
      warnings.push(`alternate_mobile_number "${v.altMobile}" does not contain 10 digits`);
    }
    const email = normalizeEmail(v.email);
    if (v.email && !EMAIL_RE.test(email)) {
      errors.push(`email "${v.email}" is not a valid email address`);
      invalidReference = true;
    }

    const joiningDate = parseDateValue(v.joiningDate);
    if (v.joiningDate && !joiningDate) {
      errors.push(`joining_date "${v.joiningDate}" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)`);
    }
    const dob = parseDateValue(v.dob);
    if (v.dob && !dob) {
      errors.push(`date_of_birth "${v.dob}" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)`);
    }
    const confirmationDate = parseDateValue(v.confirmationDate);
    if (v.confirmationDate && !confirmationDate) {
      errors.push(`confirmation_date "${v.confirmationDate}" is not a valid date`);
    }

    // -- Matching -------------------------------------------------------------
    let match: ExistingEmployee | null = null;
    let matchReason = '';
    if (v.employeeId) {
      const found = store.byCode.get(v.employeeId.toLowerCase());
      if (found) {
        match = found;
        matchReason = 'employee_id';
      }
    }
    if (!match && v.employeeCode) {
      const found = store.byLegacy.get(v.employeeCode.toLowerCase());
      if (found) {
        match = found;
        matchReason = 'legacy_code';
      }
    }
    if (!match && email) {
      const list = store.byEmail.get(email);
      if (list && list.length === 1) {
        match = list[0];
        matchReason = 'email';
      } else if (list && list.length > 1) {
        warnings.push('Several employees share this email; supply employee_id to identify the right one');
        idProblem = true;
      }
    }
    if (!match && phone.length === 10) {
      const list = store.byPhone.get(phone);
      if (list && list.length === 1) {
        match = list[0];
        matchReason = 'mobile_number';
      } else if (list && list.length > 1) {
        warnings.push('Several employees share this mobile number; supply employee_id to identify the right one');
        idProblem = true;
      }
    }

    // -- In-file duplicate detection ------------------------------------------
    if (v.employeeId) {
      const key = v.employeeId.toLowerCase();
      if (seenIds.has(key)) {
        errors.push(`Duplicate employee_id "${v.employeeId}" in this file (already used on row ${seenIds.get(key)})`);
        inFileDuplicate = true;
        idProblem = true;
      } else seenIds.set(key, rowNumber);
    }
    if (email) {
      if (seenEmails.has(email)) {
        errors.push(`Duplicate email "${email}" in this file (already used on row ${seenEmails.get(email)})`);
        inFileDuplicate = true;
      } else seenEmails.set(email, rowNumber);
    }
    if (phone.length === 10) {
      if (seenPhones.has(phone)) {
        warnings.push(`Mobile number "${v.mobile}" also appears on row ${seenPhones.get(phone)} of this file`);
      } else seenPhones.set(phone, rowNumber);
    }

    // -- Decide the action ----------------------------------------------------
    let action: RowAction = 'ERROR';
    let proposedCode = v.employeeId;

    if (match) {
      if (mode === 'new') {
        action = 'SKIP';
        warnings.push(`Employee ${match.employeeCode} (${match.fullName}) already exists � skipped in "Add New" mode`);
        if (v.employeeId && v.employeeId.toLowerCase() !== match.employeeCode.toLowerCase()) {
          errors.push(`employee_id "${v.employeeId}" belongs to a different employee than the matched record`);
          action = 'ERROR';
        }
      } else {
        // UPDATE path
        if (v.employeeId && v.employeeId.toLowerCase() !== match.employeeCode.toLowerCase()) {
          errors.push(
            `Employee IDs are immutable: cannot change ${match.employeeCode} to ${v.employeeId}. Update the record without employee_id, or migrate the ID through an authorised HR review.`
          );
          idProblem = true;
        } else {
          action = 'UPDATE';
          proposedCode = match.employeeCode;
        }
      }
    } else {
      // No existing match.
      if (mode === 'update') {
        errors.push(
          `No existing employee matches ${v.employeeId || v.employeeCode || email || v.mobile || v.fullName || '(this row)'}. "Update Existing" mode never creates records � switch to "Upsert" to add new employees.`
        );
        idProblem = Boolean(v.employeeId);
      } else {
        action = 'CREATE';
        if (!v.firstName) {
          errors.push('first_name is required to create a new employee');
        }
        if (!v.lastName) {
          errors.push('last_name is required to create a new employee');
        }
        if (!joiningDate) {
          errors.push('joining_date is required to create a new employee');
        }
        if (email && userEmails.has(email)) {
          errors.push(`A login account already uses ${email}; choose a different email or update that employee instead`);
        }
        if (v.employeeId) {
          const kind = classifyEmployeeCode(v.employeeId, policy);
          if (kind === 'test' || kind === 'numeric-legacy') {
            warnings.push(
              `employee_id "${v.employeeId}" looks like a legacy/test identifier; the generated standard ID (${policy.sampleFormat} style) is recommended`
            );
          } else if (!matchesActiveFormat(v.employeeId, policy)) {
            warnings.push(`employee_id "${v.employeeId}" does not follow the active format ${policy.sampleFormat}`);
          }
        }
      }
    }

    if (errors.length > 0) action = 'ERROR';

    const row: PreviewRow = {
      rowNumber,
      employeeId: proposedCode || v.employeeCode || '',
      employeeIdKind: classifyEmployeeCode(proposedCode || v.employeeCode, policy),
      employeeName: v.fullName || [v.firstName, v.middleName, v.lastName].filter(Boolean).join(' '),
      mobile: v.mobile,
      email: v.email,
      designation: v.designation,
      role: role || v.role || (match ? match.role : ''),
      locationCode: location?.code || v.locationCode,
      department: v.department,
      floor: v.floor,
      shift: v.shiftId || v.shiftName,
      employmentStatus: status || v.employmentStatus || (match ? match.status : ''),
      action,
      matchedEmployeeId: match?.employeeCode,
      matchedByName: match ? `${match.fullName} (${match.employeeCode})` : undefined,
      changes,
      errors,
      warnings,
    };

    (row as any)._flags = { invalidReference, idProblem, inFileDuplicate };
    (row as any)._payload = {
      v, location, departmentId, floorId, sectionId, shiftId, role, status,
      joiningDate, dob, confirmationDate, phone, email, match, matchReason,
      gender: v.gender ? normalizeGender(v.gender) : null,
      pfApplicable: v.pfApplicable ? boolish(v.pfApplicable) : null,
      esiApplicable: v.esiApplicable ? boolish(v.esiApplicable) : null,
      attendanceEligible: v.attendanceEligible ? boolish(v.attendanceEligible) : null,
    };

    if (action === 'UPDATE') {
      buildUpdateChanges(row, (row as any)._payload, actor);
    }

    rows.push(row);
  }

  const summary = summarise(rows);
  const duplicateFileWarning = await findRecentDuplicate(fileHash, mode);

  let absentActiveEmployees: AbsentActiveEmployee[] | undefined;
  if (mode === 'replace_roster') {
    const matchedEmployeeIds = new Set<string>();
    for (const r of rows) {
      if (r.matchedEmployeeId) {
        matchedEmployeeIds.add(r.matchedEmployeeId.toLowerCase());
      }
    }
    const [activeDbEmployees]: any = await pool.query(`
      SELECT e.id, e.employeeCode, e.fullName, l.code as locationCode, e.designation
      FROM employee e
      JOIN location l ON e.locationId = l.id
      WHERE e.status = 'ACTIVE'
    `);
    absentActiveEmployees = (activeDbEmployees || [])
      .filter((emp) => !matchedEmployeeIds.has(String(emp.employeeCode || '').toLowerCase()))
      .map((emp) => ({
        id: emp.id,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        locationCode: emp.locationCode,
        designation: emp.designation,
        action: 'DEACTIVATE_ON_REPLACE' as const,
      }));
    summary.absentActiveCount = (absentActiveEmployees || []).length;
  }

  return {
    batchRef, fileName, fileHash, mode, policy,
    columns: IMPORT_COLUMNS, unknownColumns, missingRequiredColumns, fileErrors,
    rows, summary, duplicateFileWarning, absentActiveEmployees,
  };
}

function normalizeGender(raw: string): string | null {
  const g = String(raw).trim().toUpperCase();
  if (['MALE', 'M'].includes(g)) return 'MALE';
  if (['FEMALE', 'F'].includes(g)) return 'FEMALE';
  if (['OTHER', 'O', 'OTHERS'].includes(g)) return 'OTHER';
  return null;
}

function emptySummary(total: number): ImportSummary {
  return {
    totalRows: total, validNew: 0, existingUpdates: 0, duplicates: 0,
    missingOrInvalidIds: 0, invalidReferenceValues: 0, needsAttention: 0, cannotImport: 0, skipped: 0,
  };
}

function summarise(rows: PreviewRow[]): ImportSummary {
  const s = emptySummary(rows.length);
  for (const r of rows) {
    const flags = (r as any)._flags || {};
    if (flags.inFileDuplicate) s.duplicates++;
    if (flags.idProblem) s.missingOrInvalidIds++;
    if (flags.invalidReference) s.invalidReferenceValues++;
    if (r.action === 'CREATE') s.validNew++;
    else if (r.action === 'UPDATE') s.existingUpdates++;
    else if (r.action === 'SKIP') s.skipped++;
    else s.cannotImport++;
    if (r.action !== 'ERROR' && r.warnings.length > 0) s.needsAttention++;
  }
  return s;
}

// -----------------------------------------------------------------------------
// Update-diff construction
// -----------------------------------------------------------------------------

/** Fields an HR bulk import may never rewrite without dedicated authorisation. */
const ROLE_PROTECTED_FIELDS = new Set(['role']);
/** Statutory / KYC / biometric identity fields � HR or elevated roles only. */
const SENSITIVE_FIELDS = new Set([
  'payrollEmployeeCode', 'pfApplicable', 'uanNo', 'esiApplicable', 'esiNo',
  'bankAccount', 'bankIfsc', 'panNumber', 'aadhaarVerificationStatus', 'biometricDeviceEmployeeId',
]);
const SIGNIFICANT_FIELDS = new Set([
  'status', 'role', 'locationId', 'departmentId', 'floorId', 'sectionId', 'shiftId', 'designation',
]);

function displayValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isoDate(value);
  return String(value);
}

/**
 * Build the field-by-field diff for an UPDATE row.
 * Blank CSV cells are intentionally ignored so they can never clear an
 * existing value.
 */
function buildUpdateChanges(row: PreviewRow, payload: any, actor: ImportActor): void {
  const { v, match, location, departmentId, floorId, sectionId, shiftId, role, status, joiningDate, dob, confirmationDate } = payload;
  const current: any = match.row;
  const isElevated = ELEVATED.has(actor.role);
  const isHr = HR_ROLES.has(actor.role);

  const add = (field: string, next: any) => {
    const prev = current[field];
    const nextStr = displayValue(next);
    const prevStr = displayValue(prev);
    if (!nextStr) return;
    if (nextStr === prevStr) return;
    row.changes.push({
      field,
      from: prevStr,
      to: nextStr,
      significant: SIGNIFICANT_FIELDS.has(field),
      restricted: SENSITIVE_FIELDS.has(field) || ROLE_PROTECTED_FIELDS.has(field),
    });
  };

  // -- Identity / contact ----------------------------------------------------
  add('firstName', v.firstName);
  add('middleName', v.middleName);
  add('lastName', v.lastName);
  const nextFullName = [v.firstName || current.firstName, v.middleName || current.middleName, v.lastName || current.lastName]
    .filter(Boolean)
    .join(' ');
  add('fullName', nextFullName);
  add('designation', v.designation);
  add('employmentType', v.employmentType ? v.employmentType.toUpperCase().replace(/[\s\-]+/g, '_') : '');
  add('employeeCategory', v.category ? v.category.toUpperCase().replace(/[\s\-]+/g, '_') : '');
  add('phone', payload.phone);
  add('alternatePhone', v.altMobile ? normalizePhone(v.altMobile) : '');
  add('email', payload.email);
  add('emergencyContactName', v.ecName);
  add('emergencyContactNumber', v.ecNumber);
  add('currentAddress', v.currentAddress);
  add('permanentAddress', v.permanentAddress);
  add('city', v.city);
  add('state', v.state);
  add('pincode', v.pincode);
  add('dateOfBirth', payload.dob);
  add('gender', payload.gender);
  add('joiningDate', joiningDate);
  add('confirmationDate', confirmationDate);
  add('photoReference', v.photoRef);
  add('documentStatus', v.docStatus ? v.docStatus.toUpperCase() : '');
  add('remarks', v.remarks);
  if (payload.attendanceEligible !== null) add('attendanceEligible', payload.attendanceEligible ? 1 : 0);

  // -- Work allocation -------------------------------------------------------
  if (location) add('locationId', location.id);
  if (payload.departmentId !== undefined) add('departmentId', payload.departmentId);
  if (payload.floorId !== undefined) add('floorId', payload.floorId);
  if (payload.sectionId !== undefined) add('sectionId', payload.sectionId);
  if (payload.shiftId !== undefined) add('shiftId', payload.shiftId);

  // -- Employment status (reactivation is authorised separately) -------------
  if (status) {
    const wasClosed = CLOSED_STATUSES.has(String(current.status || 'ACTIVE'));
    const nowActive = status === 'ACTIVE';
    if (wasClosed && nowActive && !isElevated) {
      row.action = 'ERROR';
      row.errors.push(
        `Employee ${match.employeeCode} is ${current.status}. Reactivating a closed employee requires Super Admin or Admin authorisation.`
      );
    } else {
      add('status', status);
    }
  }

  // -- Role (access permission � Super Admin/Admin only) ---------------------
  if (role) {
    if (role !== current.role) {
      if (ROLE_PROTECTED_FIELDS.has('role') && !isElevated) {
        row.warnings.push(
          `Role change ${current.role} ? ${role} for ${match.employeeCode} needs Super Admin or Admin authorisation and was NOT applied`
        );
      } else {
        add('role', role);
      }
    }
  }

  // -- Statutory / KYC / biometric identity fields ---------------------------
  const mayEditSensitive = isElevated || isHr;
  const sensitiveDraft: Array<[string, any]> = [
    ['payrollEmployeeCode', v.payrollCode],
    ['pfApplicable', payload.pfApplicable === null ? '' : payload.pfApplicable ? 1 : 0],
    ['uanNo', v.uan],
    ['esiApplicable', payload.esiApplicable === null ? '' : payload.esiApplicable ? 1 : 0],
    ['esiNo', v.esiNumber],
    ['bankAccount', v.bankAccount],
    ['bankIfsc', v.ifsc.toUpperCase()],
    ['panNumber', v.pan.toUpperCase()],
    ['aadhaarVerificationStatus', v.aadhaarStatus ? v.aadhaarStatus.toUpperCase().replace(/[\s\-]+/g, '_') : ''],
    ['biometricDeviceEmployeeId', v.bioDeviceId],
  ];
  for (const [field, value] of sensitiveDraft) {
    const hasChange = value !== '' && displayValue(value) !== displayValue(current[field]);
    if (!hasChange) continue;
    if (!mayEditSensitive) {
      row.warnings.push(`Field "${field}" was supplied but your role cannot modify statutory/biometric data; not applied`);
      continue;
    }
    add(field, value);
  }

  if (row.changes.length === 0 && row.action === 'UPDATE') {
    row.warnings.push('No field differences detected � this employee is already up to date');
  }
}

async function loadUserEmails(): Promise<Set<string>> {
  try {
    const rows: any[] = await prisma.$queryRaw(`SELECT email FROM user WHERE employeeId IS NOT NULL AND employeeId != ''`);
    return new Set((rows || []).map((r) => normalizeEmail(r.email)).filter(Boolean));
  } catch {
    return new Set();
  }
}

// -----------------------------------------------------------------------------
// Execution
// -----------------------------------------------------------------------------

export interface ExecuteResult {
  batchRef: string;
  status: 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  createdEmployees: Array<{ employeeId: string; name: string }>;
  updatedEmployees: Array<{ employeeId: string; name: string }>;
  assignedIds: string[];
  idFormatUsed: string;
  failureDetails: string | null;
  durationMs: number;
  deactivatedAbsent?: number;
  deactivatedEmployees?: Array<{ employeeId: string; name: string }>;
}

const MAX_IMPORT_ROWS = 5000;

/**
 * Apply a validated preview to the database.
 *
 * Only rows with action CREATE/UPDATE are written; ERROR and SKIP rows are
 * reported. Every write happens inside ONE transaction, so a database failure
 * rolls the entire batch back � no partially imported employees survive.
 *
 * Retry safety: creation re-checks the Employee ID immediately before the
 * insert, and re-validation turns already-created employees into UPDATE/keep
 * rows, so re-running the same file never duplicates an employee.
 */
export async function executeImport(preview: PreviewResult, actor: ImportActor): Promise<ExecuteResult> {
  const started = Date.now();
  const writable = preview.rows.filter((r) => r.action === 'CREATE' || r.action === 'UPDATE');

  const result: ExecuteResult = {
    batchRef: preview.batchRef,
    status: 'COMPLETED',
    totalRows: preview.rows.length,
    created: 0,
    updated: 0,
    skipped: preview.rows.filter((r) => r.action === 'SKIP').length,
    failed: preview.rows.filter((r) => r.action === 'ERROR').length,
    createdEmployees: [],
    updatedEmployees: [],
    assignedIds: [],
    idFormatUsed: preview.policy.sampleFormat,
    failureDetails: null,
    durationMs: 0,
    deactivatedAbsent: 0,
    deactivatedEmployees: [],
  };

  const folderJobs: Array<() => Promise<void>> = [];
  const shardSyncTasks: Array<() => Promise<void>> = [];

  try {
    await prisma.$transaction(async (tx: any) => {
      // 1. If replace_roster mode, safely deactivate absent active employees without touching login accounts
      if (preview.mode === 'replace_roster' && preview.absentActiveEmployees && preview.absentActiveEmployees.length > 0) {
        for (const absent of preview.absentActiveEmployees) {
          // Decouple user login so login account, credentials, and roles are 100% PRESERVED
          await tx.$executeRawUnsafe('UPDATE user SET employeeId = NULL WHERE employeeId = ?', absent.id);

          // Mark employee as INACTIVE in control DB
          await tx.employee.update({
            where: { id: absent.id },
            data: {
              status: 'INACTIVE',
              remarks: '[Deactivated: Not present in approved roster replacement batch ' + preview.batchRef + ']',
            },
          });

          result.deactivatedAbsent = (result.deactivatedAbsent || 0) + 1;
          result.deactivatedEmployees!.push({ employeeId: absent.employeeCode, name: absent.fullName });

          // Queue shard deactivation
          const absentId = absent.id;
          const absentLoc = absent.locationCode;
          shardSyncTasks.push(async () => {
            const shardId = absentLoc === 'BEL' ? 'BSC-SHARD-BEL-001' : absentLoc === 'DAV' ? 'BSC-SHARD-DAV-001' : absentLoc === 'SHI' ? 'BSC-SHARD-SHI-001' : null;
            if (!shardId) return;
            try {
              const shardPool = shardManager.getPool(shardId);
              const sConn = await shardPool.getConnection();
              try {
                await sConn.query('UPDATE employee SET status = \'INACTIVE\', updatedAt = NOW() WHERE id = ?', [absentId]);
              } finally {
                sConn.release();
              }
            } catch (err: any) {
              console.warn('[EmployeeImportService] Shard sync deactivate error on ' + shardId + ':', err.message);
            }
          });
        }
      }
      for (const row of writable) {
        const payload = (row as any)._payload;
        if (!payload) continue;
        const { v, location, departmentId, floorId, sectionId, shiftId, role, status, joiningDate, dob, confirmationDate, match } = payload;

        if (row.action === 'CREATE') {
          // Re-check uniqueness immediately before the insert (retry safety).
          const proposedCode = v.employeeId ? String(v.employeeId).trim() : '';
          let employeeCode = proposedCode;
          if (employeeCode) {
            const clash: any[] = await tx.$queryRaw(`SELECT id FROM employee WHERE LOWER(employeeCode) = ? LIMIT 1`, [
              employeeCode.toLowerCase(),
            ]);
            if (clash && clash.length > 0) {
              row.action = 'SKIP';
              row.warnings.push(`Employee ID ${employeeCode} was created by an earlier run � skipped to avoid a duplicate`);
              result.skipped++;
              continue;
            }
          } else {
            employeeCode = await allocateEmployeeId(tx);
          }

          const firstName = String(v.firstName || '').trim();
          const lastName = String(v.lastName || '').trim();
          const middleName = String(v.middleName || '').trim();
          const fullName =
            [firstName, middleName, lastName].filter(Boolean).join(' ') || String(v.fullName || '').trim();

          const created = await tx.employee.create({
            data: {
              employeeCode,
              firstName,
              middleName: middleName || undefined,
              lastName,
              fullName,
              email: payload.email || null,
              phone: payload.phone || null,
              alternatePhone: v.altMobile ? normalizePhone(v.altMobile) : null,
              gender: payload.gender || 'male',
              dateOfBirth: dob || null,
              locationId: location.id,
              floorId: floorId || null,
              departmentId: departmentId || null,
              sectionId: sectionId || null,
              shiftId: shiftId || null,
              designation: v.designation || 'Sales Consultant',
              role: role || 'EMPLOYEE',
              status: status || 'ACTIVE',
              joiningDate: joiningDate || new Date(),
              confirmationDate: confirmationDate || null,
              emergencyContactName: v.ecName || null,
              emergencyContactNumber: v.ecNumber || null,
              currentAddress: v.currentAddress || null,
              permanentAddress: v.permanentAddress || null,
              city: v.city || null,
              state: v.state || null,
              pincode: v.pincode || null,
              employmentType: v.employmentType ? v.employmentType.toUpperCase().replace(/[\s\-]+/g, '_') : null,
              employeeCategory: v.category ? v.category.toUpperCase().replace(/[\s\-]+/g, '_') : null,
              payrollEmployeeCode: v.payrollCode || null,
              pfApplicable: payload.pfApplicable,
              uanNo: v.uan || null,
              esiApplicable: payload.esiApplicable,
              esiNo: v.esiNumber || null,
              bankAccount: v.bankAccount || null,
              bankIfsc: v.ifsc ? v.ifsc.toUpperCase() : null,
              panNumber: v.pan ? v.pan.toUpperCase() : null,
              aadhaarVerificationStatus: v.aadhaarStatus ? v.aadhaarStatus.toUpperCase().replace(/[\s\-]+/g, '_') : null,
              biometricDeviceEmployeeId: v.bioDeviceId || null,
              attendanceEligible: payload.attendanceEligible === null ? true : payload.attendanceEligible,
              photoReference: v.photoRef || null,
              documentStatus: v.docStatus ? v.docStatus.toUpperCase() : null,
              remarks: v.remarks || null,
              legacyEmployeeCode: v.employeeCode || null,
              importBatchId: preview.batchRef,
            },
          });

          // Link matching login user account by email if exists and unlinked
          if (created.email) {
            await tx.$executeRawUnsafe(
              `UPDATE user SET employeeId = ? WHERE LOWER(email) = LOWER(?) AND employeeId IS NULL`,
              created.id,
              created.email
            );
          }

          row.employeeId = employeeCode;
          row.employeeIdKind = classifyEmployeeCode(employeeCode, preview.policy);
          row.matchedEmployeeId = employeeCode;
          result.created++;
          result.createdEmployees.push({ employeeId: employeeCode, name: fullName });
          result.assignedIds.push(employeeCode);
          if (!v.employeeId) result.idFormatUsed = preview.policy.sampleFormat;

          const nameForFolder = fullName;
          const codeForFolder = employeeCode;
          folderJobs.push(async () => {
            try {
              const svc = await import('../services/userUploadService.js');
              svc.UserUploadService.ensureUserFolder(nameForFolder, codeForFolder);
            } catch {
              /* folder creation is best-effort */
            }
          });

          // Queue shard insert
          const createdCopy = { ...created };
          const locCode = location.code;
          shardSyncTasks.push(async () => {
            const shardId = locCode === 'BEL' ? 'BSC-SHARD-BEL-001' : locCode === 'DAV' ? 'BSC-SHARD-DAV-001' : locCode === 'SHI' ? 'BSC-SHARD-SHI-001' : null;
            if (!shardId) return;
            try {
              const shardPool = shardManager.getPool(shardId);
              const sConn = await shardPool.getConnection();
              try {
                await sConn.query(
                  `INSERT INTO employee (id, employeeCode, firstName, lastName, fullName, email, phone, gender, locationId, designation, role, status, joiningDate, legacyEmployeeCode, importBatchId, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                   ON DUPLICATE KEY UPDATE fullName = VALUES(fullName), status = VALUES(status), designation = VALUES(designation), role = VALUES(role), updatedAt = NOW()`,
                  [
                    createdCopy.id,
                    createdCopy.employeeCode,
                    createdCopy.firstName,
                    createdCopy.lastName,
                    createdCopy.fullName,
                    createdCopy.email,
                    createdCopy.phone,
                    createdCopy.gender,
                    createdCopy.locationId,
                    createdCopy.designation,
                    createdCopy.role,
                    createdCopy.status,
                    createdCopy.joiningDate,
                    createdCopy.legacyEmployeeCode,
                    preview.batchRef,
                  ]
                );
              } finally {
                sConn.release();
              }
            } catch (err: any) {
              console.warn(`[EmployeeImportService] Shard sync create error on ${shardId}:`, err.message);
            }
          });
        } else {
          // UPDATE
          const data: Record<string, any> = { importBatchId: preview.batchRef };
          for (const change of row.changes) {
            data[change.field] = coerceForColumn(change.field, change.to);
          }
          await tx.employee.update({ where: { id: match.id }, data });
          result.updated++;
          result.updatedEmployees.push({ employeeId: match.employeeCode, name: row.employeeName || match.fullName });

          // Queue shard update
          const updatedEmpId = match.id;
          const updatedLocCode = match.locationCode || location?.code;
          const updatedStatus = data.status;
          shardSyncTasks.push(async () => {
            const shardId = updatedLocCode === 'BEL' ? 'BSC-SHARD-BEL-001' : updatedLocCode === 'DAV' ? 'BSC-SHARD-DAV-001' : updatedLocCode === 'SHI' ? 'BSC-SHARD-SHI-001' : null;
            if (!shardId) return;
            try {
              const shardPool = shardManager.getPool(shardId);
              const sConn = await shardPool.getConnection();
              try {
                if (updatedStatus) {
                  await sConn.query(`UPDATE employee SET status = ?, updatedAt = NOW() WHERE id = ?`, [updatedStatus, updatedEmpId]);
                }
              } finally {
                sConn.release();
              }
            } catch (err: any) {
              console.warn(`[EmployeeImportService] Shard sync update error on ${shardId}:`, err.message);
            }
          });
        }
      }
    });

    result.status = result.failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
  } catch (err: any) {
    result.status = 'FAILED';
    result.created = 0;
    result.updated = 0;
    result.createdEmployees = [];
    result.updatedEmployees = [];
    result.assignedIds = [];
    result.failureDetails =
      'The import was rolled back and no employee records were changed. ' + (err?.message || 'Database failure');
    result.durationMs = Date.now() - started;
    await persistBatch(preview, actor, result);
    throw Object.assign(new Error(result.failureDetails), { executeResult: result, status: 400 });
  }

  // Execute shard synchronization
  try {
    await shardManager.initialize();
    for (const syncTask of shardSyncTasks) {
      await syncTask();
    }
  } catch (shardErr: any) {
    console.warn('[EmployeeImportService] Shard sync warning:', shardErr.message);
  }

  for (const job of folderJobs) {
    try {
      await job();
    } catch {
      /* best effort */
    }
  }

  result.durationMs = Date.now() - started;
  await persistBatch(preview, actor, result);
  return result;
}

function coerceForColumn(field: string, value: string): any {
  if (['attendanceEligible', 'pfApplicable', 'esiApplicable'].includes(field)) {
    return value === '1' || value.toLowerCase() === 'true';
  }
  if (['dateOfBirth', 'joiningDate', 'confirmationDate'].includes(field)) {
    return parseDateValue(value) || value;
  }
  return value;
}

async function persistBatch(preview: PreviewResult, actor: ImportActor, result: ExecuteResult): Promise<void> {
  try {
    const errorReport = buildErrorReportCsv(preview);
    const rowsJson = preview.rows.map((r) => ({
      rowNumber: r.rowNumber,
      employeeId: r.employeeId,
      employeeIdKind: r.employeeIdKind,
      name: r.employeeName,
      mobile: r.mobile,
      email: r.email,
      designation: r.designation,
      role: r.role,
      locationCode: r.locationCode,
      department: r.department,
      floor: r.floor,
      shift: r.shift,
      employmentStatus: r.employmentStatus,
      action: r.action,
      matched: r.matchedByName || '',
      changes: r.changes.map((c) => `${c.field}: ${c.from || '(empty)'} ? ${c.to}`),
      errors: r.errors,
      warnings: r.warnings,
    }));

    await prisma.$executeRaw(
      `INSERT INTO employee_import_batch
         (id, batch_ref, file_name, file_hash, mode, status, total_rows, created_rows, updated_rows,
          failed_rows, skipped_rows, location_scope, imported_by, imported_by_name, id_format_used,
          rows_json, error_report, failure_details, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE status = VALUES(status), created_rows = VALUES(created_rows),
         updated_rows = VALUES(updated_rows), failed_rows = VALUES(failed_rows),
         skipped_rows = VALUES(skipped_rows), rows_json = VALUES(rows_json),
         error_report = VALUES(error_report), failure_details = VALUES(failure_details),
         updated_at = NOW(3)`,
      [
        crypto.randomUUID(),
        preview.batchRef,
        preview.fileName.slice(0, 255),
        preview.fileHash,
        preview.mode,
        result.status,
        result.totalRows,
        result.created,
        result.updated,
        result.failed,
        result.skipped,
        actor.locationId || 'ALL',
        actor.userId,
        actor.userName,
        result.idFormatUsed,
        JSON.stringify(rowsJson),
        errorReport,
        result.failureDetails,
      ]
    );
  } catch (err: any) {
    console.warn('[employeeImport] Could not persist import history:', err?.message);
  }
}

// -----------------------------------------------------------------------------
// Error report & history
// -----------------------------------------------------------------------------

export function buildErrorReportCsv(preview: PreviewResult): string {
  const header = [
    'csv_row', 'employee_id', 'employee_name', 'mobile_number', 'email',
    'location_code', 'result', 'errors', 'warnings',
  ];
  const problemRows = preview.rows.filter(
    (r) => r.action === 'ERROR' || r.action === 'SKIP' || r.errors.length > 0 || r.warnings.length > 0
  );
  const body = problemRows.map((r) => [
    String(r.rowNumber),
    r.employeeId,
    r.employeeName,
    r.mobile,
    r.email,
    r.locationCode,
    r.action,
    r.errors.join(' | '),
    r.warnings.join(' | '),
  ]);
  return toCsv([header, ...body]);
}

export interface BatchSummaryRow {
  batch_ref: string;
  file_name: string;
  mode: string;
  status: string;
  total_rows: number;
  created_rows: number;
  updated_rows: number;
  failed_rows: number;
  skipped_rows: number;
  location_scope: string;
  imported_by_name: string;
  created_at: any;
}

export async function listImportHistory(actor: ImportActor, page = 1, limit = 20): Promise<{ batches: BatchSummaryRow[]; total: number }> {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;

  const scopeClause = ELEVATED.has(actor.role) ? '' : ' AND imported_by = ?';
  const scopeParams = ELEVATED.has(actor.role) ? [] : [actor.userId];

  const countRows: any[] = await prisma.$queryRaw(
    `SELECT COUNT(*) AS total FROM employee_import_batch WHERE 1=1${scopeClause}`,
    ...scopeParams
  );
  const total = Number(countRows?.[0]?.total || 0);

  const rows: any[] = await prisma.$queryRaw(
    `SELECT batch_ref, file_name, mode, status, total_rows, created_rows, updated_rows,
            failed_rows, skipped_rows, location_scope, imported_by_name, created_at
     FROM employee_import_batch WHERE 1=1${scopeClause}
     ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${offset}`,
    ...scopeParams
  );

  return { batches: (rows || []) as BatchSummaryRow[], total };
}

export async function getImportBatch(batchRef: string, actor: ImportActor): Promise<any | null> {
  const rows: any[] = await prisma.$queryRaw(
    `SELECT * FROM employee_import_batch WHERE batch_ref = ? LIMIT 1`,
    [batchRef]
  );
  if (!rows || rows.length === 0) return null;
  const batch = rows[0];
  // Location managers may only inspect their own batches.
  if (!ELEVATED.has(actor.role) && batch.imported_by !== actor.userId) return null;
  let parsedRows: any[] = [];
  try {
    parsedRows = JSON.parse(batch.rows_json || '[]');
  } catch {
    parsedRows = [];
  }
  return {
    batchRef: batch.batch_ref,
    fileName: batch.file_name,
    mode: batch.mode,
    status: batch.status,
    totalRows: batch.total_rows,
    created: batch.created_rows,
    updated: batch.updated_rows,
    failed: batch.failed_rows,
    skipped: batch.skipped_rows,
    locationScope: batch.location_scope,
    importedBy: batch.imported_by_name,
    importedById: batch.imported_by,
    idFormatUsed: batch.id_format_used,
    failureDetails: batch.failure_details,
    createdAt: batch.created_at,
    rows: parsedRows,
  };
}

// -----------------------------------------------------------------------------
// Data-quality audit (directory integrity review for authorised HR users)
// -----------------------------------------------------------------------------

export interface DataQualityIssue {
  category: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
  affected: string[];
  description: string;
}

export interface DataQualityReport {
  generatedAt: string;
  scope: string;
  totals: {
    employees: number;
    active: number;
    locations: number;
  };
  issues: DataQualityIssue[];
}

export async function runDataQualityAudit(actor: ImportActor): Promise<DataQualityReport> {
  const policy = await getEmployeeIdPolicy();
  const scopeSql = ELEVATED.has(actor.role) ? '' : ' AND locationId = ?';
  const scopeParams = ELEVATED.has(actor.role) ? [] : [actor.locationId];

  const employees: any[] = await prisma.$queryRaw(
    `SELECT * FROM employee WHERE 1=1${scopeSql}`,
    ...scopeParams
  );

  const issues: DataQualityIssue[] = [];
  const push = (issue: DataQualityIssue) => {
    if (issue.count > 0) issues.push(issue);
  };

  const codeCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  const phoneCounts = new Map<string, number>();
  const nameCounts = new Map<string, number>();
  const missingId: string[] = [];
  const legacyIds: string[] = [];
  const testIds: string[] = [];
  const nonStandardIds: string[] = [];
  const missingPhone: string[] = [];
  const missingEmail: string[] = [];
  const closedWithJob: string[] = [];

  for (const e of employees) {
    const code = String(e.employeeCode || '').trim();
    if (!code) missingId.push(e.fullName || e.id);
    codeCounts.set(code.toLowerCase(), (codeCounts.get(code.toLowerCase()) || 0) + 1);

    const kind = classifyEmployeeCode(code, policy);
    if (kind === 'numeric-legacy') legacyIds.push(`${code} � ${e.fullName}`);
    else if (kind === 'test') testIds.push(`${code} � ${e.fullName}`);
    else if (kind === 'other-assigned') nonStandardIds.push(`${code} � ${e.fullName}`);

    const em = normalizeEmail(e.email);
    if (em) emailCounts.set(em, (emailCounts.get(em) || 0) + 1);
    else missingEmail.push(`${code} � ${e.fullName}`);

    const ph = normalizePhone(e.phone);
    if (ph.length === 10) phoneCounts.set(ph, (phoneCounts.get(ph) || 0) + 1);
    else missingPhone.push(`${code} � ${e.fullName}`);

    const nm = String(e.fullName || '').trim().toLowerCase();
    if (nm) nameCounts.set(nm, (nameCounts.get(nm) || 0) + 1);

    if (CLOSED_STATUSES.has(String(e.status)) && e.designation) {
      closedWithJob.push(`${code} � ${e.fullName} (${e.status})`);
    }
  }

  const dupCodes = [...codeCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const dupEmails = [...emailCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const dupPhones = [...phoneCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const dupNames = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k);

  push({
    category: 'MISSING_EMPLOYEE_ID', severity: 'HIGH', count: missingId.length, affected: missingId.slice(0, 25),
    description: 'Employees without an Employee ID. IDs are generated by the centralised allocator during import.',
  });
  push({
    category: 'DUPLICATE_EMPLOYEE_ID', severity: 'HIGH', count: dupCodes.length, affected: dupCodes.slice(0, 25),
    description: 'Employee IDs used more than once. The database unique index prevents this; investigate if reported.',
  });
  push({
    category: 'DUPLICATE_EMAIL', severity: 'MEDIUM', count: dupEmails.length, affected: dupEmails.slice(0, 25),
    description: 'Email addresses shared by several employee records � blocks duplicate creation and confuses matching.',
  });
  push({
    category: 'DUPLICATE_MOBILE', severity: 'MEDIUM', count: dupPhones.length, affected: dupPhones.slice(0, 25),
    description: 'Mobile numbers shared by several employee records � weakens the secondary import matcher.',
  });
  push({
    category: 'POSSIBLE_DUPLICATE_PROFILE', severity: 'MEDIUM', count: dupNames.length, affected: dupNames.slice(0, 25),
    description: 'Identical full names on multiple records. Never auto-merged � HR must review before any consolidation.',
  });
  push({
    category: 'LEGACY_NUMERIC_ID', severity: 'MEDIUM', count: legacyIds.length, affected: legacyIds.slice(0, 25),
    description: `Legacy numeric IDs (e.g. 1372) kept as the official display ID. Converting to ${policy.sampleFormat} style needs an authorised migration preview.`,
  });
  push({
    category: 'TEST_IDENTIFIER', severity: 'LOW', count: testIds.length, affected: testIds.slice(0, 25),
    description: 'Seeded TEST-EMP-* identifiers still in production data. Candidates for authorised ID migration.',
  });
  push({
    category: 'NON_STANDARD_ID', severity: 'LOW', count: nonStandardIds.length, affected: nonStandardIds.slice(0, 25),
    description: `Employee IDs that do not follow the active format ${policy.sampleFormat}.`,
  });
  push({
    category: 'MISSING_MOBILE', severity: 'LOW', count: missingPhone.length, affected: missingPhone.slice(0, 25),
    description: 'Employees without a valid 10-digit mobile number.',
  });
  push({
    category: 'MISSING_EMAIL', severity: 'LOW', count: missingEmail.length, affected: missingEmail.slice(0, 25),
    description: 'Employees without an email address.',
  });
  push({
    category: 'CLOSED_WITH_DESIGNATION', severity: 'LOW', count: closedWithJob.length, affected: closedWithJob.slice(0, 25),
    description: 'Closed (INACTIVE/TERMINATED) employees still carrying an active designation � review before reactivation.',
  });

  // Broken relations between employee and the modules that reference it.
  const dangling = await findDanglingRelations(scopeParams);
  for (const issue of dangling) push(issue);

  const activeCount = employees.filter((e) => e.status === 'ACTIVE').length;
  const locCount = new Set(employees.map((e) => e.locationId)).size;

  return {
    generatedAt: new Date().toISOString(),
    scope: ELEVATED.has(actor.role) ? 'ALL LOCATIONS' : actor.locationId || 'ALL LOCATIONS',
    totals: { employees: employees.length, active: activeCount, locations: locCount },
    issues,
  };
}

async function findDanglingRelations(scopeParams: any[]): Promise<DataQualityIssue[]> {
  const issues: DataQualityIssue[] = [];
  const queries: Array<{ category: string; severity: DataQualityIssue['severity']; description: string; sql: string; label: string }> = [
    {
      category: 'DANGLING_ATTENDANCE', severity: 'HIGH',
      description: 'Attendance records pointing at employees that no longer exist.',
      sql: `SELECT DISTINCT a.employeeId AS eid, e.fullName FROM attendance a LEFT JOIN employee e ON e.id = a.employeeId WHERE e.id IS NULL`,
      label: 'attendance',
    },
    {
      category: 'DANGLING_PAYROLL', severity: 'HIGH',
      description: 'Payslip/payroll items pointing at employees that no longer exist.',
      sql: `SELECT DISTINCT p.employeeId AS eid, NULL AS fullName FROM payrollitem p LEFT JOIN employee e ON e.id = p.employeeId WHERE e.id IS NULL`,
      label: 'payroll',
    },
    {
      category: 'DANGLING_FACE_PROFILE', severity: 'MEDIUM',
      description: 'Biometric face profiles no longer linked to any employee.',
      sql: `SELECT f.id AS eid, NULL AS fullName FROM faceprofile f LEFT JOIN employee e ON e.faceProfileId = f.id WHERE e.id IS NULL`,
      label: 'biometric',
    },
    
    {
      category: 'DANGLING_EMPLOYEE_DOCUMENT', severity: 'MEDIUM',
      description: 'Employee documents no longer linked to any employee.',
      sql: `SELECT d.id AS eid, NULL AS fullName FROM employee_documents d LEFT JOIN employee e ON e.id = d.employee_id WHERE e.id IS NULL`,
      label: 'documents',
    },
    {
      category: 'DANGLING_DEPARTMENT_REF', severity: 'MEDIUM',
      description: 'Employees referencing a department/floor/section/shift that no longer exists.',
      sql: `SELECT e.id AS eid, e.fullName FROM employee e LEFT JOIN department d ON d.id = e.departmentId WHERE e.departmentId IS NOT NULL AND d.id IS NULL`,
      label: 'department',
    },
  ];

  for (const q of queries) {
    try {
      const rows: any[] = await prisma.$queryRaw(q.sql);
      const affected = (rows || []).map((r) => (r.fullName ? `${r.eid} � ${r.fullName}` : String(r.eid)));
      if (affected.length > 0) {
        issues.push({
          category: q.category, severity: q.severity, count: affected.length,
          affected: affected.slice(0, 25), description: q.description,
        });
      }
    } catch {
      /* optional table missing in an offline build */
    }
  }
  return issues;
}

// -----------------------------------------------------------------------------
// CSV export (same column contract as the import template)
// -----------------------------------------------------------------------------

export interface ExportOptions {
  actor: ImportActor;
  locationId?: string;
  departmentId?: string;
  status?: string;
  search?: string;
  /** Privileged users may export unmasked statutory/banking references. */
  unmaskSensitive?: boolean;
}

export async function buildEmployeeExportCsv(options: ExportOptions): Promise<{ csv: string; fileName: string; count: number }> {
  const { actor } = options;
  const policy = await getEmployeeIdPolicy();
  const mayUnmask = options.unmaskSensitive && canViewSensitive(actor);

  const where: string[] = [];
  const params: any[] = [];
  const locationScope = ELEVATED.has(actor.role) ? options.locationId : actor.locationId;

  if (locationScope) {
    where.push('e.locationId = ?');
    params.push(locationScope);
  }
  if (options.departmentId && options.departmentId !== 'all') {
    where.push('e.departmentId = ?');
    params.push(options.departmentId);
  }
  if (options.status && options.status !== 'ALL') {
    where.push('e.status = ?');
    params.push(options.status);
  }
  if (options.search) {
    where.push('(e.employeeCode LIKE ? OR e.fullName LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.designation LIKE ? OR e.role LIKE ?)');
    const like = `%${options.search}%`;
    params.push(like, like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const employees: any[] = await prisma.$queryRaw(
    `SELECT e.*, l.code AS loc_code, l.name AS loc_name, d.name AS dept_name, d.code AS dept_code,
            f.name AS floor_name, s.name AS section_name, s.code AS section_code,
            sh.code AS shift_code, sh.name AS shift_name
     FROM employee e
     LEFT JOIN location l ON l.id = e.locationId
     LEFT JOIN department d ON d.id = e.departmentId
     LEFT JOIN floor f ON f.id = e.floorId
     LEFT JOIN section s ON s.id = e.sectionId
     LEFT JOIN shift sh ON sh.id = e.shiftId
     ${whereSql}
     ORDER BY e.employeeCode ASC`,
    ...params
  );

  const header = IMPORT_COLUMNS.map((c) => c.key);
  const body = employees.map((e) => {
    const values: Record<string, string> = {
      employee_id: e.employeeCode || '',
      employee_code: e.legacyEmployeeCode || '',
      first_name: e.firstName || '',
      middle_name: e.middleName || '',
      last_name: e.lastName || '',
      full_name: e.fullName || '',
      designation: e.designation || '',
      role: e.role || '',
      employment_type: e.employmentType || '',
      employment_status: e.status || '',
      mobile_number: e.phone || '',
      alternate_mobile_number: e.alternatePhone || '',
      email: e.email || '',
      emergency_contact_name: e.emergencyContactName || '',
      emergency_contact_number: e.emergencyContactNumber || '',
      current_address: e.currentAddress || '',
      permanent_address: e.permanentAddress || '',
      city: e.city || '',
      state: e.state || '',
      pincode: e.pincode || '',
      location_code: e.loc_code || '',
      location_name: e.loc_name || '',
      department: e.dept_code || e.dept_name || '',
      floor: e.floor_name || '',
      section: e.section_code || e.section_name || '',
      shift_id: e.shift_code || '',
      shift_name: e.shift_name || '',
      reporting_manager_employee_id: '',
      joining_date: isoDate(e.joiningDate),
      confirmation_date: isoDate(e.confirmationDate),
      employee_category: e.employeeCategory || '',
      date_of_birth: isoDate(e.dateOfBirth),
      gender: e.gender || '',
      payroll_employee_code: e.payrollEmployeeCode || '',
      pf_applicable: e.pfApplicable === null || e.pfApplicable === undefined ? '' : Number(e.pfApplicable) ? 'TRUE' : 'FALSE',
      uan_number: e.uanNo || '',
      esi_applicable: e.esiApplicable === null || e.esiApplicable === undefined ? '' : Number(e.esiApplicable) ? 'TRUE' : 'FALSE',
      esi_number: e.esiNo || '',
      bank_account_reference: mayUnmask ? e.bankAccount || '' : maskValue(e.bankAccount || ''),
      ifsc_code: e.bankIfsc || '',
      pan_number: mayUnmask ? e.panNumber || '' : maskValue(e.panNumber || ''),
      aadhaar_verification_status: e.aadhaarVerificationStatus || '',
      biometric_enrollment_status: e.faceProfileId ? 'ENROLLED' : 'NOT_ENROLLED',
      biometric_device_employee_id: e.biometricDeviceEmployeeId || '',
      attendance_eligibility:
        e.attendanceEligible === null || e.attendanceEligible === undefined ? 'TRUE' : Number(e.attendanceEligible) ? 'TRUE' : 'FALSE',
      employee_photo_reference: e.photoReference || '',
      employee_document_status: e.documentStatus || '',
      remarks: e.remarks || '',
    };
    return IMPORT_COLUMNS.map((c) => values[c.key] ?? '');
  });

  const legend = [
    '',
    '# BSC TEXTILES � WORKFORCE DIRECTORY EXPORT',
    `# Generated: ${new Date().toISOString()}`,
    `# Employee ID format in use: ${policy.sampleFormat}`,
    mayUnmask
      ? '# Sensitive columns (bank_account_reference, pan_number) are EXPORTED IN CLEAR TEXT for your role.'
      : '# Sensitive columns (bank_account_reference, pan_number) are masked. Ask an Administrator for full values.',
    '# This file uses the same column names as the bulk import template and can be re-imported directly.',
  ];

  const csv = `${toCsv([header, ...body])}\r\n${legend.join('\r\n')}`;
  const scope = (locationScope || 'ALL').toString().replace(/[^A-Za-z0-9_-]/g, '');
  return {
    csv,
    fileName: `bsc_textiles_workforce_export_${scope}_${new Date().toISOString().slice(0, 10)}.csv`,
    count: employees.length,
  };
}
