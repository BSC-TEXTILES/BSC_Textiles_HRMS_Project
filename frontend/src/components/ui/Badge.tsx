'use client';

import { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
  dot?: boolean;
  style?: CSSProperties;
}

const badgeVariants: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  gray: 'bg-gray-100 text-gray-800',
  neutral: 'bg-gray-100 text-gray-800',
  primary: 'bg-primary-100 text-primary-800',
};

const dotVariants: Record<string, string> = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  gray: 'bg-gray-500',
  neutral: 'bg-gray-500',
  primary: 'bg-primary-500',
};

export function Badge({ children, variant = 'gray', className, dot, style }: BadgeProps) {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';

  return (
    <span
      style={style}
      className={cn(baseStyles, badgeVariants[variant] || badgeVariants.gray, className)}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full mr-1.5', dotVariants[variant] || dotVariants.gray)}
        />
      )}
      {children}
    </span>
  );
}