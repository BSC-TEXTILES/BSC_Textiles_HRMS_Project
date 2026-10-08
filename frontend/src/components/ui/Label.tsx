'use client';

import { LabelHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ required, size = 'md', className, children, ...rest }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'block font-semibold text-gray-700 mb-1.5',
          sizeClasses[size],
          className
        )}
        {...rest}
      >
        {children}
        {required && (
          <span className="ml-1 text-burgundy-500" aria-hidden="true">*</span>
        )}
      </label>
    );
  }
);

Label.displayName = 'Label';