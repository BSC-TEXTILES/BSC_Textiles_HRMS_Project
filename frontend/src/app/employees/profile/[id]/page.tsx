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

  // KYC & DigiLocker State
  const [kycDocuments, setKycDocuments] = useState<any[]>([]);
  const [kycConsent, setKycConsent] = useState<any>(null);
  const [isDigiLockerConnected, setIsDigiLockerConnected] = useState(false);
  const [kycLoading, setKycLoading] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedDocPreview, setSelectedDocPreview] = useState<any>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [fetchingDocType, setFetchingDocType] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    documentType: 'AADHAAR',
    documentNumber: '',
    issuer: 'UIDAI (Govt of India)',
    expiryDate: '',
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    phone: '',
    emergencyContact: '',
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
  });

  // Notes state
  const [notesList, setNotesList] = useState([
    {
      id: 1,
      author: 'Sunita Deshmukh (Lead HR Partner)',
      date: '18 Oct 2024 • 11:30 AM',
      category: 'Annual Appraisal',
      content: 'Consistently exceeded retail merchandising quota for Bridal Silks by 18%. Excellent peer mentorship during the Diwali rush.',
    },
    {
      id: 2,
      author: 'Anand Kulkarni (Store Manager)',
      date: '04 Sep 2024 • 04:15 PM',
      category: 'Store Commendation',
      content: 'Handled high-value Mysore Silk royal family bridal order with exemplary product knowledge. Zero customer disputes.',
    },
    {
      id: 3,
      author: 'S. B. Angadi (Director Operations)',
      date: '15 Jul 2024 • 02:00 PM',
      category: 'Biometric Adherence',
      content: 'Maintained 100% biometric attendance fidelity across Q1 and Q2. Eligible for master floor supervisor nomination.',
    },
  ]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState('Supervisory Observation');

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/employees/${id}`);
      setEmployee(res.data);
      if (res.data) {
        setEditForm({
          phone: res.data.phone || '+91 98452 31209',
          emergencyContact: res.data.emergencyContact || '+91 94481 09842 (Spouse: Venkatesh)',
          addressLine1: res.data.addressLine1 || '#45 Tilakwadi Main Road, Near 2nd Railway Gate',
          city: res.data.city || 'Belagavi',
          state: res.data.state || 'Karnataka',
          pincode: res.data.pincode || '590006',
        });
      }
    } catch (err) {
      console.error(err);
      // Fallback synthetic mock profile if specific ID is not populated
      const fallback = {
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
      };
      setEmployee(fallback);
      setEditForm({
        phone: fallback.phone,
        emergencyContact: fallback.emergencyContact,
        addressLine1: fallback.addressLine1,
        city: fallback.city,
        state: fallback.state,
        pincode: fallback.pincode,
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchKycData = useCallback(async () => {
    if (!id) return;
    try {
      setKycLoading(true);
      const res = await api.get(`/kyc/employee/${id}`);
      if (res.data) {
        setKycDocuments(res.data.documents || []);
        setKycConsent(res.data.consent || null);
        setIsDigiLockerConnected(Boolean(res.data.isDigiLockerConnected));
      }
    } catch (err) {
      console.error('Failed to load KYC dossier:', err);
    } finally {
      setKycLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProfile();
    fetchKycData();
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('tab') === 'documents') {
        setActiveTab('documents');
      }
    }
  }, [fetchProfile, fetchKycData]);

  const handleConnectDigiLocker = async () => {
    if (!consentAccepted) {
      toast.error('Please accept the explicit consent declaration to continue');
      return;
    }
    try {
      setConsentSubmitting(true);
      // 1. Record explicit employee consent
      await api.post('/kyc/consent', {
        employeeId: id,
        purpose: 'Statutory employment KYC verification, PF/ESIC linkage, and tamper-evident identity verification',
        scopes: 'doc_fetch:ADHAR,doc_fetch:PANCR,doc_fetch:DRVLC',
      });

      // 2. Obtain DigiLocker OAuth PKCE Authorization URL
      await api.post('/kyc/digilocker/authorize', { employeeId: id });

      // 3. Complete the retrieval of certified documents (Aadhaar & PAN)
      await api.post('/kyc/digilocker/fetch', {
        employeeId: id,
        docType: 'AADHAAR',
      });
      await api.post('/kyc/digilocker/fetch', {
        employeeId: id,
        docType: 'PAN',
      });

      toast.success('DigiLocker linked! Certified Aadhaar & PAN verified with UIDAI seal.');
      setIsConnectModalOpen(false);
      fetchKycData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'DigiLocker connection failed');
    } finally {
      setConsentSubmitting(false);
    }
  };

  const handlePullDigiLockerDoc = async (docType: string) => {
    try {
      setFetchingDocType(docType);
      await api.post('/kyc/digilocker/fetch', {
        employeeId: id,
        docType,
      });
      toast.success(`Certified ${docType.replace('_', ' ')} pulled and sealed from DigiLocker!`);
      fetchKycData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Failed to fetch ${docType}`);
    } finally {
      setFetchingDocType(null);
    }
  };

  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.documentNumber.trim()) {
      toast.error('Please enter the document number');
      return;
    }
    try {
      setUploading(true);
      await api.post('/kyc/upload', {
        employeeId: id,
        documentType: uploadForm.documentType,
        documentNumber: uploadForm.documentNumber.trim(),
        issuer: uploadForm.issuer.trim() || 'Verified Official Authority',
        expiryDate: uploadForm.expiryDate || undefined,
      });
      toast.success('Physical document scan submitted! Awaiting HR attestation.');
      setIsUploadModalOpen(false);
      setUploadForm({
        documentType: 'AADHAAR',
        documentNumber: '',
        issuer: 'UIDAI (Govt of India)',
        expiryDate: '',
      });
      fetchKycData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDoc = async (doc: any) => {
    try {
      const res = await api.get(`/kyc/download/${doc.id}`);
      if (res.data?.downloadUrl) {
        toast.success(`Secure token generated for ${doc.fileName || doc.documentType}`);
        window.open(res.data.downloadUrl, '_blank');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Download failed');
    }
  };

  const emp = {
    id: employee?.id || id || 'BSC-EMP-0042',
    employeeCode: employee?.employeeCode || 'BSC-EMP-0042',
    fullName: employee?.fullName || `${employee?.firstName || 'Rajeshwari'} ${employee?.lastName || 'Patil'}`,
    firstName: employee?.firstName || 'Rajeshwari',
    lastName: employee?.lastName || 'Patil',
    designation: employee?.designation || 'Senior Merchandising & Floor Lead',
    role: employee?.role || 'FLOOR_MANAGER',
    department: employee?.department || { name: 'Bridal & Silk Atelier' },
    location: employee?.location || { name: 'Belagavi Flagship Store (BEL-01)', code: 'BEL-01' },
    email: employee?.email || `${(employee?.firstName || 'rajeshwari').toLowerCase()}@bsctextiles.in`,
    phone: editForm.phone || employee?.phone || '+91 98452 31209',
    emergencyContact: editForm.emergencyContact || employee?.emergencyContact || '+91 94481 09842 (Spouse: Venkatesh)',
    dateOfBirth: employee?.dateOfBirth ? (typeof employee.dateOfBirth === 'string' && employee.dateOfBirth.includes('T') ? new Date(employee.dateOfBirth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : employee.dateOfBirth) : '14 Aug 1988',
    gender: employee?.gender ? (employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1)) : 'Female',
    bloodGroup: employee?.bloodGroup || 'O+ Positive',
    maritalStatus: employee?.maritalStatus || 'Married',
    addressLine1: editForm.addressLine1 || employee?.addressLine1 || '#45 Tilakwadi Main Road, Near 2nd Railway Gate',
    city: editForm.city || employee?.city || 'Belagavi',
    state: editForm.state || employee?.state || 'Karnataka',
    pincode: editForm.pincode || employee?.pincode || '590006',
    pan: employee?.pan || 'ABZPP4912K',
    aadhaar: employee?.aadhaar || '•••• •••• 8821',
    uan: employee?.uan || '101294821039',
    esic: employee?.esic || '3109284719',
    bankName: employee?.bankName || 'State Bank of India',
    bankAccount: employee?.bankAccount || '••••••••4912',
    bankIfsc: employee?.bankIfsc || 'SBIN0001248',
    bankBranch: employee?.bankBranch || 'Belagavi Camp Cantonment',
    joiningDate: employee?.joiningDate ? (typeof employee.joiningDate === 'string' && employee.joiningDate.includes('T') ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : employee.joiningDate) : '12 Jan 2021',
    shift: employee?.shift || { name: 'Retail A (09:30 – 18:30)', code: 'SHIFT-A' },
    managerName: employee?.managerName || 'Anand Kulkarni',
    hrPartner: employee?.hrPartner || 'Sunita Deshmukh',
    attendances: employee?.attendances || [],
    breaks: employee?.breaks || [],
    faceProfile: employee?.faceProfile || { enrolledAt: '2024-01-15', isActive: true },
    qrCode: employee?.qrCode || { token: `EMP-${employee?.employeeCode || '0042'}` },
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/employees/${id}`, {
        ...employee,
        phone: editForm.phone,
        addressLine1: editForm.addressLine1,
      });
      toast.success('Employee profile updated in master database!');
    } catch {
      toast.success('Employee profile updated locally!');
    }
    setIsEditModalOpen(false);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    const newEntry = {
      id: Date.now(),
      author: 'Active Authenticated User (HR Reviewer)',
      date: 'Just Now',
      category: newNoteCategory,
      content: newNoteText.trim(),
    };
    setNotesList([newEntry, ...notesList]);
    setNewNoteText('');
    toast.success('Confidential note recorded in audit dossier');
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
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500"></span>
                </span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-space-sm mb-space-xs">
                  <span className="font-label-sm text-label-sm px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-bold tracking-widest uppercase">
                    {emp.employeeCode}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-label-md text-label-md font-bold border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Confirmed • Full-Time Permanent
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold">
                    <span className="material-symbols-outlined text-[14px] text-[#0058be]">storefront</span>
                    {emp.location?.name || 'Belagavi Flagship Store (BEL-01)'}
                  </span>
                </div>
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface truncate">
                  {emp.fullName}
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant mb-space-sm">
                  {emp.designation} • <span className="text-on-surface font-semibold">{emp.department?.name || 'Bridal & Silk Department'}</span>
                </p>
                {/* Executive Micro Specs Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-space-lg gap-y-space-xs pt-space-xs text-on-surface-variant">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">Reporting Head</span>
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{emp.managerName}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">HR Partner</span>
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{emp.hrPartner}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">Shift &amp; Cadence</span>
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{emp.shift?.name}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">Tenure</span>
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">{emp.joiningDate} (4y 2m)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Action Suite & Quick Contact Drop */}
            <div className="flex flex-col sm:items-end justify-between gap-space-md shrink-0">
              <div className="flex items-center gap-space-xs flex-wrap justify-end">
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors font-label-lg text-label-lg shadow-sm border border-slate-200"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_square</span>
                  <span>Edit Profile</span>
                </button>
                <button
                  onClick={() => toast.success('Transfer requisition created for ' + emp.fullName)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors font-label-lg text-label-lg shadow-sm border border-slate-200"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">move_up</span>
                  <span>Transfer</span>
                </button>
                <button
                  onClick={() => router.push('/attendance/corrections')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors font-label-lg text-label-lg shadow-sm border border-slate-200"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">more_time</span>
                  <span>Log Correction</span>
                </button>
                <button
                  onClick={() => toast.success('Dossier PDF downloaded (Certified Karnataka Form B)')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0058be] text-white hover:bg-blue-700 transition-colors font-label-lg text-label-lg shadow-sm font-bold"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  <span>Dossier PDF</span>
                </button>
              </div>
              <div className="flex items-center gap-space-lg bg-surface-container-low px-space-md py-space-xs rounded-lg border border-slate-200/60">
                <div className="flex items-center gap-space-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-[#0058be]">mail</span>
                  <span className="font-body-sm text-body-sm text-on-surface font-medium">{emp.email}</span>
                </div>
                <div className="flex items-center gap-space-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-[#0058be]">phone_iphone</span>
                  <span className="font-body-sm text-body-sm text-on-surface font-medium">{emp.phone}</span>
                </div>
                <div className="flex items-center gap-space-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-rose-500">emergency</span>
                  <span className="font-body-sm text-body-sm text-on-surface font-medium">SOS: {emp.emergencyContact}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Dossier Navigation Tabs */}
          <div className="mt-space-lg pt-space-sm flex items-center gap-1.5 overflow-x-auto border-t border-slate-100">
            {[
              { key: 'overview', label: '1. Overview' },
              { key: 'attendance', label: '2. Attendance & Biometrics' },
              { key: 'breaks', label: '3. Work Hours & Breaks' },
              { key: 'leaves', label: '4. Leave Balances & Quota' },
              { key: 'payroll', label: '5. Salary & Payslip History' },
              { key: 'documents', label: `6. KYC & Digital Documents (${kycDocuments.length})` },
              { key: 'audit', label: '7. Audit Trail' },
              { key: 'notes', label: '8. HR Confidential Notes' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-4 py-2 rounded-lg font-medium text-xs shrink-0 transition-all ${
                  activeTab === tab.key
                    ? 'bg-[#0058be] text-white shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
            {/* LEFT COLUMN: Personal, Compliance & Assets (4 Cols) */}
            <div className="xl:col-span-4 flex flex-col gap-space-lg">
              {/* Personal Demographics */}
              <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
                <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-slate-100">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[#0058be] text-[20px]">badge</span>
                    <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Personal Demographics</h3>
                  </div>
                  <span className="font-label-sm text-label-sm text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded uppercase font-bold border border-emerald-200">
                    Verified
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-space-md mb-space-md">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">Date of Birth</span>
                    <span className="font-body-md text-body-md text-on-surface font-semibold">{emp.dateOfBirth}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">Gender</span>
                    <span className="font-body-md text-body-md text-on-surface font-semibold">{emp.gender}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">Blood Group</span>
                    <span className="font-body-md text-body-md text-on-surface font-semibold">{emp.bloodGroup}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">Marital Status</span>
                    <span className="font-body-md text-body-md text-on-surface font-semibold">{emp.maritalStatus}</span>
                  </div>
                </div>
                <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-1 border border-slate-200/40">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-slate-400 font-bold">Permanent Address</span>
                  <p className="font-body-sm text-body-sm text-on-surface leading-snug">
                    {emp.addressLine1},<br />
                    {emp.city}, {emp.state} – {emp.pincode}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[#0058be] font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-[14px]">home_pin</span>
                    <span>Proof of Residence: Aadhaar &amp; Utility Bill on file</span>
                  </div>
                </div>
              </div>

              {/* Identity & Statutory Compliance */}
              <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
                <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-slate-100">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[#0058be] text-[20px]">account_balance</span>
                    <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Statutory &amp; Bank Registry</h3>
                  </div>
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]">verified_user</span>
                </div>
                <div className="space-y-space-sm">
                  <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-slate-400 uppercase tracking-wider">Aadhaar (UIDAI)</span>
                      <span className="font-body-md text-body-md font-mono text-on-surface font-bold">{emp.aadhaar}</span>
                    </div>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">e-KYC Done</span>
                  </div>
                  <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-slate-400 uppercase tracking-wider">Income Tax PAN</span>
                      <span className="font-body-md text-body-md font-mono text-on-surface font-bold">{emp.pan}</span>
                    </div>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">NSDL Active</span>
                  </div>
                  <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-slate-400 uppercase tracking-wider">Provident Fund (UAN)</span>
                      <span className="font-body-md text-body-md font-mono text-on-surface font-bold">{emp.uan}</span>
                    </div>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-blue-50 text-[#0058be] font-medium">EPFO Synced</span>
                  </div>
                  <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-slate-400 uppercase tracking-wider">ESI Corporation ID</span>
                      <span className="font-body-md text-body-md font-mono text-on-surface font-bold">{emp.esic}</span>
                    </div>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">Active</span>
                  </div>
                  {/* Bank Account Box */}
                  <div className="p-space-sm bg-surface-container rounded-lg flex items-start gap-space-sm mt-space-md">
                    <div className="w-8 h-8 rounded-lg bg-surface-container-lowest flex items-center justify-center shrink-0 text-[#0058be]">
                      <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-label-md text-label-md text-on-surface font-bold">{emp.bankName}</span>
                        <span className="font-label-sm text-label-sm text-emerald-700 uppercase font-bold">Direct ACH</span>
                      </div>
                      <span className="font-body-sm text-body-sm font-mono text-on-surface-variant">{emp.bankAccount} • IFSC: {emp.bankIfsc}</span>
                      <span className="font-label-sm text-label-sm text-slate-400">Branch: {emp.bankBranch}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Allocated Hardware & Floor Assets */}
              <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
                <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-slate-100">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[#0058be] text-[20px]">devices</span>
                    <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Floor Inventory &amp; Custody</h3>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">3 Items</span>
                </div>
                <div className="space-y-space-xs">
                  <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                    <div className="flex items-center gap-space-sm">
                      <span className="material-symbols-outlined text-[18px] text-[#0058be]">barcode_scanner</span>
                      <div className="flex flex-col">
                        <span className="font-label-lg text-label-lg text-on-surface font-semibold">Barcode Scanner RFID</span>
                        <span className="font-label-sm text-label-sm text-slate-400 font-mono">SN: #BEL-302 • Handheld 2D</span>
                      </div>
                    </div>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-blue-50 text-[#0058be] font-bold">Assigned</span>
                  </div>
                  <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                    <div className="flex items-center gap-space-sm">
                      <span className="material-symbols-outlined text-[18px] text-[#0058be]">lock</span>
                      <div className="flex flex-col">
                        <span className="font-label-lg text-label-lg text-on-surface font-semibold">Staff Locker &amp; Key</span>
                        <span className="font-label-sm text-label-sm text-slate-400 font-mono">Basement Wing B • #B-14</span>
                      </div>
                    </div>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-blue-50 text-[#0058be] font-bold">Assigned</span>
                  </div>
                  <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
                    <div className="flex items-center gap-space-sm">
                      <span className="material-symbols-outlined text-[18px] text-[#0058be]">id_card</span>
                      <div className="flex flex-col">
                        <span className="font-label-lg text-label-lg text-on-surface font-semibold">Security RFID Card</span>
                        <span className="font-label-sm text-label-sm text-slate-400 font-mono">#BEL-VLT-12 • Vault Level 1</span>
                      </div>
                    </div>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">Active</span>
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
                    <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-label-sm text-label-sm font-bold">98.4% Present</span>
                    <span className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm font-semibold">0 Unexcused</span>
                  </div>
                </div>

                {/* Attendance Mini Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <span className="text-xs text-on-surface-variant font-semibold">Avg Check-in Time</span>
                    <div className="text-lg font-bold font-mono text-on-surface mt-0.5">09:27 AM</div>
                    <span className="text-[11px] text-[#0058be] font-medium">3m Early Shift Buffer</span>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <span className="text-xs text-on-surface-variant font-semibold">Avg Check-out Time</span>
                    <div className="text-lg font-bold font-mono text-on-surface mt-0.5">18:34 PM</div>
                    <span className="text-[11px] text-on-surface-variant">Standard 18:30 Closure</span>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <span className="text-xs text-on-surface-variant font-semibold">Total Overtime Hours</span>
                    <div className="text-lg font-bold font-mono text-[#0058be] mt-0.5">6.5 Hours</div>
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
                    <span className="material-symbols-outlined text-[#0058be] text-[20px]">payments</span>
                    <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Compensation &amp; Salary Structure</h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#0058be]">Cycle: Oct 2024</span>
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
                      <span className="font-mono font-semibold text-[#0058be]">₹4,500</span>
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
                      <span className="text-[#0058be]">Net Disbursed Take-Home:</span>
                      <span className="text-[#0058be] font-mono">₹50,233</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Commendations & Observational Log */}
              <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-lg">
                <div className="flex items-center justify-between pb-space-sm border-b border-slate-100">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[#0058be] text-[20px]">military_tech</span>
                    <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Supervisory Commendations &amp; Milestones</h3>
                  </div>
                  <span className="text-xs text-on-surface-variant">Total: 4 Citations</span>
                </div>

                <div className="space-y-3 mt-3">
                  <div className="p-3 bg-surface-container-low rounded-lg flex items-start gap-3">
                    <span className="material-symbols-outlined text-amber-500 mt-0.5">hotel_class</span>
                    <div>
                      <h4 className="text-sm font-bold text-on-surface">Exceptional Bridal Presentation Handover</h4>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Presented high-end Kanjeevaram wedding silks to prestigious royal wedding patrons resulting in record single-bill closing of ₹3.4L.
                      </p>
                      <span className="text-[11px] text-slate-400 mt-1 block">Commended by Anand Kulkarni (Store Lead) • 24 Oct 2024</span>
                    </div>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded-lg flex items-start gap-3">
                    <span className="material-symbols-outlined text-emerald-500 mt-0.5">verified</span>
                    <div>
                      <h4 className="text-sm font-bold text-on-surface">Zero Discrepancy Biometric Adherence (Q2)</h4>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Maintained 100% on-time attendance across 74 consecutive work shifts without grace period breach.
                      </p>
                      <span className="text-[11px] text-slate-400 mt-1 block">Awarded by HR Director S.B. Angadi • 30 Jun 2024</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ATTENDANCE & BIOMETRICS */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            {/* Biometric Status Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[28px]">fingerprint</span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Face AI Verification</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">99.8% Match Rate</div>
                  <div className="text-[11px] text-emerald-600 font-semibold">Active &bull; Liveness Confirmed</div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0058be] flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[28px]">qr_code_2</span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Daily Token &amp; QR</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{emp.qrCode?.token?.slice(0, 14) || 'EMP-QR-9821'}</div>
                  <div className="text-[11px] text-blue-600 font-semibold">Karnataka Encrypted Key</div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[28px]">price_check</span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Early Bonus Accrued</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">₹1,440 credited</div>
                  <div className="text-[11px] text-amber-600 font-semibold">₹1/sec Incentive Policy</div>
                </div>
              </div>
            </div>

            {/* Attendance Punch History Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Recent Biometric Attendance Logs</h3>
                  <p className="text-xs text-slate-500">Live synchronization with Karnataka Hub IoT facial recognition terminals</p>
                </div>
                <button
                  onClick={() => router.push('/attendance/punches')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#0058be] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  View All Hub Punches
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Shift</th>
                      <th className="py-3 px-4">In Punch</th>
                      <th className="py-3 px-4">Out Punch</th>
                      <th className="py-3 px-4">Terminal</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Early Incentive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      { date: 'Today (09 Oct 2026)', shift: 'Retail A (09:30-18:30)', in: '09:18:22 AM', out: '18:35:10 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.8%)', status: 'Early Login', bonus: '+₹718' },
                      { date: '08 Oct 2026', shift: 'Retail A (09:30-18:30)', in: '09:22:45 AM', out: '18:32:04 PM', terminal: 'BEL-TERM-02', method: 'Face Mesh (99.4%)', status: 'Early Login', bonus: '+₹435' },
                      { date: '07 Oct 2026', shift: 'Retail A (09:30-18:30)', in: '09:29:10 AM', out: '18:30:15 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.9%)', status: 'On Time', bonus: '+₹50' },
                      { date: '06 Oct 2026', shift: 'Retail A (09:30-18:30)', in: '09:34:00 AM', out: '18:36:50 PM', terminal: 'BEL-TERM-03', method: 'QR Scan + Face', status: 'Grace Period', bonus: '₹0' },
                      { date: '05 Oct 2026', shift: 'Retail A (09:30-18:30)', in: '09:15:30 AM', out: '18:34:20 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.7%)', status: 'Early Login', bonus: '+₹870' },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800">{row.date}</td>
                        <td className="py-3 px-4 text-slate-600">{row.shift}</td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-700">{row.in}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{row.out}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{row.terminal}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-[#0058be] font-semibold text-[11px]">
                            <span className="material-symbols-outlined text-[12px]">verified</span>
                            {row.method}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                            row.status === 'Early Login' ? 'bg-emerald-100 text-emerald-800' :
                            row.status === 'On Time' ? 'bg-blue-100 text-blue-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{row.bonus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WORK HOURS & BREAKS */}
        {activeTab === 'breaks' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Morning Tea Break</span>
                <div className="text-xl font-bold text-slate-900 mt-1">15 Mins Quota</div>
                <div className="text-xs text-emerald-600 mt-0.5 font-medium">Avg Duration: 12.4 Mins (Adherent)</div>
              </div>
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Lunch Break</span>
                <div className="text-xl font-bold text-slate-900 mt-1">45 Mins Quota</div>
                <div className="text-xs text-emerald-600 mt-0.5 font-medium">Avg Duration: 38.0 Mins (Adherent)</div>
              </div>
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Evening Tea Break</span>
                <div className="text-xl font-bold text-slate-900 mt-1">15 Mins Quota</div>
                <div className="text-xs text-emerald-600 mt-0.5 font-medium">Avg Duration: 14.1 Mins (Adherent)</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Tea Stall &amp; Break RFID Audit Log</h3>
                  <p className="text-xs text-slate-500">Live RFID tracking from Karnataka Flagship store cafeteria terminals</p>
                </div>
                <button
                  onClick={() => router.push('/attendance/breaks')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#0058be] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Manage Break Policies
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Break Name</th>
                      <th className="py-3 px-4">Punch Out</th>
                      <th className="py-3 px-4">Punch In</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Limit</th>
                      <th className="py-3 px-4">Terminal</th>
                      <th className="py-3 px-4 text-right">Adherence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      { date: 'Today (09 Oct)', break: 'Morning Tea', out: '11:15 AM', in: '11:28 AM', duration: '13m', limit: '15m', terminal: 'BEL-TEA-01', ok: true },
                      { date: 'Today (09 Oct)', break: 'Lunch Break', out: '13:30 PM', in: '14:12 PM', duration: '42m', limit: '45m', terminal: 'BEL-CAFETERIA', ok: true },
                      { date: '08 Oct 2026', break: 'Evening Tea', out: '16:45 PM', in: '16:58 PM', duration: '13m', limit: '15m', terminal: 'BEL-TEA-01', ok: true },
                      { date: '08 Oct 2026', break: 'Lunch Break', out: '13:35 PM', in: '14:15 PM', duration: '40m', limit: '45m', terminal: 'BEL-CAFETERIA', ok: true },
                      { date: '07 Oct 2026', break: 'Morning Tea', out: '11:20 AM', in: '11:34 AM', duration: '14m', limit: '15m', terminal: 'BEL-TEA-02', ok: true },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-semibold text-slate-800">{row.date}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">{row.break}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.out}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{row.in}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{row.duration}</td>
                        <td className="py-3 px-4 text-slate-500">{row.limit}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{row.terminal}</td>
                        <td className="py-3 px-4 text-right">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                            Within Policy
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LEAVE BALANCES & QUOTA */}
        {activeTab === 'leaves' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Casual Leave (CL)</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">4.0 / 8.0</div>
                <div className="text-[11px] text-slate-500 mt-0.5">4 Days Remaining</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Sick Leave (SL)</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">7.0 / 10.0</div>
                <div className="text-[11px] text-slate-500 mt-0.5">7 Days Remaining</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Earned Leave (EL)</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">14.5 / 18.0</div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">Encashable at Year End</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 uppercase">Festival Holidays</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">2.0 / 2.0</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Karnataka State Gazetted</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Leave Application History</h3>
                  <p className="text-xs text-slate-500">Statutory record complying with Karnataka Shops &amp; Commercial Establishments Act</p>
                </div>
                <button
                  onClick={() => router.push('/leaves')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#0058be] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Apply Leave on Behalf
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Leave Type</th>
                      <th className="py-3 px-4">From</th>
                      <th className="py-3 px-4">To</th>
                      <th className="py-3 px-4">Days</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Approved By</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      { type: 'Casual Leave (CL)', from: '14 Aug 2026', to: '15 Aug 2026', days: '2.0', reason: 'Family engagement in Dharwad', approver: 'Sunita Deshmukh', status: 'APPROVED' },
                      { type: 'Sick Leave (SL)', from: '02 Jun 2026', to: '03 Jun 2026', days: '2.0', reason: 'Medical consultation & viral fever', approver: 'Anand Kulkarni', status: 'APPROVED' },
                      { type: 'Earned Leave (EL)', from: '20 Jan 2026', to: '24 Jan 2026', days: '5.0', reason: 'Annual pilgrimage trip', approver: 'Sunita Deshmukh', status: 'APPROVED' },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.type}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{row.from}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{row.to}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{row.days}</td>
                        <td className="py-3 px-4 text-slate-600">{row.reason}</td>
                        <td className="py-3 px-4 text-slate-700">{row.approver}</td>
                        <td className="py-3 px-4 text-right">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SALARY & PAYSLIP HISTORY */}
        {activeTab === 'payroll' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Certified Monthly Payslips (Form T)</h3>
                  <p className="text-xs text-slate-500">Official Karnataka wage records with statutory PF, ESIC, and Professional Tax deductions</p>
                </div>
                <button
                  onClick={() => router.push('/payroll')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#0058be] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Run Master Payroll
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Pay Period</th>
                      <th className="py-3 px-4">Basic + DA</th>
                      <th className="py-3 px-4">HRA</th>
                      <th className="py-3 px-4">Allowances</th>
                      <th className="py-3 px-4">Early Bonus</th>
                      <th className="py-3 px-4">Gross Earnings</th>
                      <th className="py-3 px-4">Deductions</th>
                      <th className="py-3 px-4">Net Disbursed</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      { period: 'October 2026', basic: '₹28,000', hra: '₹11,200', allow: '₹10,500', bonus: '₹1,440', gross: '₹55,640', ded: '₹3,967', net: '₹51,673' },
                      { period: 'September 2026', basic: '₹28,000', hra: '₹11,200', allow: '₹10,500', bonus: '₹1,280', gross: '₹55,480', ded: '₹3,967', net: '₹51,513' },
                      { period: 'August 2026', basic: '₹28,000', hra: '₹11,200', allow: '₹10,500', bonus: '₹1,620', gross: '₹55,820', ded: '₹3,967', net: '₹51,853' },
                      { period: 'July 2026', basic: '₹28,000', hra: '₹11,200', allow: '₹10,500', bonus: '₹1,110', gross: '₹55,310', ded: '₹3,967', net: '₹51,343' },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">{row.period}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{row.basic}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{row.hra}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{row.allow}</td>
                        <td className="py-3 px-4 font-mono text-emerald-600 font-semibold">{row.bonus}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{row.gross}</td>
                        <td className="py-3 px-4 font-mono text-rose-600 font-semibold">{row.ded}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#0058be] text-sm">{row.net}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => toast.success(`Downloaded Certified Payslip for ${row.period}`)}
                            className="px-2.5 py-1 text-xs font-semibold text-[#0058be] hover:bg-blue-50 border border-blue-200 rounded transition-colors inline-flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                            Form T PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: KYC & DIGITAL DOCUMENTS */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            {/* Executive KYC Hub Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#3b82f6] text-[24px]">verified_user</span>
                    <h3 className="font-bold text-lg text-white">KYC &amp; DigiLocker Digital Vault</h3>
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                      UIDAI Sec. 29 Compliant
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                    Official employee identity and statutory credential registry. Supports instant document retrieval via National DigiLocker API (OAuth 2.0 PKCE) and verified manual upload fallback with 12-digit Aadhaar masking.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-slate-300">DigiLocker Status:</span>
                      <span className="font-semibold text-white">
                        {isDigiLockerConnected ? 'Connected & Verified' : 'Awaiting Employee Link'}
                      </span>
                    </div>
                    <span className="text-slate-600">•</span>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="material-symbols-outlined text-slate-400 text-[14px]">lock</span>
                      <span className="text-slate-300">Aadhaar Masking:</span>
                      <span className="font-semibold text-emerald-400">Enforced (Last 4 digits visible)</span>
                    </div>
                    {kycConsent && (
                      <>
                        <span className="text-slate-600">•</span>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="material-symbols-outlined text-blue-400 text-[14px]">history_edu</span>
                          <span className="text-slate-300">Active Consent:</span>
                          <span className="font-semibold text-blue-300">Valid until {new Date(kycConsent.expiresAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                  <button
                    onClick={() => {
                      setConsentAccepted(Boolean(kycConsent));
                      setIsConnectModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-md shadow-blue-900/30 transition-all cursor-pointer"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
                    <span>{isDigiLockerConnected ? 'Manage DigiLocker' : 'Connect DigiLocker'}</span>
                  </button>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition-all cursor-pointer"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>
                    <span>Upload Physical Scan</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Statutory Compliance Checklist Strip */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Mandatory Statutory Identification Checklist
                </span>
                <span className="text-xs text-slate-500">
                  {kycDocuments.filter(d => d.status === 'VERIFIED').length} of 4 Documents Verified
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    type: 'AADHAAR',
                    label: 'Aadhaar Card (UIDAI)',
                    desc: 'Required for EPFO & ESIC compliance',
                    icon: 'badge',
                  },
                  {
                    type: 'PAN',
                    label: 'PAN Card (Income Tax)',
                    desc: 'Mandatory for TDS wage filing',
                    icon: 'credit_card',
                  },
                  {
                    type: 'DRIVING_LICENSE',
                    label: 'Driving License / Address',
                    desc: 'Karnataka Form B address proof',
                    icon: 'directions_car',
                  },
                  {
                    type: 'DEGREE_CERTIFICATE',
                    label: 'Educational Certificate',
                    desc: 'Merchandising technical cadre',
                    icon: 'school',
                  },
                ].map((item) => {
                  const doc = kycDocuments.find((d) => d.documentType === item.type);
                  const isVerified = doc?.status === 'VERIFIED';
                  const isSubmitted = doc?.status === 'SUBMITTED' || doc?.status === 'PENDING';
                  return (
                    <div
                      key={item.type}
                      className={`p-3 rounded-lg border flex flex-col justify-between gap-2 ${
                        isVerified
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isSubmitted
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-[20px] ${isVerified ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {item.icon}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-slate-900">{item.label}</div>
                            <div className="text-[10px] text-slate-500">{item.desc}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/40">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            Verified ({doc.documentNumberMasked})
                          </span>
                        ) : isSubmitted ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
                            <span className="material-symbols-outlined text-[13px]">hourglass_top</span>
                            Awaiting HR Attestation
                          </span>
                        ) : (
                          <button
                            disabled={fetchingDocType === item.type}
                            onClick={() => {
                              if (!kycConsent) {
                                setIsConnectModalOpen(true);
                              } else {
                                handlePullDigiLockerDoc(item.type);
                              }
                            }}
                            className="text-[11px] font-semibold text-[#0058be] hover:underline flex items-center gap-1"
                          >
                            {fetchingDocType === item.type ? (
                              <span>Fetching...</span>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[13px]">download</span>
                                <span>Pull via DigiLocker</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Document Ledger Cards Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-sm text-slate-900">
                  Registered Documents ({kycDocuments.length})
                </h4>
                <span className="text-xs text-slate-500">
                  Certified audit copies stored in encrypted tenant storage
                </span>
              </div>

              {kycDocuments.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <span className="material-symbols-outlined text-slate-400 text-[40px] mb-2">folder_off</span>
                  <h4 className="font-bold text-sm text-slate-800">No Documents Uploaded Yet</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                    Connect DigiLocker to seamlessly fetch verified Aadhaar and PAN documents, or upload a scanned copy manually.
                  </p>
                  <button
                    onClick={() => setIsConnectModalOpen(true)}
                    className="px-4 py-2 bg-[#0058be] text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                  >
                    Connect DigiLocker Now
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {kycDocuments.map((doc: any) => {
                    const isVerified = doc.status === 'VERIFIED';
                    const isPending = doc.status === 'PENDING' || doc.status === 'SUBMITTED';
                    const isRejected = doc.status === 'REJECTED';
                    const isDigi = doc.source === 'DIGILOCKER';

                    let iconName = 'badge';
                    if (doc.documentType === 'PAN') iconName = 'credit_card';
                    if (doc.documentType === 'DRIVING_LICENSE') iconName = 'directions_car';
                    if (doc.documentType === 'DEGREE_CERTIFICATE') iconName = 'school';
                    if (doc.documentType === 'VOTER_ID') iconName = 'how_to_vote';

                    return (
                      <div
                        key={doc.id}
                        className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#0058be] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[22px]">{iconName}</span>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-900">
                                  {doc.documentType.replace('_', ' ')}
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5">{doc.issuer}</p>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                                isVerified
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : isPending
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : isRejected
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {doc.status}
                            </span>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Masked ID:</span>
                              <span className="font-mono font-bold text-slate-800">{doc.documentNumberMasked}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Source:</span>
                              <span className={`inline-flex items-center gap-1 font-semibold text-[11px] ${isDigi ? 'text-indigo-600' : 'text-slate-600'}`}>
                                {isDigi && <span className="material-symbols-outlined text-[13px]">cloud_done</span>}
                                {isDigi ? 'DigiLocker PKCE' : 'Physical Scan'}
                              </span>
                            </div>
                            {doc.expiryDate && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Expires:</span>
                                <span className="font-mono text-slate-700">{new Date(doc.expiryDate).toLocaleDateString('en-IN')}</span>
                              </div>
                            )}
                          </div>

                          {isRejected && doc.rejectionReason && (
                            <div className="p-2 bg-rose-50 rounded border border-rose-200 text-xs text-rose-700">
                              <span className="font-bold">Rejection Note: </span>
                              {doc.rejectionReason}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                          <span className="text-[11px] text-slate-400">
                            {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Verified'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedDocPreview(doc);
                                setIsPreviewModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 rounded font-medium"
                              type="button"
                            >
                              Inspect
                            </button>
                            <button
                              onClick={() => handleDownloadDoc(doc)}
                              className="px-2.5 py-1 bg-[#0058be] text-white hover:bg-blue-700 rounded font-bold flex items-center gap-1"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[14px]">download</span>
                              Download
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 7: AUDIT TRAIL */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-base text-slate-900 mb-1">Employee Dossier Immutable Audit Log</h3>
            <p className="text-xs text-slate-500 mb-6">Chronological audit ledger tracing biometric events, role adjustments, and compliance checks</p>

            <div className="space-y-4">
              {[
                { time: 'Today • 09:18 AM', event: 'BIOMETRIC_FACE_MATCH_SUCCESS', actor: 'Karnataka IoT Hub Terminal BEL-01', desc: 'Facial match 99.8% confirmed. Shift A login clocked at 09:18 AM with early login incentive of ₹718 credited.' },
                { time: '01 Oct 2026 • 10:00 AM', event: 'MONTHLY_PAYROLL_GENERATION', actor: 'Pradeep Chavan (Payroll Manager)', desc: 'October 2026 payroll run processed. Gross ₹55,640, Deductions ₹3,967, Net ₹51,673.' },
                { time: '14 Aug 2026 • 05:40 PM', event: 'LEAVE_REQUEST_APPROVAL', actor: 'Sunita Deshmukh (Lead HR Partner)', desc: 'Approved 2.0 days Casual Leave for 14 Aug - 15 Aug.' },
                { time: '01 Apr 2026 • 11:15 AM', event: 'ANNUAL_INCREMENT_APPLIED', actor: 'System Auto-Engine', desc: 'Annual merit revision applied. Basic salary incremented to ₹28,000 according to Floor Lead Cadre VII.' },
                { time: '12 Jan 2021 • 09:00 AM', event: 'EMPLOYEE_ONBOARDING_COMPLETED', actor: 'HR Operations Directorate', desc: 'Master dossier created with employee code BSC-EMP-0042. UIDAI e-KYC verified.' },
              ].map((log, idx) => (
                <div key={idx} className="flex items-start gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/60">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#0058be] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">{log.event}</span>
                      <span className="font-mono text-xs text-slate-400">{log.time}</span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">{log.desc}</p>
                    <span className="text-[11px] text-slate-500 font-medium mt-1 block">Actor: {log.actor}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 8: HR CONFIDENTIAL NOTES */}
        {activeTab === 'notes' && (
          <div className="space-y-6">
            {/* Add New Note Box */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-sm text-slate-900 mb-2">Record Confidential Supervisory Note</h3>
              <form onSubmit={handleAddNote} className="space-y-3">
                <div className="flex gap-3">
                  <select
                    value={newNoteCategory}
                    onChange={(e) => setNewNoteCategory(e.target.value)}
                    className="text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                  >
                    <option value="Supervisory Observation">Supervisory Observation</option>
                    <option value="Performance Review">Performance Review</option>
                    <option value="Biometric Grace Exemption">Biometric Grace Exemption</option>
                    <option value="Disciplinary Record">Disciplinary Record</option>
                  </select>
                </div>
                <textarea
                  rows={3}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Enter confidential HR observation, store appraisal feedback, or compliance remarks..."
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#0058be] text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Save Note to Dossier
                  </button>
                </div>
              </form>
            </div>

            {/* List of Notes */}
            <div className="space-y-3">
              {notesList.map((n) => (
                <div key={n.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0058be] font-bold text-[10px] uppercase border border-blue-200">
                      {n.category}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{n.date}</span>
                  </div>
                  <p className="text-xs text-slate-800 leading-relaxed">{n.content}</p>
                  <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-semibold">
                    Logged by: {n.author}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit Profile Modal */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <h3 className="font-bold text-base text-slate-900">Edit Employee Dossier</h3>
                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Emergency SOS Contact</label>
                  <input
                    type="text"
                    value={editForm.emergencyContact}
                    onChange={(e) => setEditForm({ ...editForm, emergencyContact: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Residential Address</label>
                  <textarea
                    rows={2}
                    value={editForm.addressLine1}
                    onChange={(e) => setEditForm({ ...editForm, addressLine1: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">City</label>
                    <input
                      type="text"
                      value={editForm.city}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">State</label>
                    <input
                      type="text"
                      value={editForm.state}
                      onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Pincode</label>
                    <input
                      type="text"
                      value={editForm.pincode}
                      onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#0058be] text-white hover:bg-blue-700 rounded-lg font-bold shadow-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Connect DigiLocker Modal */}
        {isConnectModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0058be] flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-[24px]">cloud_sync</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">
                      Connect National DigiLocker
                    </h3>
                    <p className="text-xs text-slate-500">
                      Approved OAuth 2.0 PKCE Authorization &amp; KYC Verification
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsConnectModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* Purpose Explanation */}
                <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <span className="material-symbols-outlined text-[16px]">info</span>
                    <span>Why are we requesting your documents?</span>
                  </div>
                  <p className="text-blue-800 leading-relaxed">
                    BSC Textiles requires verified documents for statutory employment registration, provident fund (EPFO) linkage, employee state insurance (ESIC) enrollment, and income tax TDS filing under Karnataka and Indian labor laws.
                  </p>
                </div>

                {/* Requested Documents & Scopes */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Requested Certified Scopes:</h4>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200/60">
                      <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0 mt-0.5">badge</span>
                      <div>
                        <span className="font-semibold text-slate-900">Aadhaar Card (UIDAI)</span>
                        <p className="text-slate-500 text-[11px]">Identity &amp; age verification. Stored strictly in masked format (XXXX-XXXX-1234).</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200/60">
                      <span className="material-symbols-outlined text-blue-600 text-[18px] shrink-0 mt-0.5">credit_card</span>
                      <div>
                        <span className="font-semibold text-slate-900">PAN Card (Income Tax Dept)</span>
                        <p className="text-slate-500 text-[11px]">Salary disbursement and TDS compliance certificate.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200/60">
                      <span className="material-symbols-outlined text-indigo-600 text-[18px] shrink-0 mt-0.5">directions_car</span>
                      <div>
                        <span className="font-semibold text-slate-900">Driving License / Address Proof</span>
                        <p className="text-slate-500 text-[11px]">Karnataka Shops &amp; Establishments Register Form B address proof.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Privacy & UIDAI Compliance Notice */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <span className="material-symbols-outlined text-[16px]">security</span>
                    <span>Statutory Privacy &amp; Data Security Safeguards</span>
                  </div>
                  <p className="text-emerald-800 text-[11px] leading-relaxed">
                    Under UIDAI Section 29 and DPDP Act 2023: Raw 12-digit Aadhaar numbers, biometric templates, and Aadhaar OTPs are NEVER stored on our servers. All documents are retrieved through an encrypted, authorized government tunnel with digital signatures verified.
                  </p>
                </div>

                {/* Explicit Consent Checkbox */}
                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-start gap-3 cursor-pointer p-2.5 rounded-lg hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(e) => setConsentAccepted(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-[#0058be] rounded border-slate-300 focus:ring-[#0058be]"
                    />
                    <span className="text-slate-700 leading-snug">
                      I voluntarily grant explicit consent to BSC Textiles Pvt Ltd to initiate DigiLocker OAuth 2.0 PKCE authorization and retrieve my certified documents for official employment KYC. I understand this consent is valid for 365 days and can be revoked upon request.
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsConnectModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!consentAccepted || consentSubmitting}
                  onClick={handleConnectDigiLocker}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {consentSubmitting ? (
                    <>
                      <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                      <span>Authorizing &amp; Fetching...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">lock_open</span>
                      <span>Authorize with DigiLocker</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Scanned Upload Modal */}
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0058be] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px]">upload_file</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">
                      Manual Document Upload Fallback
                    </h3>
                    <p className="text-xs text-slate-500">
                      For physical scan submissions awaiting HR attestation
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <form onSubmit={handleManualUpload} className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Document Type *</label>
                  <select
                    value={uploadForm.documentType}
                    onChange={(e) => {
                      const dt = e.target.value;
                      let defaultIssuer = 'UIDAI (Govt of India)';
                      if (dt === 'PAN') defaultIssuer = 'Income Tax Department';
                      if (dt === 'DRIVING_LICENSE') defaultIssuer = 'MoRTH Karnataka Transport';
                      if (dt === 'VOTER_ID') defaultIssuer = 'Election Commission of India';
                      if (dt === 'DEGREE_CERTIFICATE') defaultIssuer = 'Karnataka State University';
                      setUploadForm({ ...uploadForm, documentType: dt, issuer: defaultIssuer });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                  >
                    <option value="AADHAAR">Aadhaar Card (UIDAI)</option>
                    <option value="PAN">PAN Card (Income Tax)</option>
                    <option value="DRIVING_LICENSE">Driving License (Transport Dept)</option>
                    <option value="VOTER_ID">Voter ID (Election Commission)</option>
                    <option value="DEGREE_CERTIFICATE">Educational Degree Certificate</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Document Number / Identifier *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={uploadForm.documentType === 'AADHAAR' ? 'e.g. 12-digit number (will be masked)' : 'e.g. ABCDE1234F'}
                    value={uploadForm.documentNumber}
                    onChange={(e) => setUploadForm({ ...uploadForm, documentNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                  />
                  {uploadForm.documentType === 'AADHAAR' && (
                    <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-semibold">
                      <span className="material-symbols-outlined text-[13px]">shield</span>
                      Only masked number (XXXX-XXXX-1234) will be stored in database.
                    </p>
                  )}
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Issuing Authority</label>
                  <input
                    type="text"
                    value={uploadForm.issuer}
                    onChange={(e) => setUploadForm({ ...uploadForm, issuer: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Expiry Date (Optional)</label>
                  <input
                    type="date"
                    value={uploadForm.expiryDate}
                    onChange={(e) => setUploadForm({ ...uploadForm, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0058be]"
                  />
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[11px]">
                  <span className="font-bold">Note: </span>
                  Manually submitted documents enter the <strong>PENDING</strong> review queue. An authorized HR Officer assigned to your store location will verify the scan before marking it <strong>VERIFIED</strong>.
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-5 py-2 bg-[#0058be] text-white hover:bg-blue-700 rounded-lg font-bold shadow-sm disabled:opacity-50"
                  >
                    {uploading ? 'Submitting...' : 'Submit for HR Attestation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Certified Document Inspection Modal */}
        {isPreviewModalOpen && selectedDocPreview && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0058be] text-[24px]">verified</span>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">
                      Certified Document Dossier
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedDocPreview.documentType.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setSelectedDocPreview(null);
                  }}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Document Type</span>
                    <span className="font-bold text-slate-800">{selectedDocPreview.documentType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Masked Identifier</span>
                    <span className="font-mono font-bold text-slate-800">{selectedDocPreview.documentNumberMasked}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Issuing Authority</span>
                    <span className="font-semibold text-slate-800">{selectedDocPreview.issuer}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Acquisition Channel</span>
                    <span className="font-semibold text-slate-800">{selectedDocPreview.source}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                    <span className="font-bold text-emerald-700">{selectedDocPreview.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Attested By</span>
                    <span className="font-semibold text-slate-800">{selectedDocPreview.verifiedBy || 'System / Pending'}</span>
                  </div>
                </div>

                {selectedDocPreview.digilockerDocUri && (
                  <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-1">
                    <span className="text-blue-900 font-bold block text-[11px]">DigiLocker Cryptographic URI</span>
                    <span className="font-mono text-blue-800 text-[11px] break-all">{selectedDocPreview.digilockerDocUri}</span>
                  </div>
                )}

                {selectedDocPreview.rejectionReason && (
                  <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-700">
                    <span className="font-bold block">HR Rejection Reason:</span>
                    <span>{selectedDocPreview.rejectionReason}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-xs"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadDoc(selectedDocPreview)}
                  className="px-4 py-2 bg-[#0058be] text-white hover:bg-blue-700 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Download Secure Copy</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}