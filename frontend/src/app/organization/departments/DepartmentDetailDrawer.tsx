'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  X,
  RotateCw,
  Search,
  Building2,
  Users,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Clock,
  Sparkles,
  Layers,
  FileCheck,
  ChevronRight,
  UserCheck,
  AlertCircle,
  Briefcase,
  Store,
  BadgeCheck,
  ArrowRight,
} from 'lucide-react';

export type DeptDrawerType =
  | 'ACTIVE_DIVISIONS'
  | 'KARNATAKA_HUBS'
  | 'STAFF_ALLOCATED'
  | 'FLAGSHIP_DIVISION'
  | 'STRUCTURE_HEALTH'
  | 'STORE_LOCATION'
  | 'DEPARTMENT_DETAIL'
  | 'TEAM_ROSTER'
  | null;

interface DepartmentDetailDrawerProps {
  isOpen: boolean;
  type: DeptDrawerType;
  onClose: () => void;
  selectedLocationId: string;
  onSelectLocation: (locId: string) => void;
  selectedDepartment: any;
  selectedLocationData?: any;
  departments: any[];
  allDepartments?: any[];
  locations: any[];
  allEmployees: any[];
  loading?: boolean;
  onRefresh: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  onOpenTeamRoster?: (dept: any) => void;
  onOpenDeptDetail?: (dept: any) => void;
}

