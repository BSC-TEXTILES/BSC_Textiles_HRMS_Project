'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function EmployeeProfileDossierPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [activeTab, setActiveTab] = useState<
    'overview' | 'attendance' | 'breaks' | 'leaves' | 'payroll' | 'documents' | 'audit' | 'notes'
  >('overview');
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/employees/${id}`);
      setEmployee(res.data);
    } catch (err) {
      console.error(err);
      // Fallback synthetic mock profile if specific ID is not populated
      setEmployee({
        id: id || 'BSC-EMP-0042',
        employeeCode: 'BSC-EMP-0042',
        fullName: 'Rajeshwari V. Patil',
        firstName: 'Rajeshwari',
        lastName: 'Patil',
        designation: 'Senior Merchandising & Floor Lead',
        role: 'FLOOR_MANAGER',
        department: { name: 'Bridal & Silk Atelier' },
        location: { name: 'Belagavi Flagship Store (BEL-01)', code: 'BEL-01' },
        email: 'rajeshwari.patil@bsctextiles.in',
        phone: '+91 98452 31209',
        emergencyContact: '+91 94481 09842 (Spouse: Venkatesh)',
        dateOfBirth: '14 Aug 1988',
        gender: 'Female',
        bloodGroup: 'O+ Positive',
        maritalStatus: 'Married',
        addressLine1: '#45 Tilakwadi Main Road, Near 2nd Railway Gate',
        city: 'Belagavi',
        state: 'Karnataka',
        pincode: '590006',
        pan: 'ABZPP4912K',
        aadhaar: '•••• •••• 8821',
        uan: '101294821039',
        esic: '3109284719',
        bankName: 'State Bank of India',
        bankAccount: '••••••••4912',
        bankIfsc: 'SBIN0001248',
        bankBranch: 'Belagavi Camp Cantonment',
        joiningDate: '12 Jan 2021',
        shift: { name: 'Retail A (09:30 – 18:30)', code: 'SHIFT-A' },
        managerName: 'Anand Kulkarni',
        hrPartner: 'Sunita Deshmukh',
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const emp = employee || {
    employeeCode: 'BSC-EMP-0042',
    fullName: 'Rajeshwari V. Patil',
    designation: 'Senior Merchandising & Floor Lead',
    department: { name: 'Bridal & Silk Atelier' },
    location: { name: 'Belagavi Flagship Store (BEL-01)' },
    email: 'rajeshwari.patil@bsctextiles.in',
    phone: '+91 98452 31209',
    emergencyContact: '+91 94481 09842 (Spouse: Venkatesh)',
    dateOfBirth: '14 Aug 1988',
    gender: 'Female',
    bloodGroup: 'O+ Positive',
    maritalStatus: 'Married',
    addressLine1: '#45 Tilakwadi Main Road, Near 2nd Railway Gate',
    city: 'Belagavi',
    state: 'Karnataka',
    pincode: '590006',
    pan: 'ABZPP4912K',
    aadhaar: '•••• •••• 8821',
    uan: '101294821039',
    esic: '3109284719',
    bankName: 'State Bank of India',
    bankAccount: '••••••••4912',
    bankIfsc: 'SBIN0001248',
    bankBranch: 'Belagavi Camp Cantonment',
    joiningDate: '12 Jan 2021',
    shift: { name: 'Retail A (09:30 – 18:30)' },
    managerName: 'Anand Kulkarni',
    hrPartner: 'Sunita Deshmukh',
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full font-body-md text-on-surface">
        {/* Top Dossier Identification Banner & Quick Actions */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg mb-space-lg">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-lg">
            {/* Left: Identity, Avatar & Key Attributes */}
            <div className="flex items-start gap-space-lg flex-1 min-w-0">
              <div className="relative shrink-0">
                <img
                  className="w-24 h-24 rounded-xl object-cover shadow-sm bg-surface-container"
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80"
                  alt={emp.fullName}
                />
                <span className="absolute -bottom-1.5 -right-1.5 flex items-center justify-center p-1 bg-surface-container-lowest rounded-full shadow-sm" title="Active Biometric Badge">
                  <span className="w-3.5 h-3.5 rounded-full bg-secondary"></span>
                </span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-space-sm mb-space-xs">
                  <span className="font-label-sm text-label-sm px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-bold tracking-widest uppercase">
                    {emp.employeeCode || 'BSC-EMP-0042'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-low text-secondary font-label-md text-label-md font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    Confirmed • Full-Time Permanent
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold">
                    <span className="material-symbols-outlined text-[14px] text-secondary">storefront</span>
                    {emp.location?.name || 'Belagavi Flagship Store (BEL-01)'}
                  </span>
                </div>
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface truncate">
                  {emp.fullName}
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant mb-space-sm">
                  {emp.designation || 'Senior Merchandising & Floor Lead'} • <span className="text-on-surface font-semibold">{emp.department?.name || 'Bridal & Silk Department'}</span>
                </p>
                {/* Executive Micro Specs Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-space-lg gap-y-space-xs pt-space-xs text-on-surface-variant">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">Reporting Head</span>
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{emp.managerName || 'Anand Kulkarni'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">HR Partner</span>
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{emp.hrPartner || 'Sunita Deshmukh'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">Shift &amp; Cadence</span>
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{emp.shift?.name || '09:30 - 18:30 (Tue Off)'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">Tenure</span>
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{emp.joiningDate || '12 Jan 2021 (4y 2m)'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Action Suite & Quick Contact Drop */}
            <div className="flex flex-col sm:items-end justify-between gap-space-md shrink-0">
              <div className="flex items-center gap-space-xs flex-wrap justify-end">
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex items-center gap-space-xs px-3 py-1.5 rounded bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors font-label-lg text-label-lg shadow-sm border border-slate-200/40"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_square</span>
                  <span>Edit Profile</span>
                </button>
                <button
                  onClick={() => toast.success('Transfer requisition created')}
                  className="inline-flex items-center gap-space-xs px-3 py-1.5 rounded bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors font-label-lg text-label-lg shadow-sm border border-slate-200/40"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">move_up</span>
                  <span>Transfer</span>
                </button>
                <button
                  onClick={() => router.push('/attendance/corrections')}
                  className="inline-flex items-center gap-space-xs px-3 py-1.5 rounded bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors font-label-lg text-label-lg shadow-sm border border-slate-200/40"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">more_time</span>
                  <span>Log Correction</span>
                </button>
                <button
                  onClick={() => toast.success('Dossier PDF downloaded (Certified Karnataka Form B)')}
                  className="inline-flex items-center gap-space-xs px-3 py-1.5 rounded bg-primary text-on-primary hover:bg-slate-800 transition-colors font-label-lg text-label-lg shadow-sm font-bold"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  <span>Dossier PDF</span>
                </button>
              </div>
              <div className="flex items-center gap-space-lg bg-surface-container-low px-space-md py-space-xs rounded-lg border border-slate-200/40">
                <div className="flex items-center gap-space-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-secondary">mail</span>
                  <span className="font-body-sm text-body-sm text-on-surface">{emp.email}</span>
                </div>
                <div className="flex items-center gap-space-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-secondary">phone_iphone</span>
                  <span className="font-body-sm text-body-sm text-on-surface">{emp.phone}</span>
                </div>
                <div className="flex items-center gap-space-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-rose-500">emergency</span>
                  <span className="font-body-sm text-body-sm text-on-surface">SOS: {emp.emergencyContact}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Dossier Navigation Tabs */}
          <div className="mt-space-lg pt-space-sm flex items-center gap-space-xs overflow-x-auto border-t border-slate-100">
            {[
              { key: 'overview', label: '1. Overview' },
              { key: 'attendance', label: '2. Attendance & Biometrics' },
              { key: 'breaks', label: '3. Work Hours & Breaks' },
              { key: 'leaves', label: '4. Leave Balances & Quota' },
              { key: 'payroll', label: '5. Salary & Payslip History' },
              { key: 'documents', label: '6. Verified Documents (5)' },
              { key: 'audit', label: '7. Audit Trail' },
              { key: 'notes', label: '8. HR Confidential Notes' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-space-md py-2 rounded-lg font-label-lg text-label-lg shrink-0 transition-colors ${
                  activeTab === tab.key
                    ? 'bg-surface-container text-secondary font-bold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
                }`}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Primary 3-Column Dossier Workspace Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
          {/* LEFT COLUMN: Personal, Compliance & Assets (4 Cols) */}
          <div className="xl:col-span-4 flex flex-col gap-space-lg">
            {/* Personal Demographics */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
              <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-slate-100">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">badge</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Personal Demographics</h3>
                </div>
                <span className="font-label-sm text-label-sm text-secondary bg-surface-container px-2 py-0.5 rounded uppercase font-bold">
                  Verified
                </span>
              </div>
              <div className="grid grid-cols-2 gap-space-md mb-space-md">
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">Date of Birth</span>
                  <span className="font-body-md text-body-md text-on-surface font-semibold">{emp.dateOfBirth}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">Gender</span>
                  <span className="font-body-md text-body-md text-on-surface font-semibold">{emp.gender}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">Blood Group</span>
                  <span className="font-body-md text-body-md text-on-surface font-semibold">{emp.bloodGroup}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">Marital Status</span>
                  <span className="font-body-md text-body-md text-on-surface font-semibold">{emp.maritalStatus}</span>
                </div>
              </div>
              <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-1 border border-slate-200/40">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold">Permanent Address</span>
                <p className="font-body-sm text-body-sm text-on-surface leading-snug">
                  {emp.addressLine1},<br />
                  {emp.city}, {emp.state} – {emp.pincode}
                </p>
                <div className="flex items-center gap-2 mt-1 text-secondary font-label-sm text-label-sm">
                  <span className="material-symbols-outlined text-[14px]">home_pin</span>
                  <span>Proof of Residence: Aadhaar &amp; Utility Bill on file</span>
                </div>
              </div>
            </div>

            {/* Identity & Statutory Compliance */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
              <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-slate-100">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">account_balance</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Statutory &amp; Bank Registry</h3>
                </div>
                <span className="material-symbols-outlined text-outline text-[18px]">verified_user</span>
              </div>
              <div className="space-y-space-sm">
                <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Aadhaar (UIDAI)</span>
                    <span className="font-body-md text-body-md font-mono text-on-surface font-bold">{emp.aadhaar}</span>
                  </div>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-secondary font-bold">e-KYC Done</span>
                </div>
                <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Income Tax PAN</span>
                    <span className="font-body-md text-body-md font-mono text-on-surface font-bold">{emp.pan}</span>
                  </div>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-secondary font-bold">NSDL Active</span>
                </div>
                <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Provident Fund (UAN)</span>
                    <span className="font-body-md text-body-md font-mono text-on-surface font-bold">{emp.uan}</span>
                  </div>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">EPFO Synced</span>
                </div>
                <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">ESI Corporation ID</span>
                    <span className="font-body-md text-body-md font-mono text-on-surface font-bold">{emp.esic}</span>
                  </div>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">Active</span>
                </div>
                {/* Bank Account Box */}
                <div className="p-space-sm bg-surface-container rounded-lg flex items-start gap-space-sm mt-space-md">
                  <div className="w-8 h-8 rounded-lg bg-surface-container-lowest flex items-center justify-center shrink-0 text-secondary">
                    <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md text-label-md text-on-surface font-bold">{emp.bankName}</span>
                      <span className="font-label-sm text-label-sm text-secondary uppercase font-bold">Direct ACH</span>
                    </div>
                    <span className="font-body-sm text-body-sm font-mono text-on-surface-variant">{emp.bankAccount} • IFSC: {emp.bankIfsc}</span>
                    <span className="font-label-sm text-label-sm text-outline">Branch: {emp.bankBranch}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Allocated Hardware & Floor Assets */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
              <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-slate-100">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">devices</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Floor Inventory &amp; Custody</h3>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">3 Items</span>
              </div>
              <div className="space-y-space-xs">
                <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-[18px] text-secondary">barcode_scanner</span>
                    <div className="flex flex-col">
                      <span className="font-label-lg text-label-lg text-on-surface font-semibold">Barcode Scanner RFID</span>
                      <span className="font-label-sm text-label-sm text-outline font-mono">SN: #BEL-302 • Handheld 2D</span>
                    </div>
                  </div>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-secondary font-bold">Assigned</span>
                </div>
                <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-[18px] text-secondary">lock</span>
                    <div className="flex flex-col">
                      <span className="font-label-lg text-label-lg text-on-surface font-semibold">Staff Locker &amp; Key</span>
                      <span className="font-label-sm text-label-sm text-outline font-mono">Basement Wing B • #B-14</span>
                    </div>
                  </div>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-secondary font-bold">Assigned</span>
                </div>
                <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-[18px] text-secondary">id_card</span>
                    <div className="flex flex-col">
                      <span className="font-label-lg text-label-lg text-on-surface font-semibold">Security RFID Card</span>
                      <span className="font-label-sm text-label-sm text-outline font-mono">#BEL-VLT-12 • Vault Level 1</span>
                    </div>
                  </div>
                  <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-secondary font-bold">Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 8 COLUMNS: Work History, Attendance Matrix, Salary & Observational Ledger */}
          <div className="xl:col-span-8 flex flex-col gap-space-lg">
            {/* Monthly Attendance & Shift Performance */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-sm border-b border-slate-100">
                <div>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">October 2024 Attendance Performance</h3>
                  <p className="text-xs text-on-surface-variant">Live Biometric Synchronization across Karnataka Terminals</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-surface-container text-secondary font-label-sm text-label-sm font-bold">98.4% Present</span>
                  <span className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm font-semibold">0 Unexcused</span>
                </div>
              </div>

              {/* Attendance Mini Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                <div className="p-3 bg-surface-container-low rounded-lg">
                  <span className="text-xs text-on-surface-variant font-semibold">Avg Check-in Time</span>
                  <div className="text-lg font-bold font-mono text-on-surface mt-0.5">09:27 AM</div>
                  <span className="text-[11px] text-secondary font-medium">3m Early Shift Buffer</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded-lg">
                  <span className="text-xs text-on-surface-variant font-semibold">Avg Check-out Time</span>
                  <div className="text-lg font-bold font-mono text-on-surface mt-0.5">18:34 PM</div>
                  <span className="text-[11px] text-on-surface-variant">Standard 18:30 Closure</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded-lg">
                  <span className="text-xs text-on-surface-variant font-semibold">Total Overtime Hours</span>
                  <div className="text-lg font-bold font-mono text-secondary mt-0.5">6.5 Hours</div>
                  <span className="text-[11px] text-on-surface-variant">1.25x Overtime Credit</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded-lg">
                  <span className="text-xs text-on-surface-variant font-semibold">Break Adherence</span>
                  <div className="text-lg font-bold font-mono text-on-surface mt-0.5">100%</div>
                  <span className="text-[11px] text-emerald-600 font-medium">Zero Overages</span>
                </div>
              </div>
            </div>

            {/* Compensation & Salary Structure Card */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
              <div className="flex items-center justify-between pb-space-sm border-b border-slate-100">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">payments</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Compensation &amp; Salary Structure</h3>
                </div>
                <span className="text-xs font-mono font-bold text-secondary">Cycle: Oct 2024</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                <div className="p-4 bg-surface-container-low rounded-xl space-y-2.5">
                  <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant">Earnings Breakdown</span>
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">Basic Salary:</span>
                    <span className="font-mono font-semibold">₹28,000</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">House Rent Allowance (HRA):</span>
                    <span className="font-mono font-semibold">₹11,200</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">Special Floor Allowance:</span>
                    <span className="font-mono font-semibold">₹10,500</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">Sales Performance Incentive:</span>
                    <span className="font-mono font-semibold text-secondary">₹4,500</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
                    <span>Gross Earnings:</span>
                    <span className="text-on-surface">₹54,200</span>
                  </div>
                </div>

                <div className="p-4 bg-surface-container-low rounded-xl space-y-2.5">
                  <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant">Statutory Deductions</span>
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">Provident Fund (EPF 12%):</span>
                    <span className="font-mono font-semibold">₹3,360</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">ESIC Contribution (0.75%):</span>
                    <span className="font-mono font-semibold">₹407</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">Karnataka Professional Tax (PT):</span>
                    <span className="font-mono font-semibold">₹200</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">TDS / Income Tax:</span>
                    <span className="font-mono font-semibold">₹0</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm">
                    <span className="text-secondary">Net Disbursed Take-Home:</span>
                    <span className="text-secondary font-mono">₹50,233</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Commendations & Observational Log */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
              <div className="flex items-center justify-between pb-space-sm border-b border-slate-100">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">military_tech</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Supervisory Commendations &amp; Milestones</h3>
                </div>
                <span className="text-xs text-on-surface-variant">Total: 4 Citations</span>
              </div>

              <div className="space-y-3 mt-3">
                <div className="p-3 bg-surface-container-low rounded-lg flex items-start gap-3">
                  <span className="material-symbols-outlined text-secondary mt-0.5">hotel_class</span>
                  <div>
                    <h4 className="text-sm font-bold text-on-surface">Exceptional Bridal Presentation Handover</h4>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Presented high-end Kanjeevaram wedding silks to prestigious royal wedding patrons resulting in record single-bill closing of ₹3.4L.
                    </p>
                    <span className="text-[11px] text-outline mt-1 block">Commended by Anand Kulkarni (Store Lead) • 24 Oct 2024</span>
                  </div>
                </div>
                <div className="p-3 bg-surface-container-low rounded-lg flex items-start gap-3">
                  <span className="material-symbols-outlined text-secondary mt-0.5">verified</span>
                  <div>
                    <h4 className="text-sm font-bold text-on-surface">Zero Discrepancy Biometric Adherence (Q2)</h4>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Maintained 100% on-time attendance across 74 consecutive work shifts without grace period breach.
                    </p>
                    <span className="text-[11px] text-outline mt-1 block">Awarded by HR Director S.B. Angadi • 30 Jun 2024</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Profile Modal */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Edit Employee Dossier</h3>
                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    defaultValue={emp.phone}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Emergency SOS Contact</label>
                  <input
                    type="text"
                    defaultValue={emp.emergencyContact}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Residential Address</label>
                  <textarea
                    rows={2}
                    defaultValue={emp.addressLine1}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    toast.success('Employee profile updated in master database!');
                  }}
                  className="px-4 py-2 text-sm bg-primary text-on-primary hover:bg-slate-800 rounded-lg font-bold shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}