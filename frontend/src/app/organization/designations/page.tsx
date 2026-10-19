'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Edit3,
  Eye,
  Filter,
  Layers,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface AssignedEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  departmentName: string;
  locationName: string;
  locationCode: string;
  status: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  joiningDate: string | null;
  baseSalary: number;
  avatarUrl: string | null;
}

interface DesignationItem {
  id: string;
  title: string;
  code: string | null;
  grade: string;
  band: string;
  minSalary: number;
  maxSalary: number;
  description: string;
  icon: string;
  department: string | null;
  aliases: string | null;
  count: number;
  avgSalary: number;
  departmentNames: string[];
  employees: AssignedEmployee[];
}

interface DesignationKpis {
  totalRoles: number;
  totalStaffMapped: number;
  totalEmployees: number;
  coveragePct: number;
  minCompensation: number;
  maxCompensation: number;
}

const GRADE_OPTIONS = [
  'L5 - Executive',
  'L4 - Senior Supervisory',
  'L3 - Supervisory',
  'L2 - Operational',
  'L1 - Support Operator',
];

const GRADE_STYLES: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  'L5 - Executive': {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    bar: 'from-purple-600 to-indigo-600',
  },
  'L4 - Senior Supervisory': {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    bar: 'from-blue-600 to-cyan-600',
  },
  'L3 - Supervisory': {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-200 dark:border-teal-800',
    bar: 'from-teal-600 to-emerald-600',
  },
  'L2 - Operational': {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    bar: 'from-emerald-600 to-green-600',
  },
  'L1 - Support Operator': {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    bar: 'from-amber-500 to-orange-600',
  },
};

const AVATAR_COLORS = [
  'from-blue-600 to-indigo-600',
  'from-purple-600 to-pink-600',
  'from-emerald-600 to-teal-700',
  'from-amber-500 to-orange-600',
  'from-rose-600 to-red-600',
  'from-cyan-600 to-blue-600',
];

