'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, RefreshCw, AlertCircle, Check } from 'lucide-react';

export interface DeptOptionItem {
  id: string; // unique departmentId
  name: string;
  code?: string;
  hubCount?: number;
}

export const dashboardDepartmentOptions: DeptOptionItem[] = [
  { id: 'all', name: 'All Departments' },
  { id: 'dept-accounts', name: 'ACCOUNTS' },
  { id: 'dept-billing', name: 'BILLING' },
  { id: 'dept-blouse-dress-mtrl', name: 'BLOUSE & DRESS MTRL' },
  { id: 'dept-brand-bsc-staff', name: 'BRAND (BSC) STAFF' },
  { id: 'dept-brand-arrow-brand-staff', name: 'BRAND ARROW (BRAND STAFF)' },
  { id: 'dept-brand-bb-bsc-staff', name: 'BRAND BB (BSC STAFF)' },
  { id: 'dept-brand-it-brand-staff', name: 'BRAND IT (BRAND STAFF)' },
  { id: 'dept-brand-lenin-club-brand-staff', name: 'BRAND LENIN CLUB (BRAND STAFF)' },
  { id: 'dept-brand-levis-brand-staff', name: 'BRAND LEVIS (BRAND STAFF)' },
  { id: 'dept-brand-lp-brand-staff', name: 'BRAND LP (BRAND STAFF)' },
  { id: 'dept-brand-mft-bsc-staff', name: 'BRAND MFT (BSC STAFF)' },
  { id: 'dept-brand-ok-bsc-brand-staff', name: 'BRAND OK (BSC BRAND STAFF)' },
  { id: 'dept-brand-parx-brand-staff', name: 'BRAND PARX (BRAND STAFF)' },
  { id: 'dept-brand-pe-bsc-staff', name: 'BRAND PE (BSC STAFF)' },
  { id: 'dept-brand-pepe-bsc-staff', name: 'BRAND PEPE (BSC STAFF)' },
  { id: 'dept-brand-puma-brand-staff', name: 'BRAND PUMA (BRAND STAFF)' },
  { id: 'dept-brand-qcb-brand-staff', name: 'BRAND QCB (BRAND STAFF)' },
  { id: 'dept-brand-rokies-brand-staff', name: 'BRAND ROKIES (BRAND STAFF)' },
  { id: 'dept-brand-spykar-bsc-staff', name: 'BRAND SPYKAR (BSC STAFF)' },
  { id: 'dept-brand-trimus-brand-staff', name: 'BRAND TRIMUS (BRAND STAFF)' },
  { id: 'dept-brand-us-polo-bsc-staff', name: 'BRAND US POLO (BSC STAFF)' },
  { id: 'dept-brand-vh-brand-staff', name: 'BRAND VH (BRAND STAFF)' },
  { id: 'dept-brand-vh-bsc-staff', name: 'BRAND VH (BSC STAFF)' },
  { id: 'dept-chudi-set', name: 'CHUDI SET' },
  { id: 'dept-customer-service-desk', name: 'CUSTOMER SERVICE DESK' },
  { id: 'dept-dhothi', name: 'DHOTHI' },
  { id: 'dept-dress-material', name: 'DRESS MATERIAL' },
  { id: 'dept-driver', name: 'DRIVER' },
  { id: 'dept-home-furnishing', name: 'HOME FURNISHING' },
  { id: 'dept-housekeeping', name: 'HOUSEKEEPING' },
  { id: 'dept-human-resource', name: 'HUMAN RESOURCE' },
  { id: 'dept-it', name: 'IT' },
  { id: 'dept-kids', name: 'KIDS' },
  { id: 'dept-ladies-readymade', name: 'LADIES READYMADE' },
  { id: 'dept-logistic', name: 'LOGISTIC' },
  { id: 'dept-maintainance', name: 'MAINTAINANCE' },
  { id: 'dept-marketing', name: 'MARKETING' },
  { id: 'dept-mens-inner-garments', name: 'MENS INNER GARMENTS' },
  { id: 'dept-mens-readymade', name: 'MENS READYMADE' },
  { id: 'dept-mens-readymade-economy', name: 'MENS READYMADE ECONOMY' },
  { id: 'dept-mens-readymade-ethnic', name: 'MENS READYMADE ETHNIC' },
  { id: 'dept-mens-readymade-mid-section', name: 'MENS READYMADE MID SECTION' },
  { id: 'dept-mens-tailor', name: 'MENS TAILOR' },
  { id: 'dept-packing', name: 'PACKING' },
  { id: 'dept-saree', name: 'SAREE' },
  { id: 'dept-security', name: 'SECURITY' },
  { id: 'dept-store', name: 'STORE' },
  { id: 'dept-suiting-shirting', name: 'SUITING & SHIRTING' },
  { id: 'dept-visual-merchandising', name: 'VISUAL MERCHANDISING' },
];

const ALL_DEPT_OPTION: DeptOptionItem = {
  id: 'all',
  name: 'All Departments',
};

