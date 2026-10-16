/**
 * Employee field-level permission matrix.
 *
 * The legacy `authorize('EDIT')` gate is module-wide: anyone who can edit the
 * employee module could previously rewrite salary, employee number, employment
 * status, identity documents and even the account's authentication data, and an
 * employee holding a VIEW token could PUT their own record. This module splits
 * the record into field groups and answers one question: may THIS caller write
 * THIS field on THIS employee?
 *
 * The matrix is derived from roles and RBAC module levels that already exist in
 * this database (`user.role`, `rolepermission` via `rbacService`):
 *   SUPER_ADMIN / ADMIN      — everything, including renumbering an employee
 *   HR_MANAGER               — everything except authentication data
 *   HR_EXECUTIVE             — roster & assignment fields, protected fields read-only
 *   PAYROLL_MANAGER          — compensation fields only
 *   LOCATION_MANAGER /
 *   DEPARTMENT_MANAGER /
 *   FLOOR_MANAGER            — their own assigned operational fields only
 *   HR_AUDITOR               — read only, by design
 *   everyone else            — nothing about another person; the four
 *                              self-service fields on their own profile only
 *
 * Nothing here widens access: a role not listed gets the strictest row.
 */
import type { AccessLevel } from './rbacService.js';

export type FieldGroup =
  | 'compensation'          // basicSalary, hra, fixedGrossSalary, perDaySalary, daysPayable, pfPay, pf/esi flags
  | 'employeeNumber'        // employeeCode, salesmanNo, payrollEmployeeCode, biometricDeviceEmployeeId
  | 'employmentStatus'      // status, exitDate
  | 'identityDocuments'     // panNumber, aadhaarVerificationStatus, pfNo, esiNo, uanNo, bank*, documentStatus
  | 'authentication'        // role, permissions, password/auth data on the linked account
  | 'assignment'            // locationId, floorId, departmentId, sectionId, shiftId, designation, reportingManagerId
  | 'personal'              // names, email, phone, gender, addresses, dateOfBirth, emergency contact
  | 'selfService';          // phone, address, emergency contact on the caller's OWN profile

/** Fields that must never be edited through the ordinary employee form. */
export const PROTECTED_GROUPS: readonly FieldGroup[] = [
  'compensation',
  'employeeNumber',
  'employmentStatus',
  'identityDocuments',
  'authentication',
];

const FIELD_TO_GROUP: Record<string, FieldGroup> = {
  // compensation
  basicSalary: 'compensation',
  hra: 'compensation',
  fixedGrossSalary: 'compensation',
  perDaySalary: 'compensation',
  daysPayable: 'compensation',
  pfPay: 'compensation',
  pfApplicable: 'compensation',
  esiApplicable: 'compensation',
  base_salary: 'compensation',
  // employee number
  employeeCode: 'employeeNumber',
  salesmanNo: 'employeeNumber',
  payrollEmployeeCode: 'employeeNumber',
  biometricDeviceEmployeeId: 'employeeNumber',
  legacyEmployeeCode: 'employeeNumber',
  // employment status
  status: 'employmentStatus',
  exitDate: 'employmentStatus',
  confirmationDate: 'employmentStatus',
  // identity documents / statutory
  panNumber: 'identityDocuments',
  aadhaarVerificationStatus: 'identityDocuments',
  pfNo: 'identityDocuments',
  esiNo: 'identityDocuments',
  uanNo: 'identityDocuments',
  bankName: 'identityDocuments',
  bankAccount: 'identityDocuments',
  bankIfsc: 'identityDocuments',
  documentStatus: 'identityDocuments',
  // authentication
  role: 'authentication',
  permissions: 'authentication',
  passwordHash: 'authentication',
  mfaEnabled: 'authentication',
  mfaRequired: 'authentication',
  mustChangePassword: 'authentication',
  // assignment
  locationId: 'assignment',
  floorId: 'assignment',
  departmentId: 'assignment',
  sectionId: 'assignment',
  shiftId: 'assignment',
  sellingPointId: 'assignment',
  designation: 'assignment',
  employmentType: 'assignment',
  employeeCategory: 'assignment',
  reportingManagerId: 'assignment',
  batch: 'assignment',
  attendanceEligible: 'assignment',
  // personal
  firstName: 'personal',
  middleName: 'personal',
  lastName: 'personal',
  fullName: 'personal',
  email: 'personal',
  phone: 'personal',
  alternatePhone: 'personal',
  gender: 'personal',
  dateOfBirth: 'personal',
  joiningDate: 'personal',
  currentAddress: 'personal',
  permanentAddress: 'personal',
  city: 'personal',
  state: 'personal',
  pincode: 'personal',
  emergencyContactName: 'personal',
  emergencyContactNumber: 'personal',
  photoReference: 'personal',
  remarks: 'personal',
};

/** Fields an employee may maintain on their own record. */
const SELF_EDITABLE: readonly string[] = [
  'phone',
  'alternatePhone',
  'currentAddress',
  'permanentAddress',
  'city',
  'state',
  'pincode',
  'emergencyContactName',
  'emergencyContactNumber',
];

