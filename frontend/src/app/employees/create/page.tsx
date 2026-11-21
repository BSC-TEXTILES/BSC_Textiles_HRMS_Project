'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  UserPlus, 
  Building2, 
  MapPin, 
  Mail, 
  Phone, 
  Calendar, 
  DollarSign, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ArrowLeft,
  KeyRound,
  Lock
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function CreateEmployeePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    employeeCode: '',
    fullName: '',
    designation: 'Sales Consultant',
    departmentId: '',
    locationId: '',
    phone: '',
    email: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    reportingManager: '',
    employmentType: 'FULL_TIME',
    fixedGrossSalary: '16000',
    basicSalary: '12000',
    dailyRate: '533.33',
    weeklyOff: 'SUNDAY',
    shiftId: '',
    username: '',
    tempPassword: '',
    sendEmailNotice: true,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Fetch reference data: locations, departments, shifts
    const loadRefs = async () => {
      try {
        const [locRes, deptRes, shiftRes] = await Promise.all([
          api.get('/locations/all').catch(() => ({ data: [] })),
          api.get('/departments').catch(() => ({ data: [] })),
          api.get('/shifts').catch(() => ({ data: [] })),
        ]);

        const locList = Array.isArray(locRes.data) ? locRes.data : locRes.data?.locations || [];
        setLocations(locList);
        if (locList.length > 0) {
          setFormData((prev) => ({ ...prev, locationId: prev.locationId || locList[0].id }));
        }

        const deptList = Array.isArray(deptRes.data) ? deptRes.data : deptRes.data?.departments || [];
        setDepartments(deptList);
        if (deptList.length > 0) {
          setFormData((prev) => ({ ...prev, departmentId: prev.departmentId || deptList[0].id }));
        }

        const shiftList = Array.isArray(shiftRes.data) ? shiftRes.data : shiftRes.data?.shifts || [];
        setShifts(shiftList);
        if (shiftList.length > 0) {
          setFormData((prev) => ({ ...prev, shiftId: prev.shiftId || shiftList[0].id }));
        }
      } catch (err) {
        console.warn('Error loading form reference data:', err);
      }
    };
    loadRefs();
  }, []);

  const handleSalaryChange = (grossStr: string) => {
    const gross = Number(grossStr) || 0;
    const basic = Math.round(gross * 0.75);
    const daily = Math.round((gross / 30.0) * 100) / 100;
    setFormData((prev) => ({
      ...prev,
      fixedGrossSalary: grossStr,
      basicSalary: String(basic),
      dailyRate: String(daily),
    }));
  };

  const handleEmployeeCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '');
    setFormData((prev) => ({
      ...prev,
      employeeCode: digits,
      username: prev.username || `emp_${digits}`,
    }));
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formData.employeeCode || formData.employeeCode.trim().length === 0) {
      errors.employeeCode = 'Employee number is mandatory (digits only).';
    }
    if (!formData.fullName || formData.fullName.trim().length === 0) {
      errors.fullName = 'Full Name is required.';
    }
    if (!formData.phone || formData.phone.trim().length < 10) {
      errors.phone = 'Valid 10-digit mobile number is required.';
    }
    if (!formData.locationId) {
      errors.locationId = 'Showroom / Location is required.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please correct errors before submitting.');
      return;
    }

    setLoading(true);
    try {
      const parts = formData.fullName.trim().split(/\s+/);
      const firstName = parts[0] || 'Employee';
      const lastName = parts.slice(1).join(' ') || 'Staff';

      const payload = {
        employeeCode: formData.employeeCode,
        firstName,
        lastName,
        fullName: formData.fullName.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim(),
        designation: formData.designation,
        departmentId: formData.departmentId || undefined,
        locationId: formData.locationId,
        joiningDate: formData.joiningDate,
        reportingManager: formData.reportingManager || undefined,
        employmentType: formData.employmentType,
        fixedGrossSalary: Number(formData.fixedGrossSalary || 0),
        basicSalary: Number(formData.basicSalary || 0),
        dailyRate: Number(formData.dailyRate || 0),
        weeklyOff: formData.weeklyOff,
        shiftId: formData.shiftId || undefined,
        username: formData.username || formData.employeeCode,
        tempPassword: formData.tempPassword || undefined,
      };

      const res = await api.post('/employees', payload);

      toast.success(
        `Employee ${formData.fullName} created successfully! User credentials auto-generated.`
      );
      router.push('/employees');
    } catch (err: any) {
      console.error('Create employee error:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create employee';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
        {/* Header Breadcrumb */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/employees')}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-7 h-7 text-sky-600" />
                Admin Employee Creation
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Register new employee with automatic login credentials, weekly off calendar, and welcome email.
              </p>
            </div>
          </div>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 1. Identity & Official Information */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-sky-500" />
              1. Official Identity & Placement
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Employee Number (Digits Only) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1024"
                  value={formData.employeeCode}
                  onChange={(e) => handleEmployeeCodeChange(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white ${
                    formErrors.employeeCode ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                {formErrors.employeeCode && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.employeeCode}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Anand Kumar"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Designation *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Sales Executive"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Showroom Location (BEL, DAV, SHI, HUB-HQ) *
                </label>
                <select
                  value={formData.locationId}
                  onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                  {locations.length === 0 && (
                    <>
                      <option value="loc_dav">DAVANGERE SHOWROOM (DAV)</option>
                      <option value="loc_bel">BELAGAVI SHOWROOM (BEL)</option>
                      <option value="loc_shi">SHIVAMOGGA SHOWROOM (SHI)</option>
                      <option value="loc_hq">HUBBALLI HQ (HUB-HQ)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Department
                </label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                  {departments.length === 0 && (
                    <>
                      <option value="dept_sales">Sales & Retail</option>
                      <option value="dept_accounts">Finance & Accounts</option>
                      <option value="dept_hr">Human Resources</option>
                      <option value="dept_ops">Store Operations</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Employment Type
                </label>
                <select
                  value={formData.employmentType}
                  onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                >
                  <option value="FULL_TIME">Full Time Permanent</option>
                  <option value="PROBATION">Probationary Period</option>
                  <option value="CONTRACT">Contract Staff</option>
                  <option value="PART_TIME">Part Time</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Date of Joining (DOJ) *
                </label>
                <input
                  type="date"
                  required
                  value={formData.joiningDate}
                  onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reporting Manager
                </label>
                <input
                  type="text"
                  placeholder="e.g. Floor Manager / Store Lead"
                  value={formData.reportingManager}
                  onChange={(e) => setFormData({ ...formData, reportingManager: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Floor Shift *
                </label>
                <select
                  value={formData.shiftId}
                  onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                >
                  <option value="">Select Shift</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || 'Shift'})
                    </option>
                  ))}
                  {shifts.length === 0 && (
                    <>
                      <option value="shift_general">General Store Shift (10:00 AM - 08:30 PM)</option>
                      <option value="shift_morning">Morning Shift (09:00 AM - 06:00 PM)</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* 2. Contact & Auto Login Credentials */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-500" />
              2. Contact & System Login Credentials
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mobile Number (10 Digits) *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Official / Personal Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    placeholder="employee@bsctextiles.in"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Login Username (Auto-Generated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. emp_1024"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Temporary Password (Optional / Random Generated)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Leave blank to auto-generate secure password"
                    value={formData.tempPassword}
                    onChange={(e) => setFormData({ ...formData, tempPassword: e.target.value })}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="sendEmailNotice"
                checked={formData.sendEmailNotice}
                onChange={(e) => setFormData({ ...formData, sendEmailNotice: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded"
              />
              <label htmlFor="sendEmailNotice" className="text-xs text-slate-600 dark:text-slate-400">
                Send welcome email with credentials & activation instructions to the employee's email address
              </label>
            </div>
          </div>

          {/* 3. Salary & Weekly Off Settings */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              3. Salary Details & Weekly Off Calendar
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Fixed Monthly Gross (₹) *
                </label>
                <input
                  type="number"
                  required
                  value={formData.fixedGrossSalary}
                  onChange={(e) => handleSalaryChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-semibold text-emerald-600 dark:text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Basic Pay (75% of Gross) (₹)
                </label>
                <input
                  type="number"
                  value={formData.basicSalary}
                  onChange={(e) => setFormData({ ...formData, basicSalary: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Per-Day Payable Rate (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.dailyRate}
                  onChange={(e) => setFormData({ ...formData, dailyRate: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Weekly Off Day *
                </label>
                <select
                  value={formData.weeklyOff}
                  onChange={(e) => setFormData({ ...formData, weeklyOff: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white"
                >
                  <option value="SUNDAY">Sunday (Standard)</option>
                  <option value="MONDAY">Monday (Showroom Off)</option>
                  <option value="TUESDAY">Tuesday</option>
                  <option value="WEDNESDAY">Wednesday</option>
                  <option value="THURSDAY">Thursday</option>
                  <option value="FRIDAY">Friday</option>
                  <option value="SATURDAY">Saturday</option>
                  <option value="ROTATIONAL">Rotational Weekly Off</option>
                </select>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={() => router.push('/employees')}
              className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-7 py-2.5 rounded-lg bg-[#092B69] hover:bg-[#07204f] text-white text-sm font-semibold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating Record...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Create Employee & Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
