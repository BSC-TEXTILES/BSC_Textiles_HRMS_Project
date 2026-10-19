'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Loader2, AlertCircle, RefreshCw, Plus, Building2, MapPin, Contact, Layers } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useShiftRegistry } from '@/hooks/useShiftRegistry';
import {
  EMPLOYEE_FORM_DEPARTMENTS,
  EMPLOYEE_FORM_DESIGNATIONS,
  INITIAL_LOCATIONS,
  INITIAL_DIVISIONS,
  INITIAL_FLOORS,
  MARITAL_STATUS_OPTIONS,
  CATEGORY_OPTIONS,
  GENDER_OPTIONS,
} from './employeeFormOptions';

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
  const digits = str.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) {
    return digits.slice(2, 12);
  }
  return digits.slice(0, 10);
}

export function getPhoneError(phone: string, isRequired = true): string | undefined {
  const clean = cleanPhoneNumber(phone);
  if (!clean) {
    return isRequired ? 'Enter a valid 10-digit mobile number' : undefined;
  }
  if (!/^[6-9]/.test(clean)) {
    return 'Enter a valid 10-digit mobile number';
  }
  if (clean.length !== 10) {
    return 'Enter a valid 10-digit mobile number';
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
  // Section 1: Personal Details
  employeeName: string;
  employeeCode: string;
  phone: string;
  email: string;
  gender: 'male' | 'female' | 'other' | '';
  maritalStatus: string;
  fatherOrGuardianName: string;
  isHusband: boolean;
  motherName: string;
  dob: string;
  doj: string;
  dol: string;
  qualification: string;
  caste: string;
  religion: string;
  category: string;

  // Section 2: Company Details
  locationId: string;
  division: string;
  floor: string;
  department: string;
  designation: string;
  shiftId: string;

  // Section 3: Contact Details
  currentAddress1: string;
  currentAddress2: string;
  currentState: string;
  bothAddressesSame: boolean;
  permanentAddress1: string;
  permanentAddress2: string;
  permanentState: string;
}

interface FormErrors {
  employeeName?: string;
  employeeCode?: string;
  phone?: string;
  email?: string;
  gender?: string;
  locationId?: string;
  dob?: string;
  doj?: string;
  dol?: string;
  general?: string;
  [key: string]: string | undefined;
}

const INITIAL_FORM: FormState = {
  employeeName: '',
  employeeCode: '',
  phone: '',
  email: '',
  gender: '',
  maritalStatus: '',
  fatherOrGuardianName: '',
  isHusband: false,
  motherName: '',
  dob: '',
  doj: '',
  dol: '',
  qualification: '',
  caste: '',
  religion: '',
  category: '',

  locationId: '',
  division: '',
  floor: '',
  department: '',
  designation: '',
  shiftId: '',

  currentAddress1: '',
  currentAddress2: '',
  currentState: '',
  bothAddressesSame: false,
  permanentAddress1: '',
  permanentAddress2: '',
  permanentState: '',
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

  // Dynamic/session additions for Location, Division, and Floor
  const [customLocations, setCustomLocations] = useState<Array<{ id: string; label: string; name: string; code: string }>>([]);
  const [customDivisions, setCustomDivisions] = useState<string[]>([]);
  const [customFloors, setCustomFloors] = useState<string[]>([]);

  // Nested dialog states
  const [nestedDialog, setNestedDialog] = useState<'location' | 'division' | 'floor' | null>(null);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationCode, setNewLocationCode] = useState('');
  const [nestedLocationError, setNestedLocationError] = useState('');
  const [newDivisionName, setNewDivisionName] = useState('');
  const [nestedDivisionError, setNestedDivisionError] = useState('');
  const [newFloorName, setNewFloorName] = useState('');
  const [nestedFloorError, setNestedFloorError] = useState('');

  // Refs for focusing first invalid element
  const employeeNameInputRef = useRef<HTMLInputElement>(null);
  const employeeCodeInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const genderSelectRef = useRef<HTMLSelectElement>(null);
  const locationSelectRef = useRef<HTMLSelectElement>(null);
  const dobInputRef = useRef<HTMLInputElement>(null);
  const dolInputRef = useRef<HTMLInputElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load standardized shift master via shared hook
  const { allOptions: shiftOptions, rawAllOptions } = useShiftRegistry(formData.locationId || undefined);

  // Real shift options excluding any 'All Shifts' item
  const validShiftOptions = useMemo(() => {
    const list = (shiftOptions || []).filter(
      (s) => s.id !== 'all' && s.id !== 'ALL' && s.name !== 'All Shifts' && s.displayName !== 'All Shifts'
    );
    if (formData.shiftId && !list.some((s) => s.id === formData.shiftId)) {
      const legacy = rawAllOptions?.find((s) => s.id === formData.shiftId);
      if (legacy) {
        list.push(legacy);
      }
    }
    return list;
  }, [shiftOptions, rawAllOptions, formData.shiftId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if form has unsaved edits
  const isDirty = useMemo(() => {
    return Boolean(
      formData.employeeName.trim() ||
      formData.employeeCode.trim() ||
      formData.email.trim() ||
      formData.phone.trim() ||
      formData.gender ||
      formData.maritalStatus ||
      formData.fatherOrGuardianName.trim() ||
      formData.motherName.trim() ||
      formData.dob ||
      formData.doj ||
      formData.dol ||
      formData.qualification.trim() ||
      formData.caste.trim() ||
      formData.religion.trim() ||
      formData.category ||
      formData.locationId ||
      formData.division ||
      formData.floor ||
      formData.department ||
      formData.designation ||
      formData.shiftId ||
      formData.currentAddress1.trim() ||
      formData.currentAddress2.trim() ||
      formData.currentState.trim() ||
      formData.permanentAddress1.trim() ||
      formData.permanentAddress2.trim() ||
      formData.permanentState.trim()
    );
  }, [formData]);

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
    setNestedDialog(null);
    onClose();

    setTimeout(() => {
      triggerRef?.current?.focus();
    }, 50);
  }, [onClose, triggerRef]);

  // Request close: ask confirmation if dirty
  const handleRequestClose = React.useCallback(() => {
    if (isSubmittingRef.current) return;

    if (nestedDialog !== null) {
      setNestedDialog(null);
      return;
    }

    if (isDirtyRef.current) {
      setShowConfirmClose(true);
    } else {
      executeClose();
    }
  }, [nestedDialog, executeClose]);

  // Focus first input on open, trap body scroll, handle Escape key
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmClose(false);
      setNestedDialog(null);
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      employeeNameInputRef.current?.focus();
    }, 60);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (nestedDialog !== null) {
          setNestedDialog(null);
        } else {
          handleRequestClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, nestedDialog, handleRequestClose]);

  // Handle phone changes with clean formatting and counter
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const cleaned = cleanPhoneNumber(rawVal);
    setFormData((prev) => ({ ...prev, phone: cleaned }));
    if (errors.phone && cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
      setErrors((prev) => ({ ...prev, phone: undefined }));
    }
  };

  const handlePhoneBlur = () => {
    const phoneErr = getPhoneError(formData.phone, true);
    setErrors((prev) => ({ ...prev, phone: phoneErr }));
  };

  // Synchronize permanent address when BOTH is checked
  const handleBothCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setFormData((prev) => {
      if (checked) {
        return {
          ...prev,
          bothAddressesSame: true,
          permanentAddress1: prev.currentAddress1,
          permanentAddress2: prev.currentAddress2,
          permanentState: prev.currentState,
        };
      }
      return {
        ...prev,
        bothAddressesSame: false,
      };
    });
  };

  const handleCurrentAddress1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData((prev) => {
      const next = { ...prev, currentAddress1: val };
      if (prev.bothAddressesSame) {
        next.permanentAddress1 = val;
      }
      return next;
    });
  };

  const handleCurrentAddress2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData((prev) => {
      const next = { ...prev, currentAddress2: val };
      if (prev.bothAddressesSame) {
        next.permanentAddress2 = val;
      }
      return next;
    });
  };

  const handleCurrentStateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData((prev) => {
      const next = { ...prev, currentState: val };
      if (prev.bothAddressesSame) {
        next.permanentState = val;
      }
      return next;
    });
  };

  // Compile combined locations list
  const combinedLocationOptions = useMemo(() => {
    const standard = INITIAL_LOCATIONS.map((loc: { label: string; code: string; name: string; hubCode: string }) => {
      const matched = locations.find(
        (l) =>
          l.code === loc.hubCode ||
          l.code === loc.code ||
          (l.name && l.name.toLowerCase().includes(loc.name.toLowerCase()))
      );
      return {
        id: matched?.id || loc.hubCode,
        label: loc.label,
        name: loc.name,
        code: loc.code,
      };
    });

    return [...standard, ...customLocations];
  }, [locations, customLocations]);

  // Combined divisions list
  const combinedDivisionOptions = useMemo(() => {
    return [...INITIAL_DIVISIONS, ...customDivisions];
  }, [customDivisions]);

  // Combined floors list
  const combinedFloorOptions = useMemo(() => {
    return [...INITIAL_FLOORS, ...customFloors];
  }, [customFloors]);

  // Handle Location selection (triggers Add Location dialog if selected)
  const handleLocationSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__ADD_LOCATION__') {
      setNewLocationName('');
      setNewLocationCode('');
      setNestedLocationError('');
      setNestedDialog('location');
      return;
    }
    setFormData((prev) => ({ ...prev, locationId: val }));
    if (errors.locationId) {
      setErrors((prev) => ({ ...prev, locationId: undefined }));
    }
  };

  // Handle Division selection (triggers Add Division dialog if selected)
  const handleDivisionSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__ADD_DIVISION__') {
      setNewDivisionName('');
      setNestedDivisionError('');
      setNestedDialog('division');
      return;
    }
    setFormData((prev) => ({ ...prev, division: val }));
  };

  // Handle Floor selection (triggers Add Floor dialog if selected)
  const handleFloorSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__ADD_FLOOR__') {
      setNewFloorName('');
      setNestedFloorError('');
      setNestedDialog('floor');
      return;
    }
    setFormData((prev) => ({ ...prev, floor: val }));
  };

  // Submit nested Add Location
  const handleAddLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newLocationName.trim();
    const code = newLocationCode.trim();

    if (!name || !code) {
      setNestedLocationError('Location Name and Location Code are required.');
      return;
    }

    const exists = combinedLocationOptions.some(
      (loc) => loc.name.toLowerCase() === name.toLowerCase() || loc.code.toLowerCase() === code.toLowerCase()
    );
    if (exists) {
      setNestedLocationError('A location with this name or code already exists.');
      return;
    }

    const newLocId = `loc_custom_${Date.now()}`;
    const newLoc = {
      id: newLocId,
      label: `${name} (${code})`,
      name,
      code,
    };

    setCustomLocations((prev) => [...prev, newLoc]);
    setFormData((prev) => ({ ...prev, locationId: newLocId }));
    if (errors.locationId) setErrors((prev) => ({ ...prev, locationId: undefined }));
    setNestedDialog(null);
  };

  // Submit nested Add Division
  const handleAddDivisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDivisionName.trim();
    if (!name) {
      setNestedDivisionError('Division Name is required.');
      return;
    }
    const exists = combinedDivisionOptions.some((d) => d.toLowerCase() === name.toLowerCase());
    if (exists) {
      setNestedDivisionError('This division already exists.');
      return;
    }

    setCustomDivisions((prev) => [...prev, name]);
    setFormData((prev) => ({ ...prev, division: name }));
    setNestedDialog(null);
  };

  // Submit nested Add Floor
  const handleAddFloorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFloorName.trim();
    if (!name) {
      setNestedFloorError('Floor Name is required.');
      return;
    }
    const exists = combinedFloorOptions.some((f) => f.toLowerCase() === name.toLowerCase());
    if (exists) {
      setNestedFloorError('This floor already exists.');
      return;
    }

    setCustomFloors((prev) => [...prev, name]);
    setFormData((prev) => ({ ...prev, floor: name }));
    setNestedDialog(null);
  };

  // Comprehensive Form Validation
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // 1. Employee Name: required, trim, not empty
    const trimmedName = formData.employeeName.trim();
    if (!trimmedName) {
      newErrors.employeeName = 'Employee Name is required.';
    } else if (trimmedName.length < 2) {
      newErrors.employeeName = 'Employee Name must be at least 2 characters.';
    }

    // 2. Employee ID (Sales Code): required, trim
    const trimmedCode = formData.employeeCode.trim();
    if (!trimmedCode) {
      newErrors.employeeCode = 'Employee ID (Sales Code) is required.';
    }

    // 3. Mobile Number: required, exactly 10 digits
    const phoneErr = getPhoneError(formData.phone, true);
    if (phoneErr) {
      newErrors.phone = phoneErr;
    }

    // 4. Email: required, standard email format
    const trimmedEmail = formData.email.trim().toLowerCase();
    if (!trimmedEmail) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    // 5. Gender: required
    if (!formData.gender) {
      newErrors.gender = 'Gender is required.';
    }

    // 6. Location: required
    if (!formData.locationId) {
      newErrors.locationId = 'Please select a location.';
    }

    // 7. DOB: cannot be in the future
    if (formData.dob) {
      const dobDate = new Date(formData.dob);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (dobDate > today) {
        newErrors.dob = 'Date of Birth cannot be in the future.';
      }
    }

    // 8. DOL: cannot be before DOJ
    if (formData.doj && formData.dol) {
      const dojDate = new Date(formData.doj);
      const dolDate = new Date(formData.dol);
      if (dolDate < dojDate) {
        newErrors.dol = 'Date of Leaving cannot be before Date of Joining.';
      }
    }

    setErrors(newErrors);

    // Focus the first invalid field
    if (newErrors.employeeName && employeeNameInputRef.current) {
      employeeNameInputRef.current.focus();
    } else if (newErrors.employeeCode && employeeCodeInputRef.current) {
      employeeCodeInputRef.current.focus();
    } else if (newErrors.phone && phoneInputRef.current) {
      phoneInputRef.current.focus();
    } else if (newErrors.email && emailInputRef.current) {
      emailInputRef.current.focus();
    } else if (newErrors.gender && genderSelectRef.current) {
      genderSelectRef.current.focus();
    } else if (newErrors.locationId && locationSelectRef.current) {
      locationSelectRef.current.focus();
    } else if (newErrors.dob && dobInputRef.current) {
      dobInputRef.current.focus();
    } else if (newErrors.dol && dolInputRef.current) {
      dolInputRef.current.focus();
    }

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
      // Split full name safely into firstName and lastName for backend compatibility
      const nameParts = formData.employeeName.trim().split(/\s+/);
      const firstName = nameParts[0] || formData.employeeName.trim();
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0] || '-';

      // Find matched department ID if available in database master
      let matchedDeptId: string | undefined = undefined;
      if (formData.department) {
        const found = departments.find(
          (d) =>
            d.name?.toLowerCase().trim() === formData.department.toLowerCase().trim() ||
            d.code?.toLowerCase().trim() === formData.department.toLowerCase().trim()
        );
        if (found) {
          matchedDeptId = found.id;
        }
      }

      // Map role appropriately based on designation
      let mappedRole = 'SALES_EMPLOYEE';
      const desUpper = (formData.designation || '').toUpperCase();
      if (desUpper.includes('HR')) {
        mappedRole = 'HR_EXECUTIVE';
      } else if (desUpper.includes('FLOOR MANAGER')) {
        mappedRole = 'FLOOR_MANAGER';
      } else if (desUpper.includes('MANAGER')) {
        mappedRole = 'DEPARTMENT_MANAGER';
      }

      // Payload contains only backend-compatible fields to preserve API contract
      const payload: Record<string, any> = {
        employeeCode: formData.employeeCode.trim(),
        firstName,
        lastName,
        email: formData.email.trim().toLowerCase(),
        phone: cleanPhoneNumber(formData.phone),
        gender: formData.gender,
        locationId: formData.locationId,
        departmentId: matchedDeptId || undefined,
        shiftId: formData.shiftId || undefined,
        designation: formData.designation || 'Sales Consultant',
        role: mappedRole,
        joiningDate: formData.doj ? new Date(formData.doj).toISOString() : new Date().toISOString(),
      };

      const res = await api.post('/employees', payload, {
        signal: controller.signal,
      });

      const createdEmp = res.data;
      toast.success(`Employee ${formData.employeeName.trim()} created successfully.`);

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
      const apiDetails: string[] = Array.isArray(err?.response?.data?.details) ? err.response.data.details : [];

      if (err?.response?.status && err.response.status >= 400 && err.response.status < 500) {
        console.warn('[AddEmployeeDialog] Client validation/conflict response:', apiErrorMsg, apiDetails);
      } else if (process.env.NODE_ENV === 'development') {
        console.error('Add Employee server error:', err);
      }

      // Map backend validation errors safely to field errors
      if (apiDetails.length > 0) {
        const fieldErrors: FormErrors = {};
        for (const detail of apiDetails) {
          const lower = detail.toLowerCase();
          const cleanMsg = detail.includes(':') ? detail.split(':').slice(1).join(':').trim() : detail;
          if (lower.includes('email')) {
            fieldErrors.email = cleanMsg || 'Please enter a valid email address.';
          } else if (lower.includes('phone') || lower.includes('mobile')) {
            fieldErrors.phone = cleanMsg || 'Enter a valid 10-digit mobile number.';
          } else if (lower.includes('locationid')) {
            fieldErrors.locationId = 'Please select a valid store location.';
          } else if (lower.includes('employeecode')) {
            fieldErrors.employeeCode = cleanMsg || 'Invalid Employee ID.';
          } else if (lower.includes('firstname') || lower.includes('lastname')) {
            fieldErrors.employeeName = cleanMsg || 'Invalid Employee Name.';
          }
        }
        if (Object.keys(fieldErrors).length > 0) {
          setErrors((prev) => ({ ...prev, ...fieldErrors }));
          return;
        }
      }

      if (apiErrorMsg && apiErrorMsg.toLowerCase().includes('email')) {
        setErrors((prev) => ({
          ...prev,
          email: 'This email is already registered. Please use another email address.',
        }));
      } else if (
        apiErrorMsg &&
        (apiErrorMsg.toLowerCase().includes('mobile') || apiErrorMsg.toLowerCase().includes('phone'))
      ) {
        setErrors((prev) => ({
          ...prev,
          phone: 'This mobile number is already registered. Please enter a different number.',
        }));
      } else if (
        (apiErrorMsg && (apiErrorMsg.toLowerCase().includes('employee number') || apiErrorMsg.toLowerCase().includes('code'))) ||
        err?.response?.data?.field === 'employeeCode'
      ) {
        setErrors((prev) => ({
          ...prev,
          employeeCode: apiErrorMsg || 'Employee ID already exists. Please enter a unique ID.',
        }));
      } else if (apiErrorMsg) {
        setErrors((prev) => ({
          ...prev,
          general: apiErrorMsg,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          general: 'Could not add employee. Please check the details and try again.',
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
      {/* Dim Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/60 transition-opacity"
        onClick={handleRequestClose}
        aria-hidden="true"
      />

      {/* Dialog Modal Container */}
      <div className="relative z-10 bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full flex flex-col max-h-[92vh] max-sm:h-full max-sm:max-h-full max-sm:rounded-none overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Sticky Header */}
        <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1346a1]/10 flex items-center justify-center text-[#1346a1]">
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
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1]"
            aria-label="Cancel and close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs bg-slate-50/30">
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

          <form id="add-employee-form" onSubmit={handleSubmit} className="space-y-6">
            {/* --------------------------------------------------------- */}
            {/* SECTION 1: PERSONAL DETAILS */}
            {/* --------------------------------------------------------- */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-[#1346a1]/10 flex items-center justify-center text-[#1346a1]">
                  <Contact className="w-3.5 h-3.5" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 tracking-tight">Personal Details</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Employee Name * */}
                <div>
                  <label htmlFor="field-employee-name" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Employee Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={employeeNameInputRef}
                    id="field-employee-name"
                    type="text"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(errors.employeeName)}
                    aria-describedby={errors.employeeName ? 'err-employee-name' : undefined}
                    value={formData.employeeName}
                    onChange={(e) => {
                      setFormData({ ...formData, employeeName: e.target.value });
                      if (errors.employeeName) setErrors({ ...errors, employeeName: undefined });
                    }}
                    placeholder="e.g. Ramesh Angadi"
                    className={`w-full px-3 py-2 border rounded-lg text-xs transition-colors focus:outline-none ${
                      errors.employeeName
                        ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] bg-white'
                    }`}
                  />
                  {errors.employeeName && (
                    <p id="err-employee-name" role="alert" className="text-[11px] text-red-600 mt-1">
                      {errors.employeeName}
                    </p>
                  )}
                </div>

                {/* 2. Employee ID (Sales Code) * */}
                <div>
                  <label htmlFor="field-employee-code" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Employee ID (Sales Code) <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={employeeCodeInputRef}
                    id="field-employee-code"
                    type="text"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(errors.employeeCode)}
                    aria-describedby={errors.employeeCode ? 'err-employee-code' : undefined}
                    value={formData.employeeCode}
                    onChange={(e) => {
                      setFormData({ ...formData, employeeCode: e.target.value });
                      if (errors.employeeCode) setErrors({ ...errors, employeeCode: undefined });
                    }}
                    placeholder="e.g. 1001"
                    className={`w-full px-3 py-2 border rounded-lg text-xs transition-colors focus:outline-none ${
                      errors.employeeCode
                        ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] bg-white'
                    }`}
                  />
                  {errors.employeeCode && (
                    <p id="err-employee-code" role="alert" className="text-[11px] text-red-600 mt-1">
                      {errors.employeeCode}
                    </p>
                  )}
                </div>

                {/* 3. Mobile Number * */}
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
                    className={`flex items-center border rounded-lg overflow-hidden transition-colors focus-within:ring-1 focus-within:ring-[#1346a1] ${
                      errors.phone
                        ? 'border-red-400 focus-within:border-red-500 bg-red-50/20'
                        : 'border-slate-300 focus-within:border-[#1346a1] bg-white'
                    }`}
                  >
                    <span
                      className="px-2.5 py-2 text-xs font-semibold text-slate-500 bg-slate-100 border-r border-slate-200 select-none shrink-0"
                      aria-label="Country code plus 91"
                    >
                      +91
                    </span>
                    <input
                      ref={phoneInputRef}
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

                {/* 4. Email * */}
                <div>
                  <label htmlFor="field-email" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={emailInputRef}
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
                        : 'border-slate-300 focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] bg-white'
                    }`}
                  />
                  {errors.email && (
                    <p id="err-email" role="alert" className="text-[11px] text-red-600 mt-1">
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* 5. Gender * */}
                <div>
                  <label htmlFor="field-gender" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    ref={genderSelectRef}
                    id="field-gender"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(errors.gender)}
                    aria-describedby={errors.gender ? 'err-gender' : undefined}
                    value={formData.gender}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        gender: e.target.value as 'male' | 'female' | 'other',
                      });
                      if (errors.gender) setErrors({ ...errors, gender: undefined });
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none transition-colors ${
                      errors.gender
                        ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]'
                    }`}
                  >
                    <option value="">Select Gender</option>
                    {GENDER_OPTIONS.map((g: { value: string; label: string }) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                  {errors.gender && (
                    <p id="err-gender" role="alert" className="text-[11px] text-red-600 mt-1">
                      {errors.gender}
                    </p>
                  )}
                </div>

                {/* 6. Marital Status */}
                <div>
                  <label htmlFor="field-marital-status" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Marital Status
                  </label>
                  <select
                    id="field-marital-status"
                    value={formData.maritalStatus}
                    onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  >
                    <option value="">Select Marital Status</option>
                    {MARITAL_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 7. Father / Guardian Name + Is Husband Checkbox */}
                <div>
                  <label htmlFor="field-father-name" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Father / Guardian Name
                  </label>
                  <input
                    id="field-father-name"
                    type="text"
                    value={formData.fatherOrGuardianName}
                    onChange={(e) => setFormData({ ...formData, fatherOrGuardianName: e.target.value })}
                    placeholder="Enter Father or Guardian Name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  />
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      id="checkbox-is-husband"
                      type="checkbox"
                      checked={formData.isHusband}
                      onChange={(e) => setFormData({ ...formData, isHusband: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-[#1346a1] focus:ring-[#1346a1]"
                    />
                    <label htmlFor="checkbox-is-husband" className="text-[11px] font-medium text-slate-600 select-none cursor-pointer">
                      Is Husband
                    </label>
                  </div>
                </div>

                {/* 8. Mother Name */}
                <div>
                  <label htmlFor="field-mother-name" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Mother Name
                  </label>
                  <input
                    id="field-mother-name"
                    type="text"
                    value={formData.motherName}
                    onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                    placeholder="Enter Mother Name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  />
                </div>

                {/* 9. DOB */}
                <div>
                  <label htmlFor="field-dob" className="block text-[11px] font-bold text-slate-700 mb-1">
                    DOB
                  </label>
                  <input
                    ref={dobInputRef}
                    id="field-dob"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    aria-invalid={Boolean(errors.dob)}
                    aria-describedby={errors.dob ? 'err-dob' : undefined}
                    value={formData.dob}
                    onChange={(e) => {
                      setFormData({ ...formData, dob: e.target.value });
                      if (errors.dob) setErrors({ ...errors, dob: undefined });
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none transition-colors ${
                      errors.dob
                        ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]'
                    }`}
                  />
                  {errors.dob && (
                    <p id="err-dob" role="alert" className="text-[11px] text-red-600 mt-1">
                      {errors.dob}
                    </p>
                  )}
                </div>

                {/* 10. DOJ */}
                <div>
                  <label htmlFor="field-doj" className="block text-[11px] font-bold text-slate-700 mb-1">
                    DOJ
                  </label>
                  <input
                    id="field-doj"
                    type="date"
                    value={formData.doj}
                    onChange={(e) => {
                      setFormData({ ...formData, doj: e.target.value });
                      if (errors.dol && formData.dol && e.target.value && new Date(formData.dol) >= new Date(e.target.value)) {
                        setErrors({ ...errors, dol: undefined });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  />
                </div>

                {/* 11. DOL */}
                <div>
                  <label htmlFor="field-dol" className="block text-[11px] font-bold text-slate-700 mb-1">
                    DOL
                  </label>
                  <input
                    ref={dolInputRef}
                    id="field-dol"
                    type="date"
                    aria-invalid={Boolean(errors.dol)}
                    aria-describedby={errors.dol ? 'err-dol' : undefined}
                    value={formData.dol}
                    onChange={(e) => {
                      setFormData({ ...formData, dol: e.target.value });
                      if (errors.dol) setErrors({ ...errors, dol: undefined });
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none transition-colors ${
                      errors.dol
                        ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]'
                    }`}
                  />
                  {errors.dol && (
                    <p id="err-dol" role="alert" className="text-[11px] text-red-600 mt-1">
                      {errors.dol}
                    </p>
                  )}
                </div>

                {/* 12. Qualification */}
                <div>
                  <label htmlFor="field-qualification" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Qualification
                  </label>
                  <input
                    id="field-qualification"
                    type="text"
                    value={formData.qualification}
                    onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                    placeholder="e.g. B.Com, High School"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  />
                </div>

                {/* 13. Caste */}
                <div>
                  <label htmlFor="field-caste" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Caste
                  </label>
                  <input
                    id="field-caste"
                    type="text"
                    value={formData.caste}
                    onChange={(e) => setFormData({ ...formData, caste: e.target.value })}
                    placeholder="Enter Caste"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  />
                </div>

                {/* 14. Religion */}
                <div>
                  <label htmlFor="field-religion" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Religion
                  </label>
                  <input
                    id="field-religion"
                    type="text"
                    value={formData.religion}
                    onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                    placeholder="Enter Religion"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  />
                </div>

                {/* 15. Category */}
                <div>
                  <label htmlFor="field-category" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    id="field-category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  >
                    <option value="">Select Category</option>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* --------------------------------------------------------- */}
            {/* SECTION 2: COMPANY DETAILS */}
            {/* --------------------------------------------------------- */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-[#1346a1]/10 flex items-center justify-center text-[#1346a1]">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 tracking-tight">Company Details</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Location */}
                <div>
                  <label htmlFor="field-location" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <select
                    ref={locationSelectRef}
                    id="field-location"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(errors.locationId)}
                    aria-describedby={errors.locationId ? 'err-location' : undefined}
                    value={formData.locationId}
                    onChange={handleLocationSelect}
                    className={`w-full px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none transition-colors ${
                      errors.locationId
                        ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]'
                    }`}
                  >
                    <option value="">Select Location</option>
                    {combinedLocationOptions.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label}
                      </option>
                    ))}
                    <option value="__ADD_LOCATION__" className="font-bold text-[#1346a1]">
                      + Add Location
                    </option>
                  </select>
                  {errors.locationId && (
                    <p id="err-location" role="alert" className="text-[11px] text-red-600 mt-1">
                      {errors.locationId}
                    </p>
                  )}
                </div>

                {/* 2. Division */}
                <div>
                  <label htmlFor="field-division" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Division
                  </label>
                  <select
                    id="field-division"
                    value={formData.division}
                    onChange={handleDivisionSelect}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  >
                    <option value="">Select Division</option>
                    {combinedDivisionOptions.map((div) => (
                      <option key={div} value={div}>
                        {div}
                      </option>
                    ))}
                    <option value="__ADD_DIVISION__" className="font-bold text-[#1346a1]">
                      + Add Division
                    </option>
                  </select>
                </div>

                {/* 3. Floor */}
                <div>
                  <label htmlFor="field-floor" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Floor
                  </label>
                  <select
                    id="field-floor"
                    value={formData.floor}
                    onChange={handleFloorSelect}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  >
                    <option value="">Select Floor</option>
                    {combinedFloorOptions.map((flr) => (
                      <option key={flr} value={flr}>
                        {flr}
                      </option>
                    ))}
                    <option value="__ADD_FLOOR__" className="font-bold text-[#1346a1]">
                      + Add Floor
                    </option>
                  </select>
                </div>

                {/* 4. Department */}
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
                  ) : (
                    <select
                      id="field-department"
                      aria-label="Department"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                    >
                      <option value="">Select Department</option>
                      {EMPLOYEE_FORM_DEPARTMENTS.map((deptName, idx) => (
                        <option key={`dept-${idx}-${deptName}`} value={deptName}>
                          {deptName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 5. Designation */}
                <div>
                  <label htmlFor="field-designation" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Designation
                  </label>
                  <select
                    id="field-designation"
                    aria-label="Designation"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  >
                    <option value="">Select Designation</option>
                    {EMPLOYEE_FORM_DESIGNATIONS.map((desig, idx) => (
                      <option key={`desig-${idx}-${desig}`} value={desig}>
                        {desig}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Shift */}
                <div>
                  <label htmlFor="field-shift" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Shift
                  </label>
                  <select
                    id="field-shift"
                    aria-label="Shift"
                    value={formData.shiftId}
                    onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                  >
                    <option value="">Select Shift</option>
                    {validShiftOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName || s.name} {s.timeRange ? `(${s.timeRange})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* --------------------------------------------------------- */}
            {/* SECTION 3: CONTACT DETAILS */}
            {/* --------------------------------------------------------- */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-[#1346a1]/10 flex items-center justify-center text-[#1346a1]">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 tracking-tight">Contact Details</h4>
              </div>

              {/* Current Address Group */}
              <div className="space-y-3">
                <h5 className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">Current Address</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="field-current-address-1" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Current Address 1
                    </label>
                    <input
                      id="field-current-address-1"
                      type="text"
                      value={formData.currentAddress1}
                      onChange={handleCurrentAddress1Change}
                      placeholder="House / Flat / Street address"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                    />
                  </div>

                  <div>
                    <label htmlFor="field-current-address-2" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Current Address 2
                    </label>
                    <input
                      id="field-current-address-2"
                      type="text"
                      value={formData.currentAddress2}
                      onChange={handleCurrentAddress2Change}
                      placeholder="Landmark, Area, Colony"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                    />
                  </div>

                  <div>
                    <label htmlFor="field-current-state" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Current State
                    </label>
                    <input
                      id="field-current-state"
                      type="text"
                      value={formData.currentState}
                      onChange={handleCurrentStateChange}
                      placeholder="e.g. Karnataka"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1] transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Divider & BOTH Checkbox */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <h5 className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">Permanent Address</h5>
                <div className="flex items-center gap-2">
                  <input
                    id="checkbox-both"
                    type="checkbox"
                    checked={formData.bothAddressesSame}
                    onChange={handleBothCheckboxChange}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1346a1] focus:ring-[#1346a1]"
                  />
                  <label htmlFor="checkbox-both" className="text-xs font-bold text-[#1346a1] select-none cursor-pointer">
                    BOTH
                  </label>
                </div>
              </div>

              {/* Permanent Address Group */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="field-permanent-address-1" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Permanent Address 1
                  </label>
                  <input
                    id="field-permanent-address-1"
                    type="text"
                    readOnly={formData.bothAddressesSame}
                    disabled={formData.bothAddressesSame}
                    value={formData.permanentAddress1}
                    onChange={(e) => setFormData({ ...formData, permanentAddress1: e.target.value })}
                    placeholder="House / Flat / Street address"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-xs transition-colors ${
                      formData.bothAddressesSame
                        ? 'bg-slate-100/70 text-slate-500 cursor-not-allowed border-slate-200'
                        : 'bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]'
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="field-permanent-address-2" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Permanent Address 2
                  </label>
                  <input
                    id="field-permanent-address-2"
                    type="text"
                    readOnly={formData.bothAddressesSame}
                    disabled={formData.bothAddressesSame}
                    value={formData.permanentAddress2}
                    onChange={(e) => setFormData({ ...formData, permanentAddress2: e.target.value })}
                    placeholder="Landmark, Area, Colony"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-xs transition-colors ${
                      formData.bothAddressesSame
                        ? 'bg-slate-100/70 text-slate-500 cursor-not-allowed border-slate-200'
                        : 'bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]'
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="field-permanent-state" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Permanent State
                  </label>
                  <input
                    id="field-permanent-state"
                    type="text"
                    readOnly={formData.bothAddressesSame}
                    disabled={formData.bothAddressesSame}
                    value={formData.permanentState}
                    onChange={(e) => setFormData({ ...formData, permanentState: e.target.value })}
                    placeholder="e.g. Karnataka"
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-xs transition-colors ${
                      formData.bothAddressesSame
                        ? 'bg-slate-100/70 text-slate-500 cursor-not-allowed border-slate-200'
                        : 'bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]'
                    }`}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0 bg-white">
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
            disabled={isSubmitting}
            className="inline-flex items-center justify-center px-4 py-2 text-xs bg-[#1346a1] hover:bg-[#0e3882] text-white rounded-lg font-bold shadow-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-1"
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

        {/* Nested Dialog: Add Location */}
        {nestedDialog === 'location' && (
          <div className="absolute inset-0 z-30 bg-slate-900/40 flex items-center justify-center p-4 animate-in fade-in duration-100">
            <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full space-y-4 border border-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="font-bold text-sm text-slate-900">Add Location</h4>
                <button
                  type="button"
                  onClick={() => setNestedDialog(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {nestedLocationError && (
                <p role="alert" className="text-[11px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                  {nestedLocationError}
                </p>
              )}

              <form onSubmit={handleAddLocationSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Location Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="e.g. Hubballi Store"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Location Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newLocationCode}
                    onChange={(e) => setNewLocationCode(e.target.value)}
                    placeholder="e.g. BSC-HBX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setNestedDialog(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs bg-[#1346a1] hover:bg-[#0e3882] text-white rounded-lg font-bold transition-colors"
                  >
                    Add Location
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Nested Dialog: Add Division */}
        {nestedDialog === 'division' && (
          <div className="absolute inset-0 z-30 bg-slate-900/40 flex items-center justify-center p-4 animate-in fade-in duration-100">
            <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full space-y-4 border border-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="font-bold text-sm text-slate-900">Add Division</h4>
                <button
                  type="button"
                  onClick={() => setNestedDialog(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {nestedDivisionError && (
                <p role="alert" className="text-[11px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                  {nestedDivisionError}
                </p>
              )}

              <form onSubmit={handleAddDivisionSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Division Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newDivisionName}
                    onChange={(e) => setNewDivisionName(e.target.value)}
                    placeholder="e.g. Footwear Division"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setNestedDialog(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs bg-[#1346a1] hover:bg-[#0e3882] text-white rounded-lg font-bold transition-colors"
                  >
                    Add Division
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Nested Dialog: Add Floor */}
        {nestedDialog === 'floor' && (
          <div className="absolute inset-0 z-30 bg-slate-900/40 flex items-center justify-center p-4 animate-in fade-in duration-100">
            <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full space-y-4 border border-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="font-bold text-sm text-slate-900">Add Floor</h4>
                <button
                  type="button"
                  onClick={() => setNestedDialog(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {nestedFloorError && (
                <p role="alert" className="text-[11px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                  {nestedFloorError}
                </p>
              )}

              <form onSubmit={handleAddFloorSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Floor Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newFloorName}
                    onChange={(e) => setNewFloorName(e.target.value)}
                    placeholder="e.g. Mezzanine Floor"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1346a1] focus:ring-1 focus:ring-[#1346a1]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setNestedDialog(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs bg-[#1346a1] hover:bg-[#0e3882] text-white rounded-lg font-bold transition-colors"
                  >
                    Add Floor
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Unsaved Changes Confirmation Overlay */}
        {showConfirmClose && (
          <div className="absolute inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4 animate-in fade-in duration-100">
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
