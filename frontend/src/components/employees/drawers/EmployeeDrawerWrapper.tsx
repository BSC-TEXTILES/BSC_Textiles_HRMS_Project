'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw } from 'lucide-react';

interface EmployeeDrawerWrapperProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  filterSummary: string;
  recordCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children: React.ReactNode;
  footerAction?: React.ReactNode;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function EmployeeDrawerWrapper({
  open,
  onClose,
  title,
  subtitle,
  filterSummary,
  recordCount,
  onRefresh,
  isRefreshing = false,
  children,
  footerAction,
  triggerRef,
}: EmployeeDrawerWrapperProps) {
  const [mounted, setMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Manage body scroll locking, Escape key handling, and focus return
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const triggerEl = triggerRef?.current;

    // Focus close button on open for keyboard accessibility
    const timeout = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timeout);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      // Return focus to the trigger card button on close
      triggerEl?.focus();
    };
  }, [open, onClose, triggerRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emp-drawer-title"
      aria-describedby="emp-drawer-desc"
    >
      {/* Fixed backdrop with even dim tone, no blur, no gradient */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Container */}
      <div className="relative z-10 w-full md:w-[80vw] md:max-w-[720px] max-w-full h-full bg-white dark:bg-[#0e172a] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col text-slate-800 dark:text-slate-100 animate-in slide-in-from-right duration-200 ease-out">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 px-5 py-4 bg-white dark:bg-[#0e172a] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex flex-col min-w-0 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="emp-drawer-title"
                className="text-base font-bold text-[#18181B] dark:text-slate-100 tracking-tight truncate"
              >
                {title}
              </h2>
              {recordCount !== undefined && (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#1346a1]/10 text-[#1346a1] border border-[#1346a1]/20 whitespace-nowrap">
                  {recordCount} Records
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span
                id="emp-drawer-desc"
                className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-md"
              >
                {filterSummary}
              </span>
              {subtitle && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                  • {subtitle}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label="Refresh records"
                className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                title="Refresh Records"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#1346a1]' : ''}`}
                />
              </button>
            )}

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Body - internal scrolling */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </div>

        {/* Sticky Footer Action (if provided) */}
        {footerAction && (
          <div className="sticky bottom-0 z-20 px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
            {footerAction}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
