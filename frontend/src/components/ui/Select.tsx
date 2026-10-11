'use client';

import { forwardRef, Ref } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  onValueChange?: (value: string) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, onValueChange, onChange, ...props }, ref: Ref<HTMLSelectElement>) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full appearance-none rounded-lg border bg-white px-3 py-2 text-sm transition-colors',
        'placeholder:text-slate-400',
        'focus:outline-none focus:ring-2 focus:ring-[#0058be] focus:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50',
        error && 'border-red-500 focus:ring-red-500',
        'border-slate-300 hover:border-slate-400',
        className
      )}
      onChange={(e) => {
        onChange?.(e);
        onValueChange?.(e.target.value);
      }}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref: Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors',
        'hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0058be] focus:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50',
        'data-[placeholder]:text-slate-400',
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
    </button>
  )
);
SelectTrigger.displayName = 'SelectTrigger';

interface SelectValueProps {
  placeholder?: string;
  children?: React.ReactNode;
}

export function SelectValue({ placeholder, children }: SelectValueProps) {
  return children ? (
    <span>{children}</span>
  ) : (
    <span data-placeholder="true">{placeholder}</span>
  );
}

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  position?: 'popper' | 'inline';
}

export function SelectContent({ className, children, position = 'popper', ...props }: SelectContentProps) {
  return (
    <div
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-950 shadow-lg',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'inline' && 'relative z-auto',
        className
      )}
      {...props}
    >
      <div className="max-h-96 overflow-y-auto">{children}</div>
    </div>
  );
}

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  disabled?: boolean;
}

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, value, disabled, ...props }, ref: Ref<HTMLDivElement>) => (
    <div
      ref={ref}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        'data-[highlighted]:outline-none data-[highlighted]:bg-[#eff4ff] data-[highlighted]:text-[#0058be]',
        'focus:bg-[#eff4ff] focus:text-[#0058be]',
        disabled && 'text-slate-400',
        className
      )}
      data-value={value}
      data-disabled={disabled}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <Check className="h-4 w-4" />
      </span>
      <span className="flex-1">{children}</span>
    </div>
  )
);
SelectItem.displayName = 'SelectItem';

export interface SelectGroupProps extends React.HTMLAttributes<HTMLDivElement> {}
export const SelectGroup = forwardRef<HTMLDivElement, SelectGroupProps>(
  ({ className, children, ...props }, ref: Ref<HTMLDivElement>) => (
    <div ref={ref} className={cn('[&_[data-select-group]]:flex [&_[data-select-group]]:items-center [&_[data-select-group]]:gap-2', className)} {...props}>
      {children}
    </div>
  )
);
SelectGroup.displayName = 'SelectGroup';

export interface SelectLabelProps extends React.HTMLAttributes<HTMLDivElement> {}
export const SelectLabel = forwardRef<HTMLDivElement, SelectLabelProps>(
  ({ className, children, ...props }, ref: Ref<HTMLDivElement>) => (
    <div
      ref={ref}
      className={cn('px-2 py-1.5 text-xs font-semibold text-slate-500', className)}
      {...props}
    >
      {children}
    </div>
  )
);
SelectLabel.displayName = 'SelectLabel';

export interface SelectSeparatorProps extends React.HTMLAttributes<HTMLHRElement> {}
export const SelectSeparator = forwardRef<HTMLHRElement, SelectSeparatorProps>(
  ({ className, ...props }, ref: Ref<HTMLHRElement>) => (
    <hr ref={ref} className={cn('-mx-1 my-1 h-px bg-slate-200', className)} {...props} />
  )
);
SelectSeparator.displayName = 'SelectSeparator';

export interface SelectScrollUpButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}
export const SelectScrollUpButton = forwardRef<HTMLButtonElement, SelectScrollUpButtonProps>(
  ({ className, ...props }, ref: Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronDown className="h-4 w-4 rotate-180" />
    </button>
  )
);
SelectScrollUpButton.displayName = 'SelectScrollUpButton';

export interface SelectScrollDownButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}
export const SelectScrollDownButton = forwardRef<HTMLButtonElement, SelectScrollDownButtonProps>(
  ({ className, ...props }, ref: Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronDown className="h-4 w-4" />
    </button>
  )
);
SelectScrollDownButton.displayName = 'SelectScrollDownButton';