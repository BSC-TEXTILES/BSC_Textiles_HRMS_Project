'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Save, ShieldAlert, X } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { EmployeeCodeInput } from '@/components/employees/EmployeeCodeField';
import { validateEmployeeCode, employeeCodeErrorFromResponse } from '@/lib/employeeCode';
import { formatDateTimeSafe } from '@/lib/utils';

/**
 * HR master-data editing for one employee.
 *
 * - `hr`   mode: everything HR owns (code, store, department, designation,
 *          dates, contact, employment + account status, shift/attendance
 *          settings, floor/counter, salary & payroll, HR remarks).
 * - `self` mode: the person may only fix their own contact/personal details.
 *          Salary, attendance history, employment status and employee number
 *          are rendered disabled (the API enforces the same rule).
 *
 * Saving is always an explicit "Save Changes" action. Unsaved edits are
 * confirmed before discarding, and a concurrent-edit conflict (HTTP 409) is
 * shown to the user instead of silently overwriting the other person's work.
 */

const EMPLOYMENT_STATUSES = ['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_LEAVE', 'SUSPENDED', 'INACTIVE', 'TERMINATED', 'RESIGNED', 'EX_EMPLOYEE'];

interface ReferenceList {
  id: string;
  name: string;
  code?: string;
}

interface HrEditProps {
  open: boolean;
  onClose: () => void;
  employee: any | null;
  mode?: 'hr' | 'self';
  /** HR roles that may change employment/account status and salary. */
  canManageStatus?: boolean;
  canManageSalary?: boolean;
  locations: ReferenceList[];
  departments: ReferenceList[];
  floors?: ReferenceList[];
  sections?: ReferenceList[];
  shifts?: ReferenceList[];
  onSaved?: (updated: any) => void;
}

interface FormState {
  employeeCode: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  gender: string;
  dateOfBirth: string;
  locationId: string;
  departmentId: string;
  floorId: string;
  sectionId: string;
  shiftId: string;
  designation: string;
  status: string;
  employmentType: string;
  employeeCategory: string;
  joiningDate: string;
  confirmationDate: string;
  exitDate: string;
  attendanceEligible: boolean;
  basicSalary: string;
  hra: string;
  fixedGrossSalary: string;
  pfPay: string;
  daysPayable: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  pfNo: string;
  esiNo: string;
  uanNo: string;
  panNumber: string;
  remarks: string;
}

function toDateInput(value: any): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function buildInitialState(emp: any): FormState {
  return {
    employeeCode: emp?.employeeCode ? String(emp.employeeCode) : '',
    firstName: emp?.firstName || '',
    middleName: emp?.middleName || '',
    lastName: emp?.lastName || '',
    email: emp?.email || '',
    phone: emp?.phone || '',
    alternatePhone: emp?.alternatePhone || '',
    emergencyContactName: emp?.emergencyContactName || '',
    emergencyContactNumber: emp?.emergencyContactNumber || '',
    gender: emp?.gender || '',
    dateOfBirth: toDateInput(emp?.dateOfBirth),
    locationId: emp?.locationId || '',
    departmentId: emp?.departmentId || '',
    floorId: emp?.floorId || '',
    sectionId: emp?.sectionId || '',
    shiftId: emp?.shiftId || '',
    designation: emp?.designation || '',
    status: emp?.status || 'ACTIVE',
    employmentType: emp?.employmentType || '',
    employeeCategory: emp?.employeeCategory || '',
    joiningDate: toDateInput(emp?.joiningDate),
    confirmationDate: toDateInput(emp?.confirmationDate),
    exitDate: toDateInput(emp?.exitDate),
    attendanceEligible: Number(emp?.attendanceEligible ?? 1) === 1,
    basicSalary: emp?.basicSalary != null ? String(emp.basicSalary) : '',
    hra: emp?.hra != null ? String(emp.hra) : '',
    fixedGrossSalary: emp?.fixedGrossSalary != null ? String(emp.fixedGrossSalary) : '',
    pfPay: emp?.pfPay != null ? String(emp.pfPay) : '',
    daysPayable: emp?.daysPayable != null ? String(emp.daysPayable) : '',
    bankName: emp?.bankName || '',
    bankAccount: emp?.bankAccount || '',
    bankIfsc: emp?.bankIfsc || '',
    pfNo: emp?.pfNo || '',
    esiNo: emp?.esiNo || '',
    uanNo: emp?.uanNo || '',
    panNumber: emp?.panNumber || '',
    remarks: emp?.remarks || '',
  };
}

