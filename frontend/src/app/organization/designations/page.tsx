'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

export default function DesignationsPage() {
  const [designations, setDesignations] = useState([
    { title: 'Store General Manager', grade: 'L5 - Executive', band: '₹75,000 – ₹1,20,000', count: 4, desc: 'Overall store P&L and workforce administrative leadership', icon: 'military_tech' },
    { title: 'Floor Manager', grade: 'L4 - Senior Supervisory', band: '₹45,000 – ₹65,000', count: 12, desc: 'Floor shift operations, discipline, and break monitoring', icon: 'supervisor_account' },
    { title: 'Department Team Lead', grade: 'L3 - Supervisory', band: '₹35,000 – ₹45,000', count: 18, desc: 'Section targets, saree presentations, and floor mentoring', icon: 'groups' },
    { title: 'Senior Sales Consultant', grade: 'L2 - Operational', band: '₹28,000 – ₹38,000', count: 24, desc: 'Customer engagement, bridal saree consultations, closing', icon: 'styler' },
    { title: 'Cashier & Billing Executive', grade: 'L2 - Operational', band: '₹25,000 – ₹32,000', count: 8, desc: 'POS checkout, transaction processing, and reconciliation', icon: 'point_of_sale' },
    { title: 'Tea Break & Canteen Owner', grade: 'L1 - Support Operator', band: 'Special Operator', count: 4, desc: 'Authorized canteen QR token validation and meal passes', icon: 'coffee' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGrade, setNewGrade] = useState('L2 - Operational');
  const [newBand, setNewBand] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;
    setDesignations([
      ...designations,
      {
        title: newTitle,
        grade: newGrade,
        band: newBand || 'Standard Band',
        count: 1,
        desc: newDesc || 'Designation role in retail workforce',
        icon: 'badge',
      },
    ]);
    toast.success(`Designation "${newTitle}" created successfully!`);
    setIsModalOpen(false);
    setNewTitle('');
    setNewBand('');
    setNewDesc('');
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full font-body-md text-on-surface">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-space-lg mb-space-lg">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant tracking-wider uppercase">
              <span>Workforce Directory</span>
              <span className="material-symbols-outlined text-[12px] text-outline">chevron_right</span>
              <span className="text-secondary font-bold">Designations &amp; Career Ladder</span>
            </div>
            <div className="flex flex-wrap items-center gap-space-md mt-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                Designations &amp; Grade Matrix
              </h1>
              <div className="inline-flex items-center gap-space-xs px-space-sm py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold">
                Karnataka Retail Band Standard
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-primary text-on-primary hover:bg-slate-800 transition-colors rounded-lg font-label-lg text-label-lg shadow-sm font-bold mt-3 md:mt-0"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Add Designation
          </button>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-lg">
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Active Roles</span>
            <div className="text-2xl font-bold font-mono text-on-surface mt-1">{designations.length} Grades</div>
            <span className="text-xs text-on-surface-variant mt-1">L1 Support to L5 Executive</span>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Total Staff Mapped</span>
            <div className="text-2xl font-bold font-mono text-on-surface mt-1">
              {designations.reduce((acc, curr) => acc + curr.count, 0)} Associate Employees
            </div>
            <span className="text-xs text-secondary font-medium mt-1">100% Workforce Covered</span>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Compensation Slabs</span>
            <div className="text-2xl font-bold font-mono text-secondary mt-1">₹25K – ₹1.2L</div>
            <span className="text-xs text-on-surface-variant mt-1">Direct Bank ACH Remittance</span>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Governance Compliance</span>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">Audited</div>
            <span className="text-xs text-emerald-600 font-medium mt-1">Karnataka Minimum Wages Act</span>
          </div>
        </div>

        {/* Designations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {designations.map((d, i) => (
            <div
              key={i}
              className="bg-surface-container-lowest rounded-xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary bg-surface-container px-2.5 py-0.5 rounded">
                      {d.grade}
                    </span>
                    <h3 className="font-bold text-on-surface text-base mt-2">{d.title}</h3>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-surface-container-low text-secondary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">{d.icon}</span>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">{d.desc}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-mono text-on-surface font-semibold">{d.band}</span>
                <span className="text-on-surface-variant font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">groups</span>
                  {d.count} Staff
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Add New Designation</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Designation Title</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Senior Inventory Auditor"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Grade Level</label>
                  <select
                    value={newGrade}
                    onChange={(e) => setNewGrade(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  >
                    <option>L1 - Support Operator</option>
                    <option>L2 - Operational</option>
                    <option>L3 - Supervisory</option>
                    <option>L4 - Senior Supervisory</option>
                    <option>L5 - Executive</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Salary Range Band</label>
                  <input
                    type="text"
                    value={newBand}
                    onChange={(e) => setNewBand(e.target.value)}
                    placeholder="e.g. ₹32,000 – ₹42,000"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Functional Description</label>
                  <textarea
                    rows={2}
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Key responsibilities and floor coverage duties..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-primary text-on-primary hover:bg-slate-800 rounded-lg font-bold shadow-sm"
                  >
                    Save Designation
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
