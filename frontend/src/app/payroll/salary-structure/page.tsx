'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface SalaryStructure {
  id: string;
  name: string;
  cadre: string;
  basicSalary: number;
  hraPercent: number;
  allowances: number;
  pfPercent: number;
  taxPercent: number;
  description?: string;
  updatedAt?: string;
}

export default function SalaryStructurePage() {
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    cadre: '',
    basicSalary: 25000,
    hraPercent: 40,
    allowances: 3000,
    pfPercent: 12,
    taxPercent: 5,
    description: '',
  });

  const fetchStructures = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/payroll/salary-structures');
      setStructures(res.data?.structures || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load salary structures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStructures();
  }, [fetchStructures]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.post('/payroll/salary-structures', formData);
      toast.success(res.data?.message || 'Salary structure saved successfully');
      setOpenModal(false);
      setFormData({
        name: '',
        cadre: '',
        basicSalary: 25000,
        hraPercent: 40,
        allowances: 3000,
        pfPercent: 12,
        taxPercent: 5,
        description: '',
      });
      fetchStructures();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create structure');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
              <span>Payroll Management</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#0058be]">Salary Cadres & Compensation Policy</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight">
                Salary Structure & Grade Cadres
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0058be] text-[10px] font-bold uppercase tracking-wider border border-blue-200 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0058be]"></span> Statutory Scales
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Configured compensation scales for retail showroom staff, floor merchandisers, master tailors, and store management under Karnataka Shops & Commercial Establishments regulations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpenModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0058be] hover:bg-[#2170e4] text-white shadow-md shadow-[#0058be]/20 transition-all text-xs font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Create Salary Cadre</span>
            </button>
          </div>
        </div>

        {/* CADRE CARDS GRID */}
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading salary structures...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {structures.map((s) => {
              const hraAmount = Math.round(s.basicSalary * (s.hraPercent / 100));
              const pfAmount = Math.round(s.basicSalary * (s.pfPercent / 100));
              const grossEst = s.basicSalary + hraAmount + s.allowances;
              const netEst = grossEst - pfAmount;

              return (
                <div
                  key={s.id}
                  className="bg-white rounded-xl border border-slate-200/80 shadow-xs hover:border-[#0058be]/40 transition-all p-5 flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-[#0058be] border border-blue-100">
                          {s.cadre || 'GRADE'}
                        </span>
                        <h3 className="font-bold text-base text-[#0b1c30] mt-1.5">{s.name}</h3>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                        <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                      </div>
                    </div>
                    {s.description && (
                      <p className="text-[11px] text-slate-500 mt-2 line-clamp-2">{s.description}</p>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-b border-slate-100 py-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Base Salary:</span>
                      <span className="font-mono font-bold text-[#0b1c30]">₹{Number(s.basicSalary).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">HRA ({s.hraPercent}%):</span>
                      <span className="font-mono font-semibold text-slate-700">₹{hraAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Fixed Allowances:</span>
                      <span className="font-mono font-semibold text-slate-700">₹{Number(s.allowances).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>PF Contribution ({s.pfPercent}%):</span>
                      <span className="font-mono font-semibold">-₹{pfAmount.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Estimated Take-Home</div>
                      <div className="text-lg font-mono font-bold text-[#0058be]">
                        ₹{netEst.toLocaleString()}<span className="text-xs text-slate-400 font-normal">/mo</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Active Cadre
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL TO ADD NEW CADRE */}
        {openModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0058be] text-[22px]">add_circle</span>
                  <h3 className="font-bold text-base text-[#0b1c30]">Create Salary Structure Cadre</h3>
                </div>
                <button onClick={() => setOpenModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Cadre Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senior Merchandiser Grade 2"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#0058be] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Cadre Code / Tag</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CADRE-MERCH-02"
                      value={formData.cadre}
                      onChange={(e) => setFormData({ ...formData, cadre: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#0058be] focus:outline-none uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Base Monthly Salary (₹)</label>
                    <input
                      type="number"
                      required
                      value={formData.basicSalary}
                      onChange={(e) => setFormData({ ...formData, basicSalary: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#0058be] focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">HRA (%)</label>
                    <input
                      type="number"
                      required
                      value={formData.hraPercent}
                      onChange={(e) => setFormData({ ...formData, hraPercent: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#0058be] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Fixed Allowances (₹)</label>
                    <input
                      type="number"
                      required
                      value={formData.allowances}
                      onChange={(e) => setFormData({ ...formData, allowances: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#0058be] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">PF Deduction (%)</label>
                    <input
                      type="number"
                      required
                      value={formData.pfPercent}
                      onChange={(e) => setFormData({ ...formData, pfPercent: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#0058be] focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Description & Eligibility</label>
                  <textarea
                    rows={2}
                    placeholder="Criteria, showroom roles, and minimum experience..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#0058be] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setOpenModal(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-lg bg-[#0058be] text-white font-bold hover:bg-[#2170e4] disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Cadre'}
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
