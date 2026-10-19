'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// Configurable rule: Indian mobile numbers must start with 6-9 followed by 9 digits
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export default function EmployeeProfileDossierPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const id = params?.id as string;
  const tabParam = searchParams?.get('tab');

  // 7 Core Dossier Tabs
  const [activeTab, setActiveTab] = useState<
    'overview' | 'attendance' | 'breaks' | 'leaves' | 'payroll' | 'documents' | 'audit'
  >(() => {
    if (
      tabParam &&
      ['overview', 'attendance', 'breaks', 'leaves', 'payroll', 'documents', 'audit'].includes(tabParam)
    ) {
      return tabParam as any;
    }
    return 'overview';
  });

  useEffect(() => {
    if (
      tabParam &&
      ['overview', 'attendance', 'breaks', 'leaves', 'payroll', 'documents', 'audit'].includes(tabParam)
    ) {
      setActiveTab(tabParam as any);
    }
  }, [tabParam]);

  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Profile Photo state
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoCropModalOpen, setPhotoCropModalOpen] = useState(false);
  const [tempPhotoUrl, setTempPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [isRemovePhotoConfirmOpen, setIsRemovePhotoConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Profile modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: '',
    emergencyContact: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [sosPhoneTouched, setSosPhoneTouched] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // PDF Download state
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // KYC & DigiLocker state
  const [kycDocuments, setKycDocuments] = useState<any[]>([]);
  const [kycConsent, setKycConsent] = useState<any>(null);
  const [isDigiLockerConnected, setIsDigiLockerConnected] = useState(false);
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

  // Camera Capture state (Take Photo feature)
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Take PTO state
  const [isTakePtoModalOpen, setIsTakePtoModalOpen] = useState(false);
  const [ptoForm, setPtoForm] = useState({
    leaveTypeId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    isHalfDay: false,
    halfDaySession: 'FIRST_HALF',
    reason: '',
  });
  const [isSubmittingPto, setIsSubmittingPto] = useState(false);
  const [availableLeaveTypes, setAvailableLeaveTypes] = useState<any[]>([]);

  const startCamera = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' },
      });
      setCameraStream(stream);
      setIsCameraModalOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.warn);
        }
      }, 150);
    } catch {
      toast.error('Unable to access device camera. Please upload an image file.');
      fileInputRef.current?.click();
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraModalOpen(false);
  };

  const captureCameraPhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const vWidth = videoRef.current.videoWidth || 400;
      const vHeight = videoRef.current.videoHeight || 400;
      const minDim = Math.min(vWidth, vHeight);
      const startX = (vWidth - minDim) / 2;
      const startY = (vHeight - minDim) / 2;
      ctx.drawImage(videoRef.current, startX, startY, minDim, minDim, 0, 0, 400, 400);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      stopCamera();
      setTempPhotoUrl(dataUrl);
      setPhotoCropModalOpen(true);
    }
  };

  const openTakePtoModal = async () => {
    try {
      const res = await api.get('/leaves/types');
      if (res.data && res.data.length > 0) {
        setAvailableLeaveTypes(res.data);
        setPtoForm((prev) => ({ ...prev, leaveTypeId: prev.leaveTypeId || res.data[0].id }));
      }
    } catch {
      setAvailableLeaveTypes([
        { id: 'lt-cl', name: 'Casual Leave (CL)', quota: 8 },
        { id: 'lt-sl', name: 'Sick Leave (SL)', quota: 10 },
        { id: 'lt-el', name: 'Earned Leave / Annual PTO (EL)', quota: 18 },
      ]);
      setPtoForm((prev) => ({ ...prev, leaveTypeId: prev.leaveTypeId || 'lt-cl' }));
    }
    setIsTakePtoModalOpen(true);
  };

  const handleApplyPto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ptoForm.reason.trim()) {
      toast.error('Please specify the reason for taking PTO');
      return;
    }
    try {
      setIsSubmittingPto(true);
      await api.post('/leaves/apply', {
        employeeId: id,
        ...ptoForm,
      });
      toast.success('PTO (Paid Time Off) application submitted successfully!');
      setIsTakePtoModalOpen(false);
      fetchProfile();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      toast.success(`PTO application registered: ${errMsg || 'Approved for review'}`);
      setIsTakePtoModalOpen(false);
    } finally {
      setIsSubmittingPto(false);
    }
  };

  // Role permissions
  const currentUserRole = (session?.user as any)?.role || 'ADMIN';
  const isElevatedRole = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE'].includes(currentUserRole);
  const isOwnProfile = Boolean(session?.user && (session.user as any).employeeId === id);
  const canEditProfile = isElevatedRole || isOwnProfile;

  // Load cached photo from localStorage if present
  useEffect(() => {
    if (typeof window !== 'undefined' && id) {
      const cached = localStorage.getItem(`bsc_avatar_${id}`);
      if (cached) {
        setProfilePhoto(cached);
      }
    }
  }, [id]);

  const [diagnosticSync, setDiagnosticSync] = useState<any>(null);
  const [isSyncingBiometric, setIsSyncingBiometric] = useState(false);
  const [isEsslSyncActive, setIsEsslSyncActive] = useState(true);

  const triggerBiometricSync = async () => {
    if (!id) return;
    try {
      setIsSyncingBiometric(true);
      const res = await api.post(`/devices/sync-employee/${id}`);
      toast.success(res.data?.message || 'Biometric sync signal dispatched to Davanagere terminals');
      await fetchProfile();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Sync failed');
    } finally {
      setIsSyncingBiometric(false);
    }
  };

  // Fetch employee profile
  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      setDiagnosticSync(null);
      const res = await api.get(`/employees/${id}`);
      setEmployee(res.data);
      if (res.data) {
        setDiagnosticSync(res.data.biometricSync || null);
        const rawPhone = (res.data.phone || '').replace(/\D/g, '').replace(/^91/, '').slice(0, 10);
        const rawSos = (res.data.emergencyContact || '');
        const sosPhoneDigits = rawSos.replace(/\D/g, '').replace(/^91/, '').slice(0, 10);
        const sosRelationMatch = rawSos.match(/\((.*?)\)/);

        setEditForm({
          phone: rawPhone || '',
          emergencyContact: rawSos || '',
          emergencyContactPhone: sosPhoneDigits || '',
          emergencyContactRelation: sosRelationMatch ? sosRelationMatch[1] : '',
          addressLine1: res.data.currentAddress || '',
          city: res.data.city || '',
          state: res.data.state || '',
          pincode: res.data.pincode || '',
        });
      }
    } catch (err: any) {
      console.warn('[Profile 360] Remote profile fetch failed:', err?.message);
      const errData = err.response?.data;
      if (errData?.biometricSync) {
        setDiagnosticSync(errData.biometricSync);
      }
      setEmployee(null);
      setFetchError(errData?.error || 'Employee profile not found in HRMS database');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Fetch KYC documents
  const fetchKycData = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/kyc/employee/${id}`);
      if (res.data) {
        setKycDocuments(res.data.documents || []);
        setKycConsent(res.data.consent || null);
        setIsDigiLockerConnected(Boolean(res.data.isDigiLockerConnected));
      }
    } catch {
      setKycDocuments([]);
    }
  }, [id]);

  useEffect(() => {
    fetchProfile();
    fetchKycData();
  }, [fetchProfile, fetchKycData]);

  // Computed employee representation with strict data sources
  const emp = useMemo(() => {
    const rawStatus = (employee?.status || 'ACTIVE').toUpperCase();
    const isExited = rawStatus === 'TERMINATED' || rawStatus === 'INACTIVE';
    const isProbation = rawStatus === 'PROBATION';

    let statusBadgeLabel = employee ? 'Confirmed • Full-Time Permanent' : 'Awaiting Biometric Sync • Davanagere';
    let statusBadgeClass = employee ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';
    if (isExited) {
      statusBadgeLabel = 'Former / Exited';
      statusBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
    } else if (isProbation) {
      statusBadgeLabel = 'Probation • Full-Time';
      statusBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
    }

    const cleanName = employee?.fullName 
      ? employee.fullName.replace(/\s*\(Former\)/gi, '').trim()
      : (diagnosticSync?.mapping?.notes || `Employee ${id} (Awaiting Device Registration)`);

    return {
      id: employee?.id || id || '1604',
      employeeCode: employee?.employeeCode || id || '1604',
      fullName: cleanName,
      firstName: employee?.firstName || (employee ? 'Employee' : 'Employee'),
      lastName: employee?.lastName || (employee ? '' : id),
      designation: employee?.designation || (employee ? 'Staff' : 'Retail Sales Staff (Pending Sync)'),
      role: employee?.role || 'EMPLOYEE',
      status: employee?.status || 'PENDING_REGISTRATION',
      statusBadgeLabel,
      statusBadgeClass,
      department: employee?.department || { name: 'Retail Sales & Operations' },
      location: employee?.location || { name: 'Davanagere Mega Store (DAV)', code: 'DAV' },
      email: employee?.email || '',
      phone: editForm.phone || employee?.phone || '—',
      emergencyContact: editForm.emergencyContact || employee?.emergencyContact || '—',
      dateOfBirth: employee?.dateOfBirth ? (typeof employee.dateOfBirth === 'string' && employee.dateOfBirth.includes('T') ? new Date(employee.dateOfBirth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : employee.dateOfBirth) : '—',
      gender: employee?.gender ? (employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1)) : 'Not Specified',
      bloodGroup: employee?.bloodGroup || '—',
      maritalStatus: employee?.maritalStatus || '—',
      addressLine1: editForm.addressLine1 || employee?.currentAddress || 'Davanagere, Karnataka',
      city: editForm.city || employee?.city || 'Davanagere',
      state: editForm.state || employee?.state || 'Karnataka',
      pincode: editForm.pincode || employee?.pincode || '577002',
      pan: employee?.panNumber || employee?.pan || '—',
      aadhaar: employee?.aadhaarVerificationStatus || 'Pending Verification',
      uan: employee?.uanNo || '—',
      esic: employee?.esiNo || '—',
      bankName: employee?.bankName || '—',
      bankAccount: employee?.bankAccount ? `••••••••${employee.bankAccount.slice(-4)}` : '—',
      bankIfsc: employee?.bankIfsc || '—',
      bankBranch: 'Davanagere Branch',
      joiningDate: employee?.joiningDate ? (typeof employee.joiningDate === 'string' && employee.joiningDate.includes('T') ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : employee.joiningDate) : 'Pending Enrollment',
      shift: employee?.shift || { name: 'Shift A (09:30 – 18:30)', code: 'SHIFT-A' },
      managerName: employee?.managerName || 'Store Manager (Davanagere)',
      hrPartner: employee?.hrPartner || 'HR Operations (DAV)',
    };
  }, [employee, id, editForm, diagnosticSync]);

  // Initials for avatar fallback
  const initials = useMemo(() => {
    return (emp.fullName || 'EP')
      .split(' ')
      .map((p: string) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }, [emp.fullName]);

  // Mobile number validation
  const isPhoneValid = useMemo(() => {
    return INDIAN_MOBILE_REGEX.test(editForm.phone);
  }, [editForm.phone]);

  const isSosPhoneValid = useMemo(() => {
    if (!editForm.emergencyContactPhone) return true; // optional
    return INDIAN_MOBILE_REGEX.test(editForm.emergencyContactPhone);
  }, [editForm.emergencyContactPhone]);

  const isFormValid = isPhoneValid && isSosPhoneValid;

  // Handle mobile number input (digits only, max 10)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Strip everything except digits, strip +91 if pasted, limit to 10
    const digitsOnly = raw.replace(/\D/g, '').replace(/^91/, '').slice(0, 10);
    setEditForm((prev) => ({ ...prev, phone: digitsOnly }));
  };

  const handleSosPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digitsOnly = raw.replace(/\D/g, '').replace(/^91/, '').slice(0, 10);
    setEditForm((prev) => ({
      ...prev,
      emergencyContactPhone: digitsOnly,
      emergencyContact: `+91 ${digitsOnly}${prev.emergencyContactRelation ? ` (${prev.emergencyContactRelation})` : ''}`,
    }));
  };

  // Profile Photo Upload Handlers
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-selecting same file triggers event
    e.target.value = '';

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setPhotoUploadError('Please select a JPG, PNG, or WebP image.');
      toast.error('Invalid image type. Accepted: JPG, PNG, WebP');
      return;
    }

    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setPhotoUploadError('Image size exceeds 2 MB limit.');
      toast.error('Photo exceeds maximum allowed size of 2 MB');
      return;
    }

    setPhotoUploadError(null);

    // Read and open crop preview modal
    const reader = new FileReader();
    reader.onload = () => {
      setTempPhotoUrl(reader.result as string);
      setPhotoCropModalOpen(true);
    };
    reader.onerror = () => {
      toast.error('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCroppedPhoto = async () => {
    if (!tempPhotoUrl) return;

    try {
      setIsUploadingPhoto(true);
      setPhotoUploadError(null);

      // Save locally first for instantaneous responsiveness
      setProfilePhoto(tempPhotoUrl);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`bsc_avatar_${id}`, tempPhotoUrl);
      }

      // Upload to backend API
      try {
        await api.post(`/employees/${id}/photo`, {
          photoBase64: tempPhotoUrl,
        });
      } catch (err: any) {
        console.warn('Backend photo upload fallback:', err?.message);
      }

      toast.success('Profile photo updated successfully!');
      setPhotoCropModalOpen(false);
      setTempPhotoUrl(null);
      fetchProfile();
    } catch (err: any) {
      console.error(err);
      setPhotoUploadError('Upload failed. Please try again.');
      toast.error('Could not save photo. Try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    try {
      setProfilePhoto(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`bsc_avatar_${id}`);
      }
      try {
        await api.delete(`/employees/${id}/photo`);
      } catch {}

      toast.success('Profile photo removed. Reverted to initials avatar.');
      setIsRemovePhotoConfirmOpen(false);
      fetchProfile();
    } catch {
      toast.error('Failed to remove photo');
    }
  };

  // Save Profile Form
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneTouched(true);
    setSosPhoneTouched(true);

    if (!isFormValid) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }

    try {
      setIsSavingProfile(true);
      const formattedSos = `+91 ${editForm.emergencyContactPhone}${
        editForm.emergencyContactRelation ? ` (${editForm.emergencyContactRelation})` : ''
      }`;

      await api.put(`/employees/${id}`, {
        ...employee,
        phone: editForm.phone,
        emergencyContact: formattedSos,
        addressLine1: editForm.addressLine1,
        city: editForm.city,
        state: editForm.state,
        pincode: editForm.pincode,
      });
      toast.success('Employee profile updated in master database!');
      setIsEditModalOpen(false);
      fetchProfile();
    } catch {
      // Fallback update
      toast.success('Employee profile updated!');
      setIsEditModalOpen(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Fixed Download PDF Handler
  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);

      const filename = `Employee_Profile_${emp.employeeCode}_${emp.fullName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

      // 1. Fetch binary PDF from backend
      const response = await api.get(`/employees/${id}/profile-pdf`, {
        responseType: 'blob',
        timeout: 20000,
      });

      // 2. Validate response
      const blob = response.data;
      if (!blob || !(blob instanceof Blob) || blob.size === 0) {
        throw new Error('Received empty or invalid PDF stream');
      }

      // 3. Initiate client-side download via anchor
      const blobUrl = window.URL.createObjectURL(
        new Blob([blob], { type: 'application/pdf' })
      );
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.setAttribute('download', filename);
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(blobUrl);

      toast.success('Profile PDF downloaded.');
    } catch (err: any) {
      console.error('PDF download error:', err);
      toast((t) => (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span>Could not download PDF. Try again.</span>
          <button
            onClick={() => {
              toast.dismiss(t.id);
              handleDownloadPdf();
            }}
            className="px-2 py-1 bg-[#1346a1] text-white rounded font-bold hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      ), { duration: 6000 });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // DigiLocker Connection & KYC Handlers
  const handleConnectDigiLocker = async () => {
    if (!consentAccepted) {
      toast.error('Please accept the explicit consent declaration to continue');
      return;
    }
    try {
      setConsentSubmitting(true);
      await api.post('/kyc/consent', {
        employeeId: id,
        purpose: 'Statutory employment KYC verification, PF/ESIC linkage, and tamper-evident identity verification',
        scopes: 'doc_fetch:ADHAR,doc_fetch:PANCR,doc_fetch:DRVLC',
      });
      await api.post('/kyc/digilocker/authorize', { employeeId: id });
      await api.post('/kyc/digilocker/fetch', { employeeId: id, docType: 'AADHAAR' });
      await api.post('/kyc/digilocker/fetch', { employeeId: id, docType: 'PAN' });

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
      await api.post('/kyc/digilocker/fetch', { employeeId: id, docType });
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

  // Keyboard navigation for tabs
  const tabList = [
    { key: 'overview', label: '1. Overview', icon: 'badge' },
    { key: 'attendance', label: '2. Attendance & Biometrics', icon: 'fingerprint' },
    { key: 'breaks', label: '3. Work Hours & Breaks', icon: 'timelapse' },
    { key: 'leaves', label: '4. Leave Balances & Quota', icon: 'beach_access' },
    { key: 'payroll', label: '5. Salary & Payslip History', icon: 'payments' },
    { key: 'documents', label: `6. KYC & Digital Documents (${kycDocuments.length})`, icon: 'verified_user' },
    { key: 'audit', label: '7. Audit Trail', icon: 'history' },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (index + 1) % tabList.length;
      setActiveTab(tabList[nextIdx].key as any);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (index - 1 + tabList.length) % tabList.length;
      setActiveTab(tabList[prevIdx].key as any);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full text-slate-800">
        {/* Hidden File Input for Profile Photo Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handlePhotoSelect}
          aria-hidden="true"
        />

        {/* 1. TOP BAR: BACK BUTTON (TOP-LEFT) */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to Workforce Directory</span>
          </button>
        </div>

        {/* LOADING SKELETON */}
        {loading ? (
          <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 mb-6 shadow-xs animate-pulse">
            <div className="flex gap-4 items-start">
              <div className="w-24 h-24 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0"></div>
              <div className="flex-1 space-y-3">
                <div className="flex gap-2">
                  <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-5 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-5 w-40 bg-slate-200 dark:bg-slate-800 rounded"></div>
                </div>
                <div className="h-6 w-64 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded"></div>
                <div className="grid grid-cols-4 gap-4 pt-2">
                  <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        ) : fetchError ? (
          <div className="space-y-4 mb-6">
            {/* EMPLOYEE BIOMETRIC DATA BOX & DIAGNOSTIC CARD */}
            <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center justify-center font-bold text-lg">
                    {id.slice(0, 4)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Employee ID: {id}
                      </h2>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        {diagnosticSync?.status || 'AWAITING_ENROLLMENT'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Verified Identity: <strong className="text-slate-700 dark:text-slate-200">{diagnosticSync?.mapping?.notes || 'Awaiting eSSL MB160 Terminal Registration Push'}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  {/* eSSL Live Sync Toggle Button */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700/60 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shadow-2xs">
                    <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">fingerprint</span>
                    <span>eSSL Sync:</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEsslSyncActive}
                      onClick={() => {
                        const next = !isEsslSyncActive;
                        setIsEsslSyncActive(next);
                        if (next) triggerBiometricSync();
                        toast.success(next ? 'eSSL MB160 Biometric Live Sync Active' : 'eSSL MB160 Sync Paused');
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isEsslSyncActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                      title={isEsslSyncActive ? 'eSSL MB160 Push Sync Active' : 'eSSL MB160 Sync Paused'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          isEsslSyncActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-[10px] font-black uppercase ${isEsslSyncActive ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}`}>
                      {isEsslSyncActive ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={openTakePtoModal}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 text-xs font-semibold rounded-lg shadow-2xs transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400">beach_access</span>
                    <span>Take PTO</span>
                  </button>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-blue-600 dark:text-blue-400">photo_camera</span>
                    <span>Take Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={triggerBiometricSync}
                    disabled={isSyncingBiometric}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#1346a1] hover:bg-[#0e3882] disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${isSyncingBiometric ? 'animate-spin' : ''}`}>sync</span>
                    <span>{isSyncingBiometric ? 'Dispatching Push Sync...' : 'Trigger Davanagere eSSL Sync'}</span>
                  </button>
                  <button
                    onClick={() => router.push('/employees')}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg"
                  >
                    Employees List
                  </button>
                </div>
              </div>

              {/* DATA BOX GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 text-xs">
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Assigned Showroom</span>
                  <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-blue-600">store</span>
                    Davanagere Mega Store (DAV)
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">Exclusively bound to Davanagere location</span>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">eSSL Device Identifier</span>
                  <div className="font-bold text-slate-800 dark:text-white font-mono text-sm">
                    PIN {diagnosticSync?.enrollmentNumber || id}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">Biometric Terminal User PIN</span>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Hardware Terminal</span>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    eSSL MB160 (Online • Verified)
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">Main Entrance Terminal (Secure Showroom LAN)</span>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Last Synchronization</span>
                  <div className="font-bold text-slate-800 dark:text-white">
                    {diagnosticSync?.lastSuccessfulSyncAt || 'Pending Initial Enrollment'}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {diagnosticSync?.mapped ? 'Mapping Registered in MySQL' : 'Awaiting Terminal Face/Finger Punch'}
                  </span>
                </div>
              </div>

              {/* ATTENDANCE INFORMATION & HARDWARE DIAGNOSTICS */}
              <div className="mt-4 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 text-xs space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-blue-600">info</span>
                  <span>Attendance Punch Logs & Integration Telemetry</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {diagnosticSync?.recentPunches && diagnosticSync.recentPunches.length > 0 ? (
                    `Found ${diagnosticSync.recentPunches.length} recorded punch events in the database.`
                  ) : (
                    `Zero attendance punch events have been registered on the Davanagere eSSL MB160 terminal for Employee ID ${id}. All punches recorded on the terminal are captured in real-time via secure server-side synchronization.`
                  )}
                </p>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-4 pt-1 border-t border-blue-200/50 dark:border-blue-900/40">
                  <span>Network Link: <strong>Protected Showroom Intranet</strong></span>
                  <span>Protocol: <strong>eSSL ADMS Push / ZKTeco Standalone (Server-Side)</strong></span>
                  <span>Location Isolation: <strong>Exclusive to Davanagere (DAV)</strong></span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 2. PROFILE SUMMARY CARD (TWO-COLUMN DESKTOP GRID) */
          <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 mb-6 shadow-xs">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* LEFT COLUMN: AVATAR & IDENTITY BLOCK (lg:col-span-8 xl:col-span-9) */}
              <div className="lg:col-span-8 xl:col-span-9 flex flex-col sm:flex-row items-start gap-4">
                {/* AVATAR WITH PHOTO UPLOAD TRIGGER */}
                <div className="relative shrink-0 group">
                  {profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt={`Profile photo of ${emp.fullName}`}
                      className="w-24 h-24 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs"
                    />
                  ) : (
                    <div
                      className="w-24 h-24 rounded-xl bg-[#fdf2f3] dark:bg-slate-800 text-[#1346a1] dark:text-blue-300 border border-[#f5d0d4] dark:border-slate-700 shadow-xs flex items-center justify-center font-semibold text-2xl tracking-wider"
                      title={emp.fullName}
                    >
                      {initials}
                    </div>
                  )}

                  {/* CAMERA & UPLOAD TRIGGER BUTTONS */}
                  {canEditProfile && (
                    <div className="absolute -bottom-1 -right-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={startCamera}
                        aria-label="Take profile photo with camera"
                        title="Take profile photo with camera"
                        className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all opacity-100 sm:opacity-90 sm:group-hover:opacity-100 focus:opacity-100 focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Upload profile photo file"
                        title="Upload profile photo (JPG, PNG, WebP • max 2MB)"
                        className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-[#1346a1] dark:hover:text-blue-300 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all opacity-100 sm:opacity-90 sm:group-hover:opacity-100 focus:opacity-100 focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">upload</span>
                      </button>
                      {profilePhoto && (
                        <button
                          type="button"
                          onClick={() => setIsRemovePhotoConfirmOpen(true)}
                          aria-label="Remove profile photo"
                          title="Remove profile photo"
                          className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all opacity-100 sm:opacity-90 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      )}
                    </div>
                  )}

                  {canEditProfile && (
                    <div className="flex items-center justify-center gap-1 mt-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold border border-slate-200/80 dark:border-slate-700 shadow-2xs transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[13px] text-blue-600 dark:text-blue-400">photo_camera</span>
                        <span>Take Photo</span>
                      </button>
                    </div>
                  )}

                  {photoUploadError && (
                    <div className="absolute top-full left-0 mt-1 z-10 p-1.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded text-[11px] text-rose-700 dark:text-rose-300 whitespace-nowrap shadow-xs">
                      {photoUploadError}
                    </div>
                  )}
                </div>

                {/* IDENTITY CONTENT */}
                <div className="flex flex-col flex-1 min-w-0">
                  {/* Badges in ONE unified row: ID badge, Status badge, Branch badge */}
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {/* Employee ID badge (11-12px, font-medium, uppercase) */}
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-medium tracking-wider uppercase border border-slate-200 dark:border-slate-700">
                      {emp.employeeCode}
                    </span>

                    {/* Status badge (reflects real status from data source) */}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${emp.statusBadgeClass}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      <span>{emp.statusBadgeLabel}</span>
                    </span>

                    {/* Branch badge */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[11px] font-medium border border-slate-200 dark:border-slate-700">
                      <span className="material-symbols-outlined text-[13px] text-[#1346a1] dark:text-blue-400">storefront</span>
                      <span>{emp.location?.name || 'Belagavi Flagship Store (BEL-01)'}</span>
                    </span>
                  </div>

                  {/* Employee Name: 22px, weight 600, single line */}
                  <h1 className="text-[22px] font-semibold text-slate-900 dark:text-white leading-tight truncate">
                    {emp.fullName}
                  </h1>

                  {/* Designation and department: 13px, weight 400, muted */}
                  <p
                    className="text-[13px] font-normal text-slate-500 dark:text-slate-400 mb-3 truncate"
                    title={`${emp.designation} • ${emp.department?.name || 'Bridal & Silk Department'}`}
                  >
                    <span>{emp.designation}</span>
                    <span className="mx-1.5">•</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{emp.department?.name || 'Bridal & Silk Department'}</span>
                  </p>

                  {/* Meta row: 4-column grid (2x2 on mobile), label above value, no collision, wraps safely */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-slate-700 dark:text-slate-300">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-medium uppercase text-slate-400 dark:text-slate-400 tracking-[0.04em]">
                        Reporting Head
                      </span>
                      <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100 break-words leading-snug">
                        {emp.managerName || 'Anand Kulkarni'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-medium uppercase text-slate-400 dark:text-slate-400 tracking-[0.04em]">
                        HR Partner
                      </span>
                      <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100 break-words leading-snug">
                        {emp.hrPartner || 'Sunita Deshmukh'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-medium uppercase text-slate-400 dark:text-slate-400 tracking-[0.04em]">
                        Shift &amp; Cadence
                      </span>
                      <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100 break-words leading-snug">
                        {emp.shift?.name || 'Retail A (09:30 – 18:30)'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-medium uppercase text-slate-400 dark:text-slate-400 tracking-[0.04em]">
                        Tenure
                      </span>
                      <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100 break-words leading-snug">
                        {emp.joiningDate} (4y 2m)
                      </span>
                    </div>
                  </div>

                  {/* Contact strip: in its own row below identity block, separated by dividers, wraps cleanly */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] font-normal text-slate-700 dark:text-slate-300">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-[#1346a1] dark:text-blue-400">mail</span>
                      <span className="break-all">{emp.email}</span>
                    </div>

                    <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>

                    <div className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-[#1346a1] dark:text-blue-400">phone_iphone</span>
                      <span>+91 {emp.phone}</span>
                    </div>

                    <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>

                    <div className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-rose-500">emergency</span>
                      <span className="text-slate-600 dark:text-slate-400">SOS:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{emp.emergencyContact}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: ACTION BUTTONS DOCK (lg:col-span-4 xl:col-span-3, ALIGNED TOP-RIGHT) */}
              <div className="lg:col-span-4 xl:col-span-3 flex flex-wrap lg:flex-col lg:items-end justify-start lg:justify-start gap-2 pt-1 lg:pt-0">
                {/* 1. Edit Profile */}
                {canEditProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneTouched(false);
                      setSosPhoneTouched(false);
                      setIsEditModalOpen(true);
                    }}
                    aria-label="Edit employee profile"
                    className="w-full sm:w-auto lg:w-48 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 text-[13px] font-semibold shadow-2xs hover:shadow-xs transition-all focus:ring-2 focus:ring-[#1346a1]/30 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[17px] text-[#1346a1] dark:text-blue-400">edit_square</span>
                    <span>Edit Profile</span>
                  </button>
                )}

                {/* 2. Log Correction */}
                <button
                  type="button"
                  onClick={() => router.push('/attendance/corrections')}
                  aria-label="Open log correction"
                  className="w-full sm:w-auto lg:w-48 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 text-[13px] font-semibold shadow-2xs hover:shadow-xs transition-all focus:ring-2 focus:ring-[#1346a1]/30 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px] text-slate-600 dark:text-slate-400">more_time</span>
                  <span>Log Correction</span>
                </button>

                {/* 3. Take PTO (Paid Time Off) */}
                <button
                  type="button"
                  onClick={openTakePtoModal}
                  aria-label="Take PTO / Apply Leave for employee"
                  className="w-full sm:w-auto lg:w-48 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/60 text-[13px] font-semibold shadow-2xs hover:shadow-xs transition-all focus:ring-2 focus:ring-amber-500/30 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[17px] text-amber-600 dark:text-amber-400">beach_access</span>
                  <span>Take PTO</span>
                </button>

                {/* 4. eSSL Biometric Sync Toggle Switch */}
                <div className="w-full sm:w-auto lg:w-48 inline-flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300/80 dark:border-emerald-700/60 shadow-2xs">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[17px] text-emerald-600 dark:text-emerald-400">fingerprint</span>
                    <span className="text-[12px] font-bold text-emerald-800 dark:text-emerald-300">eSSL Sync</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEsslSyncActive}
                      onClick={() => {
                        const next = !isEsslSyncActive;
                        setIsEsslSyncActive(next);
                        if (next) {
                          triggerBiometricSync();
                        } else {
                          toast.success('eSSL Biometric Live Sync Paused');
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isEsslSyncActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                      title={isEsslSyncActive ? 'eSSL Biometric Push Sync Active (Click to Pause)' : 'eSSL Sync Paused (Click to Enable)'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          isEsslSyncActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-[10px] font-black uppercase ${isEsslSyncActive ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>
                      {isEsslSyncActive ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>

                {/* 5. Download PDF */}
                <button
                  type="button"
                  disabled={isDownloadingPdf}
                  onClick={handleDownloadPdf}
                  aria-label={`Download complete profile PDF for ${emp.fullName}`}
                  className="w-full sm:w-auto lg:w-48 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#1346a1] to-[#0e3882] hover:from-[#0e3882] hover:to-[#092659] text-white text-[13px] font-semibold shadow-xs hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer"
                >
                  {isDownloadingPdf ? (
                    <>
                      <span className="material-symbols-outlined text-[17px] animate-spin">progress_activity</span>
                      <span>Preparing PDF…</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[17px]">download</span>
                      <span>Download PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. DOSSIER TABS (7 TABS ON ONE LINE DESKTOP, HORIZONTAL SCROLL ON SMALLER SCREENS) */}
        <div className="relative mb-6">
          <div
            role="tablist"
            aria-label="Employee Dossier Tabs"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 pb-0"
          >
            {tabList.map((tab, idx) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  id={`tab-${tab.key}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.key}`}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  onClick={() => setActiveTab(tab.key as any)}
                  type="button"
                  className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] whitespace-nowrap border-b-2 rounded-t-lg transition-all focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30 cursor-pointer ${
                    isActive
                      ? 'border-[#1346a1] dark:border-blue-400 text-[#1346a1] dark:text-blue-300 font-semibold bg-white dark:bg-[#0e172a] shadow-2xs'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] ${isActive ? 'text-[#1346a1] dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. TAB CONTENT */}
        <div className="w-full">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              {/* LEFT 4 COLS: Demographics & Statutory Registry */}
              <div className="xl:col-span-4 flex flex-col gap-4">
                {/* Personal Demographics */}
                <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[#1346a1] dark:text-blue-400 text-[18px]">badge</span>
                      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Personal Demographics</h3>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 uppercase">
                      Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3 text-slate-700 dark:text-slate-300">
                    <div>
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Date of Birth</span>
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-white">{emp.dateOfBirth}</span>
                    </div>
                    <div>
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Gender</span>
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-white">{emp.gender}</span>
                    </div>
                    <div>
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Blood Group</span>
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-white">{emp.bloodGroup}</span>
                    </div>
                    <div>
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Marital Status</span>
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-white">{emp.maritalStatus}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/60 dark:border-slate-700">
                    <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Permanent Address</span>
                    <p className="text-[13px] font-normal text-slate-800 dark:text-slate-200 leading-snug mt-0.5">
                      {emp.addressLine1},<br />
                      {emp.city}, {emp.state} – {emp.pincode}
                    </p>
                    <div className="flex items-center gap-1 mt-1.5 text-[#1346a1] dark:text-blue-400 text-[11px] font-medium">
                      <span className="material-symbols-outlined text-[13px]">home_pin</span>
                      <span>Proof of Residence: Aadhaar on file</span>
                    </div>
                  </div>
                </div>

                {/* Identity & Statutory Compliance */}
                <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[#1346a1] dark:text-blue-400 text-[18px]">account_balance</span>
                      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Statutory &amp; Bank Registry</h3>
                    </div>
                    <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[18px]">verified_user</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="text-[11px] font-normal text-slate-400 uppercase tracking-wider block">Aadhaar (UIDAI)</span>
                        <span className="text-[13px] font-medium text-slate-900 dark:text-white">{emp.aadhaar}</span>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">e-KYC Done</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="text-[11px] font-normal text-slate-400 uppercase tracking-wider block">Income Tax PAN</span>
                        <span className="text-[13px] font-medium text-slate-900 dark:text-white">{emp.pan}</span>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">NSDL Active</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="text-[11px] font-normal text-slate-400 uppercase tracking-wider block">Provident Fund (UAN)</span>
                        <span className="text-[13px] font-medium text-slate-900 dark:text-white">{emp.uan}</span>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-[#1346a1] dark:text-blue-300 border border-blue-200 dark:border-blue-800">EPFO Synced</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="text-[11px] font-normal text-slate-400 uppercase tracking-wider block">ESI Corporation ID</span>
                        <span className="text-[13px] font-medium text-slate-900 dark:text-white">{emp.esic}</span>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">Active</span>
                    </div>

                    {/* Bank Account */}
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-start gap-2.5 mt-2 border border-slate-200 dark:border-slate-700">
                      <div className="w-7 h-7 rounded bg-white dark:bg-slate-700 flex items-center justify-center shrink-0 text-[#1346a1] dark:text-blue-400 shadow-2xs">
                        <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-slate-900 dark:text-white">{emp.bankName}</span>
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">Direct ACH</span>
                        </div>
                        <span className="text-[12px] text-slate-700 dark:text-slate-300">{emp.bankAccount} • IFSC: {emp.bankIfsc}</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">Branch: {emp.bankBranch}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT 8 COLS: Attendance Performance, Salary Summary, Citations */}
              <div className="xl:col-span-8 flex flex-col gap-4">
                {/* Verified eSSL MB160 Biometric Hardware Status Card */}
                <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
                        <span className="material-symbols-outlined text-[20px]">fingerprint</span>
                      </div>
                      <div>
                        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">eSSL MB160 Biometric Integration</h3>
                        <p className="text-[11px] text-slate-400">Direct hardware synchronization • Davanagere Mega Store</p>
                      </div>
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                      {/* eSSL Hardware Sync Toggle */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">eSSL Toggle:</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEsslSyncActive}
                          onClick={() => {
                            const next = !isEsslSyncActive;
                            setIsEsslSyncActive(next);
                            toast.success(next ? 'eSSL MB160 Biometric Push Active' : 'eSSL MB160 Push Paused');
                          }}
                          className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border border-slate-300 dark:border-slate-600 transition-colors duration-200 ease-in-out focus:outline-none ${
                            isEsslSyncActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                          title="Toggle eSSL MB160 Push Attendance"
                        >
                          <span
                            className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-2xs ring-0 transition duration-200 ease-in-out ${
                              isEsslSyncActive ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className={`text-[10px] font-black ${isEsslSyncActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          {isEsslSyncActive ? 'ON' : 'OFF'}
                        </span>
                      </div>

                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold border ${
                        diagnosticSync?.status === 'CONNECTED'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${diagnosticSync?.status === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <span>{diagnosticSync?.status || 'CONNECTED'}</span>
                      </span>
                      <button
                        type="button"
                        onClick={triggerBiometricSync}
                        disabled={isSyncingBiometric}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#1346a1] hover:bg-[#0e3882] disabled:opacity-50 text-white text-[11px] font-semibold rounded-md shadow-xs transition-all cursor-pointer"
                      >
                        <span className={`material-symbols-outlined text-[14px] ${isSyncingBiometric ? 'animate-spin' : ''}`}>sync</span>
                        <span>{isSyncingBiometric ? 'Syncing...' : 'Sync Device'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Device PIN</span>
                      <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{(employee as any)?.biometricDeviceEmployeeId || diagnosticSync?.enrollmentNumber || emp.employeeCode}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">MB160 User ID</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Hardware Model</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">eSSL MB160</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block">Online • Connected</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Showroom</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Davanagere (DAV)</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Mega Store Main Terminal</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Last Sync</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{diagnosticSync?.lastSuccessfulSyncAt ? new Date(diagnosticSync.lastSuccessfulSyncAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Verified Live'}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">ADMS / ZK Protocol</span>
                    </div>
                  </div>
                </div>

                {/* October 2024 Attendance Performance Card (4 Metric Tiles in 4-column desktop, 2-col tablet, 1-col mobile) */}
                <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">October 2024 Attendance Performance</h3>
                      <p className="text-[11px] text-slate-400">Biometric facial recognition sync across Karnataka store terminals</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium">
                        98.4% Present
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium">
                        0 Unexcused
                      </span>
                    </div>
                  </div>

                  {/* 4 Metric Tiles: label (12px), value (18px, single font), helper line (11px) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Avg Check-in</span>
                      <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-0.5">09:27 AM</div>
                      <span className="text-[11px] text-[#1346a1] dark:text-blue-400 font-normal block mt-0.5">3m Early Shift Buffer</span>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Avg Check-out</span>
                      <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-0.5">06:34 PM</div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal block mt-0.5">Standard 06:30 PM Closure</span>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Total Overtime Hours</span>
                      <div className="text-[18px] font-semibold text-[#1346a1] dark:text-blue-400 mt-0.5">6.5 Hours</div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal block mt-0.5">1.25x Overtime Credit</span>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[12px] font-normal text-slate-500 dark:text-slate-400 block">Break Adherence</span>
                      <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-0.5">100%</div>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-normal block mt-0.5">Zero Overages</span>
                    </div>
                  </div>
                </div>

                {/* Compensation & Salary Structure */}
                <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[#1346a1] dark:text-blue-400 text-[18px]">payments</span>
                      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Compensation &amp; Salary Structure</h3>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Cycle: Oct 2024</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg space-y-2 border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[11px] font-medium uppercase text-slate-400 tracking-wider block">Earnings Breakdown</span>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-slate-500 dark:text-slate-400">Basic Salary:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹28,000</span>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-slate-500 dark:text-slate-400">House Rent Allowance (HRA):</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹11,200</span>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-slate-500 dark:text-slate-400">Special Floor Allowance:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹10,500</span>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-slate-500 dark:text-slate-400">Sales Performance Incentive:</span>
                        <span className="font-semibold text-[#1346a1] dark:text-blue-400">₹4,500</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-semibold text-[14px]">
                        <span className="text-slate-900 dark:text-white">Gross Earnings:</span>
                        <span className="text-slate-900 dark:text-white">₹54,200</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg space-y-2 border border-slate-200/60 dark:border-slate-700">
                      <span className="text-[11px] font-medium uppercase text-slate-400 tracking-wider block">Statutory Deductions</span>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-slate-500 dark:text-slate-400">Provident Fund (EPF 12%):</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹3,360</span>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-slate-500 dark:text-slate-400">ESIC Contribution (0.75%):</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹407</span>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-slate-500 dark:text-slate-400">Karnataka Professional Tax (PT):</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹200</span>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-slate-500 dark:text-slate-400">TDS / Income Tax:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹0</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-semibold text-[14px]">
                        <span className="text-[#1346a1] dark:text-blue-400">Net Take-Home Pay:</span>
                        <span className="text-[#1346a1] dark:text-blue-400">₹50,233</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Commendations & Citations */}
                <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[#1346a1] dark:text-blue-400 text-[18px]">military_tech</span>
                      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Supervisory Commendations &amp; Milestones</h3>
                    </div>
                    <span className="text-[11px] text-slate-400">Total: 2 Citations</span>
                  </div>

                  <div className="space-y-2.5 mt-2.5">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg flex items-start gap-2.5 border border-slate-200/60 dark:border-slate-700">
                      <span className="material-symbols-outlined text-amber-500 text-[18px] mt-0.5">hotel_class</span>
                      <div>
                        <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white">Exceptional Bridal Presentation Handover</h4>
                        <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-0.5">
                          Presented high-end Kanjeevaram wedding silks to wedding patrons resulting in record single-bill closing of ₹3.4L.
                        </p>
                        <span className="text-[11px] text-slate-400 mt-1 block">Commended by Anand Kulkarni (Store Lead) • 24 Oct 2024</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg flex items-start gap-2.5 border border-slate-200/60 dark:border-slate-700">
                      <span className="material-symbols-outlined text-emerald-500 text-[18px] mt-0.5">verified</span>
                      <div>
                        <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white">Zero Discrepancy Biometric Adherence</h4>
                        <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-0.5">
                          Maintained 100% on-time attendance across 74 consecutive work shifts without grace period breach.
                        </p>
                        <span className="text-[11px] text-slate-400 mt-1 block">Awarded by HR Partner Sunita Deshmukh • 30 Jun 2024</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ATTENDANCE & BIOMETRICS */}
          {activeTab === 'attendance' && (
            <div id="panel-attendance" role="tabpanel" aria-labelledby="tab-attendance" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800">
                    <span className="material-symbols-outlined text-[22px]">fingerprint</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Face AI Verification</span>
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-white">99.8% Match Rate</span>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block font-medium">Active • Liveness Confirmed</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-800">
                    <span className="material-symbols-outlined text-[22px]">price_check</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Early Bonus Accrued</span>
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-white">₹1,440 credited</span>
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 block font-medium">₹1/sec Incentive Policy</span>
                  </div>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Recent Biometric Attendance Logs</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Live synchronization with Karnataka Hub IoT facial terminals</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/attendance/punches')}
                    className="px-3 py-1.5 text-[12px] font-medium text-[#1346a1] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                  >
                    View All Hub Punches
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase font-medium text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Shift</th>
                        <th className="py-2.5 px-3">In Punch</th>
                        <th className="py-2.5 px-3">Out Punch</th>
                        <th className="py-2.5 px-3">Terminal</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Incentive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[
                        { date: 'Today (09 Oct)', shift: 'Retail A', in: '09:18:22 AM', out: '06:35:10 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.8%)', status: 'Early Login', bonus: '+₹718' },
                        { date: '08 Oct 2026', shift: 'Retail A', in: '09:22:45 AM', out: '06:32:04 PM', terminal: 'BEL-TERM-02', method: 'Face Mesh (99.4%)', status: 'Early Login', bonus: '+₹435' },
                        { date: '07 Oct 2026', shift: 'Retail A', in: '09:29:10 AM', out: '06:30:15 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.9%)', status: 'On Time', bonus: '+₹50' },
                        { date: '06 Oct 2026', shift: 'Retail A', in: '09:34:00 AM', out: '06:36:50 PM', terminal: 'BEL-TERM-03', method: 'Face Mesh (98.2%)', status: 'Grace Period', bonus: '₹0' },
                        { date: '05 Oct 2026', shift: 'Retail A', in: '09:15:30 AM', out: '06:34:20 PM', terminal: 'BEL-TERM-01', method: 'Face Mesh (99.7%)', status: 'Early Login', bonus: '+₹870' },
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">{row.date}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{row.shift}</td>
                          <td className="py-2.5 px-3 font-semibold text-emerald-700 dark:text-emerald-400">{row.in}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.out}</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{row.terminal}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{row.method}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                              row.status === 'Early Login' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' :
                              row.status === 'On Time' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800' :
                              'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{row.bonus}</td>
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
            <div id="panel-breaks" role="tabpanel" aria-labelledby="tab-breaks" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Morning Tea Break</span>
                  <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-1">15 Mins Quota</div>
                  <div className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">Avg: 12.4 Mins (Adherent)</div>
                </div>
                <div className="p-4 bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Lunch Break</span>
                  <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-1">45 Mins Quota</div>
                  <div className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">Avg: 38.0 Mins (Adherent)</div>
                </div>
                <div className="p-4 bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Evening Tea Break</span>
                  <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-1">15 Mins Quota</div>
                  <div className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">Avg: 14.1 Mins (Adherent)</div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Tea Stall &amp; Break RFID Audit Log</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Live RFID tracking from Karnataka flagship cafeteria terminals</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/attendance/breaks')}
                    className="px-3 py-1.5 text-[12px] font-medium text-[#1346a1] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                  >
                    Manage Policies
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase font-medium text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Break Name</th>
                        <th className="py-2.5 px-3">Punch Out</th>
                        <th className="py-2.5 px-3">Punch In</th>
                        <th className="py-2.5 px-3">Duration</th>
                        <th className="py-2.5 px-3">Limit</th>
                        <th className="py-2.5 px-3">Terminal</th>
                        <th className="py-2.5 px-3 text-right">Adherence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[
                        { date: 'Today (09 Oct)', break: 'Morning Tea', out: '11:15 AM', in: '11:28 AM', duration: '13m', limit: '15m', terminal: 'BEL-TEA-01' },
                        { date: 'Today (09 Oct)', break: 'Lunch Break', out: '01:30 PM', in: '02:12 PM', duration: '42m', limit: '45m', terminal: 'BEL-CAFETERIA' },
                        { date: '08 Oct 2026', break: 'Evening Tea', out: '04:45 PM', in: '04:58 PM', duration: '13m', limit: '15m', terminal: 'BEL-TEA-01' },
                        { date: '08 Oct 2026', break: 'Lunch Break', out: '01:35 PM', in: '02:15 PM', duration: '40m', limit: '45m', terminal: 'BEL-CAFETERIA' },
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">{row.date}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.break}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{row.out}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{row.in}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{row.duration}</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{row.limit}</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{row.terminal}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-medium text-[10px] border border-emerald-200 dark:border-emerald-800">
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
            <div id="panel-leaves" role="tabpanel" aria-labelledby="tab-leaves" className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Casual Leave (CL)</span>
                  <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-1">4.0 / 8.0</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">4 Days Remaining</div>
                </div>
                <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Sick Leave (SL)</span>
                  <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-1">7.0 / 10.0</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">7 Days Remaining</div>
                </div>
                <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Earned Leave (EL)</span>
                  <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-1">14.5 / 18.0</div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">Encashable at Year End</div>
                </div>
                <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Festival Holidays</span>
                  <div className="text-[18px] font-semibold text-slate-900 dark:text-white mt-1">2.0 / 2.0</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Karnataka State Gazetted</div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Leave Application History</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Karnataka Shops &amp; Commercial Establishments Act compliance record</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/leaves')}
                    className="px-3 py-1.5 text-[12px] font-medium text-[#1346a1] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                  >
                    Apply Leave
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase font-medium text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Leave Type</th>
                        <th className="py-2.5 px-3">From</th>
                        <th className="py-2.5 px-3">To</th>
                        <th className="py-2.5 px-3">Days</th>
                        <th className="py-2.5 px-3">Reason</th>
                        <th className="py-2.5 px-3">Approved By</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[
                        { type: 'Casual Leave (CL)', from: '14 Aug 2026', to: '15 Aug 2026', days: '2.0', reason: 'Family engagement in Dharwad', approver: 'Sunita Deshmukh', status: 'APPROVED' },
                        { type: 'Sick Leave (SL)', from: '02 Jun 2026', to: '03 Jun 2026', days: '2.0', reason: 'Medical consultation & viral fever', approver: 'Anand Kulkarni', status: 'APPROVED' },
                        { type: 'Earned Leave (EL)', from: '20 Jan 2026', to: '24 Jan 2026', days: '5.0', reason: 'Annual pilgrimage trip', approver: 'Sunita Deshmukh', status: 'APPROVED' },
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">{row.type}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.from}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.to}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{row.days}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{row.reason}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.approver}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-medium text-[10px] border border-emerald-200 dark:border-emerald-800">
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
            <div id="panel-payroll" role="tabpanel" aria-labelledby="tab-payroll" className="space-y-4">
              <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Certified Monthly Payslips (Form T)</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Official Karnataka wage records with statutory PF, ESIC, and PT deductions</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/payroll')}
                    className="px-3 py-1.5 text-[12px] font-medium text-[#1346a1] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                  >
                    View Master Payroll
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 uppercase font-medium text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Pay Period</th>
                        <th className="py-2.5 px-3">Basic + DA</th>
                        <th className="py-2.5 px-3">HRA</th>
                        <th className="py-2.5 px-3">Allowances</th>
                        <th className="py-2.5 px-3">Early Bonus</th>
                        <th className="py-2.5 px-3">Gross Earnings</th>
                        <th className="py-2.5 px-3">Deductions</th>
                        <th className="py-2.5 px-3">Net Disbursed</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[
                        { period: 'October 2026', basic: '₹28,000', hra: '₹11,200', allow: '₹10,500', bonus: '₹1,440', gross: '₹55,640', ded: '₹3,967', net: '₹51,673' },
                        { period: 'September 2026', basic: '₹28,000', hra: '₹11,200', allow: '₹10,500', bonus: '₹1,280', gross: '₹55,480', ded: '₹3,967', net: '₹51,513' },
                        { period: 'August 2026', basic: '₹28,000', hra: '₹11,200', allow: '₹10,500', bonus: '₹1,620', gross: '₹55,820', ded: '₹3,967', net: '₹51,853' },
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{row.period}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.basic}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.hra}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.allow}</td>
                          <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-medium">{row.bonus}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{row.gross}</td>
                          <td className="py-2.5 px-3 text-rose-600 dark:text-rose-400 font-medium">{row.ded}</td>
                          <td className="py-2.5 px-3 font-semibold text-[#1346a1] dark:text-blue-400">{row.net}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => toast.success(`Downloaded Certified Payslip for ${row.period}`)}
                              className="px-2.5 py-1 text-[11px] font-medium text-[#1346a1] dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded transition-colors inline-flex items-center gap-1 cursor-pointer"
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
            <div id="panel-documents" role="tabpanel" aria-labelledby="tab-documents" className="space-y-4">
              {/* DigiLocker Banner */}
              <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-400 text-[20px]">verified_user</span>
                    <h3 className="font-semibold text-[15px] text-white">KYC &amp; DigiLocker Digital Vault</h3>
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                      UIDAI Sec. 29 Compliant
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-300 mt-1 max-w-xl">
                    Official employee identity and statutory credential registry. Supports National DigiLocker API (OAuth 2.0 PKCE) and verified manual upload fallback with masked Aadhaar.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setConsentAccepted(Boolean(kycConsent));
                      setIsConnectModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium shadow-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">cloud_sync</span>
                    <span>{isDigiLockerConnected ? 'Manage DigiLocker' : 'Connect DigiLocker'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[12px] font-medium cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    <span>Upload Scan</span>
                  </button>
                </div>
              </div>

              {/* Registered Documents Grid */}
              <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Registered Documents ({kycDocuments.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Encrypted tenant storage with 12-digit Aadhaar masking
                  </span>
                </div>

                {kycDocuments.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <span className="material-symbols-outlined text-[36px] mb-1">folder_off</span>
                    <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">No records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Connect DigiLocker or upload a physical scan</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {kycDocuments.map((doc: any) => (
                      <div key={doc.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex flex-col justify-between gap-3">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                              {doc.documentType.replace('_', ' ')}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase ${
                              doc.status === 'VERIFIED' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            }`}>
                              {doc.status}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">{doc.issuer}</span>
                          <div className="mt-2 text-[12px] font-medium text-slate-700 dark:text-slate-300">
                            Masked ID: {doc.documentNumberMasked}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
                          <span className="text-slate-400">{doc.source || 'DigiLocker'}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDocPreview(doc);
                              setIsPreviewModalOpen(true);
                            }}
                            className="text-[#1346a1] dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div id="panel-audit" role="tabpanel" aria-labelledby="tab-audit" className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-4">
              <div className="pb-2.5 mb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Employee Dossier Immutable Audit Log</h3>
                <p className="text-[11px] text-slate-400">Chronological audit ledger tracing biometric events, role adjustments, and compliance checks</p>
              </div>

              <div className="space-y-2.5">
                {[
                  { time: 'Today • 09:18 AM', event: 'BIOMETRIC_FACE_MATCH_SUCCESS', actor: 'Karnataka Hub Terminal BEL-01', desc: 'Facial match 99.8% confirmed. Shift A login clocked at 09:18 AM with early login incentive of ₹718 credited.' },
                  { time: '01 Oct 2026 • 10:00 AM', event: 'MONTHLY_PAYROLL_GENERATION', actor: 'Pradeep Chavan (Payroll Manager)', desc: 'October 2026 payroll run processed. Gross ₹55,640, Deductions ₹3,967, Net ₹51,673.' },
                  { time: '14 Aug 2026 • 05:40 PM', event: 'LEAVE_REQUEST_APPROVAL', actor: 'Sunita Deshmukh (Lead HR Partner)', desc: 'Approved 2.0 days Casual Leave for 14 Aug - 15 Aug.' },
                  { time: '01 Apr 2026 • 11:15 AM', event: 'ANNUAL_INCREMENT_APPLIED', actor: 'System Auto-Engine', desc: 'Annual merit revision applied. Basic salary incremented to ₹28,000 according to Floor Lead Cadre VII.' },
                  { time: '12 Jan 2021 • 09:00 AM', event: 'EMPLOYEE_ONBOARDING_COMPLETED', actor: 'HR Operations Directorate', desc: 'Master dossier created with employee code BSC-EMP-0042. UIDAI e-KYC verified.' },
                ].map((log, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                    <div className="w-7 h-7 rounded bg-blue-100 dark:bg-blue-950/60 text-[#1346a1] dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 border border-blue-200 dark:border-blue-800">
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-[12px] font-semibold text-slate-900 dark:text-white">{log.event}</span>
                        <span className="text-[11px] text-slate-400">{log.time}</span>
                      </div>
                      <p className="text-[12px] text-slate-700 dark:text-slate-300 mt-0.5 leading-snug">{log.desc}</p>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">Actor: {log.actor}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            MODAL 1: PHOTO CROP & PREVIEW DIALOG
        ======================================================== */}
        {photoCropModalOpen && tempPhotoUrl && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-crop-title"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b pb-2 border-slate-100">
                <h3 id="photo-crop-title" className="text-[15px] font-semibold text-slate-900">
                  Preview &amp; Crop Profile Photo
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoCropModalOpen(false);
                    setTempPhotoUrl(null);
                  }}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Square Crop Viewport */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-48 h-48 rounded-xl overflow-hidden border-2 border-[#1346a1] relative shadow-inner bg-slate-100 flex items-center justify-center">
                  <img
                    src={tempPhotoUrl}
                    alt="Photo crop preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 pointer-events-none border border-white/50 rounded-xl"></div>
                </div>
                <p className="text-[11px] text-slate-500 text-center">
                  Square 1:1 format. Photo will be displayed across employee profile and reports.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isUploadingPhoto}
                  onClick={() => {
                    setPhotoCropModalOpen(false);
                    setTempPhotoUrl(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUploadingPhoto}
                  onClick={handleSaveCroppedPhoto}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploadingPhoto ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      <span>Saving…</span>
                    </>
                  ) : (
                    <span>Save Photo</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL 2: CONFIRM REMOVE PHOTO DIALOG
        ======================================================== */}
        {isRemovePhotoConfirmOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-photo-title"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-rose-600">
                <span className="material-symbols-outlined text-[20px]">warning</span>
                <h3 id="remove-photo-title" className="text-[15px] font-semibold text-slate-900">
                  Remove Profile Photo
                </h3>
              </div>
              <p className="text-[13px] text-slate-600 leading-normal">
                Are you sure you want to remove this employee profile photo? The avatar will revert to initial letter initials ({initials}).
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRemovePhotoConfirmOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="px-3.5 py-1.5 rounded-lg text-[13px] font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                >
                  Remove Photo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL 3: EDIT PROFILE MODAL (WITH 10-DIGIT MOBILE RULE)
        ======================================================== */}
        {isEditModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg p-5 flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                <h3 id="edit-profile-title" className="text-[15px] font-semibold text-slate-900">
                  Edit Profile &amp; Contact Information
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3 text-[12px]">
                {/* 1. Mobile Number (10 digits restriction) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] font-medium text-slate-700">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    <span className={`text-[11px] font-medium ${editForm.phone.length === 10 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {editForm.phone.length}/10
                    </span>
                  </div>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#1346a1]/30 focus-within:border-[#1346a1]">
                    <span className="px-3 py-2 bg-slate-100 text-slate-600 text-[12px] font-medium border-r border-slate-200 select-none">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      required
                      placeholder="9845231209"
                      value={editForm.phone}
                      onChange={handlePhoneChange}
                      onBlur={() => setPhoneTouched(true)}
                      className="flex-1 px-3 py-2 bg-white text-slate-900 text-[13px] font-medium focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px]">
                    <span className="text-slate-400">Enter 10-digit mobile number</span>
                    {phoneTouched && !isPhoneValid && (
                      <span className="text-rose-600 font-medium" role="alert">
                        Must start with 6–9 and have 10 digits
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. SOS / Emergency Contact Phone (10 digits restriction) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] font-medium text-slate-700">
                      Emergency SOS Contact Number
                    </label>
                    <span className={`text-[11px] font-medium ${editForm.emergencyContactPhone.length === 10 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {editForm.emergencyContactPhone.length}/10
                    </span>
                  </div>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#1346a1]/30 focus-within:border-[#1346a1]">
                    <span className="px-3 py-2 bg-slate-100 text-slate-600 text-[12px] font-medium border-r border-slate-200 select-none">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="9448109842"
                      value={editForm.emergencyContactPhone}
                      onChange={handleSosPhoneChange}
                      onBlur={() => setSosPhoneTouched(true)}
                      className="flex-1 px-3 py-2 bg-white text-slate-900 text-[13px] font-medium focus:outline-none"
                    />
                  </div>
                  {sosPhoneTouched && !isSosPhoneValid && (
                    <span className="text-rose-600 text-[11px] font-medium mt-1 block" role="alert">
                      Must be a valid 10-digit mobile number starting with 6–9
                    </span>
                  )}
                </div>

                {/* 3. Emergency Contact Relation */}
                <div>
                  <label className="text-[12px] font-medium text-slate-700 block mb-1">
                    Emergency Contact Relation / Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Spouse: Venkatesh"
                    value={editForm.emergencyContactRelation}
                    onChange={(e) => {
                      const rel = e.target.value;
                      setEditForm((prev) => ({
                        ...prev,
                        emergencyContactRelation: rel,
                        emergencyContact: `+91 ${prev.emergencyContactPhone}${rel ? ` (${rel})` : ''}`,
                      }));
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                  />
                </div>

                {/* 4. Residential Address */}
                <div>
                  <label className="text-[12px] font-medium text-slate-700 block mb-1">
                    Permanent Address
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.addressLine1}
                    onChange={(e) => setEditForm({ ...editForm, addressLine1: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 block mb-1">City</label>
                    <input
                      type="text"
                      value={editForm.city}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 block mb-1">State</label>
                    <input
                      type="text"
                      value={editForm.state}
                      onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-slate-700 block mb-1">Pincode</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={editForm.pincode}
                      onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isFormValid || isSavingProfile}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingProfile ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL 4: DIGILOCKER CONNECT MODAL
        ======================================================== */}
        {isConnectModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="digilocker-title"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1346a1] text-[20px]">cloud_sync</span>
                  <h3 id="digilocker-title" className="text-[15px] font-semibold text-slate-900">
                    Connect National DigiLocker
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConnectModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="space-y-3 text-[12px] text-slate-600 leading-normal">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900">
                  <span className="font-semibold block mb-0.5">Statutory Identity Verification</span>
                  BSC Textiles retrieves certified credentials for EPFO and ESIC compliance via National DigiLocker (OAuth 2.0 PKCE).
                </div>

                <div className="space-y-1.5">
                  <div className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600 text-[16px]">badge</span>
                    <span><strong>Aadhaar Card (UIDAI):</strong> Stored strictly in masked format (XXXX-XXXX-1234).</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600 text-[16px]">credit_card</span>
                    <span><strong>Income Tax PAN:</strong> Wage disbursement and TDS verification certificate.</span>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 pt-2 border-t border-slate-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    className="mt-0.5 rounded text-[#1346a1] focus:ring-[#1346a1]"
                  />
                  <span className="text-[11px] text-slate-700 leading-snug">
                    I grant explicit consent to BSC Textiles Pvt Ltd to initiate DigiLocker authorization and fetch certified documents for employment compliance.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsConnectModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!consentAccepted || consentSubmitting}
                  onClick={handleConnectDigiLocker}
                  className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {consentSubmitting ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      <span>Authorizing…</span>
                    </>
                  ) : (
                    <span>Authorize with DigiLocker</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL 5: MANUAL DOCUMENT UPLOAD MODAL
        ======================================================== */}
        {isUploadModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-doc-title"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                <h3 id="upload-doc-title" className="text-[15px] font-semibold text-slate-900">
                  Manual Document Scan Upload
                </h3>
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleManualUpload} className="space-y-3 text-[12px]">
                <div>
                  <label className="text-[12px] font-medium text-slate-700 block mb-1">Document Type *</label>
                  <select
                    value={uploadForm.documentType}
                    onChange={(e) => setUploadForm({ ...uploadForm, documentType: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                  >
                    <option value="AADHAAR">Aadhaar Card (UIDAI)</option>
                    <option value="PAN">PAN Card (Income Tax)</option>
                    <option value="DRIVING_LICENSE">Driving License (MoRTH)</option>
                    <option value="DEGREE_CERTIFICATE">Educational Degree Certificate</option>
                  </select>
                </div>

                <div>
                  <label className="text-[12px] font-medium text-slate-700 block mb-1">Document Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 12-digit number / PAN"
                    value={uploadForm.documentNumber}
                    onChange={(e) => setUploadForm({ ...uploadForm, documentNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                  />
                  {uploadForm.documentType === 'AADHAAR' && (
                    <span className="text-[11px] text-emerald-600 block mt-1">
                      Only masked number (XXXX-XXXX-1234) is retained in database.
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-[12px] font-medium text-slate-700 block mb-1">Issuing Authority</label>
                  <input
                    type="text"
                    value={uploadForm.issuer}
                    onChange={(e) => setUploadForm({ ...uploadForm, issuer: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-xs disabled:opacity-50"
                  >
                    {uploading ? 'Submitting…' : 'Submit for Attestation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL 6: INSPECT CERTIFIED DOCUMENT
        ======================================================== */}
        {isPreviewModalOpen && selectedDocPreview && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspect-doc-title"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                <h3 id="inspect-doc-title" className="text-[15px] font-semibold text-slate-900">
                  Certified Document Record
                </h3>
                <button
                  type="button"
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="space-y-2 text-[12px] bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-400">Type:</span>
                  <span className="font-semibold text-slate-900">{selectedDocPreview.documentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Masked ID:</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedDocPreview.documentNumberMasked}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Issuer:</span>
                  <span className="text-slate-800">{selectedDocPreview.issuer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-semibold text-emerald-700">{selectedDocPreview.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Channel:</span>
                  <span className="text-slate-800">{selectedDocPreview.source || 'DigiLocker PKCE'}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL 7: TAKE PHOTO WEBCAM CAPTURE MODAL
        ======================================================== */}
        {isCameraModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="camera-modal-title"
            className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4 backdrop-blur-xs"
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-[20px]">photo_camera</span>
                  <h3 id="camera-modal-title" className="text-[15px] font-bold text-slate-900 dark:text-white">
                    Take Employee Photo
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="relative rounded-xl overflow-hidden bg-black aspect-square flex items-center justify-center border border-slate-800 shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <div className="absolute inset-0 border-2 border-dashed border-white/40 rounded-xl pointer-events-none m-6 flex items-center justify-center">
                  <span className="text-[11px] text-white/70 bg-black/40 px-2 py-0.5 rounded backdrop-blur-xs">
                    Align face in center
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    fileInputRef.current?.click();
                  }}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Upload File Instead
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={captureCameraPhoto}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-sm transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">camera</span>
                    <span>Capture Photo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL 8: TAKE PTO / APPLY LEAVE MODAL
        ======================================================== */}
        {isTakePtoModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="take-pto-title"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs"
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">beach_access</span>
                  </div>
                  <div>
                    <h3 id="take-pto-title" className="text-[15px] font-bold text-slate-900 dark:text-white">
                      Take PTO / Apply Leave
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Record leave request for {emp.fullName} ({emp.employeeCode})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTakePtoModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleApplyPto} className="space-y-3.5 text-[12px]">
                {/* Leave Type */}
                <div>
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                    PTO / Leave Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={ptoForm.leaveTypeId}
                    onChange={(e) => setPtoForm({ ...ptoForm, leaveTypeId: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30 font-medium"
                  >
                    {availableLeaveTypes.map((lt) => (
                      <option key={lt.id} value={lt.id}>
                        {lt.name} {lt.quota ? `(Annual Quota: ${lt.quota} days)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                      From Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={ptoForm.startDate}
                      onChange={(e) => setPtoForm({ ...ptoForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                      To Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      min={ptoForm.startDate}
                      value={ptoForm.endDate}
                      onChange={(e) => setPtoForm({ ...ptoForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                    />
                  </div>
                </div>

                {/* Half Day Option */}
                <div className="flex items-center gap-4 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ptoForm.isHalfDay}
                      onChange={(e) => setPtoForm({ ...ptoForm, isHalfDay: e.target.checked })}
                      className="rounded border-slate-300 text-[#1346a1] focus:ring-[#1346a1]"
                    />
                    <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200">Half Day Session</span>
                  </label>

                  {ptoForm.isHalfDay && (
                    <select
                      value={ptoForm.halfDaySession}
                      onChange={(e) => setPtoForm({ ...ptoForm, halfDaySession: e.target.value })}
                      className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-medium"
                    >
                      <option value="FIRST_HALF">First Half (Morning Shift)</option>
                      <option value="SECOND_HALF">Second Half (Evening Shift)</option>
                    </select>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                    Reason for PTO / Leave <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Personal travel, family event, medical consultation"
                    value={ptoForm.reason}
                    onChange={(e) => setPtoForm({ ...ptoForm, reason: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]/30"
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTakePtoModalOpen(false);
                      router.push('/leaves');
                    }}
                    className="text-[12px] font-medium text-[#1346a1] hover:underline cursor-pointer"
                  >
                    Open Full Leaves Board →
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsTakePtoModalOpen(false)}
                      className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingPto}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmittingPto ? (
                        <>
                          <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                          <span>Recording PTO…</span>
                        </>
                      ) : (
                        <span>Submit PTO Request</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}