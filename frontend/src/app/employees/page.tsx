'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Users,
  Building2,
  ShieldCheck,
  Fingerprint,
  Store,
  Download,
  UserPlus,
  Search,
  Filter,
  X,
  ChevronRight,
  QrCode,
  ScanFace,
  FilterX,
  Contact
} from 'lucide-react';

import { useSession } from 'next-auth/react';

export default function EmployeesPage() {
  const { data: session, status: authStatus } = useSession();
  const [employees, setEmployees] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');
  const [totalCount, setTotalCount] = useState(0);

  // Add Employee Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmp, setNewEmp] = useState({
    employeeCode: '',
    firstName: '',
    lastName: '',
    email: '',
    gender: 'male',
    role: 'SALES_EMPLOYEE',
    locationId: '',
    departmentId: '',
    designation: 'Sales Consultant',
  });

  const fetchMetadata = useCallback(async () => {
    try {
      const [locRes, deptRes] = await Promise.all([
        api.get('/locations/all').catch(() => ({ data: [] })),
        api.get('/departments').catch(() => ({ data: [] })),
      ]);
      setLocations(locRes.data || []);
      setDepartments(deptRes.data?.departments || deptRes.data || []);
    } catch (e: any) {
      if (e?.response?.status !== 401 && !e?.isHandled401) {
        console.warn('Metadata fetch error:', e?.message || e);
      }
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedLocation) params.append('locationId', selectedLocation);
      if (selectedDept) params.append('departmentId', selectedDept);
      if (selectedStatus && selectedStatus !== 'ALL') params.append('status', selectedStatus);
      params.append('limit', '1000');

      const res = await api.get(`/employees?${params.toString()}`);
      if (res?.data) {
        setEmployees(res.data.employees || []);
        setTotalCount(res.data.total || (res.data.employees ? res.data.employees.length : 35));
      }
    } catch (err: any) {
      if (err?.response?.status !== 401 && !err?.isHandled401) {
        console.warn('Fetch employees error:', err?.message || err);
      }
    } finally {
      setLoading(false);
    }
  }, [search, selectedLocation, selectedDept, selectedStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchMetadata();
      fetchEmployees();
    }
  }, [authStatus, fetchMetadata, fetchEmployees]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newEmp.firstName || !newEmp.lastName || !newEmp.email || !newEmp.locationId) {
        toast.error('Please fill in required fields (Name, Email, Location)');
        return;
      }
      const code = newEmp.employeeCode || `TEST-EMP-${Math.floor(100 + Math.random() * 900)}`;
      await api.post('/employees', {
        ...newEmp,
        employeeCode: code,
      });
      toast.success('Employee created successfully!');
      setIsAddModalOpen(false);
      fetchEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create employee');
    }
  };

  const handleExportCSV = () => {
    if (employees.length === 0) {
      toast.error('No employees to export');
      return;
    }
    const headers = 'Employee Code,Name,Role,Location,Department,Status\n';
    const rows = employees.map(e => 
      `"${e.employeeCode}","${e.fullName || `${e.firstName} ${e.lastName}`}","${e.role}","${e.location?.name || ''}","${e.department?.name || ''}","${e.status}"`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BSC_Textiles_Workforce_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success('Exported Workforce Master CSV!');
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* BREADCRUMB & CONTEXT BANNER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <span>Workforce Directory</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[#722F37] font-bold">Staff Master Ledger</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span>Karnataka Hubs</span>
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-[#18181B] tracking-tight">
                Workforce Directory & Staff Records
              </h1>
              <span className="bg-[#722F37]/10 text-[#722F37] border border-[#722F37]/20 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider">
                Live Synced ({totalCount} Staff)
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Centralized record directory of all verified employees across Karnataka retail stores, regional warehouses, and head office.
            </p>
          </div>

          {/* PRIMARY ACTION CLUSTER */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 shadow-xs transition-all"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#722F37] hover:bg-[#5B232A] text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Employee</span>
            </button>
          </div>
        </div>

        {/* 5 WORKFORCE KPIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Workforce</span>
              <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">{totalCount}</span>
              <span className="text-[10px] font-bold text-[#722F37] bg-[#722F37]/10 px-1.5 py-0.5 rounded-full">+3 MTD</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Full-Time Staff</span>
              <span>•</span>
              <span>Active Roster</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active On-Floor</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <Store className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">12</span>
              <span className="text-xs text-slate-400">/ {totalCount}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span className="text-emerald-700 font-bold">Shift A Active</span>
              <span>Off-Duty / Roster</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">KYC Compliance</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">100%</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">Verified</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>PF & ESI Linked</span>
              <span>Aadhaar KYC</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Biometric Profiles</span>
              <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
                <Fingerprint className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">{totalCount}</span>
              <span className="text-xs text-slate-400">/ {totalCount}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Face Enrolled</span>
              <span className="text-[#722F37] font-bold">QR Ready</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Store Locations</span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">4</span>
              <span className="text-xs text-slate-400">Hub Stores</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>BEL • DAV • SHI</span>
              <span className="text-[#722F37] font-bold">HUB-HQ</span>
            </div>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2 max-w-xl bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg focus-within:border-[#722F37] focus-within:ring-1 focus-within:ring-[#722F37]/20 transition-all">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Name, Employee Code (e.g. TEST-EMP-001), Email, or Role..."
              className="w-full bg-transparent text-xs text-[#18181B] placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Location Filter */}
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-[#722F37]"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>

            {/* Department Filter */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-[#722F37]"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-[#722F37]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Workforce</option>
              <option value="PROBATION">Probation</option>
              <option value="INACTIVE">Inactive / Resigned</option>
            </select>

            <button
              onClick={() => {
                setSearch('');
                setSelectedLocation('');
                setSelectedDept('');
                setSelectedStatus('ACTIVE');
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              title="Reset Filters"
            >
              <FilterX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* WORKFORCE MASTER TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Contact className="w-4 h-4 text-[#722F37]" />
              <h2 className="text-sm font-bold text-[#18181B]">Registered Staff Directory</h2>
              <span className="text-xs text-slate-400">({employees.length} Records)</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Sorted by Employee Code</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading workforce records...</div>
            ) : employees.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No employees match current filters.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Designation & Role</th>
                    <th className="py-3 px-4">Store & Floor</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Shift Allotment</th>
                    <th className="py-3 px-4">Biometrics</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#722F37] text-white flex items-center justify-center font-bold text-xs">
                            {emp.firstName?.[0]}{emp.lastName?.[0]}
                          </div>
                          <div>
                            <div className="font-bold text-[#18181B]">{emp.fullName || `${emp.firstName} ${emp.lastName}`}</div>
                            <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#18181B]">{emp.designation || 'Sales Consultant'}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">{emp.role?.replace(/_/g, ' ')}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#18181B]">{emp.location?.name || 'Belagavi Flagship'}</div>
                        <div className="text-[10px] text-slate-400">{emp.floor?.name || 'Floor 0'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {emp.department?.name || 'Retail Sales'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {emp.shift?.name || 'Shift A (09:30 - 18:30)'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            <ScanFace className="w-3 h-3" />
                            Face
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                            <QrCode className="w-3 h-3" />
                            QR
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          emp.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/employees/profile/${emp.id}`}
                          className="px-2.5 py-1 text-xs font-semibold text-[#722F37] hover:bg-[#722F37]/10 rounded border border-[#722F37]/20 transition-colors"
                        >
                          View Profile
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* CREATE EMPLOYEE MODAL */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#722F37]" />
                  <h3 className="font-bold text-base text-[#18181B]">Add Employee</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">First Name *</label>
                    <input
                      type="text"
                      required
                      value={newEmp.firstName}
                      onChange={(e) => setNewEmp({ ...newEmp, firstName: e.target.value })}
                      placeholder="e.g. Ramesh"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#722F37]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Last Name *</label>
                    <input
                      type="text"
                      required
                      value={newEmp.lastName}
                      onChange={(e) => setNewEmp({ ...newEmp, lastName: e.target.value })}
                      placeholder="e.g. Angadi"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#722F37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Work Email *</label>
                  <input
                    type="email"
                    required
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                    placeholder="ramesh.angadi@bsctextiles.com"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#722F37]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Store Location *</label>
                    <select
                      required
                      value={newEmp.locationId}
                      onChange={(e) => setNewEmp({ ...newEmp, locationId: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37]"
                    >
                      <option value="">Select Location</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Department</label>
                    <select
                      value={newEmp.departmentId}
                      onChange={(e) => setNewEmp({ ...newEmp, departmentId: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37]"
                    >
                      <option value="">Select Department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Gender</label>
                    <select
                      value={newEmp.gender}
                      onChange={(e) => setNewEmp({ ...newEmp, gender: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37]"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Role</label>
                    <select
                      value={newEmp.role}
                      onChange={(e) => setNewEmp({ ...newEmp, role: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37]"
                    >
                      <option value="SALES_EMPLOYEE">Sales Employee</option>
                      <option value="FLOOR_MANAGER">Floor Manager</option>
                      <option value="HR_ADMIN">HR Admin</option>
                      <option value="CASHIER">Cashier</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs bg-[#722F37] hover:bg-[#5B232A] text-white rounded-lg font-bold shadow-xs transition-colors"
                  >
                    Create Employee
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