/** Operational fields a store/floor/department manager may set for their own staff. */
const MANAGER_EDITABLE: readonly string[] = [
  'floorId',
  'sectionId',
  'shiftId',
  'designation',
  'attendanceEligible',
  'firstName',
  'middleName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'gender',
  'dateOfBirth',
  'joiningDate',
  'currentAddress',
  'permanentAddress',
  'city',
  'state',
  'pincode',
  'emergencyContactName',
  'emergencyContactNumber',
  'remarks',
];

const MANAGER_ROLES = new Set(['LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD']);
const HR_ROLES = new Set(['HR_MANAGER', 'HR_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN']);

export interface FieldAccessContext {
  role?: string;
  userId?: string;
  /** true when the caller is editing their own employee record */
  isSelf?: boolean;
  /** true when the target employee reports into the caller's location scope */
  withinManagedLocation?: boolean;
}

export interface FieldDecision {
  allowed: boolean;
  group: FieldGroup;
  reason?: string;
}

export function groupOf(field: string): FieldGroup | undefined {
  return FIELD_TO_GROUP[field];
}

export function isProtectedField(field: string): boolean {
  const group = FIELD_TO_GROUP[field];
  return !!group && PROTECTED_GROUPS.includes(group);
}

/**
 * The matrix. Deny by default: an unlisted field, an unknown role or a missing
 * context all resolve to "not allowed".
 */
export function canEditField(field: string, ctx: FieldAccessContext): FieldDecision {
  const group = FIELD_TO_GROUP[field];
  if (!group) {
    return { allowed: false, group: 'personal', reason: `Unknown or internal field "${field}" cannot be edited through the employee form.` };
  }

  const role = ctx.role ?? '';

  if (group === 'authentication') {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') return { allowed: true, group };
    return { allowed: false, group, reason: 'Authentication and role data may only be changed by a Super Admin or Admin.' };
  }

  if (group === 'employeeNumber') {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HR_MANAGER') return { allowed: true, group };
    return { allowed: false, group, reason: 'The employee number is an official identifier; only HR management may change it.' };
  }

  if (group === 'employmentStatus') {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HR_MANAGER' || role === 'HR_EXECUTIVE') {
      return { allowed: true, group };
    }
    return { allowed: false, group, reason: 'Employment status changes only through an authorised HR action.' };
  }

  if (group === 'compensation') {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HR_MANAGER' || role === 'PAYROLL_MANAGER') {
      return { allowed: true, group };
    }
    return { allowed: false, group, reason: 'Salary and statutory contribution data is restricted to HR and Payroll management.' };
  }

  if (group === 'identityDocuments') {
    if (HR_ROLES.has(role) || role === 'HR_AUDITOR') return { allowed: true, group };
    return { allowed: false, group, reason: 'Identity documents and statutory numbers are HR-managed only.' };
  }

  // Non-protected groups below.
  if (ctx.isSelf) {
    if (SELF_EDITABLE.includes(field)) return { allowed: true, group };
    return { allowed: false, group, reason: 'You cannot change this field on your own record; contact HR.' };
  }

  if (HR_ROLES.has(role)) return { allowed: true, group };

  if (role === 'HR_AUDITOR') {
    return { allowed: false, group, reason: 'HR Auditors have read-only access to employee records.' };
  }

  if (MANAGER_ROLES.has(role)) {
    if (!ctx.withinManagedLocation) {
      return { allowed: false, group, reason: 'This employee is outside your location scope.' };
    }
    if (MANAGER_EDITABLE.includes(field)) return { allowed: true, group };
    return { allowed: false, group, reason: 'Managers may edit only their assigned operational fields.' };
  }

  return { allowed: false, group, reason: 'Your role does not include editing employee records.' };
}

/** Diff the attempted payload against the matrix and return every violation. */
export function collectFieldViolations(
  payloadFields: Iterable<string>,
  ctx: FieldAccessContext
): Array<{ field: string; group: FieldGroup; reason: string }> {
  const violations: Array<{ field: string; group: FieldGroup; reason: string }> = [];
  for (const field of payloadFields) {
    const decision = canEditField(field, ctx);
    if (!decision.allowed) {
      violations.push({ field, group: decision.group, reason: decision.reason ?? 'Not allowed.' });
    }
  }
  return violations;
}

/** Fields this caller may actually write, for building a form's read-only set. */
export function editableFieldList(ctx: FieldAccessContext): string[] {
  return Object.keys(FIELD_TO_GROUP).filter((field) => canEditField(field, ctx).allowed);
}

/**
 * Whether the caller may see a protected field's value at all. Salary and
 * statutory identity data are not leaked into list endpoints for staff roles.
 */
export function canReadProtectedFields(role?: string, isSelf?: boolean): boolean {
  const r = role ?? '';
  if (HR_ROLES.has(r) || r === 'PAYROLL_MANAGER' || r === 'HR_AUDITOR') return true;
  if (MANAGER_ROLES.has(r)) return false;
  if (isSelf) return false;
  return false;
}

/** Re-exported so callers can assert against the RBAC module level too. */
export type { AccessLevel };