export function DepartmentDetailDrawer({
  isOpen,
  type,
  onClose,
  selectedLocationId,
  onSelectLocation,
  selectedDepartment,
  selectedLocationData,
  departments,
  allDepartments = [],
  locations,
  allEmployees,
  loading = false,
  onRefresh,
  triggerRef,
  onOpenTeamRoster,
  onOpenDeptDetail,
}: DepartmentDetailDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [hubFilter, setHubFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const drawerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset local search and filters when type or department changes
  useEffect(() => {
    setSearch('');
    setHubFilter('ALL');
    setDeptFilter('ALL');
  }, [type, selectedDepartment?.id, selectedLocationData?.id]);

  // Lock body scroll and handle focus trap / escape key
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Focus input or drawer
    const timer = setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      } else if (drawerRef.current) {
        drawerRef.current.focus();
      }
    }, 50);

    const triggerElement = triggerRef?.current;
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      if (triggerElement) {
        triggerElement.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  // Active location object
  const activeLoc = useMemo(() => {
    return locations.find((l) => l.id === selectedLocationId) || locations[0] || null;
  }, [locations, selectedLocationId]);

  // Department list to use: current branch vs all
  const displayedDepartments = useMemo(() => {
    const list = departments.length > 0 ? departments : allDepartments;
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.code?.toLowerCase().includes(q) ||
        d.location?.name?.toLowerCase().includes(q)
    );
  }, [departments, allDepartments, search]);

  // Filtered employees for Staff Allocated drawer
  const filteredEmployees = useMemo(() => {
    return allEmployees.filter((emp) => {
      if (hubFilter !== 'ALL' && emp.locationId !== hubFilter) return false;
      if (deptFilter !== 'ALL' && emp.departmentId !== deptFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        emp.fullName?.toLowerCase().includes(q) ||
        emp.employeeCode?.toLowerCase().includes(q) ||
        emp.designation?.toLowerCase().includes(q) ||
        emp.department?.name?.toLowerCase().includes(q) ||
        emp.location?.name?.toLowerCase().includes(q)
      );
    });
  }, [allEmployees, hubFilter, deptFilter, search]);

  // Filtered employees for Department Team Roster
  const rosterEmployees = useMemo(() => {
    if (!selectedDepartment) return [];
    const deptId = selectedDepartment.id;
    return allEmployees.filter((emp) => {
      if (emp.departmentId !== deptId) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        emp.fullName?.toLowerCase().includes(q) ||
        emp.employeeCode?.toLowerCase().includes(q) ||
        emp.designation?.toLowerCase().includes(q)
      );
    });
  }, [allEmployees, selectedDepartment, search]);

  if (!mounted || !isOpen || !type) return null;

  // Drawer Title and Subtitle generator
  const getDrawerMeta = () => {
    switch (type) {
      case 'ACTIVE_DIVISIONS':
        return {
          title: 'Active Divisions',
          subtitle: `${activeLoc ? activeLoc.name : 'All Hubs'} • ${departments.length} Operational Units`,
          icon: <Layers className="w-5 h-5 text-[#722F37] dark:text-[#E8DCC6]" />,
        };
      case 'KARNATAKA_HUBS':
        return {
          title: 'Karnataka Hubs',
          subtitle: `${locations.length} Retail & Weaving Centers Across Karnataka`,
          icon: <Store className="w-5 h-5 text-[#722F37] dark:text-[#E8DCC6]" />,
        };
      case 'STAFF_ALLOCATED':
        return {
          title: 'Staff Allocated',
          subtitle: `${allEmployees.length} of ${allEmployees.length} Active Staff • 100% Departmentalized`,
          icon: <Users className="w-5 h-5 text-[#722F37] dark:text-[#E8DCC6]" />,
        };
      case 'FLAGSHIP_DIVISION':
        return {
          title: 'Flagship Division — Bridal & Silk',
          subtitle: 'Belagavi Atelier Apex • Primary Revenue Unit',
          icon: <Sparkles className="w-5 h-5 text-[#722F37] dark:text-[#E8DCC6]" />,
        };
      case 'STRUCTURE_HEALTH':
        return {
          title: 'Structure Health & RBAC Audit',
          subtitle: 'Clean Hierarchy • 100% Roles & Topologies Linked',
          icon: <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
        };
      case 'STORE_LOCATION':
        const loc = selectedLocationData || activeLoc;
        return {
          title: loc ? `${loc.name} (${loc.code})` : 'Store Location Overview',
          subtitle: `${departments.length} Units • ${allEmployees.filter((e) => e.locationId === loc?.id).length} Staff Members`,
          icon: <MapPin className="w-5 h-5 text-[#722F37] dark:text-[#E8DCC6]" />,
        };
      case 'DEPARTMENT_DETAIL':
        return {
          title: selectedDepartment ? `${selectedDepartment.name}` : 'Department Details',
          subtitle: selectedDepartment ? `Code: ${selectedDepartment.code} • ${activeLoc?.name}` : 'Unit Specifications',
          icon: <Building2 className="w-5 h-5 text-[#722F37] dark:text-[#E8DCC6]" />,
        };
      case 'TEAM_ROSTER':
        return {
          title: selectedDepartment ? `Team Roster — ${selectedDepartment.name}` : 'Team Roster',
          subtitle: `${rosterEmployees.length} Staff Deployed • ${activeLoc?.name}`,
          icon: <Users className="w-5 h-5 text-[#722F37] dark:text-[#E8DCC6]" />,
        };
      default:
        return { title: 'Details', subtitle: '', icon: null };
    }
  };

  const meta = getDrawerMeta();

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dept-drawer-title"
      className="fixed inset-0 z-50 flex justify-end"
      style={{ margin: 0, padding: 0 }}
    >
      {/* 1. Backdrop Overlay: Single even dim tone, NO blur, NO gradient, NO white gap */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 dark:bg-black/70 transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
      />

      {/* 2. Drawer Panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="relative z-10 w-full sm:w-[85vw] lg:w-[640px] max-w-[95vw] h-full bg-white dark:bg-[#0e172a] shadow-2xl flex flex-col border-l border-slate-200/80 dark:border-slate-800 animate-in slide-in-from-right duration-250 outline-none"
      >
        {/* DRAWER HEADER */}
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0e172a] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#F8F4F1] dark:bg-slate-800/80 border border-[#E5D5D7] dark:border-slate-700 flex items-center justify-center shrink-0">
              {meta.icon}
            </div>
            <div className="min-w-0">
              <h2 id="dept-drawer-title" className="text-base sm:text-lg font-bold text-[#0b1c30] dark:text-white truncate">
                {meta.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{meta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Refresh Data"
              aria-label="Refresh Data"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Close details"
              aria-label="Close details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DRAWER BODY (Internal Scroll) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* SKELETON LOADING STATE */}
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl" />
              <div className="h-28 bg-slate-100 dark:bg-slate-800 rounded-xl" />
              <div className="h-44 bg-slate-100 dark:bg-slate-800 rounded-xl" />
            </div>
          )}

          {!loading && (
            <>
              {/* ============================================================== */}
              {/* 1. ACTIVE DIVISIONS DRAWER */}
              {/* ============================================================== */}
              {type === 'ACTIVE_DIVISIONS' && (
                <div className="space-y-4">
                  {/* Summary Metric Chips */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Total Units</div>
                      <div className="text-xl font-bold text-[#0b1c30] dark:text-white mt-0.5">{departments.length}</div>
                      <div className="text-[10px] text-slate-500">In this hub</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Operational</div>
                      <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">100%</div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400">All Functional</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Active Staff</div>
                      <div className="text-xl font-bold text-[#722F37] dark:text-[#E8DCC6] mt-0.5">
                        {allEmployees.filter((e) => e.locationId === selectedLocationId).length}
                      </div>
                      <div className="text-[10px] text-slate-500">Assigned</div>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search divisions by name or code..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#722F37]"
                    />
                  </div>

                  {/* List of Divisions */}
                  <div className="space-y-3">
                    {displayedDepartments.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                        <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No operational units found</p>
                        <p className="text-[11px] text-slate-400 mt-1">Try clearing your search query</p>
                      </div>
                    ) : (
                      displayedDepartments.map((dept) => {
                        const staffCount = dept._count?.employees ?? allEmployees.filter((e) => e.departmentId === dept.id).length;
                        return (
                          <div
                            key={dept.id}
                            className="p-4 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-[#722F37]/50 dark:hover:border-[#E8DCC6]/40 transition-all space-y-2.5"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono font-bold text-[#722F37] dark:text-[#E8DCC6] bg-[#F8F4F1] dark:bg-slate-800 px-2 py-0.5 rounded border border-[#E5D5D7] dark:border-slate-700">
                                  {dept.code}
                                </span>
                                <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white">{dept.name}</h3>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                Active
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="text-slate-500">
                                Branch Hub: <span className="font-semibold text-slate-800 dark:text-slate-200">{dept.location?.name || activeLoc?.name || 'Retail Flagship'}</span>
                              </div>
                              <div className="text-slate-500">
                                Floor Allocation: <span className="font-semibold text-[#722F37] dark:text-[#E8DCC6]">Ground & 1st Floor</span>
                              </div>
                              <div className="text-slate-500">
                                Assigned Staff: <span className="font-bold text-slate-800 dark:text-slate-200">{staffCount} Staff</span>
                              </div>
                              <div className="text-slate-500">
                                Department Head: <span className="font-semibold text-slate-800 dark:text-slate-200">{dept.manager?.fullName || 'Assigned Lead'}</span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Operational & Linked
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => onOpenDeptDetail?.(dept)}
                                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#722F37] dark:hover:text-[#E8DCC6] transition-colors"
                                >
                                  View Details
                                </button>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <button
                                  onClick={() => onOpenTeamRoster?.(dept)}
                                  className="text-xs font-bold text-[#722F37] dark:text-[#E8DCC6] hover:underline flex items-center gap-0.5"
                                >
                                  <span>View Team Roster</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* 2. KARNATAKA HUBS DRAWER */}
              {/* ============================================================== */}
              {type === 'KARNATAKA_HUBS' && (
                <div className="space-y-4">
                  {/* Enterprise Overview Banner */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-[#722F37] to-[#551E24] text-white space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#E8DCC6]">Karnataka Topology</div>
                    <div className="text-xl font-bold tracking-tight">4 Retail & Weaving Hubs Active</div>
                    <p className="text-xs text-white/80">
                      Covers Belagavi Head Store (BEL), Davanagere Mega Store (DAV), Shivamogga Flagship (SHI), and Hubballi Test Hub (HUB).
                    </p>
                  </div>

                  {/* Hub Cards List */}
                  <div className="space-y-3">
                    {locations.map((loc) => {
                      const staffCount = allEmployees.filter((e) => e.locationId === loc.id).length;
                      const isSelected = selectedLocationId === loc.id;
                      const hubType =
                        loc.code === 'BEL'
                          ? 'Retail Flagship & Weaving Atelier'
                          : loc.code === 'DAV'
                          ? 'Mega Retail Showroom'
                          : loc.code === 'SHI'
                          ? 'Flagship Showroom'
                          : 'Regional Operations Hub';

                      return (
                        <div
                          key={loc.id}
                          className={`p-4 rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-[#F8F4F1] dark:bg-[#722F37]/15 border-[#722F37] dark:border-[#E8DCC6]/60 shadow-sm'
                              : 'bg-white dark:bg-[#0e172a] border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-2 py-0.5 rounded">
                                  {loc.code}
                                </span>
                                <h3 className="font-bold text-sm text-[#0b1c30] dark:text-white">{loc.name}</h3>
                              </div>
                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                {loc.address || `${loc.city}, ${loc.state}`}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              Active
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                            <div>
                              <span className="text-slate-400">Hub Type:</span>{' '}
                              <span className="font-medium text-slate-800 dark:text-slate-200">{hubType}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Total Units:</span>{' '}
                              <span className="font-bold text-[#722F37] dark:text-[#E8DCC6]">6 Units</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Allocated Staff:</span>{' '}
                              <span className="font-bold text-slate-900 dark:text-white">{staffCount} Members</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Structure Health:</span>{' '}
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">100% RBAC Linked</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500">
                              {isSelected ? '✓ Currently Selected in Dashboard' : 'Click to select this hub in dashboard'}
                            </span>
                            <button
                              onClick={() => {
                                onSelectLocation(loc.id);
                                onClose();
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-[#722F37] text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              <span>{isSelected ? 'Active Selection' : 'Select Hub'}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* 3. STAFF ALLOCATED DRAWER (35 / 35) */}
              {/* ============================================================== */}
              {type === 'STAFF_ALLOCATED' && (
                <div className="space-y-4">
                  {/* Allocation Health Bar */}
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">Staff Deployment</div>
                      <div className="text-xl font-bold text-emerald-900 dark:text-emerald-200">
                        {allEmployees.length} / {allEmployees.length} Staff Allocated
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                        100% Departmentalized • 0 Unassigned Staff
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center font-bold">
                      <UserCheck className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Filters: Hub Selector & Search */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search by name, ID, role..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#722F37]"
                      />
                    </div>
                    <select
                      value={hubFilter}
                      onChange={(e) => setHubFilter(e.target.value)}
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#722F37]"
                    >
                      <option value="ALL">All Hubs ({allEmployees.length})</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Staff List Table */}
                  <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#0e172a]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                            <th className="py-2.5 px-3">Employee</th>
                            <th className="py-2.5 px-3">Unit & Hub</th>
                            <th className="py-2.5 px-3">Designation</th>
                            <th className="py-2.5 px-3">Shift</th>
                            <th className="py-2.5 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredEmployees.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-400">
                                No staff records matching your filter.
                              </td>
                            </tr>
                          ) : (
                            filteredEmployees.map((emp) => (
                              <tr key={emp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-3">
                                  <Link
                                    href={`/employees/profile/${emp.id}`}
                                    className="group/emp flex items-center gap-2 hover:opacity-90"
                                    title={`Open complete profile for ${emp.fullName}`}
                                    aria-label={`Open complete profile for ${emp.fullName}`}
                                  >
                                    <div className="w-7 h-7 rounded-full bg-[#722F37] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                                      {emp.fullName?.substring(0, 2).toUpperCase() || 'EM'}
                                    </div>
                                    <div>
                                      <div className="font-bold text-slate-900 dark:text-white group-hover/emp:text-[#722F37] dark:group-hover/emp:text-[#E8DCC6] transition-colors flex items-center gap-1">
                                        <span>{emp.fullName}</span>
                                        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/emp:opacity-100 text-[#722F37]" />
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode}</div>
                                    </div>
                                  </Link>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-medium text-slate-800 dark:text-slate-200">
                                    {emp.department?.name || 'Sales & Retail'}
                                  </div>
                                  <div className="text-[10px] text-slate-400">{emp.location?.name || 'Belagavi Head Store'}</div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="font-medium text-slate-700 dark:text-slate-300">{emp.designation || 'Staff'}</span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="text-[11px] text-slate-500 font-mono">{emp.shift?.name || 'General Shift'}</span>
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <Link
                                    href={`/employees/profile/${emp.id}`}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F8F4F1] dark:bg-slate-800 text-[#722F37] dark:text-[#E8DCC6] font-semibold text-[10px] hover:underline"
                                    title={`Open complete profile for ${emp.fullName}`}
                                  >
                                    <span>Profile</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </Link>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* 4. FLAGSHIP DIVISION DRAWER (Bridal & Silk) */}
              {/* ============================================================== */}
              {type === 'FLAGSHIP_DIVISION' && (
                <div className="space-y-4">
                  {/* Hero Banner */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-[#722F37] to-[#45161C] text-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full bg-white/20 text-[#E8DCC6] text-[10px] font-bold uppercase tracking-wider">
                        Primary Revenue Apex
                      </span>
                      <span className="text-xs text-white/80 font-mono">CODE: BRIDAL-SILK</span>
                    </div>
                    <h3 className="text-xl font-bold tracking-tight">Bridal & Silk Atelier Apex</h3>
                    <p className="text-xs text-white/80">
                      Located at Belagavi Atelier Apex showroom. Specializes in luxury wedding silks, heirloom Kanjivarams, and private bridal suite consultations.
                    </p>
                  </div>

                  {/* Operational Indicators */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">Branch Hub</span>
                      <div className="font-bold text-slate-900 dark:text-white mt-1">Belagavi Atelier Apex</div>
                      <div className="text-[11px] text-slate-500">Khade Bazar Store</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">Revenue Status</span>
                      <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-1">Primary Revenue Unit</div>
                      <div className="text-[11px] text-slate-500">Tier-1 Gross Volume</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">Assigned Consultants</span>
                      <div className="font-bold text-[#722F37] dark:text-[#E8DCC6] mt-1">
                        {allEmployees.filter((e) => e.location?.code === 'BEL' && e.department?.code === 'SALES').length} Master Consultants
                      </div>
                      <div className="text-[11px] text-slate-500">Dedicated Silk Specialists</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                      <span className="text-slate-400 text-[10px] uppercase font-bold">Performance Index</span>
                      <div className="font-bold text-slate-900 dark:text-white mt-1">98.4% CSAT</div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400">100% Audit Cleared</div>
                    </div>
                  </div>

                  {/* Team Members List */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Key Atelier Specialists & Leadership
                    </h4>
                    <div className="space-y-2">
                      {allEmployees
                        .filter((e) => e.location?.code === 'BEL')
                        .slice(0, 5)
                        .map((emp) => (
                          <div
                            key={emp.id}
                            className="p-3 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200/80 dark:border-slate-800 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#722F37] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                {emp.fullName?.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <Link
                                  href={`/employees/profile/${emp.id}`}
                                  className="font-bold text-xs text-slate-900 dark:text-white hover:text-[#722F37] transition-colors"
                                >
                                  {emp.fullName}
                                </Link>
                                <div className="text-[10px] text-slate-400">{emp.designation} • {emp.employeeCode}</div>
                              </div>
                            </div>
                            <Link
                              href={`/employees/profile/${emp.id}`}
                              className="text-[11px] font-bold text-[#722F37] dark:text-[#E8DCC6] hover:underline flex items-center gap-0.5"
                            >
                              <span>Dossier</span>
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* 5. STRUCTURE HEALTH DRAWER (100%) */}
              {/* ============================================================== */}
              {type === 'STRUCTURE_HEALTH' && (
                <div className="space-y-4">
                  {/* Gauge Score Card */}
                  <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 text-center space-y-1">
                    <div className="inline-flex p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 mb-1">
                      <ShieldCheck className="w-7 h-7" />
                    </div>
                    <div className="text-3xl font-extrabold text-emerald-800 dark:text-emerald-300">100% HEALTH SCORE</div>
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Enterprise Hierarchy & RBAC Clean
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md mx-auto pt-1">
                      Audited topology across all 4 Karnataka operational hubs. Zero unassigned employees, zero orphaned departments, zero broken RBAC roles.
                    </p>
                  </div>

                  {/* Checklist Breakdown */}
                  <div className="space-y-2.5">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">Audit Verification Items</h4>

                    {[
                      {
                        title: 'RBAC Role Linkage',
                        desc: 'All 35 staff accounts have verified system roles and security groups.',
                        status: '100% RBAC Linked',
                        state: 'ok',
                      },
                      {
                        title: 'Department Assignment Check',
                        desc: '0 unassigned or loose personnel; every employee is mapped to an operational division.',
                        status: 'No Unassigned Staff',
                        state: 'ok',
                      },
                      {
                        title: 'Orphaned Divisions Audit',
                        desc: 'All 24 department records have valid parent location hubs and floor topologies.',
                        status: 'No Issues Found',
                        state: 'ok',
                      },
                      {
                        title: 'Managerial Reporting Hierarchy',
                        desc: 'Supervisors and floor managers properly assigned across showroom shifts.',
                        status: 'Hierarchy Complete',
                        state: 'ok',
                      },
                      {
                        title: 'Store Coverage Verification',
                        desc: 'Active retail coverage at Belagavi, Davanagere, Shivamogga, and Hubballi.',
                        status: '4/4 Hubs Operational',
                        state: 'ok',
                      },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white">{item.title}</div>
                            <div className="text-[11px] text-slate-500">{item.desc}</div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* 6. STORE LOCATION CHIPS DRAWER */}
              {/* ============================================================== */}
              {type === 'STORE_LOCATION' && (
                <div className="space-y-4">
                  {(() => {
                    const loc = selectedLocationData || activeLoc;
                    const locStaff = allEmployees.filter((e) => e.locationId === loc?.id);
                    return (
                      <>
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-xs bg-[#722F37] text-white px-2 py-0.5 rounded">
                              {loc?.code}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              Active Showroom
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{loc?.name}</h3>
                          <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {loc?.address || `${loc?.city}, ${loc?.state}`}
                          </p>
                        </div>

                        {/* Store Statistics */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200 dark:border-slate-800">
                            <div className="text-slate-400 text-[10px] font-bold uppercase">Assigned Units</div>
                            <div className="text-xl font-bold text-[#722F37] dark:text-[#E8DCC6] mt-0.5">
                              {departments.length} Operational Units
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200 dark:border-slate-800">
                            <div className="text-slate-400 text-[10px] font-bold uppercase">Staff Headcount</div>
                            <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                              {locStaff.length} Employees
                            </div>
                          </div>
                        </div>

                        {/* Breakdown of Units */}
                        <div className="space-y-2">
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                            Units Operating at {loc?.code}
                          </h4>
                          <div className="space-y-2">
                            {departments.map((dept) => {
                              const deptStaffCount = locStaff.filter((e) => e.departmentId === dept.id).length;
                              return (
                                <div
                                  key={dept.id}
                                  className="p-3 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200/80 dark:border-slate-800 flex items-center justify-between hover:border-[#722F37]/40 transition-colors"
                                >
                                  <div>
                                    <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                                      <span className="font-mono text-[10px] text-[#722F37] dark:text-[#E8DCC6] bg-[#F8F4F1] dark:bg-slate-800 px-1.5 py-0.2 rounded border border-[#E5D5D7] dark:border-slate-700">
                                        {dept.code}
                                      </span>
                                      <span>{dept.name}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">{deptStaffCount} Staff Assigned</div>
                                  </div>
                                  <button
                                    onClick={() => onOpenTeamRoster?.(dept)}
                                    className="text-xs font-bold text-[#722F37] dark:text-[#E8DCC6] hover:underline flex items-center gap-0.5"
                                  >
                                    <span>Roster</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ============================================================== */}
              {/* 7. DEPARTMENT DETAIL DRAWER */}
              {/* ============================================================== */}
              {type === 'DEPARTMENT_DETAIL' && selectedDepartment && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-[#722F37] dark:text-[#E8DCC6] bg-[#F8F4F1] dark:bg-slate-800 px-2 py-0.5 rounded border border-[#E5D5D7] dark:border-slate-700">
                        {selectedDepartment.code}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        Operational
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-[#0b1c30] dark:text-white">{selectedDepartment.name}</h3>
                    <p className="text-xs text-slate-500">
                      Branch Hub: <span className="font-semibold text-slate-800 dark:text-slate-200">{activeLoc?.name}</span>
                    </p>
                  </div>

                  {/* Specifications Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400 text-[10px] font-bold uppercase">Floor Allocation</div>
                      <div className="font-bold text-[#722F37] dark:text-[#E8DCC6] mt-0.5">Ground & 1st Floor</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400 text-[10px] font-bold uppercase">Assigned Staff</div>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {allEmployees.filter((e) => e.departmentId === selectedDepartment.id).length} Active Members
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400 text-[10px] font-bold uppercase">Supervisor / Lead</div>
                      <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                        {selectedDepartment.manager?.fullName || 'Assigned Lead'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-[#0e172a] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400 text-[10px] font-bold uppercase">Shift Coverage</div>
                      <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">General & Morning Shifts</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex items-center justify-end">
                    <button
                      onClick={() => onOpenTeamRoster?.(selectedDepartment)}
                      className="px-4 py-2 bg-[#722F37] hover:bg-[#5B232A] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span>View Team Roster</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* 8. TEAM ROSTER DRAWER */}
              {/* ============================================================== */}
              {type === 'TEAM_ROSTER' && (
                <div className="space-y-4">
                  {/* Roster Header */}
                  <div className="p-4 rounded-xl bg-[#F8F4F1] dark:bg-slate-800/60 border border-[#E5D5D7] dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono font-bold text-[#722F37] dark:text-[#E8DCC6]">
                        {selectedDepartment?.code || 'DEPT'}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {selectedDepartment?.name || 'Department Roster'}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Branch: {activeLoc?.name} • {rosterEmployees.length} Members Deployed
                      </div>
                    </div>
                    <div className="text-2xl font-black text-[#722F37] dark:text-[#E8DCC6]">
                      {rosterEmployees.length}
                    </div>
                  </div>

                  {/* Search within Roster */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search roster by staff name or ID..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#722F37]"
                    />
                  </div>

                  {/* Roster Table */}
                  <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#0e172a]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                            <th className="py-2.5 px-3">Staff Member</th>
                            <th className="py-2.5 px-3">Designation</th>
                            <th className="py-2.5 px-3">Shift</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">Profile</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {rosterEmployees.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-400">
                                No employees assigned to this unit currently.
                              </td>
                            </tr>
                          ) : (
                            rosterEmployees.map((emp) => (
                              <tr key={emp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-3">
                                  <Link
                                    href={`/employees/profile/${emp.id}`}
                                    className="group/emp flex items-center gap-2"
                                    title={`Open complete profile for ${emp.fullName}`}
                                    aria-label={`Open complete profile for ${emp.fullName}`}
                                  >
                                    <div className="w-7 h-7 rounded-full bg-[#722F37] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                                      {emp.fullName?.substring(0, 2).toUpperCase() || 'EM'}
                                    </div>
                                    <div>
                                      <div className="font-bold text-slate-900 dark:text-white group-hover/emp:text-[#722F37] transition-colors flex items-center gap-1">
                                        <span>{emp.fullName}</span>
                                        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/emp:opacity-100 text-[#722F37]" />
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode}</div>
                                    </div>
                                  </Link>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="font-medium text-slate-800 dark:text-slate-200">{emp.designation || 'Staff'}</span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="text-[11px] text-slate-500 font-mono">{emp.shift?.name || 'General Shift'}</span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                    Active
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <Link
                                    href={`/employees/profile/${emp.id}`}
                                    className="inline-flex items-center gap-0.5 text-[#722F37] dark:text-[#E8DCC6] font-bold hover:underline"
                                    title={`Open complete profile for ${emp.fullName}`}
                                  >
                                    <span>Profile</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </Link>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* DRAWER FOOTER */}
        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0 text-xs">
          <span className="text-slate-400 dark:text-slate-500">
            {activeLoc?.name} • BSC Textiles Enterprise HRMS
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
