'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'full' | 'icon' | 'text';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showText?: boolean;
}

const sizeClasses = {
  icon: {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-24 h-24',
  },
  text: {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
    '2xl': 'text-xl',
  },
  full: {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-14',
    xl: 'h-20',
    '2xl': 'h-28',
  },
};

export function Logo({ variant = 'full', size = 'md', className, showText = true }: LogoProps) {
  const iconSize = sizeClasses.icon[size];
  const textSize = sizeClasses.text[size];

  if (variant === 'full') {
    return (
      <div className={cn('flex items-center gap-2.5', className)}>
        <div className={cn(
          'relative flex items-center justify-center rounded-xl bg-white p-1 border border-slate-200/80 shadow-xs shrink-0 overflow-hidden',
          sizeClasses.full[size]
        )}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/bsc_logo.png"
            alt="BSC Textiles Since 1938"
            className="w-full h-full object-contain"
          />
        </div>
        {showText && (
          <div className="flex flex-col leading-tight">
            <span className={cn('font-display font-black tracking-tight text-[#0b1c30]', textSize)}>
              BSC Textiles
            </span>
            <span className="text-[10px] font-bold tracking-wider uppercase text-[#0058be]">
              Since 1938
            </span>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <div className={cn(
        'relative flex items-center justify-center rounded-xl bg-white p-0.5 border border-slate-200/80 shadow-xs shrink-0 overflow-hidden hover:scale-105 transition-transform',
        iconSize,
        className
      )}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/bsc_logo.png"
          alt="BSC Textiles"
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col leading-tight', className)}>
      <span className={cn('font-display font-black tracking-tight text-[#0b1c30]', textSize)}>
        BSC Textiles
      </span>
      <span className="text-[10px] font-bold tracking-wider uppercase text-[#0058be]">
        Since 1938
      </span>
    </div>
  );
}

export function LogoMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'; className?: string }) {
  const iconSize = sizeClasses.icon[size];

  return (
    <div className={cn(
      'relative flex items-center justify-center rounded-xl bg-white p-0.5 border border-slate-200/80 shadow-xs shrink-0 overflow-hidden',
      iconSize,
      className
    )}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/bsc_logo.png"
        alt="BSC Textiles Mark"
        className="w-full h-full object-contain"
      />
    </div>
  );
}