'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  ChevronRight,
  Plus,
  Wallet,
  X,
  Eye,
  Edit3,
  Trash2,
  ShieldCheck,
  Building,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Calculator,
} from 'lucide-react';

interface SalaryStructure {
  id: string;
  name?: string;
  title?: string;
  cadre?: string;
  cadreGrade?: string;
  basicSalary?: number | string;
  baseSalary?: number | string;
  hraPercent?: number | string;
  allowances?: number | string;
  conveyance?: number | string;
  medicalAllowance?: number | string;
  specialAllowance?: number | string;
  pfPercent?: number | string;
  esiPercent?: number | string;
  taxPercent?: number | string;
  ptDeduction?: number | string;
  hraAmount?: number | string;
  pfAmount?: number | string;
  grossEst?: number | string;
  netEst?: number | string;
  status?: string;
  description?: string;
  updatedAt?: string;
}

interface CadreFormData {
  id?: string;
  title: string;
  cadreGrade: string;
  baseSalary: number;
  hraPercent: number;
  conveyance: number;
  medicalAllowance: number;
  specialAllowance: number;
  pfPercent: number;
  ptDeduction: number;
  status: string;
  description: string;
}

const defaultFormData: CadreFormData = {
  title: '',
  cadreGrade: '',
  baseSalary: 25000,
  hraPercent: 40,
  conveyance: 1600,
  medicalAllowance: 1250,
  specialAllowance: 2150,
  pfPercent: 12,
  ptDeduction: 200,
  status: 'ACTIVE',
  description: '',
};

function calculateMetrics(data: {
  baseSalary?: number | string;
  basicSalary?: number | string;
  hraPercent?: number | string;
  conveyance?: number | string;
  medicalAllowance?: number | string;
  specialAllowance?: number | string;
  allowances?: number | string;
  pfPercent?: number | string;
  ptDeduction?: number | string;
}) {
  const base = Math.max(0, Number(data.baseSalary ?? data.basicSalary ?? 0) || 0);
  const hraPct = Number(data.hraPercent ?? 40) || 40;
  const pfPct = Number(data.pfPercent ?? 12) || 12;
  const pt = Number(data.ptDeduction ?? 200) || 0;

  const conv = Math.max(0, Number(data.conveyance ?? 0) || 0);
  const med = Math.max(0, Number(data.medicalAllowance ?? 0) || 0);
  const spec = Math.max(0, Number(data.specialAllowance ?? 0) || 0);

  // If explicit allowances were supplied without itemization
  const itemizedTotal = conv + med + spec;
  const fixedAllowances = itemizedTotal > 0 ? itemizedTotal : Math.max(0, Number(data.allowances ?? 0) || 0);

  const hraAmount = Math.round(base * (hraPct / 100));
  const pfAmount = Math.round(base * (pfPct / 100));
  const grossPay = base + hraAmount + fixedAllowances;
  const totalDeductions = pfAmount + pt;
  const netTakeHome = Math.max(0, grossPay - totalDeductions);
  const employerPf = pfAmount;
  const gratuityMonthly = Math.round(base * 0.0481);
  const annualCtc = (grossPay + employerPf + gratuityMonthly) * 12;

  return {
    base,
    hraPct,
    hraAmount,
    conv,
    med,
    spec,
    fixedAllowances,
    pfPct,
    pfAmount,
    pt,
    grossPay,
    totalDeductions,
    netTakeHome,
    employerPf,
    gratuityMonthly,
    annualCtc,
  };
}

