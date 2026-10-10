'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
      if (list.length > 0) setSelectedLocation(list[0].id);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true);
      const url = selectedLocation ? `/departments?locationId=${selectedLocation}` : '/departments';
      const res = await api.get(url);
      setDepartments(res.data?.departments || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

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

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
              <span>Workforce Directory</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#722F37]">Enterprise Hierarchy & Operational Units</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight">
                Departments & Organizational Units Dashboard
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F8F4F1] text-[#722F37] text-[10px] font-bold uppercase tracking-wider border border-[#E5D5D7] flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#722F37]"></span> Org Structure Active
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Structural divisions across Karnataka retail showrooms, weaving ateliers, inventory warehouses, and regional leadership.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white shadow-md shadow-[#722F37]/20 transition-all text-xs font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Create Department</span>
            </button>
          </div>
        </div>

        {/* 5 DEPARTMENT KPIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Divisions</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] flex items-center justify-center text-[#722F37]">
                <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">{departments.length || 8}</div>
              <div className="text-[11px] text-slate-400">Total Operational Units</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-[#722F37] font-semibold">
              <span>All Functional</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Karnataka Hubs</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] flex items-center justify-center text-[#722F37]">
                <span className="material-symbols-outlined text-[18px]">domain</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">4</div>
              <div className="text-[11px] text-slate-400">Retail & Weaving Centers</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-600 font-semibold">
              <span>BEL • DAV • SHI • HUB</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Staff Allocated</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] flex items-center justify-center text-[#722F37]">
                <span className="material-symbols-outlined text-[18px]">badge</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">35 / 35</div>
              <div className="text-[11px] text-slate-400">100% Departmentalized</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>No Unassigned Staff</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Flagship Division</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] flex items-center justify-center text-[#722F37]">
                <span className="material-symbols-outlined text-[18px]">styler</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-lg font-bold text-[#0b1c30] truncate">Bridal & Silk</div>
              <div className="text-[11px] text-slate-400">Belagavi Atelier Apex</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-[#722F37] font-semibold">
              <span>Primary Revenue Unit</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Structure Health</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-emerald-600">100%</div>
              <div className="text-[11px] text-slate-400">Clean Hierarchy</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-600 font-semibold">
              <span>RBAC Linked</span>
            </div>
          </div>
        </div>

        {/* Location Filter & Department Cards */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#0b1c30]">Select Store Location:</span>
            <div className="flex flex-wrap gap-2">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedLocation === loc.id
                      ? 'bg-[#722F37] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {loc.name} ({loc.code})
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-slate-400">{departments.length} Units in this branch</span>
        </div>

        {/* DEPARTMENTS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((d) => (
            <div key={d.id} className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#722F37] bg-[#F8F4F1] px-2 py-0.5 rounded border border-[#E5D5D7]">
                      {d.code || 'DEPT-101'}
                    </span>
                    <h3 className="text-base font-bold text-[#0b1c30] mt-1.5">{d.name}</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                    <span className="text-slate-500">Branch Hub:</span>
                    <span className="font-bold text-[#0b1c30]">{d.location?.name || 'Retail Flagship'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 px-1">
                    <span>Floor Allocation:</span>
                    <span className="font-bold text-[#722F37]">Ground & 1st Floor</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 px-1">
                    <span>Assigned Staff:</span>
                    <span className="font-semibold text-slate-800">4-6 Consultants</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Operational</span>
                <button
                  onClick={() => toast.success(`Department ${d.name} rules active`)}
                  className="font-semibold text-[#722F37] hover:underline flex items-center gap-1"
                >
                  <span>View Team Roster</span>
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* CREATE DEPT MODAL */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#722F37] text-[20px]">corporate_fare</span>
                  <h3 className="font-bold text-base text-[#0b1c30]">Create Department / Unit</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateDept} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Department Name *</label>
                  <input
                    type="text"
                    required
                    value={newDept.name}
                    onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                    placeholder="e.g. Silk Weaving & QA"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Store Location Hub *</label>
                  <select
                    required
                    value={newDept.locationId}
                    onChange={(e) => setNewDept({ ...newDept, locationId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="">Select Location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Department Code</label>
                  <input
                    type="text"
                    value={newDept.code}
                    onChange={(e) => setNewDept({ ...newDept, code: e.target.value })}
                    placeholder="e.g. DEPT-WEAVE-01"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
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
                    className="px-4 py-1.5 text-xs bg-[#722F37] hover:bg-[#5B232A] text-white rounded-lg font-bold shadow-sm"
                  >
                    Save Department
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