interface ExecutiveDeptFilterProps {
  selectedDeptId: string;
  onSelectDept: (id: string) => void;
  deptOptions?: DeptOptionItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function ExecutiveDeptFilter({
  selectedDeptId,
  onSelectDept,
  deptOptions,
  loading = false,
  error = null,
  onRetry,
}: ExecutiveDeptFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Build combined options list with "All Departments" ALWAYS first without duplicates
  const allOptions: DeptOptionItem[] = useMemo(() => {
    const sourceList = deptOptions && deptOptions.length > 0 ? deptOptions : dashboardDepartmentOptions;
    const hasAll = sourceList.some(
      (o) => o.id === 'all' || o.id === 'ALL' || o.name.toLowerCase() === 'all departments'
    );
    if (hasAll) {
      const allItem =
        sourceList.find((o) => o.id === 'all' || o.id === 'ALL' || o.name.toLowerCase() === 'all departments') ||
        ALL_DEPT_OPTION;
      const rest = sourceList.filter(
        (o) => o !== allItem && o.id !== 'all' && o.id !== 'ALL' && o.name.toLowerCase() !== 'all departments'
      );
      return [{ ...allItem, id: 'all', name: 'All Departments' }, ...rest];
    }
    return [ALL_DEPT_OPTION, ...sourceList];
  }, [deptOptions]);

  // Outside click handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync focused index with selected option when opening
  useEffect(() => {
    if (isOpen) {
      const idx = allOptions.findIndex((opt) => opt.id === selectedDeptId);
      setFocusedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, selectedDeptId, allOptions]);

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [focusedIndex, isOpen]);

  // Current selected label for the trigger
  const currentOption = allOptions.find((d) => d.id === selectedDeptId);
  const currentLabel =
    !selectedDeptId || selectedDeptId === 'all' || selectedDeptId === 'ALL'
      ? 'All Departments'
      : currentOption?.name || 'All Departments';

  const selectOption = useCallback(
    (optId: string) => {
      onSelectDept(optId);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onSelectDept]
  );

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(true);
      const idx = allOptions.findIndex((opt) => opt.id === selectedDeptId);
      setFocusedIndex(idx >= 0 ? idx : 0);
    }
  };

  const handleListboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1 < allOptions.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : allOptions.length - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusedIndex(allOptions.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const targetOpt = allOptions[focusedIndex];
      if (targetOpt) {
        selectOption(targetOpt.id);
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* TRIGGER BAR — MATCHES HUB AND SHIFT FILTER DESIGN */}
      <div className="flex items-center gap-1.5 bg-white dark:bg-[#0c1424] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs text-xs group hover:border-[#0058be] dark:hover:border-blue-500 transition-colors">
        <span className="material-symbols-outlined text-slate-400 text-[16px] group-hover:scale-110 transition-transform shrink-0">
          category
        </span>
        <span className="text-[10px] uppercase text-slate-400 font-bold shrink-0">Dept:</span>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={handleTriggerKeyDown}
          aria-label="Filter by department"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls="executive-dept-listbox"
          className="flex items-center gap-1.5 bg-transparent font-semibold text-xs text-[#0b1c30] dark:text-slate-100 focus:outline-none cursor-pointer max-w-[170px]"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        </button>
      </div>

      {/* DROPDOWN LISTBOX PANEL */}
      {isOpen && (
        <div
          ref={listboxRef}
          id="executive-dept-listbox"
          role="listbox"
          aria-label="Departments"
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
          className="absolute left-0 mt-1 w-72 sm:w-80 max-w-[90vw] rounded-xl bg-white dark:bg-[#0c1424] border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 focus:outline-none"
        >
          <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Department Directory ({allOptions.length})
            </span>
            {loading && <RefreshCw className="w-3 h-3 text-[#0058be] animate-spin" />}
          </div>

          <div className="max-h-64 sm:max-h-72 overflow-y-auto py-1">
            {/* ERROR STATE BANNER */}
            {error && (
              <div className="p-2.5 mx-2 my-1 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600 dark:text-red-400" />
                  <span className="truncate">{error}</span>
                </div>
                {onRetry && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry();
                    }}
                    className="px-2 py-0.5 text-[11px] font-bold rounded bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 hover:bg-red-200 transition-colors shrink-0"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* UNIFIED OPTIONS LIST: All Departments first, followed by all 49 departments */}
            {allOptions.map((opt, idx) => {
              const isSelected =
                selectedDeptId === opt.id ||
                (opt.id === 'all' && (!selectedDeptId || selectedDeptId === 'all' || selectedDeptId === 'ALL'));
              const isFocused = focusedIndex === idx;

              return (
                <button
                  key={opt.id}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  id={`dept-option-${opt.id}`}
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  title={opt.name}
                  onClick={() => selectOption(opt.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 font-bold'
                      : isFocused
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="truncate pr-2">{opt.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#0058be] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