export default function SalaryStructurePage() {
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [activeStructure, setActiveStructure] = useState<SalaryStructure | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState<CadreFormData>(defaultFormData);

  const fetchStructures = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/payroll/salary-structures');
      setStructures(res.data?.structures || []);
    } catch (err: any) {
      console.error('Failed to load salary structures:', err);
      toast.error('Failed to load salary structures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStructures();
  }, [fetchStructures]);

  // Handle open Create
  const handleOpenCreate = () => {
    setFormData(defaultFormData);
    setCreateModalOpen(true);
  };

  // Handle open Edit
  const handleOpenEdit = (s: SalaryStructure) => {
    setActiveStructure(s);
    const m = calculateMetrics(s);
    setFormData({
      id: s.id,
      title: s.title || s.name || '',
      cadreGrade: s.cadreGrade || s.cadre || '',
      baseSalary: m.base,
      hraPercent: m.hraPct,
      conveyance: Number(s.conveyance ?? 1600),
      medicalAllowance: Number(s.medicalAllowance ?? 1250),
      specialAllowance: Number(s.specialAllowance ?? Math.max(0, m.fixedAllowances - (1600 + 1250))),
      pfPercent: m.pfPct,
      ptDeduction: m.pt,
      status: s.status || 'ACTIVE',
      description: s.description || '',
    });
    setDetailsModalOpen(false);
    setEditModalOpen(true);
  };

  // Handle open Details
  const handleOpenDetails = (s: SalaryStructure) => {
    setActiveStructure(s);
    setDetailsModalOpen(true);
  };

  // Handle open Delete
  const handleOpenDelete = (s: SalaryStructure) => {
    setActiveStructure(s);
    setDeleteModalOpen(true);
  };

  // Save New Cadre
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        title: formData.title,
        cadreGrade: formData.cadreGrade,
        baseSalary: Number(formData.baseSalary),
        hraPercent: Number(formData.hraPercent),
        conveyance: Number(formData.conveyance),
        medicalAllowance: Number(formData.medicalAllowance),
        specialAllowance: Number(formData.specialAllowance),
        allowances: Number(formData.conveyance) + Number(formData.medicalAllowance) + Number(formData.specialAllowance),
        pfPercent: Number(formData.pfPercent),
        ptDeduction: Number(formData.ptDeduction),
        description: formData.description,
      };

      const res = await api.post('/payroll/salary-structures', payload);
      toast.success(res.data?.message || 'Salary cadre created successfully');
      setCreateModalOpen(false);
      fetchStructures();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create salary structure');
    } finally {
      setSaving(false);
    }
  };

  // Update Existing Cadre
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStructure?.id) return;
    try {
      setSaving(true);
      const payload = {
        title: formData.title,
        cadreGrade: formData.cadreGrade,
        baseSalary: Number(formData.baseSalary),
        hraPercent: Number(formData.hraPercent),
        conveyance: Number(formData.conveyance),
        medicalAllowance: Number(formData.medicalAllowance),
        specialAllowance: Number(formData.specialAllowance),
        allowances: Number(formData.conveyance) + Number(formData.medicalAllowance) + Number(formData.specialAllowance),
        pfPercent: Number(formData.pfPercent),
        ptDeduction: Number(formData.ptDeduction),
        status: formData.status,
        description: formData.description,
      };

      const res = await api.put(`/payroll/salary-structures/${activeStructure.id}`, payload);
      toast.success(res.data?.message || 'Salary cadre updated successfully');
      setEditModalOpen(false);
      setActiveStructure(null);
      fetchStructures();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update salary structure');
    } finally {
      setSaving(false);
    }
  };

  // Delete Cadre
  const handleDeleteSubmit = async () => {
    if (!activeStructure?.id) return;
    try {
      setDeleting(true);
      await api.delete(`/payroll/salary-structures/${activeStructure.id}`);
      toast.success('Salary structure cadre removed');
      setDeleteModalOpen(false);
      setActiveStructure(null);
      fetchStructures();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove structure');
    } finally {
      setDeleting(false);
    }
  };

  // Live calculation for Form
  const liveFormMetrics = useMemo(() => {
    return calculateMetrics({
      baseSalary: formData.baseSalary,
      hraPercent: formData.hraPercent,
      conveyance: formData.conveyance,
      medicalAllowance: formData.medicalAllowance,
      specialAllowance: formData.specialAllowance,
      pfPercent: formData.pfPercent,
      ptDeduction: formData.ptDeduction,
    });
  }, [formData]);

  const activeMetrics = useMemo(() => {
    if (!activeStructure) return null;
    return calculateMetrics(activeStructure);
  }, [activeStructure]);

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <span>Payroll Management</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[#722F37] font-bold">Salary Cadres & Compensation Policy</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#18181B] tracking-tight">
                Salary Structure & Grade Cadres
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#722F37]/10 text-[#722F37] text-[10px] font-bold uppercase tracking-wider border border-[#722F37]/20 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#722F37]"></span> Statutory Scales
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Configured compensation scales for retail showroom staff, floor merchandisers, master tailors, and store management under Karnataka Shops & Commercial Establishments regulations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStructures}
              title="Refresh"
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white shadow-xs transition-all text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Salary Cadre</span>
            </button>
          </div>
        </div>

        {/* CADRE CARDS GRID */}
        {loading && structures.length === 0 ? (
          <div className="p-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#722F37]" />
            <p className="text-sm font-medium">Loading salary structures...</p>
          </div>
        ) : structures.length === 0 ? (
          <div className="p-16 text-center bg-white rounded-xl border border-dashed border-slate-300">
            <Wallet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No salary structure cadres configured</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Create standard compensation brackets for showroom floor staff, master tailors, and branch managers.
            </p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#722F37] text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" /> Create First Cadre
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {structures.map((s) => {
              const m = calculateMetrics(s);
              const title = s.title || s.name || 'Compensation Cadre';
              const cadreTag = s.cadreGrade || s.cadre || 'GRADE';
              const isInactive = s.status === 'INACTIVE';

              return (
                <div
                  key={s.id}
                  className={`bg-white rounded-xl border transition-all p-5 flex flex-col justify-between space-y-4 hover:shadow-md ${
                    isInactive
                      ? 'border-slate-200 opacity-75 bg-slate-50/50'
                      : 'border-slate-200 hover:border-[#722F37]/50 shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#722F37]/10 text-[#722F37] border border-[#722F37]/20">
                            {cadreTag}
                          </span>
                          {isInactive && (
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              Inactive
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-base text-[#18181B] mt-1.5 truncate" title={title}>
                          {title}
                        </h3>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37] shrink-0">
                        <Wallet className="w-4 h-4" />
                      </div>
                    </div>

                    {s.description ? (
                      <p className="text-[11px] text-slate-500 mt-2 line-clamp-2">{s.description}</p>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-2 italic">Karnataka statutory retail grade</p>
                    )}
                  </div>

                  {/* Compensation Breakdown Rows */}
                  <div className="space-y-2 border-t border-b border-slate-100 py-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Base Salary:</span>
                      <span className="font-mono font-bold text-[#18181B]">
                        ₹{m.base.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">HRA ({m.hraPct}%):</span>
                      <span className="font-mono font-semibold text-slate-700">
                        ₹{m.hraAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Fixed Allowances:</span>
                      <span className="font-mono font-semibold text-slate-700">
                        ₹{m.fixedAllowances.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-red-700">
                      <span>PF Contribution ({m.pfPct}%):</span>
                      <span className="font-mono font-semibold">
                        -₹{m.pfAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {m.pt > 0 && (
                      <div className="flex justify-between items-center text-red-700 text-[11px]">
                        <span>Karnataka PT:</span>
                        <span className="font-mono font-semibold">
                          -₹{m.pt.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Estimated Net Take-Home */}
                  <div className="flex items-center justify-between pt-0.5">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                        Estimated Take-Home
                      </div>
                      <div className="text-lg font-mono font-bold text-[#722F37]">
                        ₹{m.netTakeHome.toLocaleString('en-IN')}
                        <span className="text-xs text-slate-400 font-normal">/mo</span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        isInactive
                          ? 'text-slate-600 bg-slate-100 border-slate-300'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      }`}
                    >
                      {isInactive ? 'Disabled' : 'Active Cadre'}
                    </span>
                  </div>

                  {/* Card Action Buttons (Details, Edit, Delete) */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenDetails(s)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-[#722F37] bg-slate-50 hover:bg-[#722F37]/10 transition-colors border border-slate-200 hover:border-[#722F37]/30"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Details</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(s)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold text-white bg-[#722F37] hover:bg-[#5B232A] transition-colors shadow-2xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDelete(s)}
                      title="Delete Cadre"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* DETAILS MODAL                                                 */}
        {/* ------------------------------------------------------------- */}
        {detailsModalOpen && activeStructure && activeMetrics && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#722F37]/10 text-[#722F37] border border-[#722F37]/20">
                      {activeStructure.cadreGrade || activeStructure.cadre || 'GRADE'}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                      <CheckCircle className="w-2.5 h-2.5" />
                      {activeStructure.status || 'Active Cadre'}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-[#18181B]">
                    {activeStructure.title || activeStructure.name}
                  </h3>
                  {activeStructure.description && (
                    <p className="text-xs text-slate-500">{activeStructure.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setDetailsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Net Take-Home Highlight Banner */}
              <div className="bg-gradient-to-r from-[#722F37] to-[#5B232A] text-white p-4 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-white/80 uppercase font-semibold tracking-wider">
                    Net Take-Home Pay (Monthly In-Hand)
                  </div>
                  <div className="text-2xl font-mono font-bold mt-0.5">
                    ₹{activeMetrics.netTakeHome.toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-white/70"> / month</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/70 uppercase font-semibold tracking-wider">
                    Annual CTC Cost
                  </div>
                  <div className="text-base font-mono font-bold mt-0.5">
                    ₹{activeMetrics.annualCtc.toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-white/70"> / yr</span>
                  </div>
                </div>
              </div>

              {/* Earnings & Deductions Breakdown Tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Earnings Box */}
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                  <div className="font-bold text-[#18181B] pb-1 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[#722F37]">Monthly Earnings</span>
                    <span className="text-[10px] text-slate-400 uppercase">Credit</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-600">Basic Pay</span>
                    <span className="font-mono font-semibold text-slate-800">
                      ₹{activeMetrics.base.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-600">HRA ({activeMetrics.hraPct}%)</span>
                    <span className="font-mono font-semibold text-slate-800">
                      ₹{activeMetrics.hraAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-600">Conveyance Allowance</span>
                    <span className="font-mono font-semibold text-slate-800">
                      ₹{activeMetrics.conv.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-600">Medical Allowance</span>
                    <span className="font-mono font-semibold text-slate-800">
                      ₹{activeMetrics.med.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-600">Special Allowance</span>
                    <span className="font-mono font-semibold text-slate-800">
                      ₹{activeMetrics.spec.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-[#18181B]">
                    <span>Gross Salary</span>
                    <span className="font-mono text-emerald-700">
                      ₹{activeMetrics.grossPay.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Deductions & Employer Contributions Box */}
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                  <div className="font-bold text-[#18181B] pb-1 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-red-700">Statutory Deductions</span>
                    <span className="text-[10px] text-slate-400 uppercase">Debit</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-600">Employee PF ({activeMetrics.pfPct}%)</span>
                    <span className="font-mono font-semibold text-red-600">
                      -₹{activeMetrics.pfAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-600">Karnataka Prof. Tax (PT)</span>
                    <span className="font-mono font-semibold text-red-600">
                      -₹{activeMetrics.pt.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-red-700">
                    <span>Total Deductions</span>
                    <span className="font-mono">
                      -₹{activeMetrics.totalDeductions.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="pt-2 mt-2 border-t border-slate-200">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                      Employer Benefit Contributions
                    </div>
                    <div className="flex justify-between text-slate-600 py-0.5">
                      <span>Employer PF Match (12%)</span>
                      <span className="font-mono">₹{activeMetrics.employerPf.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 py-0.5">
                      <span>Gratuity Reserve (4.81%)</span>
                      <span className="font-mono">₹{activeMetrics.gratuityMonthly.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Statutory Note */}
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 text-[11px] text-amber-900">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Karnataka Regulatory Compliant:</strong> Configured for Karnataka Minimum Wages schedule & PF rules. PF is calculated on Base Salary up to statutory cap, with ₹200/mo professional tax bracket.
                </span>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDetailsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors text-xs"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(activeStructure)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#722F37] text-white font-bold hover:bg-[#5B232A] transition-colors text-xs"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit This Cadre</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* EDIT CADRE MODAL                                              */}
        {/* ------------------------------------------------------------- */}
        {editModalOpen && activeStructure && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[#18181B]">Edit Salary Cadre</h3>
                    <p className="text-[11px] text-slate-500">Update compensation formulas and statutory limits</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Cadre Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Tailor Grade 1"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Cadre Code / Tag</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CADRE-TAILOR-01"
                      value={formData.cadreGrade}
                      onChange={(e) => setFormData({ ...formData, cadreGrade: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Cadre Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-semibold"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Base Monthly Salary (₹)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={formData.baseSalary}
                      onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">HRA (%)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      value={formData.hraPercent}
                      onChange={(e) => setFormData({ ...formData, hraPercent: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Conveyance (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.conveyance}
                      onChange={(e) => setFormData({ ...formData, conveyance: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Medical Allow. (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.medicalAllowance}
                      onChange={(e) => setFormData({ ...formData, medicalAllowance: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Special Allow. (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.specialAllowance}
                      onChange={(e) => setFormData({ ...formData, specialAllowance: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">PF Deduction (%)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      value={formData.pfPercent}
                      onChange={(e) => setFormData({ ...formData, pfPercent: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Karnataka PT (₹/mo)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.ptDeduction}
                      onChange={(e) => setFormData({ ...formData, ptDeduction: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
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
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none"
                  />
                </div>

                {/* Live Preview Calculator Strip */}
                <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 mb-2">
                    <Calculator className="w-3.5 h-3.5 text-[#722F37]" />
                    <span>Live Computation Preview</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Gross Pay</div>
                      <div className="font-mono font-bold text-slate-800">
                        ₹{liveFormMetrics.grossPay.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Deductions</div>
                      <div className="font-mono font-bold text-red-600">
                        -₹{liveFormMetrics.totalDeductions.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Take-Home</div>
                      <div className="font-mono font-bold text-[#722F37]">
                        ₹{liveFormMetrics.netTakeHome.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-lg bg-[#722F37] text-white font-bold hover:bg-[#5B232A] disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* CREATE CADRE MODAL                                            */}
        {/* ------------------------------------------------------------- */}
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-[#722F37]" />
                  <h3 className="font-bold text-base text-[#18181B]">Create Salary Structure Cadre</h3>
                </div>
                <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Cadre Role Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senior Merchandiser Grade 2"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Cadre Code / Tag</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CADRE-MERCH-02"
                      value={formData.cadreGrade}
                      onChange={(e) => setFormData({ ...formData, cadreGrade: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Base Monthly Salary (₹)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={formData.baseSalary}
                      onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">HRA (%)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      value={formData.hraPercent}
                      onChange={(e) => setFormData({ ...formData, hraPercent: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">PF Deduction (%)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      value={formData.pfPercent}
                      onChange={(e) => setFormData({ ...formData, pfPercent: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Conveyance (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.conveyance}
                      onChange={(e) => setFormData({ ...formData, conveyance: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Medical Allow. (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.medicalAllowance}
                      onChange={(e) => setFormData({ ...formData, medicalAllowance: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Special Allow. (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.specialAllowance}
                      onChange={(e) => setFormData({ ...formData, specialAllowance: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Karnataka PT (₹/mo)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.ptDeduction}
                    onChange={(e) => setFormData({ ...formData, ptDeduction: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Description & Eligibility</label>
                  <textarea
                    rows={2}
                    placeholder="Criteria, showroom roles, and minimum experience..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none"
                  />
                </div>

                {/* Live Preview Strip */}
                <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 mb-2">
                    <Calculator className="w-3.5 h-3.5 text-[#722F37]" />
                    <span>Live Computation Preview</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Gross Pay</div>
                      <div className="font-mono font-bold text-slate-800">
                        ₹{liveFormMetrics.grossPay.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Deductions</div>
                      <div className="font-mono font-bold text-red-600">
                        -₹{liveFormMetrics.totalDeductions.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Take-Home</div>
                      <div className="font-mono font-bold text-[#722F37]">
                        ₹{liveFormMetrics.netTakeHome.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-lg bg-[#722F37] text-white font-bold hover:bg-[#5B232A] disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Cadre'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* DELETE CONFIRMATION MODAL                                     */}
        {/* ------------------------------------------------------------- */}
        {deleteModalOpen && activeStructure && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
              <div className="flex items-center gap-3 text-red-600">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Delete Cadre</h3>
                  <p className="text-xs text-slate-500">Are you sure you want to delete this cadre?</p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div className="font-bold text-slate-800">{activeStructure.title || activeStructure.name}</div>
                <div className="text-[11px] font-mono text-slate-500">
                  {activeStructure.cadreGrade || activeStructure.cadre}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSubmit}
                  disabled={deleting}
                  className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
