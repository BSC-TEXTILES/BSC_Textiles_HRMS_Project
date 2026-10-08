'use client';

import { useEffect, useState } from 'react';
import { 
  Search, Filter, RefreshCw, Download, Eye, AlertCircle,
  CheckCircle, Clock, Coffee, Utensils, Activity, Shield,
  Video, MapPin, Building2, ChevronDown, ChevronUp,
  Users, Calendar, X
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { formatTime, getStatusColor } from '@/lib/utils';

interface EmployeeLiveStatus {
  id: string;
  employeeCode: string;
  fullName: string;
  gender: string;
  photo?: string;
  location: { id: string; name: string };
  department: string;
  shift?: { code: string; startTime: string; endTime: string } | null;
  attendance: { 
    status: string; 
    checkIn?: string; 
    checkOut?: string; 
    lateMinutes: number; 
    earlyOutMinutes: number; 
    otMinutes: number; 
    isWeekOff: boolean 
  };
  break?: { 
    status: string; 
    category: string; 
    startTime?: string; 
    endTime?: string;
    exceededMinutes: number;
  } | null;
  faceVerification?: { 
    score: number; 
    result: string; 
    threshold: number; 
    time: string;
  } | null;
}

export default function LiveAttendancePage() {
  const [employees, setEmployees] = useState<EmployeeLiveStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationId, setLocationId] = useState<string>('all');
  const [floorId, setFloorId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeLiveStatus | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (locationId !== 'all') params.set('location_id', locationId);
      if (floorId) params.set('floor_id', floorId);
      if (departmentId) params.set('department_id', departmentId);
      if (genderFilter !== 'all') params.set('gender', genderFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      
      const res = await api.get<{ employees: EmployeeLiveStatus[] }>(`/staff-ops/live-status?${params}`);
      setEmployees(res.data.employees);
    } catch (err) {
      console.error('Failed to fetch live status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [locationId, floorId, departmentId, statusFilter, genderFilter]);

  const filteredEmployees = employees.filter(emp => {
    if (search) {
      const s = search.toLowerCase();
      return emp.employeeCode.toLowerCase().includes(s) ||
             emp.fullName.toLowerCase().includes(s) ||
             emp.department.toLowerCase().includes(s) ||
             emp.location.name.toLowerCase().includes(s);
    }
    return true;
  });

  const statusColors: Record<string, string> = {
    present: 'success',
    late: 'warning',
    absent: 'danger',
    leave: 'info',
    weekly_off: 'neutral',
    on_break: 'info',
    on_lunch: 'info',
    on_tea_break: 'info',
    face_verified: 'success',
    face_failed: 'danger',
    overtime: 'warning',
  };

  const statusLabels: Record<string, string> = {
    present: 'Present',
    late: 'Late',
    absent: 'Absent',
    leave: 'On Leave',
    weekly_off: 'Weekly Off',
    on_break: 'On Break',
    on_lunch: 'On Lunch',
    on_tea_break: 'Tea Break',
    face_verified: 'Face Verified',
    face_failed: 'Face Failed',
    overtime: 'Overtime',
  };

  const stats = {
    total: employees.length,
    present: employees.filter(e => e.attendance.status === 'present' && !e.attendance.isWeekOff).length,
    late: employees.filter(e => e.attendance.lateMinutes > 0).length,
    onBreak: employees.filter(e => e.break?.status === 'active').length,
    weekOff: employees.filter(e => e.attendance.isWeekOff).length,
    absent: employees.filter(e => e.attendance.status === 'absent').length,
    faceVerified: employees.filter(e => e.faceVerification?.result === 'passed').length,
    faceFailed: employees.filter(e => e.faceVerification?.result === 'failed').length,
  };

  const columns = [
    { key: 'employee', header: 'Employee', render: (row: EmployeeLiveStatus) => (
      <div className="flex items-center gap-3">
        {row.photo ? (
          <img src={row.photo} alt={row.fullName} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-xs font-bold text-primary-700">{row.fullName.split(' ').map(n => n[0]).join('')}</span>
          </div>
        )}
        <div>
          <p className="font-medium text-gray-900">{row.fullName}</p>
          <p className="text-xs text-gray-500">{row.employeeCode}</p>
        </div>
      </div>
    )},
    { key: 'location', header: 'Location', render: (row: EmployeeLiveStatus) => (
      <div className="flex items-center gap-1">
        <MapPin className="w-3 h-3 text-gray-400" />
        <span className="text-sm">{row.location.name}</span>
      </div>
    )},
    { key: 'department', header: 'Department', render: (row: EmployeeLiveStatus) => <span className="text-sm">{row.department}</span> },
    { key: 'shift', header: 'Shift', render: (row: EmployeeLiveStatus) => row.shift ? (
      <span className="text-xs px-2 py-0.5 bg-slate-100 rounded">{row.shift.code} {row.shift.startTime}-{row.shift.endTime}</span>
    ) : <span className="text-xs text-gray-400">—</span> },
    { key: 'attendance', header: 'Status', render: (row: EmployeeLiveStatus) => {
      const status = row.break?.status === 'active' ? 
        (row.break.category === 'lunch' ? 'on_lunch' : row.break.category === 'tea' ? 'on_tea_break' : 'on_break') :
        (row.faceVerification?.result === 'failed' ? 'face_failed' :
         row.faceVerification?.result === 'passed' ? 'face_verified' :
         row.attendance.isWeekOff ? 'weekly_off' :
         row.attendance.status);
      
      return (
        <Badge variant={statusColors[status] || 'neutral'} dot>
          {statusLabels[status] || status}
        </Badge>
      );
    }},
    { key: 'checkIn', header: 'Check In', render: (row: EmployeeLiveStatus) => 
      row.attendance.checkIn ? <span className="text-sm font-mono">{formatTime(row.attendance.checkIn)}</span> : <span className="text-gray-400">—</span>
    },
    { key: 'checkOut', header: 'Check Out', render: (row: EmployeeLiveStatus) => 
      row.attendance.checkOut ? <span className="text-sm font-mono">{formatTime(row.attendance.checkOut)}</span> : <span className="text-gray-400">—</span>
    },
    { key: 'late', header: 'Late', render: (row: EmployeeLiveStatus) => 
      row.attendance.lateMinutes > 0 ? <Badge variant="warning">{row.attendance.lateMinutes}m</Badge> : <span className="text-gray-400">—</span>
    },
    { key: 'ot', header: 'OT', render: (row: EmployeeLiveStatus) => 
      row.attendance.otMinutes > 0 ? <Badge variant="warning">{row.attendance.otMinutes}m</Badge> : <span className="text-gray-400">—</span>
    },
    { key: 'break', header: 'Break', render: (row: EmployeeLiveStatus) => 
      row.break ? (
        <div className="flex items-center gap-2">
          <Badge variant="info" className="text-xs">{row.break.category}</Badge>
          <span className="text-xs text-gray-500">
            {row.break.startTime ? formatTime(row.break.startTime) : '—'}
            {row.break.endTime ? ` - ${formatTime(row.break.endTime)}` : ' (ongoing)'}
          </span>
        </div>
      ) : <span className="text-gray-400">—</span>
    },
    { key: 'face', header: 'Face', render: (row: EmployeeLiveStatus) => 
      row.faceVerification ? (
        <div className="flex items-center gap-2">
          <Badge variant={row.faceVerification.result === 'passed' ? 'success' : 'danger'} dot>
            {row.faceVerification.result === 'passed' ? 'Verified' : 'Failed'}
          </Badge>
          <span className="text-xs text-gray-500">{row.faceVerification.score.toFixed(1)}%</span>
        </div>
      ) : <span className="text-gray-400">—</span>
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Staff Tracking</h1>
          <p className="text-gray-600 mt-1">Real-time attendance, breaks, and face verification status</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4" /> Filters
          </Button>
          <Button onClick={() => { /* export CSV */ }}>
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Users, color: 'bg-blue-500' },
          { label: 'Present', value: stats.present, icon: CheckCircle, color: 'bg-emerald-500' },
          { label: 'Late', value: stats.late, icon: Clock, color: 'bg-amber-500' },
          { label: 'On Break', value: stats.onBreak, icon: Coffee, color: 'bg-blue-400' },
          { label: 'Weekly Off', value: stats.weekOff, icon: Calendar, color: 'bg-slate-400' },
          { label: 'Absent', value: stats.absent, icon: AlertCircle, color: 'bg-red-500' },
          { label: 'Face Verified', value: stats.faceVerified, icon: Shield, color: 'bg-green-500' },
          { label: 'Face Failed', value: stats.faceFailed, icon: AlertCircle, color: 'bg-red-500' },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-2xs font-semibold uppercase tracking-wide text-gray-500">{stat.label}</p>
              <div className={`p-2 rounded-xl ${stat.color}`}>
                <stat.icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Select
              label="Location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              options={[
                { value: 'all', label: 'All Locations' },
                { value: 'bel', label: 'Belagavi' },
                { value: 'dav', label: 'Davanagere' },
                { value: 'shi', label: 'Shivamogga' },
              ]}
            />
            <Select
              label="Floor"
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              options={[
                { value: '', label: 'All Floors' },
                { value: 'gf', label: 'Ground Floor' },
                { value: 'f1', label: 'First Floor' },
                { value: 'f2', label: 'Second Floor' },
              ]}
            />
            <Select
              label="Department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              options={[
                { value: '', label: 'All Departments' },
                { value: 'sales', label: 'Sales' },
                { value: 'ops', label: 'Operations' },
                { value: 'hr', label: 'HR' },
              ]}
            />
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'present', label: 'Present' },
                { value: 'late', label: 'Late' },
                { value: 'absent', label: 'Absent' },
                { value: 'leave', label: 'On Leave' },
                { value: 'weekly_off', label: 'Weekly Off' },
                { value: 'on_break', label: 'On Break' },
              ]}
            />
            <Select
              label="Gender"
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />
            <Input
              label="Search"
              placeholder="Name, code, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Card>
      )}

      {/* Data Table */}
      <Card>
        <DataTable
          columns={columns}
          data={filteredEmployees}
          loading={loading}
          emptyMessage="No employees match the current filters"
          rowClick={(row) => setSelectedEmployee(row)}
          striped
          hoverable
        />
      </Card>

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {selectedEmployee.fullName} ({selectedEmployee.employeeCode})
              </h3>
              <button onClick={() => setSelectedEmployee(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-2xs text-gray-500">Location</p>
                  <p className="font-medium">{selectedEmployee.location.name}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Department</p>
                  <p className="font-medium">{selectedEmployee.department}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Shift</p>
                  <p className="font-medium">{selectedEmployee.shift?.code || '—'}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-500">Gender</p>
                  <p className="font-medium capitalize">{selectedEmployee.gender}</p>
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <h4 className="font-semibold text-gray-900">Attendance</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-gray-500">Status</p><p className="font-medium">{statusLabels[selectedEmployee.attendance.status] || selectedEmployee.attendance.status}</p></div>
                  <div><p className="text-gray-500">Check In</p><p className="font-medium">{selectedEmployee.attendance.checkIn ? formatTime(selectedEmployee.attendance.checkIn) : '—'}</p></div>
                  <div><p className="text-gray-500">Check Out</p><p className="font-medium">{selectedEmployee.attendance.checkOut ? formatTime(selectedEmployee.attendance.checkOut) : '—'}</p></div>
                  <div><p className="text-gray-500">Late</p><p className="font-medium">{selectedEmployee.attendance.lateMinutes > 0 ? `${selectedEmployee.attendance.lateMinutes}m` : '—'}</p></div>
                  <div><p className="text-gray-500">OT</p><p className="font-medium">{selectedEmployee.attendance.otMinutes > 0 ? `${selectedEmployee.attendance.otMinutes}m` : '—'}</p></div>
                </div>
              </div>

              {selectedEmployee.break && (
                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <h4 className="font-semibold text-gray-900">Current Break</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-gray-500">Type</p><p className="font-medium capitalize">{selectedEmployee.break.category}</p></div>
                    <div><p className="text-gray-500">Status</p><p className="font-medium">{selectedEmployee.break.status}</p></div>
                    <div><p className="text-gray-500">Started</p><p className="font-medium">{selectedEmployee.break.startTime ? formatTime(selectedEmployee.break.startTime) : '—'}</p></div>
                    <div><p className="text-gray-500">Ended</p><p className="font-medium">{selectedEmployee.break.endTime ? formatTime(selectedEmployee.break.endTime) : 'Ongoing'}</p></div>
                  </div>
                </div>
              )}

              {selectedEmployee.faceVerification && (
                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <h4 className="font-semibold text-gray-900">Face Verification</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-gray-500">Result</p><Badge variant={selectedEmployee.faceVerification.result === 'passed' ? 'success' : 'danger'}>{selectedEmployee.faceVerification.result}</Badge></div>
                    <div><p className="text-gray-500">Match %</p><p className="font-medium">{selectedEmployee.faceVerification.score.toFixed(1)}%</p></div>
                    <div><p className="text-gray-500">Threshold</p><p className="font-medium">{selectedEmployee.faceVerification.threshold}%</p></div>
                    <div><p className="text-gray-500">Time</p><p className="font-medium">{selectedEmployee.faceVerification.time ? formatTime(selectedEmployee.faceVerification.time) : '—'}</p></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}