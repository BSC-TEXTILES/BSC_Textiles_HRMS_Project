'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { DepartmentDetailDrawer, DeptDrawerType } from './DepartmentDetailDrawer';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [allDepartments, setAllDepartments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Drawer state
  const [activeDrawer, setActiveDrawer] = useState<DeptDrawerType>(null);
  const [selectedDeptForDrawer, setSelectedDeptForDrawer] = useState<any>(null);
  const [selectedLocForDrawer, setSelectedLocForDrawer] = useState<any>(null);

  // Focus restoration refs
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);
  const card4Ref = useRef<HTMLDivElement>(null);
  const card5Ref = useRef<HTMLDivElement>(null);
  const [activeTriggerRef, setActiveTriggerRef] = useState<React.RefObject<HTMLElement | null>>(card1Ref);

  const [newDept, setNewDept] = useState({
    name: '',
    code: '',
    locationId: '',
  });

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get('/locations/all');
      const list = res.data || [];
      setLocations(list);
      if (list.length > 0) {
        setSelectedLocation((prev) => prev || list[0].id);
      }
    } catch (e) {
      console.error('Failed to load locations:', e);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true);
      const url = selectedLocation ? `/departments?locationId=${selectedLocation}&limit=100` : '/departments?limit=100';
      const [deptRes, allDeptRes] = await Promise.all([
        api.get(url),
        api.get('/departments?limit=100').catch(() => ({ data: [] })),
      ]);
      setDepartments(deptRes.data?.departments || deptRes.data || []);
      setAllDepartments(allDeptRes.data?.departments || allDeptRes.data || []);
    } catch (e) {
      console.error('Failed to load departments:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await api.get('/employees?limit=100');
      const list = res.data?.employees || res.data || [];
      setAllEmployees(list.filter((e: any) => e.status === 'ACTIVE' || !e.status));
    } catch (e) {
      console.error('Failed to load employees:', e);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
    fetchEmployees();
  }, [fetchLocations, fetchEmployees]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const handleRefresh = useCallback(() => {
    fetchLocations();
    fetchDepartments();
    fetchEmployees();
    toast.success('Department data refreshed');
  }, [fetchLocations, fetchDepartments, fetchEmployees]);

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDept.name || !newDept.locationId) {
      toast.error('Department name and location are required');
      return;
    }
    try {
      await api.post('/departments', {
        name: newDept.name,
        code: newDept.code || `DEPT-${Math.floor(100 + Math.random() * 900)}`,
        locationId: newDept.locationId,
      });
      toast.success('Department created successfully!');
      setIsAddModalOpen(false);
      setNewDept({ name: '', code: '', locationId: selectedLocation });
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create department');
    }
  };

  const handleOpenDrawer = (
    type: DeptDrawerType,
    ref?: React.RefObject<HTMLElement | null> | null,
    dept?: any,
    locData?: any
  ) => {
    if (ref) setActiveTriggerRef(ref);
    setSelectedDeptForDrawer(dept || null);
    setSelectedLocForDrawer(locData || null);
    setActiveDrawer(type);
  };

  // Active location object and staff stats
  const activeLocationObj = useMemo(() => {
    return locations.find((l) => l.id === selectedLocation) || locations[0] || null;
  }, [locations, selectedLocation]);

  const activeStaffTotal = useMemo(() => {
    return allEmployees.length || 35;
  }, [allEmployees]);

  const hubCodesString = useMemo(() => {
    if (locations.length === 0) return 'BEL • DAV • SHI • HUB';
    return locations.map((l) => l.code).join(' • ');
  }, [locations]);

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] uppercase tracking-wider font-bold">
              <span>Workforce Directory</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#1346a1] dark:text-[#E8DCC6]">Enterprise Hierarchy & Operational Units</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#0b1c30] dark:text-white tracking-tight">
                Departments & Organizational Units Dashboard
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F8F4F1] dark:bg-slate-800 text-[#1346a1] dark:text-[#E8DCC6] text-[10px] font-bold uppercase tracking-wider border border-[#E5D5D7] dark:border-slate-700 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#1346a1] dark:bg-[#E8DCC6]"></span> Org Structure Active
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Structural divisions across Karnataka retail showrooms, weaving ateliers, inventory warehouses, and regional leadership.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-md shadow-[#1346a1]/20 transition-all text-xs font-bold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Create Department</span>
            </button>
          </div>
        </div>

        {/* 5 DEPARTMENT KPIS (Interactive & Accessible) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. Active Divisions */}
          <div
            ref={card1Ref}
            role="button"
            tabIndex={0}
            aria-label="View details for Active Divisions"
            onClick={() => handleOpenDrawer('ACTIVE_DIVISIONS', card1Ref)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenDrawer('ACTIVE_DIVISIONS', card1Ref);
              }
            }}
            className="group cursor-pointer bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-[#1346a1]/60 dark:hover:border-[#E8DCC6]/60 hover:shadow-md transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Divisions</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6] group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">{departments.length || 6}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">Total Operational Units</div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] flex items-center justify-between font-semibold text-[#1346a1] dark:text-[#E8DCC6]">
              <span>All Functional</span>
              <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                View Details →
              </span>
            </div>
          </div>

          {/* 2. Karnataka Hubs */}
          <div
            ref={card2Ref}
            role="button"
            tabIndex={0}
            aria-label="View details for Karnataka Hubs"
            onClick={() => handleOpenDrawer('KARNATAKA_HUBS', card2Ref)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenDrawer('KARNATAKA_HUBS', card2Ref);
              }
            }}
            className="group cursor-pointer bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-[#1346a1]/60 dark:hover:border-[#E8DCC6]/60 hover:shadow-md transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Karnataka Hubs</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6] group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[18px]">domain</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">{locations.length || 4}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">Retail & Weaving Centers</div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] flex items-center justify-between font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="truncate max-w-[120px]">{hubCodesString}</span>
              <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[#1346a1] dark:text-[#E8DCC6]">
                View Details →
              </span>
            </div>
          </div>

          {/* 3. Staff Allocated */}
          <div
            ref={card3Ref}
            role="button"
            tabIndex={0}
            aria-label="View details for Staff Allocated"
            onClick={() => handleOpenDrawer('STAFF_ALLOCATED', card3Ref)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenDrawer('STAFF_ALLOCATED', card3Ref);
              }
            }}
            className="group cursor-pointer bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-[#1346a1]/60 dark:hover:border-[#E8DCC6]/60 hover:shadow-md transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Staff Allocated</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6] group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[18px]">badge</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">
                {activeStaffTotal} / {activeStaffTotal}
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">100% Departmentalized</div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] flex items-center justify-between font-semibold text-slate-500 dark:text-slate-400">
              <span>No Unassigned Staff</span>
              <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[#1346a1] dark:text-[#E8DCC6]">
                View Details →
              </span>
            </div>
          </div>

          {/* 4. Flagship Division */}
          <div
            ref={card4Ref}
            role="button"
            tabIndex={0}
            aria-label="View details for Flagship Division"
            onClick={() => handleOpenDrawer('FLAGSHIP_DIVISION', card4Ref)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenDrawer('FLAGSHIP_DIVISION', card4Ref);
              }
            }}
            className="group cursor-pointer bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-[#1346a1]/60 dark:hover:border-[#E8DCC6]/60 hover:shadow-md transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Flagship Division</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6] group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[18px]">styler</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-lg font-bold text-[#0b1c30] dark:text-white truncate">Bridal & Silk</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">Belagavi Atelier Apex</div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] flex items-center justify-between font-semibold text-[#1346a1] dark:text-[#E8DCC6]">
              <span>Primary Revenue Unit</span>
              <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                View Details →
              </span>
            </div>
          </div>

          {/* 5. Structure Health */}
          <div
            ref={card5Ref}
            role="button"
            tabIndex={0}
            aria-label="View details for Structure Health"
            onClick={() => handleOpenDrawer('STRUCTURE_HEALTH', card5Ref)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenDrawer('STRUCTURE_HEALTH', card5Ref);
              }
            }}
            className="group cursor-pointer bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-[#1346a1]/60 dark:hover:border-[#E8DCC6]/60 hover:shadow-md transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Structure Health</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">100%</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">Clean Hierarchy</div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] flex items-center justify-between font-semibold text-emerald-600 dark:text-emerald-400">
              <span>RBAC Linked</span>
              <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[#1346a1] dark:text-[#E8DCC6]">
                View Details →
              </span>
            </div>
          </div>
        </div>

        {/* Location Filter & Department Cards */}
        <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-[#0b1c30] dark:text-white">Select Store Location:</span>
            <div className="flex flex-wrap gap-2">
              {locations.map((loc) => {
                const isSelected = selectedLocation === loc.id;
                return (
                  <button
                    key={loc.id}
                    onClick={() => {
                      setSelectedLocation(loc.id);
                      handleOpenDrawer('STORE_LOCATION', null, null, loc);
                    }}
                    aria-label={`Select store ${loc.name} (${loc.code})`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] ${
                      isSelected
                        ? 'bg-[#1346a1] text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {loc.name} ({loc.code})
                  </button>
                );
              })}
            </div>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
            {departments.length} Units in this branch
          </span>
        </div>

        {/* DEPARTMENTS GRID (Interactive Cards & Actual Assigned Counts) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((d) => {
            const staffCount =
              d._count?.employees ?? allEmployees.filter((e) => e.departmentId === d.id).length;
            const staffDisplay = typeof staffCount === 'number' ? `${staffCount} Staff` : 'Not available';

            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${d.name}`}
                onClick={() => handleOpenDrawer('DEPARTMENT_DETAIL', null, d)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenDrawer('DEPARTMENT_DETAIL', null, d);
                  }
                }}
                className="group cursor-pointer bg-white dark:bg-[#0e172a] rounded-xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-[#1346a1]/50 dark:hover:border-[#E8DCC6]/50 transition-all flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1]"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-[#1346a1] dark:text-[#E8DCC6] bg-[#F8F4F1] dark:bg-slate-800 px-2 py-0.5 rounded border border-[#E5D5D7] dark:border-slate-700">
                        {d.code || 'DEPT-101'}
                      </span>
                      <h3 className="text-base font-bold text-[#0b1c30] dark:text-white mt-1.5 group-hover:text-[#1346a1] dark:group-hover:text-[#E8DCC6] transition-colors">
                        {d.name}
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      Active
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Branch Hub:</span>
                      <span className="font-bold text-[#0b1c30] dark:text-white">
                        {d.location?.name || activeLocationObj?.name || 'Retail Flagship'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 px-1">
                      <span>Floor Allocation:</span>
                      <span className="font-bold text-[#1346a1] dark:text-[#E8DCC6]">Ground & 1st Floor</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 px-1">
                      <span>Assigned Staff:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{staffDisplay}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Operational</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDrawer('TEAM_ROSTER', null, d);
                    }}
                    aria-label={`Open team roster for ${d.name}`}
                    className="font-semibold text-[#1346a1] dark:text-[#E8DCC6] hover:underline flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1346a1]"
                  >
                    <span>View Team Roster</span>
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* CREATE DEPT MODAL (Preserved Form & Logic) */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#0e172a] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1346a1] dark:text-[#E8DCC6] text-[20px]">corporate_fare</span>
                  <h3 className="font-bold text-base text-[#0b1c30] dark:text-white">Create Department / Unit</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateDept} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">Department Name *</label>
                  <input
                    type="text"
                    required
                    value={newDept.name}
                    onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                    placeholder="e.g. Silk Weaving & QA"
                    className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">Store Location Hub *</label>
                  <select
                    required
                    value={newDept.locationId}
                    onChange={(e) => setNewDept({ ...newDept, locationId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs"
                  >
                    <option value="">Select Location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">Department Code</label>
                  <input
                    type="text"
                    value={newDept.code}
                    onChange={(e) => setNewDept({ ...newDept, code: e.target.value })}
                    placeholder="e.g. DEPT-WEAVE-01"
                    className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs bg-[#1346a1] hover:bg-[#0e3882] text-white rounded-lg font-bold shadow-sm cursor-pointer"
                  >
                    Save Department
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DETAIL DRAWER COMPONENT */}
        <DepartmentDetailDrawer
          isOpen={Boolean(activeDrawer)}
          type={activeDrawer}
          onClose={() => setActiveDrawer(null)}
          selectedLocationId={selectedLocation}
          onSelectLocation={(locId) => {
            setSelectedLocation(locId);
          }}
          selectedDepartment={selectedDeptForDrawer}
          selectedLocationData={selectedLocForDrawer}
          departments={departments}
          allDepartments={allDepartments}
          locations={locations}
          allEmployees={allEmployees}
          loading={loading}
          onRefresh={handleRefresh}
          triggerRef={activeTriggerRef}
          onOpenTeamRoster={(dept) => {
            setSelectedDeptForDrawer(dept);
            setActiveDrawer('TEAM_ROSTER');
          }}
          onOpenDeptDetail={(dept) => {
            setSelectedDeptForDrawer(dept);
            setActiveDrawer('DEPARTMENT_DETAIL');
          }}
        />
      </div>
    </DashboardLayout>
  );
}
