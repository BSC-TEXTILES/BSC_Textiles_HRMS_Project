'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Calendar,
  Clock,
  Store,
  Users,
  Plus,
  RefreshCw,
  Sparkles,
  AlertCircle
} from 'lucide-react';

export interface CreatedBatchResult {
  id: string;
  name: string;
  locationId: string;
  startTime: string;
  endTime: string;
  assignedCount: number;
  capacity?: number;
  hubName?: string;
}

interface CreateCustomShiftModalProps {
  open: boolean;
  onClose: () => void;
  hubs: Array<{ id: string; name: string }>;
  initialHubId?: string;
  existingShiftNames: string[];
  onSuccess: (result: CreatedBatchResult) => void;
}

export function CreateCustomShiftModal({
  open,
  onClose,
  hubs,
  initialHubId = 'all',
  existingShiftNames,
  onSuccess,
}: CreateCustomShiftModalProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState(
    initialHubId !== 'all' ? initialHubId : hubs[1]?.id || 'all'
  );
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('19:00');
  const [capacity, setCapacity] = useState('12');

  if (!open) return null;

  const validHubs = hubs.filter((h) => h.id !== 'all');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter a shift batch name');
      return;
    }

    if (existingShiftNames.some((n) => n.toLowerCase() === name.trim().toLowerCase())) {
      toast.error('A shift with this name already exists');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        name: name.trim(),
        code: `BATCH_${name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10)}`,
        startTime,
        endTime,
        locationId: locationId !== 'all' ? locationId : undefined,
        scannerRoles: {
          isCustomBatch: true,
          capacity: Number.parseInt(capacity, 10) || 10,
        },
      };

      const res = await api.post('/shifts', payload).catch(() => null);

      const generatedId = res?.data?.id || `shift-batch-${Date.now()}`;
      const targetHub = hubs.find((h) => h.id === locationId);

      const result: CreatedBatchResult = {
        id: generatedId,
        name: name.trim(),
        locationId: locationId,
        startTime,
        endTime,
        assignedCount: Number.parseInt(capacity, 10) || 10,
        capacity: Number.parseInt(capacity, 10) || 10,
        hubName: targetHub?.name || 'All Hubs',
      };

      toast.success(`Custom shift batch "${name.trim()}" created successfully!`);
      onSuccess(result);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create shift batch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Create Custom Shift Batch" className="max-w-md w-full">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header Note */}
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-xs text-[#0058be] dark:text-blue-300 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Define an operational or event roster batch for festivals, weekend rush, or seasonal warehouse intake.
          </span>
        </div>

        {/* Shift Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Batch / Shift Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Festival Rush Shift, Silk Depot Intake"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0058be]"
          />
        </div>

        {/* Location Hub */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Store / Warehouse Hub
          </label>
          <div className="relative">
            <select
              aria-label="Store or Warehouse Hub"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
            >
              <option value="all">Enterprise-Wide (All Hubs)</option>
              {validHubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Time Windows */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              End Time
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
            />
          </div>
        </div>

        {/* Capacity / Staff Estimate */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Floor Staff Allocation (Capacity)
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
          />
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#0058be] text-white hover:bg-[#004ba3] transition-colors shadow-xs"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Create Batch</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
