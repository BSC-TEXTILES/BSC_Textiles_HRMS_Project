'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, isOpen, onClose, title, children, className }: ModalProps) {
  const isVisible = open ?? isOpen ?? false;

  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto no-scrollbar rounded-xl bg-white dark:bg-[#0e172a] text-slate-900 dark:text-slate-100 border border-slate-200/90 dark:border-slate-800 shadow-2xl transition-all',
          className
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 px-5 py-4 bg-slate-50/50 dark:bg-[#090f1d]/50">
            <h2 className="text-base sm:text-lg font-bold text-[#0b1c30] dark:text-white tracking-tight">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
