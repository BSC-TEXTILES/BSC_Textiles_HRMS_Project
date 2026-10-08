'use client';

import { useEffect, useState } from 'react';
import { 
  User, MapPin, Building2, Clock, Calendar, Mail, Phone,
  Shield, CreditCard, Briefcase, Award, Star, Camera,
  Edit, Download, Printer, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle, AlertTriangle, Coffee, Utensils,
  QrCode, MessageSquare, DollarSign
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { formatDate, formatCurrency, formatDateTime, formatTime } from '@/lib/utils';

interface EmployeeProfile {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup: string;
  maritalStatus: string;
  nationality: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  location: { id: string; name: string; code: string };
  floor?: { id: string; name: string };
  department?: { id: string; name: string };
  section?: { id: string; name: string };
  designation: string;
  role: string;
  status: string;
  joiningDate: string;
  exitDate: string | null;
  shift?: { id: string; name: string; code: string; startTime: string; endTime: string };
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  bankIfsc: string;
  pan: string;
  aadhaar: string;
  uan: string;
  esic: string;
  faceProfile?: { id: string; enrolledAt: string; isActive: boolean };
  qrCode?: { id: string; token: string; validFrom: string; validTo: string; isConsumed: boolean };
  dailyQRCode?: { id: string; token: string; validFrom: string; validTo: string; isConsumed: boolean };
  attendances: Array<{ id: number; attendanceDate: string; status: string; checkIn: string; checkOut: string; lateMinutes: number; otMinutes: number; totalWorkingSeconds: number }>;
  breaks: Array<{ id: number; breakDate: string; breakType: string; startTime: string; endTime: string; durationMinutes: number; exceededMinutes: number; status: string }>;
  faceVerifications: Array<{ id: number; score: number; result: string; threshold: number; attemptedAt: string; failureReason?: string | null }>;
  qrScanRecords: Array<{ id: number; purpose: string; result: string; scannedAt: string; location: string }>;
  observations: Array<{ id: number; code: string; type: string; level: string; score: number; description: string; status: string; createdAt: string }>;
  incentives: Array<{ id: number; ruleName: string; amount: number; date: string; status: string }>;
}

const statusColors: Record<string, string> = {
  active: 'success',
  inactive: 'neutral',
  on_leave: 'info',
  terminated: 'danger',
};

export default function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'attendance' | 'breaks' | 'face' | 'qr' | 'observations' | 'incentives'>('profile');

  useEffect(() => {
    fetchEmployee();
  }, [params.id]);

  const fetchEmployee = async () => {
    try {
      setLoading(true);
      const res = await api.get<EmployeeProfile>(`/employees/${params.id}`);
      setEmployee(res.data);
    } catch (err) {
      console.error('Failed to fetch employee:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!employee) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-red-600">Employee not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'attendance', label: 'Attendance', icon: Calendar },
    { id: 'breaks', label: 'Breaks', icon: Coffee },
    { id: 'face', label: 'Face Verification', icon: Shield },
    { id: 'qr', label: 'QR Codes', icon: QrCode },
    { id: 'observations', label: 'Observations', icon: MessageSquare },
    { id: 'incentives', label: 'Incentives', icon: DollarSign },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{employee.fullName}</h1>
              <Badge variant={statusColors[employee.status] || 'neutral'} dot className="text-sm">
                {employee.status}
              </Badge>
              <Badge variant="neutral" className="text-sm">{employee.role}</Badge>
            </div>
            <p className="text-gray-600 mt-1">{employee.employeeCode} • {employee.location.name} ({employee.location.code})</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
            <Button variant="outline">
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
            <Button variant="outline" onClick={() => { /* edit */ }}>
              <Edit className="w-4 h-4 mr-2" /> Edit
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Employee tabs">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant="ghost"
                size="sm"
                className={activeTab === tab.id ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}
                onClick={() => setActiveTab(tab.id as any)}
              >
                <tab.icon className="w-4 h-4 mr-1" />
                {tab.label}
              </Button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Personal Info */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5" /> Personal Information
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Employee Code" value={employee.employeeCode} icon={<Badge className="text-xs">{employee.employeeCode}</Badge>} />
                <InfoField label="Full Name" value={employee.fullName} />
                <InfoField label="Email" value={employee.email} icon={<Mail className="w-4 h-4" />} />
                <InfoField label="Phone" value={employee.phone} icon={<Phone className="w-4 h-4" />} />
                <InfoField label="Gender" value={employee.gender} />
                <InfoField label="Date of Birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : '—'} icon={<Calendar className="w-4 h-4" />} />
                <InfoField label="Blood Group" value={employee.bloodGroup || '—'} />
                <InfoField label="Marital Status" value={employee.maritalStatus} />
                <InfoField label="Nationality" value={employee.nationality} />
              </div>
            </Card>

            {/* Address */}
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" /> Address
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <InfoField label="Address Line 1" value={employee.addressLine1 || '—'} />
                <InfoField label="Address Line 2" value={employee.addressLine2 || '—'} />
                <InfoField label="City" value={employee.city || '—'} />
                <InfoField label="State" value={employee.state || '—'} />
                <InfoField label="PIN Code" value={employee.pincode || '—'} />
              </div>
            </Card>

            {/* Employment Details */}
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Briefcase className="w-5 h-5" /> Employment Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Location" value={employee.location.name} icon={<MapPin className="w-4 h-4" />} />
                <InfoField label="Floor" value={employee.floor?.name || '—'} />
                <InfoField label="Department" value={employee.department?.name || '—'} icon={<Building2 className="w-4 h-4" />} />
                <InfoField label="Section" value={employee.section?.name || '—'} />
                <InfoField label="Designation" value={employee.designation} />
                <InfoField label="Role" value={employee.role} />
                <InfoField label="Status" value={employee.status} icon={<Badge variant={statusColors[employee.status] || 'neutral'} dot>{employee.status}</Badge>} />
                <InfoField label="Joining Date" value={formatDate(employee.joiningDate)} icon={<Calendar className="w-4 h-4" />} />
                <InfoField label="Exit Date" value={employee.exitDate ? formatDate(employee.exitDate) : '—'} icon={<Calendar className="w-4 h-4" />} />
                <InfoField label="Shift" value={employee.shift?.name || '—'} icon={<Clock className="w-4 h-4" />} />
              </div>
            </Card>

            {/* Banking & Statutory */}
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> Banking & Statutory
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Bank Name" value={employee.bankName || '—'} />
                <InfoField label="Branch" value={employee.bankBranch || '—'} />
                <InfoField label="Account Number" value={employee.bankAccount || '—'} />
                <InfoField label="IFSC" value={employee.bankIfsc || '—'} />
                <InfoField label="PAN" value={employee.pan || '—'} />
                <InfoField label="Aadhaar" value={employee.aadhaar || '—'} />
                <InfoField label="UAN" value={employee.uan || '—'} />
                <InfoField label="ESIC" value={employee.esic || '—'} />
              </div>
            </Card>

            {/* Face & QR */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5" /> Face Profile
                </h3>
                {employee.faceProfile ? (
                  <div className="space-y-3">
                    <InfoField label="Status" value={employee.faceProfile.isActive ? 'Active' : 'Inactive'} icon={<Badge variant={employee.faceProfile.isActive ? 'success' : 'danger'} dot>{employee.faceProfile.isActive ? 'Active' : 'Inactive'}</Badge>} />
                    <InfoField label="Enrolled" value={formatDate(employee.faceProfile.enrolledAt)} />
                  </div>
                ) : (
                  <p className="text-gray-500">No face profile enrolled</p>
                )}
              </Card>

              <Card>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <QrCode className="w-5 h-5" /> QR Codes
                </h3>
                <div className="space-y-4">
                  {employee.qrCode && (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-medium mb-2">Permanent QR</h4>
                      <p className="font-mono text-sm text-gray-700 mb-2">{employee.qrCode.token}</p>
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>Valid: {formatDate(employee.qrCode.validFrom)} to {formatDate(employee.qrCode.validTo)}</p>
                        <p>Consumed: {employee.qrCode.isConsumed ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  )}
                  {employee.dailyQRCode && (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-medium mb-2">Daily QR (Today)</h4>
                      <p className="font-mono text-sm text-gray-700 mb-2">{employee.dailyQRCode.token}</p>
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>Valid: {formatDate(employee.dailyQRCode.validFrom)} to {formatDate(employee.dailyQRCode.validTo)}</p>
                        <p>Consumed: {employee.dailyQRCode.isConsumed ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && employee && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Attendance Records</h3>
            <DataTable
              columns={[
                { key: 'attendanceDate', header: 'Date', render: (row) => formatDate(row.attendanceDate) },
                { key: 'status', header: 'Status', render: (row) => <Badge variant={getAttendanceStatusColor(row.status)}>{row.status}</Badge> },
                { key: 'checkIn', header: 'Check In', render: (row) => row.checkIn ? formatTime(row.checkIn) : '—' },
                { key: 'checkOut', header: 'Check Out', render: (row) => row.checkOut ? formatTime(row.checkOut) : '—' },
                { key: 'lateMinutes', header: 'Late (min)', render: (row) => row.lateMinutes > 0 ? <Badge variant="warning">{row.lateMinutes}</Badge> : '—' },
                { key: 'otMinutes', header: 'OT (min)', render: (row) => row.otMinutes > 0 ? <Badge variant="warning">{row.otMinutes}</Badge> : '—' },
                { key: 'totalWorkingSeconds', header: 'Working', render: (row) => formatSeconds(row.totalWorkingSeconds) },
              ]}
              data={employee.attendances}
              emptyMessage="No attendance records"
              striped
              hoverable
            />
          </Card>
        )}

        {activeTab === 'breaks' && employee && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Break Records</h3>
            <DataTable
              columns={[
                { key: 'breakDate', header: 'Date', render: (row) => formatDate(row.breakDate) },
                { key: 'breakType', header: 'Type', render: (row) => <Badge variant="neutral" className="capitalize">{row.breakType.toLowerCase()}</Badge> },
                { key: 'startTime', header: 'Start', render: (row) => row.startTime ? formatTime(row.startTime) : '—' },
                { key: 'endTime', header: 'End', render: (row) => row.endTime ? formatTime(row.endTime) : 'Ongoing' },
                { key: 'durationMinutes', header: 'Duration (min)', render: (row) => row.durationMinutes },
                { key: 'exceededMinutes', header: 'Exceeded (min)', render: (row) => row.exceededMinutes > 0 ? <span className="text-red-600">+{row.exceededMinutes}</span> : '—' },
                { key: 'status', header: 'Status', render: (row) => <Badge variant={getBreakStatusColor(row.status)}>{row.status}</Badge> },
              ]}
              data={employee.breaks}
              emptyMessage="No break records"
              striped
              hoverable
            />
          </Card>
        )}

        {activeTab === 'face' && employee && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Face Verifications</h3>
            <DataTable
              columns={[
                { key: 'attemptedAt', header: 'Date & Time', render: (row) => formatDateTime(row.attemptedAt) },
                { key: 'score', header: 'Match %', render: (row) => row.score !== null ? <span className={`${row.score >= (row.threshold || 0) ? 'text-emerald-600' : 'text-red-600'} font-mono font-medium`}>{row.score.toFixed(2)}%</span> : 'N/A' },
                { key: 'threshold', header: 'Threshold', render: (row) => <span className="font-mono">{row.threshold}%</span> },
                { key: 'result', header: 'Result', render: (row) => <Badge variant={getFaceResultColor(row.result)}>{row.result.replace('_', ' ')}</Badge> },
                { key: 'failureReason', header: 'Failure Reason', render: (row) => row.failureReason || '—' },
              ]}
              data={employee.faceVerifications}
              emptyMessage="No face verification records"
              striped
              hoverable
            />
          </Card>
        )}

        {activeTab === 'qr' && employee && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">QR Scan Records</h3>
            <DataTable
              columns={[
                { key: 'scannedAt', header: 'Date & Time', render: (row) => formatDateTime(row.scannedAt) },
                { key: 'purpose', header: 'Purpose', render: (row) => <Badge variant="neutral" className="capitalize">{row.purpose.replace('_', ' ')}</Badge> },
                { key: 'result', header: 'Result', render: (row) => <Badge variant={row.result === 'success' ? 'success' : 'danger'}>{row.result}</Badge> },
                { key: 'location', header: 'Location', render: (row) => row.location },
              ]}
              data={employee.qrScanRecords}
              emptyMessage="No QR scan records"
              striped
              hoverable
            />
          </Card>
        )}

        {activeTab === 'observations' && employee && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Observations</h3>
            <DataTable
              columns={[
                { key: 'code', header: 'Code', render: (row) => <span className="font-mono text-xs">{row.code}</span> },
                { key: 'createdAt', header: 'Date', render: (row) => formatDate(row.createdAt) },
                { key: 'type', header: 'Type', render: (row) => <Badge variant="neutral" className="capitalize">{row.type.replace('_', ' ')}</Badge> },
                { key: 'level', header: 'Level', render: (row) => row.level },
                { key: 'score', header: 'Score', render: (row) => <span className="font-mono">{row.score}/5</span> },
                { key: 'status', header: 'Status', render: (row) => <Badge variant={getObservationStatusColor(row.status)}>{row.status.replace('_', ' ')}</Badge> },
              ]}
              data={employee.observations}
              emptyMessage="No observations"
              striped
              hoverable
            />
          </Card>
        )}

        {activeTab === 'incentives' && employee && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Incentive Transactions</h3>
            <DataTable
              columns={[
                { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
                { key: 'ruleName', header: 'Rule', render: (row) => row.ruleName },
                { key: 'amount', header: 'Amount', render: (row) => <span className="font-mono font-medium">₹{formatCurrency(row.amount)}</span> },
                { key: 'status', header: 'Status', render: (row) => <Badge variant={getIncentiveStatusColor(row.status)}>{row.status}</Badge> },
              ]}
              data={employee.incentives}
              emptyMessage="No incentive transactions"
              striped
              hoverable
            />
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function InfoField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900 flex items-center gap-2">
        {value}
        {icon}
      </p>
    </div>
  );
}

function getAttendanceStatusColor(status: string) {
  switch (status) {
    case 'present': return 'success';
    case 'late': return 'warning';
    case 'absent': return 'danger';
    case 'leave': return 'info';
    case 'weekly_off': return 'neutral';
    case 'overtime': return 'warning';
    case 'face_verified': return 'success';
    case 'face_failed': return 'danger';
    default: return 'neutral';
  }
}

function getBreakStatusColor(status: string) {
  switch (status) {
    case 'completed': return 'success';
    case 'active': return 'info';
    case 'exceeded': return 'danger';
    case 'not_started': return 'neutral';
    default: return 'neutral';
  }
}

function getFaceResultColor(result: string) {
  switch (result) {
    case 'passed': return 'success';
    case 'failed': return 'danger';
    case 'not_enrolled': return 'warning';
    default: return 'neutral';
  }
}

function getObservationStatusColor(status: string) {
  switch (status) {
    case 'new': return 'info';
    case 'open': return 'info';
    case 'in_review': return 'warning';
    case 'action_required': return 'danger';
    case 'completed': return 'success';
    case 'closed': return 'neutral';
    default: return 'neutral';
  }
}

function getIncentiveStatusColor(status: string) {
  switch (status) {
    case 'approved': return 'success';
    case 'pending': return 'warning';
    case 'rejected': return 'danger';
    default: return 'neutral';
  }
}

function formatSeconds(seconds: number) {
  if (!seconds) return '00:00:00';
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}