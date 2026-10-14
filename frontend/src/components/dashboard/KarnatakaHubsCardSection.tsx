'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Plus, Edit, Trash2 } from 'lucide-react';

export interface HubCard {
  code: string;
  name: string;
  type: string;
  headcount: number;
  present: number;
  rate: string;
  terminals: string;
  status: string;
  badgeClass?: string;
}

export const INITIAL_HUBS: HubCard[] = [
  {
    code: 'BEL-01',
    name: 'Belagavi Flagship Emporium',
    type: 'Retail & Weaving Atelier',
    headcount: 24,
    present: 22,
    rate: '91.7%',
    terminals: '4/4 Active',
    status: 'Optimal',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800',
  },
  {
    code: 'DAV-02',
    name: 'Davanagere Weaving Showroom',
    type: 'Textile Distribution Hub',
    headcount: 12,
    present: 12,
    rate: '100%',
    terminals: '2/2 Active',
    status: 'Full Adherence',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800',
  },
  {
    code: 'SHI-03',
    name: 'Shivamogga Retail Megastore',
    type: 'Commercial Apparel Apex',
    headcount: 14,
    present: 13,
    rate: '92.8%',
    terminals: '2/2 Active',
    status: 'Optimal',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800',
  },
];

interface KarnatakaHubsCardSectionProps {
  selectedHub: string;
  onSelectHub: (hubCode: string) => void;
  selectedShiftLabel?: string;
}

