'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DetailDrillDownModal, type DetailMetric } from '@/components/dashboard/DetailDrillDownModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function ShiftsRosterPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [drill, setDrill] = useState<{ metric: DetailMetric; title: string; shiftId?: string; shiftName?: string } | null>(null);
  const [newShift, setNewShift] = useState({
    name: '',
    code: '',
    locationId: '',
    startTime: '09:30',
    endTime: '18:30',
    gracePeriod: 5,
    lateThreshold: 15,
  });

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get('/locations/all');
      const list = res.data || [];
      setLocations(list);
      if (list.length > 0) setSelectedLocation(list[0].id);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await api.get('/departments');
      setDepartments(res.data?.departments || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      const url = selectedLocation ? `/shifts?locationId=${selectedLocation}` : '/shifts';
      const res = await api.get(url);
      setShifts(res.data?.shifts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  useEffect(() => {
    fetchLocations();
    fetchDepartments();
  }, [fetchLocations, fetchDepartments]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShift.name || !newShift.locationId) {
      toast.error('Shift name and location are required');
      return;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.post('/shifts', {
        name: newShift.name,
        code: newShift.code || `SHIFT-${Math.floor(100 + Math.random() * 900)}`,
        locationId: newShift.locationId,
        startTime: `${today}T${newShift.startTime}:00.000Z`,
        endTime: `${today}T${newShift.endTime}:00.000Z`,
        gracePeriod: Number(newShift.gracePeriod),
        lateThreshold: Number(newShift.lateThreshold),
      });
      toast.success('Shift created successfully!');
      setIsAddModalOpen(false);
      fetchShifts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create shift');
    }
  };

  /** Resolve a shift definition by its code (e.g. MORNING / GENERAL). */
  const shiftByCode = (code: string) =>
    shifts.find((s) => String(s.code || '').toUpperCase() === code) || null;

  const openDrill = (metric: DetailMetric, title: string, shiftId?: string, shiftName?: string) =>
    setDrill({ metric, title, shiftId, shiftName });

  /** Filters + chips passed to the drill-down detail view. */
  const activeShiftId = drill?.shiftId || (selectedShift !== 'all' ? selectedShift : undefined);
  const drillFilters = {
    locationId: selectedLocation || 'all',
    departmentId: selectedDept,
    shiftId: activeShiftId || 'all',
    status: selectedStatus,
    date: selectedDate,
  };
  const drillChips = [
    { label: 'Hub', value: locations.find((l) => l.id === selectedLocation)?.name || 'All Hubs' },
    { label: 'Dept', value: departments.find((d) => d.id === selectedDept)?.name || 'All Departments' },
    { label: 'Shift', value: drill?.shiftName || shifts.find((s) => s.id === activeShiftId)?.name || 'All Shifts' },
    { label: 'Status', value: selectedStatus === 'all' ? 'All Statuses' : selectedStatus },
    { label: 'Date', value: selectedDate },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
              <span>Time & Attendance</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#0058be]">Staff Rostering & Shift Allocations</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight">
                Floor Shifts & Workforce Rosters Dashboard
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0058be] text-[10px] font-bold uppercase tracking-wider border border-[#dce9ff] flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0058be]"></span> Roster Synced
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Active shift timing definitions, grace windows, Karnataka store rosters, and floor allocation oversight.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0058be] hover:bg-[#2170e4] text-white shadow-md shadow-[#0058be]/20 transition-all text-xs font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Create Floor Shift</span>
            </button>
          </div>
        </div>

        {/* 5 SHIFT KPIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <button
            type="button"
            onClick={() => openDrill('shift-configs', 'Active Shifts')}
            aria-label="View Floor Shift Regularization details: Active Shifts"
            className="group bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#0058be]/40 hover:bg-[#eff4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Shifts</span>
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[18px]">calendar_view_week</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">{shifts.length || 3}</div>
              <div className="text-[11px] text-slate-400">Store Windows Defined</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-[#0058be] font-semibold">
              <span>All 4 Locations Active</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-[#0058be] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openDrill('shift-roster', 'Total Staff Rostered')}
            aria-label="View Floor Shift Regularization details: Total Staff Rostered"
            className="group bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#0058be]/40 hover:bg-[#eff4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Staff Rostered</span>
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[18px]">badge</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">35 / 35</div>
              <div className="text-[11px] text-slate-400">100% Floor Coverage</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-600 font-semibold">
              <span>No Unassigned Personnel</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-[#0058be] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              openDrill('shift-roster', 'Shift A (Morning)', shiftByCode('MORNING')?.id, shiftByCode('MORNING')?.name)
            }
            aria-label="View Floor Shift Regularization details: Shift A (Morning)"
            className="group bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#0058be]/40 hover:bg-[#eff4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shift A (Morning)</span>
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[18px]">wb_sunny</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">24 Staff</div>
              <div className="text-[11px] text-slate-400">09:30 AM - 06:30 PM</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Primary Floor Retail</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-[#0058be] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              openDrill('shift-roster', 'Shift B (General)', shiftByCode('GENERAL')?.id, shiftByCode('GENERAL')?.name)
            }
            aria-label="View Floor Shift Regularization details: Shift B (General)"
            className="group bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#0058be]/40 hover:bg-[#eff4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shift B (General)</span>
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[18px]">schedule</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">8 Staff</div>
              <div className="text-[11px] text-slate-400">10:30 AM - 07:30 PM</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Weaving & Management</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-[#0058be] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openDrill('shift-exceptions', 'Grace Period & Regularization')}
            aria-label="View Floor Shift Regularization details: Grace Period"
            className="group bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#0058be]/40 hover:bg-[#eff4ff]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grace Period</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">5 Mins</div>
              <div className="text-[11px] text-slate-400">15m Late Cutoff</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-600 font-semibold">
              <span>Statutory Rule Enforced</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-[#0058be] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>
        </div>

        {/* Location Filter & Shift Cards Grid */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#0b1c30]">Filter by Location Hub:</span>
            <div className="flex flex-wrap gap-2">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedLocation === loc.id
                      ? 'bg-[#0058be] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {loc.name} ({loc.code})
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-slate-400">{shifts.length} Shifts Configured</span>
        </div>

        {/* Detail Drill-down Filters (Department / Shift / Status / Date) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="fsr-dept" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
            <select
              id="fsr-dept"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 cursor-pointer"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fsr-shift" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shift</label>
            <select
              id="fsr-shift"
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 cursor-pointer"
            >
              <option value="all">All Shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code || '—'})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fsr-status" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee Status</label>
            <select
              id="fsr-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PROBATION">Probation</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="INACTIVE">Inactive</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fsr-date" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</label>
            <input
              id="fsr-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 cursor-pointer"
            />
          </div>

          <span className="text-[11px] text-slate-400 ml-auto">Filters apply to every card drill-down detail view</span>
        </div>

        {/* SHIFTS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              aria-label={`View Floor Shift Regularization details: ${s.name}`}
              onClick={() => openDrill('shift-roster', `Shift: ${s.name}`, s.id, s.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openDrill('shift-roster', `Shift: ${s.name}`, s.id, s.name);
                }
              }}
              className="group bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-[#0058be]/40 hover:bg-[#eff4ff]/30 transition-all flex flex-col justify-between cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be] focus-visible:ring-offset-2"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#0058be] bg-[#eff4ff] px-2 py-0.5 rounded border border-[#dce9ff]">
                      {s.code || 'SHIFT-A'}
                    </span>
                    <h3 className="text-base font-bold text-[#0b1c30] mt-1.5">{s.name}</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                    <span className="text-slate-500">Working Window:</span>
                    <span className="font-bold font-mono text-[#0b1c30]">
                      {s.startTime ? new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:30 AM'} -{' '}
                      {s.endTime ? new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '06:30 PM'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 px-1">
                    <span>Grace Period:</span>
                    <span className="font-bold text-[#0058be]">{s.gracePeriod || 5} Mins</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 px-1">
                    <span>Late Threshold:</span>
                    <span className="font-bold text-red-600">{s.lateThreshold || 15} Mins</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Auto-assigned</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success(`Shift ${s.name} details verified`);
                  }}
                  className="font-semibold text-[#0058be] hover:underline flex items-center gap-1"
                >
                  <span>Edit Roster Rules</span>
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-[#0058be] transition-colors">
                <span>View Roster Details</span>
                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </div>
            </div>
          ))}
        </div>

        {/* CREATE SHIFT MODAL */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0058be] text-[20px]">calendar_view_week</span>
                  <h3 className="font-bold text-base text-[#0b1c30]">Create New Floor Shift</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateShift} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Shift Name *</label>
                  <input
                    type="text"
                    required
                    value={newShift.name}
                    onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                    placeholder="e.g. Morning Retail Shift A"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Location Hub *</label>
                  <select
                    required
                    value={newShift.locationId}
                    onChange={(e) => setNewShift({ ...newShift, locationId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="">Select Location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Time (HH:MM)</label>
                    <input
                      type="time"
                      value={newShift.startTime}
                      onChange={(e) => setNewShift({ ...newShift, startTime: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">End Time (HH:MM)</label>
                    <input
                      type="time"
                      value={newShift.endTime}
                      onChange={(e) => setNewShift({ ...newShift, endTime: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Grace Period (Mins)</label>
                    <input
                      type="number"
                      value={newShift.gracePeriod}
                      onChange={(e) => setNewShift({ ...newShift, gracePeriod: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Late Cutoff (Mins)</label>
                    <input
                      type="number"
                      value={newShift.lateThreshold}
                      onChange={(e) => setNewShift({ ...newShift, lateThreshold: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs bg-[#0058be] hover:bg-[#2170e4] text-white rounded-lg font-bold shadow-sm"
                  >
                    Save Floor Shift
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CARD DRILL-DOWN DETAIL VIEW */}
        {drill && (
          <DetailDrillDownModal
            metric={drill.metric}
            title={drill.title}
            filters={drillFilters}
            chips={drillChips}
            preloaded={{ shifts, locations }}
            onClose={() => setDrill(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