export function HrEmployeeEditDialog({
  open,
  onClose,
  employee,
  mode = 'hr',
  canManageStatus = true,
  canManageSalary = true,
  locations,
  departments,
  floors = [],
  sections = [],
  shifts = [],
  onSaved,
}: HrEditProps) {
  const isHr = mode === 'hr';
  const [form, setForm] = useState<FormState>(() => buildInitialState(employee));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codeServerError, setCodeServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<{ at: string | null; message: string } | null>(null);
  const [droppedFields, setDroppedFields] = useState<string[]>([]);
  const baselineRef = useRef<string>('');

  useEffect(() => {
    if (!open || !employee) return;
    const next = buildInitialState(employee);
    setForm(next);
    baselineRef.current = JSON.stringify(next);
    setDirty(false);
    setConflict(null);
    setFieldErrors({});
    setCodeServerError(null);
    setDroppedFields([]);
  }, [open, employee]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setDirty(JSON.stringify(next) !== baselineRef.current);
      return next;
    });
  };

  const set = (patch: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      setDirty(JSON.stringify(next) !== baselineRef.current);
      return next;
    });
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address.';

    const codeCheck = validateEmployeeCode(form.employeeCode, isHr);
    if (!codeCheck.valid) errors.employeeCode = codeCheck.error || 'Invalid employee code.';

    if (isHr && form.phone && !/^[6-9]\d{9}$/.test(form.phone.replace(/[\s+-]/g, '').slice(-10))) {
      errors.phone = 'Mobile number must be 10 digits starting 6-9.';
    }

    if (isHr && form.joiningDate && form.exitDate && new Date(form.exitDate) < new Date(form.joiningDate)) {
      errors.exitDate = 'Exit / last working date cannot be before the joining date.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const requestClose = () => {
    if (dirty) {
      const ok = window.confirm('You have unsaved changes. Discard them and close?');
      if (!ok) return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!employee?.id) return;
    setConflict(null);
    setDroppedFields([]);
    if (!validate()) {
      toast.error('Please correct the highlighted fields before saving.');
      return;
    }

    const payload: Record<string, any> = {
      // personal + contact details are always editable
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim() || null,
      lastName: form.lastName.trim(),
      fullName: [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ').trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      gender: form.gender || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
    };

    if (isHr) {
      Object.assign(payload, {
        employeeCode: form.employeeCode.trim(),
        alternatePhone: form.alternatePhone.trim(),
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactNumber: form.emergencyContactNumber.trim(),
        locationId: form.locationId || undefined,
        departmentId: form.departmentId || undefined,
        floorId: form.floorId || undefined,
        sectionId: form.sectionId || undefined,
        shiftId: form.shiftId || undefined,
        designation: form.designation.trim(),
        joiningDate: form.joiningDate || undefined,
        confirmationDate: form.confirmationDate || undefined,
        employmentType: form.employmentType || undefined,
        employeeCategory: form.employeeCategory || undefined,
        attendanceEligible: form.attendanceEligible ? 1 : 0,
        remarks: form.remarks,
        // Account/employment status is only sent when the actor may manage it;
        // the backend re-checks the permission regardless.
        ...(canManageStatus ? { status: form.status, exitDate: form.exitDate || null } : {}),
        ...(canManageSalary
          ? {
              basicSalary: form.basicSalary === '' ? undefined : Number(form.basicSalary),
              hra: form.hra === '' ? undefined : Number(form.hra),
              fixedGrossSalary: form.fixedGrossSalary === '' ? undefined : Number(form.fixedGrossSalary),
              pfPay: form.pfPay === '' ? undefined : Number(form.pfPay),
              daysPayable: form.daysPayable === '' ? undefined : Number(form.daysPayable),
              bankName: form.bankName.trim(),
              bankAccount: form.bankAccount.trim(),
              bankIfsc: form.bankIfsc.trim(),
              pfNo: form.pfNo.trim(),
              esiNo: form.esiNo.trim(),
              uanNo: form.uanNo.trim(),
              panNumber: form.panNumber.trim(),
            }
          : {}),
      });
    }

    try {
      setSaving(true);
      // Optimistic-lock token: the backend rejects with 409 when somebody else
      // saved this record after it was opened here.
      const res = await api.put(`/employees/${employee.id}`, payload, {
        headers: { 'If-Match': String(employee.updatedAt || '') },
        params: { expectedUpdatedAt: employee.updatedAt || undefined },
      });

      const saved = res.data?.employee || res.data || {};
      baselineRef.current = JSON.stringify(buildInitialState(saved));
      setForm(buildInitialState(saved));
      setDirty(false);
      toast.success('Changes saved to the employee master record.');
      onSaved?.(saved);

      // Honest reporting when the API silently ignores a field it does not
      // persist yet (zod strips unknown keys), instead of pretending it saved.
      const echoChecks: Array<[string, any, any]> = [
        ['employee number', payload.employeeCode, saved.employeeCode],
        ['store', payload.locationId, saved.locationId],
        ['department', payload.departmentId, saved.departmentId],
        ['shift', payload.shiftId, saved.shiftId],
        ['floor', payload.floorId, saved.floorId],
        ['basic salary', payload.basicSalary, saved.basicSalary],
        ['employment status', payload.status, saved.status],
      ];
      const dropped = echoChecks
        .filter(([, sent, got]) => sent !== undefined && got !== undefined && String(got ?? '') !== String(sent))
        .map(([label]) => label);
      setDroppedFields(dropped);
      if (dropped.length) {
        toast(`Saved, but the API did not echo: ${dropped.join(', ')}.`, { id: 'hr-edit-dropped', icon: '⚠️' });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const apiMessage = err?.response?.data?.error || err?.response?.data?.message || 'Could not save the employee record.';

      if (status === 409) {
        setConflict({
          at: err?.response?.data?.updatedAt || err?.response?.data?.current?.updatedAt || null,
          message:
            err?.response?.data?.message ||
            'Another user saved this employee record after you opened it. Your changes were NOT applied.',
        });
        toast.error('This record changed while you were editing. Resolve before saving.');
        return;
      }

      const codeError = employeeCodeErrorFromResponse(err);
      setCodeServerError(codeError);
      if (codeError) {
        setFieldErrors((prev) => ({ ...prev, employeeCode: codeError }));
      }

      const details: string[] = Array.isArray(err?.response?.data?.details) ? err.response.data.details : [];
      const mapped: Record<string, string> = {};
      details.forEach((d) => {
        const lower = d.toLowerCase();
        const cleanMsg = d.includes(':') ? d.split(':').slice(1).join(':').trim() : d;
        if (lower.includes('employeecode')) mapped.employeeCode = cleanMsg;
        else if (lower.includes('email')) mapped.email = cleanMsg;
        else if (lower.includes('phone')) mapped.phone = cleanMsg;
        else if (lower.includes('locationid')) mapped.locationId = cleanMsg;
      });
      setFieldErrors((prev) => ({ ...prev, ...mapped }));
      toast.error(Object.keys(mapped).length ? 'Some fields were rejected by the HRMS API.' : apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const readOnlyField = !isHr;
  const statusLocked = !canManageStatus;
  const salaryLocked = !canManageSalary;

  const locationFloors = useMemo(
    () => floors.filter((f) => !form.locationId || (f as any).locationId === form.locationId),
    [floors, form.locationId]
  );
  const locationSections = useMemo(
    () => sections.filter((s) => !form.locationId || (s as any).locationId === form.locationId),
    [sections, form.locationId]
  );

  if (!employee) return null;

  return (
    <Modal open={open} onClose={requestClose} title={`Edit employee record — ${employee.fullName || employee.employeeCode}`} className="max-w-4xl">
      <div className="space-y-5 text-xs">
        {!isHr && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <p>
              You can update your own contact details here. Employee number, salary, employment status, shift and
              attendance settings are HR-controlled and locked — the HRMS API rejects changes to them from a
              self-service account.
            </p>
          </div>
        )}

        {conflict && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 p-3 space-y-2"
          >
            <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
              <AlertTriangle className="w-4 h-4" />
              Concurrent edit conflict — nothing was overwritten
            </div>
            <p className="text-red-700 dark:text-red-200">{conflict.message}</p>
            {conflict.at && (
              <p className="text-red-600/90 dark:text-red-300">Last saved on the server: {formatDateTimeSafe(conflict.at)}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const fresh = await api.get(`/employees/${employee.id}`, { params: { _r: Date.now() } });
                    const emp = fresh.data;
                    const next = buildInitialState(emp);
                    baselineRef.current = JSON.stringify(next);
                    setForm(next);
                    setDirty(false);
                    setConflict(null);
                    toast.success('Loaded the latest saved version. Re-apply your edits.');
                  } catch {
                    toast.error('Could not reload the record.');
                  }
                }}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Load latest version
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConflict(null)}>
                Keep editing (changes are not saved yet)
              </Button>
            </div>
          </div>
        )}

        {/* Personal details */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Personal details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="First name *" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} error={fieldErrors.firstName} />
            <Input label="Middle name" value={form.middleName} onChange={(e) => update('middleName', e.target.value)} />
            <Input label="Last name *" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} error={fieldErrors.lastName} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Gender"
              value={form.gender}
              onChange={(e) => update('gender', e.target.value)}
              options={[
                { value: '', label: 'Not recorded' },
                { value: 'MALE', label: 'Male' },
                { value: 'FEMALE', label: 'Female' },
                { value: 'OTHER', label: 'Other' },
              ]}
            />
            <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
            <Input label="Designation" value={form.designation} disabled={readOnlyField} onChange={(e) => update('designation', e.target.value)} />
          </div>
        </section>

        {/* Employee number */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Employee number</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <EmployeeCodeInput
              value={form.employeeCode}
              onChange={(v) => {
                update('employeeCode', v);
                if (codeServerError) setCodeServerError(null);
              }}
              disabled={readOnlyField}
              required={isHr}
              serverError={codeServerError}
            />
            <div className="sm:col-span-2 flex items-end">
              <p className="text-[11px] text-slate-500 leading-snug pb-2">
                Digits only, treated as an identifier — leading zeros are preserved. This record currently displays{' '}
                <span className="font-mono font-bold">{employee.employeeCode ?? '—'}</span>. A legacy non-numeric code is
                flagged in the directory and is never rewritten automatically.
              </p>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Contact information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} error={fieldErrors.email} />
            <Input label="Mobile" value={form.phone} onChange={(e) => update('phone', e.target.value)} error={fieldErrors.phone} placeholder="10-digit mobile" />
            <Input label="Alternate phone" value={form.alternatePhone} disabled={readOnlyField} onChange={(e) => update('alternatePhone', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Emergency contact name" value={form.emergencyContactName} disabled={readOnlyField} onChange={(e) => update('emergencyContactName', e.target.value)} />
            <Input label="Emergency contact number" value={form.emergencyContactNumber} disabled={readOnlyField} onChange={(e) => update('emergencyContactNumber', e.target.value)} />
          </div>
        </section>

        {isHr && (
          <>
            {/* Placement */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Store, department &amp; attendance settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  label="Store / location"
                  value={form.locationId}
                  onChange={(e) => update('locationId', e.target.value)}
                  error={fieldErrors.locationId}
                  options={locations.map((l) => ({ value: l.id, label: l.code ? `${l.name} (${l.code})` : l.name }))}
                />
                <Select
                  label="Department"
                  value={form.departmentId}
                  onChange={(e) => update('departmentId', e.target.value)}
                  options={[{ value: '', label: 'Unassigned' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                />
                <Select
                  label="Floor"
                  value={form.floorId}
                  onChange={(e) => update('floorId', e.target.value)}
                  options={[{ value: '', label: 'Unassigned' }, ...locationFloors.map((f) => ({ value: f.id, label: f.name }))]}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  label="Section / counter"
                  value={form.sectionId}
                  onChange={(e) => update('sectionId', e.target.value)}
                  options={[{ value: '', label: 'Unassigned' }, ...locationSections.map((s) => ({ value: s.id, label: s.code ? `${s.name} (${s.code})` : s.name }))]}
                />
                <Select
                  label="Shift"
                  value={form.shiftId}
                  onChange={(e) => update('shiftId', e.target.value)}
                  options={[{ value: '', label: 'No shift mapped' }, ...shifts.map((s) => ({ value: s.id, label: s.name }))]}
                />
                <Select
                  label="Attendance eligible"
                  value={form.attendanceEligible ? '1' : '0'}
                  onChange={(e) => update('attendanceEligible', e.target.value === '1')}
                  options={[
                    { value: '1', label: 'Yes — punches are recorded' },
                    { value: '0', label: 'No — exempt from attendance' },
                  ]}
                />
              </div>
            </section>

            {/* Employment dates & status */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Employment dates &amp; status</h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input label="Joining date" type="date" value={form.joiningDate} onChange={(e) => update('joiningDate', e.target.value)} />
                <Input label="Confirmation date" type="date" value={form.confirmationDate} onChange={(e) => update('confirmationDate', e.target.value)} />
                <Input
                  label="Last working / exit date"
                  type="date"
                  value={form.exitDate}
                  disabled={statusLocked}
                  onChange={(e) => update('exitDate', e.target.value)}
                  error={fieldErrors.exitDate}
                />
                <Select
                  label="Employment status"
                  value={form.status}
                  disabled={statusLocked}
                  onChange={(e) => update('status', e.target.value)}
                  options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: s }))}
                />
              </div>
              {statusLocked && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Employment status changes require the "Reactivate / Deactivate" action, which records a mandatory reason.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Employment type"
                  value={form.employmentType}
                  onChange={(e) => update('employmentType', e.target.value)}
                  options={[
                    { value: '', label: 'Not recorded' },
                    { value: 'PERMANENT', label: 'Permanent' },
                    { value: 'TEMPORARY', label: 'Temporary' },
                    { value: 'CONTRACT', label: 'Contract' },
                    { value: 'DAILY_WAGE', label: 'Daily wage' },
                    { value: 'TRAINEE', label: 'Trainee' },
                  ]}
                />
                <Select
                  label="Employee category"
                  value={form.employeeCategory}
                  onChange={(e) => update('employeeCategory', e.target.value)}
                  options={[
                    { value: '', label: 'Not recorded' },
                    { value: 'STAFF', label: 'Staff' },
                    { value: 'WORKMAN', label: 'Workman' },
                    { value: 'SALES', label: 'Sales' },
                    { value: 'OPERATIONS', label: 'Operations' },
                  ]}
                />
              </div>
            </section>

            {/* Salary & payroll */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Salary &amp; payroll</h3>
              {salaryLocked && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Your role can view this employee but not change compensation — the fields are disabled and the API
                  rejects the write.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <Input label="Basic (₹)" type="number" disabled={salaryLocked} value={form.basicSalary} onChange={(e) => update('basicSalary', e.target.value)} />
                <Input label="HRA (₹)" type="number" disabled={salaryLocked} value={form.hra} onChange={(e) => update('hra', e.target.value)} />
                <Input label="Fixed gross (₹)" type="number" disabled={salaryLocked} value={form.fixedGrossSalary} onChange={(e) => update('fixedGrossSalary', e.target.value)} />
                <Input label="PF base (₹)" type="number" disabled={salaryLocked} value={form.pfPay} onChange={(e) => update('pfPay', e.target.value)} />
                <Input label="Days payable" type="number" disabled={salaryLocked} value={form.daysPayable} onChange={(e) => update('daysPayable', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input label="Bank name" disabled={salaryLocked} value={form.bankName} onChange={(e) => update('bankName', e.target.value)} />
                <Input label="Account number" disabled={salaryLocked} value={form.bankAccount} onChange={(e) => update('bankAccount', e.target.value)} />
                <Input label="IFSC" disabled={salaryLocked} value={form.bankIfsc} onChange={(e) => update('bankIfsc', e.target.value)} />
                <Input label="PAN" disabled={salaryLocked} value={form.panNumber} onChange={(e) => update('panNumber', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input label="PF number" disabled={salaryLocked} value={form.pfNo} onChange={(e) => update('pfNo', e.target.value)} />
                <Input label="ESI number" disabled={salaryLocked} value={form.esiNo} onChange={(e) => update('esiNo', e.target.value)} />
                <Input label="UAN number" disabled={salaryLocked} value={form.uanNo} onChange={(e) => update('uanNo', e.target.value)} />
              </div>
            </section>

            {/* HR remarks */}
            <section className="space-y-2">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">HR remarks</h3>
              <Textarea label="Remarks stored on the master record" value={form.remarks} onChange={(e) => update('remarks', e.target.value)} placeholder="Context HR should keep on this record (roster notes, corrections, settlement follow-ups)…" />
            </section>
          </>
        )}

        {droppedFields.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-amber-900 dark:text-amber-200">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Saved, but the API did not return these fields:
            </p>
            <p className="mt-1">{droppedFields.join(', ')} — the backend has not implemented persistence for them yet.</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <span className="text-[11px] text-slate-500">
            {dirty ? 'Unsaved changes' : 'No pending changes'}
            {employee.updatedAt ? ` · record last updated ${formatDateTimeSafe(employee.updatedAt)}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={requestClose}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default HrEmployeeEditDialog;