export function KarnatakaHubsCardSection({ selectedHub, onSelectHub, selectedShiftLabel }: KarnatakaHubsCardSectionProps) {
  const [hubs, setHubs] = useState<HubCard[]>(INITIAL_HUBS);
  const [showModal, setShowModal] = useState(false);
  const [editingHub, setEditingHub] = useState<HubCard | null>(null);
  const [form, setForm] = useState<HubCard>({
    code: '',
    name: '',
    type: 'Retail & Commercial Outlet',
    headcount: 15,
    present: 14,
    rate: '93.3%',
    terminals: '2/2 Active',
    status: 'Optimal',
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bsc_hub_cards');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHubs(parsed);
        }
      }
    } catch {
      // fallback
    }
  }, []);

  const persistHubs = (updated: HubCard[]) => {
    setHubs(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('bsc_hub_cards', JSON.stringify(updated));
      } catch {}
    }
  };

  const handleOpenAdd = () => {
    setEditingHub(null);
    setForm({
      code: `BLY-0${hubs.length + 1}`,
      name: '',
      type: 'Retail & Commercial Outlet',
      headcount: 15,
      present: 14,
      rate: '93.3%',
      terminals: '2/2 Active',
      status: 'Optimal',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (hub: HubCard) => {
    setEditingHub(hub);
    setForm({ ...hub });
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;

    const rateNum = form.headcount > 0 ? Math.round((form.present / form.headcount) * 100) : 100;
    const computedRate = `${rateNum}%`;
    const badgeClass =
      rateNum >= 95
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800'
        : rateNum >= 85
        ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800'
        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800';

    const entry: HubCard = {
      ...form,
      rate: computedRate,
      badgeClass,
    };

    let updated: HubCard[];
    if (editingHub) {
      updated = hubs.map((h) => (h.code === editingHub.code ? entry : h));
    } else {
      updated = [...hubs, entry];
    }
    persistHubs(updated);
    setShowModal(false);
  };

  const handleDelete = (code: string) => {
    if (typeof window !== 'undefined' && window.confirm(`Are you sure you want to remove the card for outlet ${code}?`)) {
      const updated = hubs.filter((h) => h.code !== code);
      persistHubs(updated);
      if (selectedHub === code) {
        onSelectHub('all');
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* SECTION HEADER WITH CRUD ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[20px]">domain</span>
          <h2 className="text-base font-bold text-[#0b1c30] dark:text-slate-100">Karnataka Enterprise Hubs & Store Outlets</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">• {hubs.length} Active Branches</span>
          {selectedShiftLabel && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 border border-blue-200 dark:border-blue-900 animate-in fade-in">
              Shift: {selectedShiftLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="opacity-0 group-hover:opacity-100 hover:opacity-100 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#eff4ff] text-[#0058be] hover:bg-[#dce9ff] transition-all border border-[#dce9ff]"
            title="Add a new store outlet card"
            aria-label="Add a new store outlet card"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
          <Link
            href="/organization/locations"
            className="text-xs font-semibold text-[#0058be] dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>View All Branches</span>
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>
      </div>

      {/* 3-COLUMN RESPONSIVE CARD GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {hubs.map((hub) => {
          const isSelected =
            selectedHub === hub.code ||
            (selectedHub !== 'all' &&
              (hub.name.toLowerCase().includes(selectedHub.toLowerCase()) ||
                (selectedHub.includes('bel') && hub.code.includes('BEL')) ||
                (selectedHub.includes('dav') && hub.code.includes('DAV')) ||
                (selectedHub.includes('shi') && hub.code.includes('SHI')) ||
                (selectedHub.includes('bly') && hub.code.includes('BLY'))));

          return (
            <div
              key={hub.code}
              onClick={() => onSelectHub(isSelected ? 'all' : hub.code)}
              className={`group relative bg-white dark:bg-[#0e172a] p-4 rounded-xl border transition-all cursor-pointer card-interactive ${
                isSelected
                  ? 'border-[#0058be] dark:border-blue-500 ring-2 ring-[#0058be]/25 dark:ring-blue-500/25 shadow-md scale-[1.01]'
                  : 'border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700'
              }`}
              title={isSelected ? 'Click to show all hubs' : `Click to filter by ${hub.name}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400">{hub.code}</span>
                    {isSelected && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 animate-pop-in">
                        Active Target
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-[#0b1c30] dark:text-slate-100 mt-0.5 leading-tight truncate" title={hub.name}>
                    {hub.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate" title={hub.type}>
                    {hub.type}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${hub.badgeClass}`}>
                    {hub.status}
                  </span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-0.5 rounded border border-slate-200/60 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(hub);
                      }}
                      className="p-1 rounded text-slate-500 hover:text-[#0058be] dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                      title={`Edit ${hub.name} card`}
                      aria-label={`Edit ${hub.name} card`}
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(hub.code);
                      }}
                      className="p-1 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      title={`Delete ${hub.name} card`}
                      aria-label={`Delete ${hub.name} card`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Floor Staff:</span>
                  <span className="font-bold text-[#0b1c30] dark:text-slate-100">
                    {hub.present} / {hub.headcount}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#0058be] h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (hub.present / Math.max(1, hub.headcount)) * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                  <span>Terminals: {hub.terminals}</span>
                  <span className="text-[#0058be] dark:text-blue-400 font-bold">{hub.rate} Attendance</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* OUTLET CARD CRUD MODAL */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingHub ? `Edit Branch Card (${editingHub.code})` : 'Add Karnataka Store Outlet Card'}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Store Code *
              </label>
              <input
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. BLY-04"
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Operational Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
              >
                <option value="Optimal">Optimal</option>
                <option value="Full Adherence">Full Adherence</option>
                <option value="High Traffic">High Traffic</option>
                <option value="Audit Scheduled">Audit Scheduled</option>
                <option value="Under Review">Under Review</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Store / Outlet Name *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Bellary Silk & Cotton Emporium"
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Outlet Type / Domain Description
            </label>
            <input
              type="text"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              placeholder="e.g. Heritage Weaving Centre"
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Headcount
              </label>
              <input
                type="number"
                min="1"
                required
                value={form.headcount}
                onChange={(e) => setForm({ ...form, headcount: Number(e.target.value) || 1 })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Present on Floor
              </label>
              <input
                type="number"
                min="0"
                required
                value={form.present}
                onChange={(e) => setForm({ ...form, present: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Biometric Terminals
              </label>
              <input
                type="text"
                value={form.terminals}
                onChange={(e) => setForm({ ...form, terminals: e.target.value })}
                placeholder="e.g. 2/2 Active"
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
              />
            </div>
          </div>

          <div className="mt-1 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Projected Attendance Rate:</span>
            <span className="font-bold text-[#0058be] dark:text-blue-400">
              {form.headcount > 0 ? Math.round((form.present / form.headcount) * 100) : 100}%
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5 mt-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold rounded-lg text-white bg-[#0058be] hover:bg-[#00479b] transition-colors shadow-xs"
            >
              {editingHub ? 'Save Changes' : 'Create Outlet Card'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
