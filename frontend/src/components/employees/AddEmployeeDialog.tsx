'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export const ORDERED_DEPARTMENTS = [
  'Customer Service & Billing',
  'Finance & Accounts',
  'Human Resources',
  'Inventory & Logistics',
  'Sales & Retail',
  'Store Operations',
] as const;

export const INDIAN_PHONE_REGEX = /^[6-9][0-9]{9}$/;

export function cleanPhoneNumber(value: string): string {
  if (!value) return '';
  let str = value.trim();
  if (str.startsWith('+91')) {
    str = str.slice(3);
  } else if (str.startsWith('+')) {
    str = str.slice(1);
  }
  let digits = str.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
}

export function getPhoneError(phone: string, isRequired = true): string | undefined {
  const clean = phone.trim();
  if (!clean) {
    return isRequired ? 'Enter mobile number' : undefined;
  }
  if (!/^[6-9]/.test(clean)) {
    return 'Enter a valid mobile number';
  }
  if (clean.length < 10) {
    return 'Enter a 10-digit mobile number';
  }
  if (!INDIAN_PHONE_REGEX.test(clean)) {
    return 'Enter a valid mobile number';
  }
  return undefined;
}

export function findDepartmentIdForName(
  deptName: string,
  selectedLocationId: string,
  departmentsList: any[],
  locationsList: any[]
): string | undefined {
  const selectedLoc = locationsList.find(
    (l) => l.id === selectedLocationId || l.code === selectedLocationId
  );
  const targetLocId = selectedLoc?.id;
  const targetLocCode = selectedLoc?.code;

  const locDept = departmentsList.find((d) => {
    const nameMatch =
      d.name?.toLowerCase().trim() === deptName.toLowerCase().trim() ||
      (deptName === 'Store Operations' && (d.code === 'OPS' || d.name?.toLowerCase().includes('operation')));
    if (!nameMatch) return false;
    return (
      (targetLocId && d.locationId === targetLocId) ||
      (targetLocCode && (d.location?.code === targetLocCode || d.locationCode === targetLocCode))
    );
  });
  if (locDept) return locDept.id;

  const anyDept = departmentsList.find(
    (d) =>
      d.name?.toLowerCase().trim() === deptName.toLowerCase().trim() ||
      (deptName === 'Store Operations' && (d.code === 'OPS' || d.name?.toLowerCase().includes('operation')))
  );
  return anyDept?.id;
}

export interface AddEmployeeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newEmployee: any) => void;
  locations: any[];
  departments: any[];
  departmentsLoading?: boolean;
  departmentsError?: string | null;
  onRetryDepartments?: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  locationId: string;
  departmentId: string;
  gender: 'male' | 'female';
  role: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  locationId?: string;
  general?: string;
}

const INITIAL_FORM: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  locationId: '',
  departmentId: '',
  gender: 'male',
  role: 'SALES_EMPLOYEE',
};

export const AVAILABLE_ROLES = [
  { value: 'SALES_EMPLOYEE', label: 'Sales Employee' },
  { value: 'FLOOR_MANAGER', label: 'Floor Manager' },
  { value: 'DEPARTMENT_MANAGER', label: 'Department Manager' },
  { value: 'HR_EXECUTIVE', label: 'HR Executive' },
  { value: 'HR_MANAGER', label: 'HR Manager' },
  { value: 'TEAM_LEAD', label: 'Team Lead' },
  { value: 'LOCATION_MANAGER', label: 'Location Manager' },
  { value: 'EMPLOYEE', label: 'Employee' },
];

