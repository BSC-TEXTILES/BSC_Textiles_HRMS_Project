'use client';

import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'full' | 'icon' | 'text';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  icon: {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12',
  },
  text: {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  },
  full: {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12',
  },
};

export function Logo({ variant = 'full', size = 'md', className }: LogoProps) {
  const iconSize = sizeClasses.icon[size];
  const textSize = sizeClasses.text[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn(
        'flex items-center justify-center rounded-lg bg-gradient-to-br from-primary-800 to-primary-900',
        iconSize
      )}>
        <svg 
          className="w-5/6 h-5/6 text-white" 
          viewBox="0 0 100 100" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e0ebfe" />
            </linearGradient>
          </defs>
          
          {/* Fabric weave pattern */}
          <g opacity="0.15">
            <rect x="10" y="10" width="80" height="80" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <rect x="20" y="20" width="60" height="60" rx="3" stroke="currentColor" strokeWidth="1" fill="none"/>
            <rect x="30" y="30" width="40" height="40" rx="2" stroke="currentColor" strokeWidth="0.5" fill="none"/>
          </g>
          
          {/* BSC Monogram */}
          <text 
            x="50" 
            y="62" 
            fontFamily="Inter, system-ui, sans-serif" 
            fontSize="32" 
            fontWeight="800" 
            fill="url(#logoGradient)" 
            textAnchor="middle"
            dominantBaseline="central"
            letterSpacing="-0.02em"
          >
            BSC
          </text>
          
          {/* Accent line */}
          <line 
            x1="35" y1="68" x2="65" y2="68" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      </div>
      
      {(variant === 'full' || variant === 'text') && (
        <span className={cn(
          'font-display font-extrabold tracking-tight text-gray-900',
          textSize
        )}>
          BSC Textiles
        </span>
      )}
    </div>
  );
}

export function LogoMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const iconSize = sizeClasses.icon[size];
  
  return (
    <div className={cn(
      'flex items-center justify-center rounded-lg bg-gradient-to-br from-primary-800 to-primary-900',
      iconSize,
      className
    )}>
      <svg 
        className="w-5/6 h-5/6 text-white" 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logoMarkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e0ebfe" />
          </linearGradient>
        </defs>
        
        <g opacity="0.15">
          <rect x="10" y="10" width="80" height="80" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <rect x="20" y="20" width="60" height="60" rx="3" stroke="currentColor" strokeWidth="1" fill="none"/>
          <rect x="30" y="30" width="40" height="40" rx="2" stroke="currentColor" strokeWidth="0.5" fill="none"/>
        </g>
        
        <text 
          x="50" 
          y="62" 
          fontFamily="Inter, system-ui, sans-serif" 
          fontSize="32" 
          fontWeight="800" 
          fill="url(#logoMarkGradient)" 
          textAnchor="middle"
          dominantBaseline="central"
          letterSpacing="-0.02em"
        >
          BSC
        </text>
        
        <line 
          x1="35" y1="68" x2="65" y2="68" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
    </div>
  );
}