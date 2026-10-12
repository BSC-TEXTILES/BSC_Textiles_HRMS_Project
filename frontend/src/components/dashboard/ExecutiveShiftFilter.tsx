'use client';

import { useState, useRef, useEffect } from 'react';
import { Clock, Plus, ChevronDown, RefreshCw, AlertCircle, Sparkles, Check } from 'lucide-react';

export interface ShiftOptionItem {
  id: string;
  name: string;
  timeRange?: string;
  staffCount?: number;
  capacity?: number;
  isCustomBatch?: boolean;
}

interface ExecutiveShiftFilterProps {
  selectedShiftId: string;
  onSelectShift: (id: string) => void;
  shiftOptions: ShiftOptionItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpenCreateModal?: () => void;
}

export function ExecutiveShiftFilter({
  selectedShiftId,
  onSelectShift,
  shiftOptions,
  loading = false,
  error = null,
  onRetry,
  onOpenCreateModal,
}: ExecutiveShiftFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = shiftOptions.find((s) => s.id === selectedShiftId);
  const currentLabel =
    selectedShiftId === 'all'
      ? 'All Shifts'
      : currentOption?.name || 'Selected Shift';

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1.5 bg-white dark:bg-[#0c1424] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs text-xs group hover:border-[#0058be] dark:hover:border-blue-500 transition-colors">
        <Clock className="w-3.5 h-3.5 text-[#0058be] dark:text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
        <span className="text-[10px] uppercase text-slate-400 font-bold shrink-0">Shift:</span>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 bg-transparent font-semibold text-xs text-[#0b1c30] dark:text-slate-100 focus:outline-none cursor-pointer max-w-[170px]"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        </button>

        {onOpenCreateModal && (
          <button
            type="button"
            onClick={onOpenCreateModal}
            title="Create Custom Shift Batch"
            className="ml-1 p-1 rounded-md text-slate-400 hover:text-[#0058be] dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* DROPDOWN MENU */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-64 rounded-xl bg-white dark:bg-[#0c1424] border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Shift Directory
            </span>
            {loading && <RefreshCw className="w-3 h-3 text-[#0058be] animate-spin" />}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {/* All Shifts Option */}
            <button
              type="button"
              onClick={() => {
                onSelectShift('all');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left transition-colors ${
                selectedShiftId === 'all'
                  ? 'bg-blue-50/80 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span>All Shifts (Combined)</span>
              {selectedShiftId === 'all' && <Check className="w-3.5 h-3.5 text-[#0058be]" />}
            </button>

            {/* Individual Shifts */}
            {shiftOptions.map((opt) => {
              const isSelected = selectedShiftId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onSelectShift(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{opt.name}</span>
                      {opt.isCustomBatch && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                          Batch
                        </span>
                      )}
                    </div>
                    {opt.timeRange && (
                      <div className="text-[10px] text-slate-400 mt-0.5">{opt.timeRange}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {opt.staffCount !== undefined && (
                      <span className="text-[10px] font-mono text-slate-400">
                        {opt.staffCount} staff
                      </span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#0058be]" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Create Shift Button */}
          {onOpenCreateModal && (
            <div className="p-1.5 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenCreateModal();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-[#0058be] dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/50 hover:bg-blue-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Custom Shift Batch</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
