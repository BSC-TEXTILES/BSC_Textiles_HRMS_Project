'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  position?: 'right' | 'left';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-full w-[95vw]',
};

const positionClasses = {
  right: 'right-0',
  left: 'left-0',
};

export function Drawer({ 
  open, 
  onClose, 
  title, 
  children, 
  className, 
  size = 'lg',
  position = 'right'
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-0">
      <div
        className="absolute inset-0 bg-gray-900/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 h-full overflow-y-auto bg-white shadow-2xl flex flex-col',
          sizeClasses[size],
          positionClasses[position],
          className
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sticky top-0 bg-white z-10">
            <h2 className="text-lg font-semibold text-[#0b1c30]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}