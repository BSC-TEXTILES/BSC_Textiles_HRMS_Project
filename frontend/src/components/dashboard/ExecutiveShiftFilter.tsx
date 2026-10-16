'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Clock, ChevronDown, Check, Plus, AlertTriangle, RefreshCw } from 'lucide-react';
import { SHIFT_I_LABEL, STATUTORY_CAPS } from '@/config/shiftPolicyConfig';
import {
  formatPunchTime12,
  formatLunchBreakDisplay,
  formatTeaBreakDisplay,
} from '@/lib/shiftHelpers';

export interface ShiftOptionItem {
  id: string;
  name: string;
  code?: string;
  timeRange?: string;
  staffCount?: number;
  capacity?: number;
  isCustom?: boolean;
  isCustomBatch?: boolean;
  startTime?: string | Date;
  endTime?: string | Date;
  lunchDurationMinutes?: number;
  teaDurationMinutes?: number;
  teaBreakSlot?: string;
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
  const [activeHoverId, setActiveHoverId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [popoverPlacement, setPopoverPlacement] = useState<'right' | 'left'>('right');

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const optionsRef = useRef<Array<HTMLButtonElement | null>>([]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveHoverId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine popover flip placement based on viewport bounds
  const updatePopoverPlacement = useCallback(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const popoverWidth = 260;
      // If menu right edge + popover width exceeds viewport width, flip to left
      if (rect.right + popoverWidth > window.innerWidth - 16) {
        setPopoverPlacement('left');
      } else {
        setPopoverPlacement('right');
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePopoverPlacement();
      window.addEventListener('resize', updatePopoverPlacement);
      return () => window.removeEventListener('resize', updatePopoverPlacement);
    }
  }, [isOpen, updatePopoverPlacement]);

  // Selected shift option and display label
  const currentOption = shiftOptions.find((s) => s.id === selectedShiftId);
  const currentLabel =
    selectedShiftId === 'all'
      ? 'All Shifts'
      : currentOption?.name === 'Shift I'
      ? SHIFT_I_LABEL
      : currentOption?.name || 'Selected Shift';

  // Clear hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleMouseEnter = (shiftId: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setActiveHoverId(shiftId);
    }, 250);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setActiveHoverId(null);
    }, 150);
  };

  // Keyboard navigation for dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    const totalItems = shiftOptions.length + 1; // +1 for "All Shifts (Combined)"

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = (focusedIndex + 1) % totalItems;
        setFocusedIndex(nextIndex);
        optionsRef.current[nextIndex]?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = (focusedIndex - 1 + totalItems) % totalItems;
        setFocusedIndex(prevIndex);
        optionsRef.current[prevIndex]?.focus();
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setIsOpen(false);
        setActiveHoverId(null);
        triggerButtonRef.current?.focus();
        break;
      }
      case 'Tab': {
        setIsOpen(false);
        setActiveHoverId(null);
        break;
      }
    }
  };

  // Find the currently hovered shift option for the popover
  const hoveredOption = shiftOptions.find((s) => s.id === activeHoverId);
  const isShift1 = hoveredOption?.name === 'Shift I' || hoveredOption?.name.toLowerCase() === 'shift 1';
  const isShift2 = hoveredOption?.name === 'Shift 2';

  const punchInDisplay = formatPunchTime12(
    isShift1 ? '10:00' : isShift2 ? '11:00' : hoveredOption?.startTime
  );
  const punchOutDisplay = formatPunchTime12(
    isShift1 ? '21:30' : isShift2 ? '21:00' : hoveredOption?.endTime
  );
  const lunchMinutes = isShift1
    ? 100
    : isShift2
    ? 45
    : hoveredOption?.lunchDurationMinutes ?? null;
  const teaMinutes = isShift1
    ? 20
    : isShift2
    ? 10
    : hoveredOption?.teaDurationMinutes ?? null;
  const teaSlot = isShift1
    ? 'Evening'
    : isShift2
    ? 'None'
    : hoveredOption?.teaBreakSlot ?? 'None';

  const lunchDisplay = formatLunchBreakDisplay(lunchMinutes);
  const teaDisplay = formatTeaBreakDisplay(teaMinutes, teaSlot);
  const isLunchWarning =
    lunchMinutes !== null && lunchMinutes > STATUTORY_CAPS.lunchCapMinutes;
  const popoverTitle = isShift1 ? SHIFT_I_LABEL : hoveredOption?.name;

  return (
    <div
      className="exec-shift-container relative"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {/* SHIFT TRIGGER CONTROL (Single entry point: only the dropdown trigger) */}
      <div className="exec-shift-trigger-wrapper flex items-center gap-1.5 bg-white dark:bg-[#0c1424] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs text-xs group hover:border-[#0058be] dark:hover:border-blue-500 transition-colors">
        <Clock className="w-3.5 h-3.5 text-[#0058be] dark:text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
        <span className="text-[10px] uppercase text-slate-400 font-bold shrink-0">Shift:</span>

        <button
          ref={triggerButtonRef}
          type="button"
          onClick={() => {
            const nextOpen = !isOpen;
            setIsOpen(nextOpen);
            if (!nextOpen) setActiveHoverId(null);
            else setFocusedIndex(0);
          }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`Select shift filter, currently ${currentLabel}`}
          className="flex items-center gap-1.5 bg-transparent font-semibold text-xs text-[#0b1c30] dark:text-slate-100 focus:outline-none cursor-pointer max-w-[170px]"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown
            className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[#0058be]' : ''
            }`}
          />
        </button>
      </div>

      {/* DROPDOWN MENU */}
      {isOpen && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Shift options"
          className="exec-shift-dropdown absolute left-0 mt-1 w-72 rounded-xl bg-white dark:bg-[#0c1424] border border-slate-200 dark:border-slate-800 shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              SHIFT DIRECTORY
            </span>
            {loading && <RefreshCw className="w-3 h-3 text-[#0058be] animate-spin" />}
          </div>

          {/* Error state */}
          {error && (
            <div className="p-3 text-center space-y-2">
              <p className="text-xs text-red-500 font-medium">Could not load shifts</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-[#0058be] dark:text-blue-400 hover:bg-blue-50 transition-colors inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* Options list: with overflow-x-hidden to prevent horizontal scrollbar */}
          <div className="exec-shift-options-list max-h-72 overflow-y-auto overflow-x-hidden py-1">
            {/* 1. All Shifts (Combined) - always first */}
            <button
              ref={(el) => {
                optionsRef.current[0] = el;
              }}
              role="option"
              aria-selected={selectedShiftId === 'all'}
              aria-label="All shifts, combined"
              type="button"
              onClick={() => {
                onSelectShift('all');
                setIsOpen(false);
                setActiveHoverId(null);
                triggerButtonRef.current?.focus();
              }}
              onFocus={() => {
                setFocusedIndex(0);
                setActiveHoverId(null);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left transition-colors cursor-pointer focus:outline-none focus:bg-blue-50 dark:focus:bg-blue-950/60 ${
                selectedShiftId === 'all'
                  ? 'bg-blue-50/80 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span>All Shifts (Combined)</span>
              {selectedShiftId === 'all' && <Check className="w-3.5 h-3.5 text-[#0058be]" />}
            </button>

            {/* Individual Shifts in exact order: Shift I, Shift 2, then Custom Shifts */}
            {shiftOptions.map((opt, idx) => {
              const optionIndex = idx + 1;
              const isSelected = selectedShiftId === opt.id;
              const isOptShift1 = opt.name === 'Shift I' || opt.name.toLowerCase() === 'shift 1';
              const displayName = isOptShift1 ? SHIFT_I_LABEL : opt.name;
              const optPunchIn = formatPunchTime12(
                isOptShift1 ? '10:00' : opt.name === 'Shift 2' ? '11:00' : opt.startTime
              );
              const optPunchOut = formatPunchTime12(
                isOptShift1 ? '21:30' : opt.name === 'Shift 2' ? '21:00' : opt.endTime
              );
              const accessibleDescription = `${displayName}, punch in ${optPunchIn}, punch out ${optPunchOut}`;

              return (
                <div
                  key={opt.id}
                  className="exec-shift-option-container relative"
                  onMouseEnter={() => handleMouseEnter(opt.id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <button
                    ref={(el) => {
                      optionsRef.current[optionIndex] = el;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    aria-label={accessibleDescription}
                    type="button"
                    onClick={() => {
                      onSelectShift(opt.id);
                      setIsOpen(false);
                      setActiveHoverId(null);
                      triggerButtonRef.current?.focus();
                    }}
                    onFocus={() => {
                      setFocusedIndex(optionIndex);
                      setActiveHoverId(opt.id);
                    }}
                    onBlur={() => {
                      setActiveHoverId(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left transition-colors cursor-pointer focus:outline-none focus:bg-blue-50 dark:focus:bg-blue-950/60 ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0 pr-2 flex items-center gap-1.5">
                      <span className="truncate">{displayName}</span>
                      {opt.isCustom && (
                        <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          Custom
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Staff count with muted text for 0 staff */}
                      <span
                        className={`text-[10px] font-mono ${
                          (opt.staffCount ?? 0) === 0
                            ? 'text-slate-400 dark:text-slate-500 italic'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {opt.staffCount ?? 0} staff
                      </span>

                      {isSelected && <Check className="w-3.5 h-3.5 text-[#0058be] shrink-0" />}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Action Divider and + Custom Shift Action */}
          {onOpenCreateModal && (
            <div className="p-1.5 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setActiveHoverId(null);
                  onOpenCreateModal();
                }}
                aria-label="Create custom shift"
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-[#0058be] dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Custom Shift</span>
              </button>
            </div>
          )}

          {/* FLOATING HOVER / FOCUS DETAILS POPOVER: rendered outside scroll list to prevent clipping or horizontal scrollbars */}
          {hoveredOption && (
            <div
              id={`exec-shift-popover-${hoveredOption.id}`}
              role="tooltip"
              className={`exec-shift-popover absolute z-[70] w-64 rounded-xl bg-white dark:bg-[#09101f] border border-slate-200 dark:border-slate-700 shadow-2xl p-3 text-xs pointer-events-none transition-all animate-in fade-in duration-150 ${
                popoverPlacement === 'right'
                  ? 'left-full ml-2 top-0'
                  : 'right-full mr-2 top-0'
              }`}
              style={{
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
              }}
            >
              {/* Shift name title */}
              <div className="font-bold text-xs text-[#0b1c30] dark:text-slate-100 pb-1.5 mb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span>{popoverTitle}</span>
                {isShift1 && (
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    10h 30m
                  </span>
                )}
                {isShift2 && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    10h 00m
                  </span>
                )}
              </div>

              {/* Content rows in required order */}
              <div className="space-y-1.5 text-[11px]">
                {/* 1. Punch IN */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Punch IN:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {punchInDisplay}
                  </span>
                </div>

                {/* 2. Punch OUT */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Punch OUT:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {punchOutDisplay}
                  </span>
                </div>

                {/* 3. Lunch Break */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Lunch Break:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {lunchDisplay}
                  </span>
                </div>

                {/* Warning badge under lunch row when above statutory cap */}
                {isLunchWarning && (
                  <div
                    role="alert"
                    className="exec-shift-cap-warning flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-900 text-[10px] font-bold text-amber-800 dark:text-amber-200 mt-1"
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                    <span>Above 45 min statutory cap</span>
                  </div>
                )}

                {/* 4. Tea Break */}
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-slate-500 dark:text-slate-400">Tea Break:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {teaDisplay}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