export function AddEmployeeDialog({
  isOpen,
  onClose,
  onSuccess,
  locations,
  departments,
  departmentsLoading = false,
  departmentsError = null,
  onRetryDepartments,
  triggerRef,
}: AddEmployeeDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if form has unsaved edits
  const isDirty = Boolean(
    formData.firstName.trim() ||
    formData.lastName.trim() ||
    formData.email.trim() ||
    formData.phone.trim() ||
    formData.locationId ||
    formData.departmentId ||
    formData.gender !== 'male' ||
    formData.role !== 'SALES_EMPLOYEE'
  );

  const isPhoneValid = INDIAN_PHONE_REGEX.test(formData.phone.trim());

  // Memoized 6 canonical departments in exact order, mapped to active department IDs
  const departmentOptions = useMemo(() => {
    return ORDERED_DEPARTMENTS.map((deptName) => {
      const deptId = findDepartmentIdForName(
        deptName,
        formData.locationId,
        departments,
        locations
      );

      if (process.env.NODE_ENV === 'development' && !deptId && departments.length > 0) {
        console.warn(`[AddEmployeeDialog] Department "${deptName}" is not available in master list.`);
      }

      return {
        name: deptName,
        id: deptId || '',
        available: Boolean(deptId),
      };
    });
  }, [departments, locations, formData.locationId]);

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const executeClose = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setFormData(INITIAL_FORM);
    setErrors({});
    setIsSubmitting(false);
    setShowConfirmClose(false);
    onClose();

    // Return focus to trigger button
    setTimeout(() => {
      triggerRef?.current?.focus();
    }, 50);
  }, [onClose, triggerRef]);

  // Request close: ask confirmation if dirty
  const handleRequestClose = React.useCallback(() => {
    if (isSubmittingRef.current) return;

    if (isDirtyRef.current) {
      setShowConfirmClose(true);
    } else {
      executeClose();
    }
  }, [executeClose]);

  // Focus first input on open, trap body scroll, handle Escape key
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmClose(false);
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus first input after short tick
    const timer = setTimeout(() => {
      firstNameInputRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleRequestClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, handleRequestClose]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = cleanPhoneNumber(e.target.value);
    setFormData((prev) => ({ ...prev, phone: cleaned }));
    if (errors.phone && INDIAN_PHONE_REGEX.test(cleaned)) {
      setErrors((prev) => ({ ...prev, phone: undefined }));
    }
  };

  const handlePhoneBlur = () => {
    const phoneErr = getPhoneError(formData.phone, true);
    setErrors((prev) => ({ ...prev, phone: phoneErr }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // First Name: 2–50 chars, letters and spaces only, trimmed
    const trimmedFirst = formData.firstName.trim();
    if (!trimmedFirst) {
      newErrors.firstName = 'First name is required.';
    } else if (trimmedFirst.length < 2 || trimmedFirst.length > 50) {
      newErrors.firstName = 'First name must be between 2 and 50 characters.';
    } else if (!/^[a-zA-Z\s]+$/.test(trimmedFirst)) {
      newErrors.firstName = 'First name must contain letters and spaces only.';
    }

    // Last Name: 1–50 chars, trimmed
    const trimmedLast = formData.lastName.trim();
    if (!trimmedLast) {
      newErrors.lastName = 'Last name is required.';
    } else if (trimmedLast.length > 50) {
      newErrors.lastName = 'Last name must not exceed 50 characters.';
    }

    // Email: valid email format, lowercase
    const trimmedEmail = formData.email.trim().toLowerCase();
    if (!trimmedEmail) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = 'Please enter a valid email address (e.g. name@bsctextiles.com).';
    }

    // Mobile Number: 10 digits, Indian mobile regex
    const phoneErr = getPhoneError(formData.phone, true);
    if (phoneErr) {
      newErrors.phone = phoneErr;
    }

    // Store Location: required
    if (!formData.locationId) {
      newErrors.locationId = 'Please select a store location.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors((prev) => ({ ...prev, general: undefined }));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        locationId: formData.locationId,
        departmentId: formData.departmentId || undefined,
        gender: formData.gender,
        role: formData.role || 'SALES_EMPLOYEE',
        designation: AVAILABLE_ROLES.find((r) => r.value === formData.role)?.label || 'Sales Employee',
      };

      const res = await api.post('/employees', payload, {
        signal: controller.signal,
      });

      const createdEmp = res.data;
      const empFullName = `${payload.firstName} ${payload.lastName}`;

      toast.success(`Employee ${empFullName} added.`);

      // Reset and trigger success callback
      setFormData(INITIAL_FORM);
      setErrors({});
      setIsSubmitting(false);
      onClose();

      onSuccess(createdEmp);

      setTimeout(() => {
        triggerRef?.current?.focus();
      }, 50);
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.message === 'canceled') {
        return;
      }

      setIsSubmitting(false);
      const apiErrorMsg = err?.response?.data?.error || err?.response?.data?.message;

      if (process.env.NODE_ENV === 'development') {
        console.error('Add Employee error:', err);
      }

      if (apiErrorMsg && apiErrorMsg.toLowerCase().includes('email')) {
        setErrors((prev) => ({
          ...prev,
          email: 'This email is already registered.',
        }));
      } else if (
        apiErrorMsg &&
        (apiErrorMsg.toLowerCase().includes('mobile') || apiErrorMsg.toLowerCase().includes('phone'))
      ) {
        setErrors((prev) => ({
          ...prev,
          phone: apiErrorMsg.toLowerCase().includes('already')
            ? 'This mobile number is already registered.'
            : apiErrorMsg,
        }));
      } else if (apiErrorMsg) {
        setErrors((prev) => ({
          ...prev,
          general: apiErrorMsg,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          general: 'Could not add employee. Check the details and try again.',
        }));
      }
    }
  };

  if (!mounted || !isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 max-sm:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-emp-dialog-title"
    >
      {/* Dim Overlay - No blur, no white gap, no gradient */}
      <div
        className="fixed inset-0 bg-slate-900/60 transition-opacity"
        onClick={handleRequestClose}
        aria-hidden="true"
      />

      {/* Dialog Modal Container */}
      <div className="relative z-10 bg-white rounded-xl shadow-2xl border border-slate-200 max-w-[560px] w-full flex flex-col max-h-[90vh] max-sm:h-full max-sm:max-h-full max-sm:rounded-none overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Sticky Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 id="add-emp-dialog-title" className="font-bold text-base text-[#18181B]">
                Add New Employee
              </h3>
              <p className="text-[11px] text-slate-500">
                Enroll staff member into Karnataka workforce
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37]"
            aria-label="Cancel and close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* General API error with Retry */}
          {errors.general && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{errors.general}</span>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:text-red-800 underline shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          )}

          <form id="add-employee-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: First Name & Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="field-first-name" className="block text-[11px] font-bold text-slate-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  ref={firstNameInputRef}
                  id="field-first-name"
                  type="text"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errors.firstName)}
                  aria-describedby={errors.firstName ? 'err-first-name' : undefined}
                  value={formData.firstName}
                  onChange={(e) => {
                    setFormData({ ...formData, firstName: e.target.value });
                    if (errors.firstName) setErrors({ ...errors, firstName: undefined });
                  }}
                  placeholder="e.g. Ramesh"
                  className={`w-full px-3 py-2 border rounded-lg text-xs transition-colors focus:outline-none ${
                    errors.firstName
                      ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                      : 'border-slate-300 focus:border-[#722F37] focus:ring-1 focus:ring-[#722F37]'
                  }`}
                />
                {errors.firstName && (
                  <p id="err-first-name" role="alert" className="text-[11px] text-red-600 mt-1">
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-last-name" className="block text-[11px] font-bold text-slate-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="field-last-name"
                  type="text"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errors.lastName)}
                  aria-describedby={errors.lastName ? 'err-last-name' : undefined}
                  value={formData.lastName}
                  onChange={(e) => {
                    setFormData({ ...formData, lastName: e.target.value });
                    if (errors.lastName) setErrors({ ...errors, lastName: undefined });
                  }}
                  placeholder="e.g. Angadi"
                  className={`w-full px-3 py-2 border rounded-lg text-xs transition-colors focus:outline-none ${
                    errors.lastName
                      ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                      : 'border-slate-300 focus:border-[#722F37] focus:ring-1 focus:ring-[#722F37]'
                  }`}
                />
                {errors.lastName && (
                  <p id="err-last-name" role="alert" className="text-[11px] text-red-600 mt-1">
                    {errors.lastName}
                  </p>
                )}
              </div>
            </div>

            {/* Row 2: Email */}
            <div>
              <label htmlFor="field-email" className="block text-[11px] font-bold text-slate-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="field-email"
                type="email"
                required
                aria-required="true"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'err-email' : undefined}
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value.toLowerCase() });
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                placeholder="Enter email address"
                className={`w-full px-3 py-2 border rounded-lg text-xs transition-colors focus:outline-none ${
                  errors.email
                    ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                    : 'border-slate-300 focus:border-[#722F37] focus:ring-1 focus:ring-[#722F37]'
                }`}
              />
              {errors.email && (
                <p id="err-email" role="alert" className="text-[11px] text-red-600 mt-1">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Row 3: Mobile Number */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="field-mobile-number" className="block text-[11px] font-bold text-slate-700">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <span
                  id="mobile-counter"
                  className="text-[10px] font-medium text-slate-400 select-none"
                  aria-live="polite"
                >
                  {formData.phone.length}/10
                </span>
              </div>
              <div
                className={`flex items-center border rounded-lg overflow-hidden transition-colors focus-within:ring-1 focus-within:ring-[#722F37] ${
                  errors.phone
                    ? 'border-red-400 focus-within:border-red-500 bg-red-50/20'
                    : 'border-slate-300 focus-within:border-[#722F37] bg-white'
                }`}
              >
                <span
                  className="px-2.5 py-2 text-xs font-semibold text-slate-500 bg-slate-100 border-r border-slate-200 select-none shrink-0"
                  aria-label="Country code plus 91"
                >
                  +91
                </span>
                <input
                  id="field-mobile-number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  required
                  aria-required="true"
                  aria-label="Mobile number, 10 digits"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'err-mobile-number' : 'mobile-counter'}
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  onBlur={handlePhoneBlur}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 text-xs bg-transparent focus:outline-none placeholder:text-slate-400"
                />
              </div>
              {errors.phone && (
                <p id="err-mobile-number" role="alert" aria-live="polite" className="text-[11px] text-red-600 mt-1">
                  {errors.phone}
                </p>
              )}
            </div>

            {/* Row 4: Store Location & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="field-store-location" className="block text-[11px] font-bold text-slate-700 mb-1">
                  Store Location <span className="text-red-500">*</span>
                </label>
                <select
                  id="field-store-location"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errors.locationId)}
                  aria-describedby={errors.locationId ? 'err-store-location' : undefined}
                  value={formData.locationId}
                  onChange={(e) => {
                    const newLocationId = e.target.value;
                    let updatedDeptId = formData.departmentId;
                    if (formData.departmentId) {
                      const currentDept = departments.find((d) => d.id === formData.departmentId);
                      if (currentDept) {
                        const remappedDeptId = findDepartmentIdForName(
                          currentDept.name,
                          newLocationId,
                          departments,
                          locations
                        );
                        if (remappedDeptId) {
                          updatedDeptId = remappedDeptId;
                        }
                      }
                    }
                    setFormData({ ...formData, locationId: newLocationId, departmentId: updatedDeptId });
                    if (errors.locationId) setErrors({ ...errors, locationId: undefined });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-xs bg-white transition-colors focus:outline-none ${
                    errors.locationId
                      ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                      : 'border-slate-300 focus:border-[#722F37] focus:ring-1 focus:ring-[#722F37]'
                  }`}
                >
                  <option value="">Select Location</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
                {errors.locationId && (
                  <p id="err-store-location" role="alert" className="text-[11px] text-red-600 mt-1">
                    {errors.locationId}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="field-department" className="block text-[11px] font-bold text-slate-700 mb-1">
                  Department
                </label>
                {departmentsLoading ? (
                  <select
                    id="field-department"
                    disabled
                    aria-label="Department"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-400 cursor-not-allowed"
                  >
                    <option value="">Loading departments…</option>
                  </select>
                ) : departmentsError ? (
                  <div className="flex items-center justify-between text-xs text-red-600 bg-red-50/50 p-2 rounded-lg border border-red-200">
                    <span>Could not load departments</span>
                    {onRetryDepartments && (
                      <button
                        type="button"
                        onClick={onRetryDepartments}
                        className="text-xs font-bold underline hover:text-red-800 focus:outline-none"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ) : departments.length === 0 ? (
                  <select
                    id="field-department"
                    disabled
                    aria-label="Department"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-500 cursor-not-allowed"
                  >
                    <option value="">Select Department (Optional) — No departments available</option>
                  </select>
                ) : (
                  <select
                    id="field-department"
                    aria-label="Department"
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37] focus:ring-1 focus:ring-[#722F37] transition-colors"
                  >
                    <option value="">Select Department (Optional)</option>
                    {departmentOptions.map((opt) => (
                      <option
                        key={opt.name}
                        value={opt.id}
                        disabled={!opt.available}
                      >
                        {opt.name}{!opt.available ? ' (Not available)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Row 5: Gender & Role */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="field-gender" className="block text-[11px] font-bold text-slate-700 mb-1">
                  Gender
                </label>
                <select
                  id="field-gender"
                  value={formData.gender}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      gender: e.target.value as 'male' | 'female',
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37] focus:ring-1 focus:ring-[#722F37] transition-colors"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <div>
                <label htmlFor="field-role" className="block text-[11px] font-bold text-slate-700 mb-1">
                  Role
                </label>
                <select
                  id="field-role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37] focus:ring-1 focus:ring-[#722F37] transition-colors"
                >
                  {AVAILABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={handleRequestClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-employee-form"
            disabled={isSubmitting || !isPhoneValid}
            className="inline-flex items-center justify-center px-4 py-2 text-xs bg-[#722F37] hover:bg-[#5B232A] text-white rounded-lg font-bold shadow-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] focus-visible:ring-offset-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                <span>Creating…</span>
              </>
            ) : (
              <span>Create Employee</span>
            )}
          </button>
        </div>

        {/* Unsaved Changes Confirmation Overlay */}
        {showConfirmClose && (
          <div className="absolute inset-0 z-20 bg-slate-900/40 flex items-center justify-center p-4 animate-in fade-in duration-100">
            <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full space-y-3 text-center border border-slate-200">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Discard unsaved changes?</h4>
              <p className="text-xs text-slate-500">
                You have unsaved employee details entered. If you close now, your changes will be lost.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmClose(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors"
                >
                  Continue Editing
                </button>
                <button
                  type="button"
                  onClick={executeClose}
                  className="px-3.5 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