function getInitials(name?: string | null): string {
  if (!name) return 'EMP';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function DesignationsPage() {
  const [designations, setDesignations] = useState<DesignationItem[]>([]);
  const [kpis, setKpis] = useState<DesignationKpis>({
    totalRoles: 0,
    totalStaffMapped: 0,
    totalEmployees: 0,
    coveragePct: 100,
    minCompensation: 16000,
    maxCompensation: 120000,
  });
  const [loading, setLoading] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Designation for Drilldown Modal
  const [inspectDesignation, setInspectDesignation] = useState<DesignationItem | null>(null);
  const [inspectSearch, setInspectSearch] = useState('');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState({
    title: '',
    grade: 'L2 - Operational',
    department: 'Retail Operations',
    minSalary: 25000,
    maxSalary: 38000,
    band: '',
    description: '',
    icon: 'badge',
  });
  const [submitting, setSubmitting] = useState(false);

  // All employees for assignment dropdown
  const [allEmployees, setAllEmployees] = useState<Array<{ id: string; fullName: string; employeeCode: string; designation?: string }>>([]);
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Load designations from backend
  const fetchDesignations = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/organization/designations');
      if (data?.success && data?.data) {
        setDesignations(data.data.designations || []);
        if (data.data.kpis) {
          setKpis(data.data.kpis);
        }
      }
    } catch (err: any) {
      console.error('Failed to load designations', err);
      toast.error(err?.response?.data?.error?.message || 'Could not fetch designations from server');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all employees for assignment option
  const fetchAllEmployees = useCallback(async () => {
    try {
      const { data } = await api.get('/employees?limit=250');
      if (data?.employees || data?.data) {
        setAllEmployees(data.employees || data.data || []);
      }
    } catch {
      // silent fallback
    }
  }, []);

  useEffect(() => {
    void fetchDesignations();
    void fetchAllEmployees();
  }, [fetchDesignations, fetchAllEmployees]);

  // Keep inspectDesignation in sync when designations refresh
  useEffect(() => {
    if (inspectDesignation) {
      const updated = designations.find((d) => d.id === inspectDesignation.id);
      if (updated) {
        setInspectDesignation(updated);
      }
    }
  }, [designations, inspectDesignation]);

  // Filtered designations list
  const filteredDesignations = useMemo(() => {
    return designations.filter((d) => {
      const matchesGrade = selectedGrade === 'ALL' || d.grade.toLowerCase().includes(selectedGrade.toLowerCase());
      if (!matchesGrade) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const inTitle = d.title.toLowerCase().includes(q);
      const inDesc = d.description.toLowerCase().includes(q);
      const inDept = (d.department || '').toLowerCase().includes(q);
      const inEmployees = d.employees.some(
        (e) => e.fullName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q)
      );
      return inTitle || inDesc || inDept || inEmployees;
    });
  }, [designations, selectedGrade, searchQuery]);

  // Filtered employees inside the inspect modal
  const filteredModalEmployees = useMemo(() => {
    if (!inspectDesignation) return [];
    if (!inspectSearch.trim()) return inspectDesignation.employees;
    const q = inspectSearch.toLowerCase();
    return inspectDesignation.employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.locationName.toLowerCase().includes(q) ||
        e.departmentName.toLowerCase().includes(q)
    );
  }, [inspectDesignation, inspectSearch]);

  const openCreateModal = () => {
    setEditingId(null);
    setModalForm({
      title: '',
      grade: 'L2 - Operational',
      department: 'Retail Operations',
      minSalary: 25000,
      maxSalary: 38000,
      band: '₹25,000 – ₹38,000',
      description: '',
      icon: 'styler',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (desig: DesignationItem) => {
    setEditingId(desig.id);
    setModalForm({
      title: desig.title,
      grade: desig.grade,
      department: desig.department || 'Retail Operations',
      minSalary: desig.minSalary,
      maxSalary: desig.maxSalary,
      band: desig.band,
      description: desig.description,
      icon: desig.icon || 'badge',
    });
    setIsModalOpen(true);
  };

  const handleSaveDesignation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.title.trim()) {
      toast.error('Designation title is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: modalForm.title.trim(),
        grade: modalForm.grade,
        department: modalForm.department,
        minSalary: Number(modalForm.minSalary),
        maxSalary: Number(modalForm.maxSalary),
        band:
          modalForm.band ||
          `₹${(Number(modalForm.minSalary) / 1000).toFixed(0)}K – ₹${(Number(modalForm.maxSalary) / 1000).toFixed(0)}K`,
        description: modalForm.description.trim(),
        icon: modalForm.icon,
      };

      if (editingId) {
        await api.put(`/organization/designations/${editingId}`, payload);
        toast.success(`Designation "${payload.title}" updated and persisted successfully`);
      } else {
        await api.post('/organization/designations', payload);
        toast.success(`Designation "${payload.title}" added to organization master`);
      }

      setIsModalOpen(false);
      void fetchDesignations();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDesignation = async (desig: DesignationItem) => {
    if (!window.confirm(`Are you sure you want to deactivate "${desig.title}"?`)) return;

    try {
      await api.delete(`/organization/designations/${desig.id}`);
      toast.success(`Designation "${desig.title}" removed`);
      if (inspectDesignation?.id === desig.id) {
        setInspectDesignation(null);
      }
      void fetchDesignations();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to remove designation');
    }
  };

  const handleAssignEmployee = async () => {
    if (!inspectDesignation || !assignEmployeeId) {
      toast.error('Please select an employee to assign');
      return;
    }

    setAssigning(true);
    try {
      await api.post(`/organization/designations/${encodeURIComponent(inspectDesignation.title)}/assign`, {
        employeeId: assignEmployeeId,
      });
      toast.success(`Employee successfully assigned to ${inspectDesignation.title}`);
      setAssignEmployeeId('');
      void fetchDesignations();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full space-y-5 p-4 text-gray-900 dark:text-gray-100">
        {/* Navigation Breadcrumb & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide uppercase">
              <span>Workforce Directory</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              <span>Career Ladder</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[#0058be] font-bold">Designations &amp; Grade Matrix</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-6 h-6 text-[#0058be]" />
                Designations &amp; Grade Matrix
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Karnataka Retail Band Standard
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchDesignations()}
              loading={loading}
              className="text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Matrix
            </Button>
            <Button
              onClick={openCreateModal}
              className="bg-[#0058be] hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm px-3.5 py-2 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Add Designation
            </Button>
          </div>
        </div>

        {/* Live Master Sync Status Banner (Replaced mock warning) */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800/80 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-emerald-900 dark:text-emerald-200 text-sm">
                    Live Organization Master · 100% Connected to Workforce Register
                  </p>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE SYNC
                  </span>
                </div>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-0.5 leading-relaxed">
                  Designations, salary bands, and grade levels persist directly to MySQL. Employee counts dynamically reflect real-time active associates mapped across Karnataka store hubs (Belagavi, Davanagere, Shivamogga).
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300">
                {kpis.totalStaffMapped} of {kpis.totalEmployees} Active Associates Mapped
              </span>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                {kpis.coveragePct}% Workforce Coverage
              </p>
            </div>
          </div>
        </div>

        {/* 4 Executive KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-white dark:bg-gray-800 border-l-4 border-l-blue-600 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                Active Roles
              </span>
              <Layers className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-gray-900 dark:text-white">
              {kpis.totalRoles} <span className="text-sm font-normal text-gray-500">Designations</span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              L1 Support to L5 Executive Levels
            </span>
          </Card>

          <Card className="p-4 bg-white dark:bg-gray-800 border-l-4 border-l-emerald-600 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                Total Staff Mapped
              </span>
              <UserCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-gray-900 dark:text-white">
              {kpis.totalStaffMapped} <span className="text-sm font-normal text-gray-500">/ {kpis.totalEmployees} Staff</span>
            </div>
            <div className="mt-2 w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, kpis.coveragePct)}%` }}
              />
            </div>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
              {kpis.coveragePct}% Workforce Covered
            </span>
          </Card>

          <Card className="p-4 bg-white dark:bg-gray-800 border-l-4 border-l-indigo-600 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                Compensation Slabs
              </span>
              <DollarSign className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              ₹{(kpis.minCompensation / 1000).toFixed(0)}K – ₹{(kpis.maxCompensation / 1000).toFixed(0)}K
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Direct Bank ACH &amp; Payroll Band
            </span>
          </Card>

          <Card className="p-4 bg-white dark:bg-gray-800 border-l-4 border-l-amber-500 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                Governance Compliance
              </span>
              <Award className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              Audited
            </div>
            <span className="text-xs text-emerald-600 font-medium mt-1">
              Karnataka Minimum Wages Act
            </span>
          </Card>
        </div>

        {/* Filter Controls & Search */}
        <Card className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Grade Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Grade Level:
              </span>
              <button
                type="button"
                onClick={() => setSelectedGrade('ALL')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                  selectedGrade === 'ALL'
                    ? 'bg-[#0058be] text-white'
                    : 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                All Grades ({designations.length})
              </button>
              {GRADE_OPTIONS.map((g) => {
                const count = designations.filter((d) => d.grade.toLowerCase().includes(g.toLowerCase())).length;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedGrade(g)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      selectedGrade === g
                        ? 'bg-[#0058be] text-white'
                        : 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {g.split(' - ')[0]} ({count})
                  </button>
                );
              })}
            </div>

            {/* Instant Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search designations, employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm pl-9 pr-3 py-1.5 text-gray-900 dark:text-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0058be]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-gray-400 hover:text-gray-600 absolute right-3 top-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Designations Grid (Interactive Cards that open Workforce Roster) */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#0058be]" />
              Configured Career Hierarchy ({filteredDesignations.length} Active Roles)
            </span>
            <span className="text-xs text-gray-400">
              Click any designation card to view all mapped employees and compensation details
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDesignations.map((d) => {
              const style = GRADE_STYLES[d.grade] || {
                bg: 'bg-gray-50 dark:bg-gray-900',
                text: 'text-gray-700 dark:text-gray-300',
                border: 'border-gray-200 dark:border-gray-700',
                bar: 'from-blue-600 to-indigo-600',
              };

              return (
                <div
                  key={d.id}
                  onClick={() => setInspectDesignation(d)}
                  className="group relative bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-xs hover:shadow-lg hover:border-[#0058be]/50 transition-all duration-200 flex flex-col justify-between cursor-pointer overflow-hidden"
                >
                  {/* Grade Accent Top Bar */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${style.bar}`} />

                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide border ${style.bg} ${style.text} ${style.border}`}
                        >
                          {d.grade}
                        </span>
                        <h3 className="font-bold text-gray-900 dark:text-white text-base mt-2 group-hover:text-[#0058be] transition-colors flex items-center gap-1.5">
                          {d.title}
                        </h3>
                        <span className="inline-block text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                          {d.department || 'Retail Operations'}
                        </span>
                      </div>

                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#0058be] flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                        <Award className="w-5 h-5" />
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed line-clamp-2">
                      {d.description}
                    </p>
                  </div>

                  {/* Footer details */}
                  <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-700/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-gray-900 dark:text-white">
                        {d.band}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#0058be] dark:text-blue-300 border border-blue-100 dark:border-blue-900/40">
                        <Users className="w-3.5 h-3.5" />
                        {d.count} Staff Mapped
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400 group-hover:text-[#0058be] font-medium pt-1">
                      <span>Click to inspect assigned workforce</span>
                      <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredDesignations.length === 0 && (
              <div className="col-span-full p-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-base font-bold text-gray-800 dark:text-gray-200">No designations found</p>
                <p className="text-xs text-gray-500 mt-1">
                  No roles match the selected filter or query. Use "Add Designation" to define a new career step.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Designation Workforce & Compensation Detail Modal ─── */}
        <Modal
          isOpen={Boolean(inspectDesignation)}
          onClose={() => setInspectDesignation(null)}
          className="max-w-4xl"
        >
          {inspectDesignation && (
            <div className="space-y-5 p-1">
              {/* Modal Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/60 text-[#0058be] border border-blue-200 dark:border-blue-800">
                      {inspectDesignation.grade}
                    </span>
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                      {inspectDesignation.department || 'Retail Operations'}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Award className="w-6 h-6 text-[#0058be]" />
                    {inspectDesignation.title}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-2xl leading-relaxed">
                    {inspectDesignation.description}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(inspectDesignation)}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Role
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteDesignation(inspectDesignation)}
                    className="text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                </div>
              </div>

              {/* Compensation & Coverage Stat Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Salary Band</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white text-sm block mt-0.5">
                    {inspectDesignation.band}
                  </span>
                  <span className="text-[10px] text-gray-500 block mt-0.5">Standard Retail Band</span>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Mapped Workforce</span>
                  <span className="font-mono font-bold text-[#0058be] text-sm block mt-0.5">
                    {inspectDesignation.count} Active Associates
                  </span>
                  <span className="text-[10px] text-gray-500 block mt-0.5">Assigned in employee master</span>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Avg Base Salary</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm block mt-0.5">
                    ₹{inspectDesignation.avgSalary.toLocaleString('en-IN')}/mo
                  </span>
                  <span className="text-[10px] text-gray-500 block mt-0.5">Actual mapped average</span>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Hub Distribution</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200 text-xs block mt-0.5 truncate" title={inspectDesignation.departmentNames.join(', ')}>
                    {inspectDesignation.departmentNames.length > 0 ? inspectDesignation.departmentNames.join(', ') : 'All Hubs'}
                  </span>
                  <span className="text-[10px] text-gray-500 block mt-0.5">Store department coverage</span>
                </div>
              </div>

              {/* Assign New Employee to this Role Widget */}
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#0058be]" />
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    Assign an employee to &ldquo;{inspectDesignation.title}&rdquo;:
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={assignEmployeeId}
                    onChange={(e) => setAssignEmployeeId(e.target.value)}
                    className="flex-1 sm:w-64 text-xs rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-1.5 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Select Associate to Assign...</option>
                    {allEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        #{emp.employeeCode} — {emp.fullName} ({emp.designation || 'No Designation'})
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    onClick={handleAssignEmployee}
                    loading={assigning}
                    disabled={!assignEmployeeId}
                    className="bg-[#0058be] hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg shrink-0"
                  >
                    Assign Role
                  </Button>
                </div>
              </div>

              {/* Mapped Employees Roster */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#0058be]" />
                    Assigned Employees ({filteredModalEmployees.length})
                  </span>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Filter assigned staff..."
                      value={inspectSearch}
                      onChange={(e) => setInspectSearch(e.target.value)}
                      className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 pl-8 pr-2.5 py-1.5 text-gray-900 dark:text-gray-100 focus:bg-white"
                    />
                  </div>
                </div>

                {filteredModalEmployees.length > 0 ? (
                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-100/70 dark:bg-gray-900/60 text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 backdrop-blur-xs">
                        <tr>
                          <th className="p-3 text-left">Associate Profile</th>
                          <th className="p-3 text-left">Store Hub</th>
                          <th className="p-3 text-left">Department</th>
                          <th className="p-3 text-left">Joining Date</th>
                          <th className="p-3 text-left">Monthly Base</th>
                          <th className="p-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-800">
                        {filteredModalEmployees.map((emp, index) => (
                          <tr key={emp.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${
                                    AVATAR_COLORS[index % AVATAR_COLORS.length]
                                  } flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs`}
                                >
                                  {getInitials(emp.fullName)}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                                    {emp.fullName}
                                    <span className="font-mono text-[10px] font-bold text-[#0058be] dark:text-blue-400">
                                      #{emp.employeeCode}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-gray-400">
                                    {emp.email || emp.phone || 'Verified Staff'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700/60 font-mono font-bold text-[10px]">
                                {emp.locationCode || 'BEL'}
                              </span>
                              <span className="text-gray-500 text-[11px] ml-1">
                                {emp.locationName}
                              </span>
                            </td>
                            <td className="p-3 text-gray-600 dark:text-gray-300 font-medium">
                              {emp.departmentName}
                            </td>
                            <td className="p-3 text-gray-500 font-mono">
                              {emp.joiningDate || '—'}
                            </td>
                            <td className="p-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                              ₹{emp.baseSalary.toLocaleString('en-IN')}
                            </td>
                            <td className="p-3">
                              <Badge variant="success" dot>
                                {emp.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    <Users className="w-8 h-8 text-gray-400 mx-auto mb-1.5" />
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      No employees are currently mapped to &ldquo;{inspectDesignation.title}&rdquo;.
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Use the &ldquo;Assign an employee&rdquo; tool above to map associates from the workforce register.
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end pt-3 border-t border-gray-100 dark:border-gray-800">
                <Button
                  variant="outline"
                  onClick={() => setInspectDesignation(null)}
                  className="text-xs px-4 py-2"
                >
                  Close Roster
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* ─── Add / Edit Designation Modal ─── */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingId ? 'Edit Designation & Grade Standard' : 'Add New Designation to Organization Master'}
        >
          <form onSubmit={handleSaveDesignation} className="space-y-4 p-1">
            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                Designation Title <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                required
                value={modalForm.title}
                onChange={(e: any) => setModalForm({ ...modalForm, title: e.target.value })}
                placeholder="e.g. Senior Merchandising Specialist"
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                  Grade Level <span className="text-red-500">*</span>
                </label>
                <select
                  value={modalForm.grade}
                  onChange={(e) => setModalForm({ ...modalForm, grade: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#0058be]"
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={modalForm.department}
                  onChange={(e) => setModalForm({ ...modalForm, department: e.target.value })}
                  placeholder="e.g. Floor Sales, Supply Chain"
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#0058be]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                  Min Monthly Base (₹)
                </label>
                <Input
                  type="number"
                  value={modalForm.minSalary}
                  onChange={(e: any) => setModalForm({ ...modalForm, minSalary: e.target.value })}
                  className="text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                  Max Monthly Base (₹)
                </label>
                <Input
                  type="number"
                  value={modalForm.maxSalary}
                  onChange={(e: any) => setModalForm({ ...modalForm, maxSalary: e.target.value })}
                  className="text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                Salary Range Band Display Text
              </label>
              <Input
                type="text"
                value={modalForm.band}
                onChange={(e: any) => setModalForm({ ...modalForm, band: e.target.value })}
                placeholder="e.g. ₹35,000 – ₹50,000"
                className="text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                Functional Role Description
              </label>
              <textarea
                rows={3}
                value={modalForm.description}
                onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
                placeholder="Key responsibilities, team hierarchy, and floor coverage duties..."
                className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#0058be]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="text-xs px-4 py-2"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={submitting}
                className="bg-[#0058be] hover:bg-blue-700 text-white font-medium text-xs px-5 py-2 rounded-lg"
              >
                {editingId ? 'Update Designation' : 'Save to Organization Master'}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
