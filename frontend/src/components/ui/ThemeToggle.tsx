'use client';

import React, { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon, Sparkles } from 'lucide-react';

interface ThemeToggleProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ThemeToggle({
  showLabel = false,
  size = 'md',
  className = '',
}: ThemeToggleProps) {
  const { theme, isDark, toggleTheme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggle = () => {
    setIsAnimating(true);
    toggleTheme();
    setTimeout(() => setIsAnimating(false), 400);
  };

  const isSmall = size === 'sm';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Interactive Toggle Capsule Switch */}
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? 'Dark Mode active. Click to switch to Bright Mode.' : 'Bright Mode active. Click to switch to Dark Mode.'}
        onClick={handleToggle}
        className={`group relative flex items-center select-none rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#0058be] focus:ring-offset-2 ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-[#0e1c36] to-[#1c2d5a] border border-blue-500/40 shadow-[0_0_12px_rgba(37,99,235,0.25)]'
            : 'bg-gradient-to-r from-amber-100 via-sky-100 to-amber-50 border border-amber-300 shadow-sm'
        } ${isSmall ? 'w-14 h-7 p-0.5' : 'w-16 h-8 p-1'} cursor-pointer`}
        title={isDark ? 'Switch to Bright Mode (Daylight)' : 'Switch to Dark Mode (Night)'}
      >
        {/* Track Icons for visual guidance */}
        <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none overflow-hidden rounded-full">
          {/* Sun indicator on left */}
          <Sun
            className={`transition-all duration-300 ${
              isDark
                ? 'opacity-30 scale-75 text-amber-200'
                : 'opacity-90 scale-90 text-amber-500'
            } ${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
          />
          {/* Moon indicator on right */}
          <div className="relative flex items-center justify-center">
            <Moon
              className={`transition-all duration-300 ${
                isDark
                  ? 'opacity-90 scale-95 text-blue-300'
                  : 'opacity-30 scale-75 text-slate-400'
              } ${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
            />
            {isDark && (
              <Sparkles className="absolute -top-1 -right-1 w-2.5 h-2.5 text-blue-300 animate-pulse" />
            )}
          </div>
        </div>

        {/* Sliding Thumb: LEFT in Bright mode, RIGHT in Dark mode */}
        <span
          className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            isSmall ? 'w-5 h-5' : 'w-6 h-6'
          } ${
            isDark
              ? `${isSmall ? 'translate-x-7' : 'translate-x-8'} bg-gradient-to-tr from-indigo-600 to-blue-400 text-white shadow-[0_0_10px_rgba(96,165,250,0.8)]`
              : 'translate-x-0 bg-gradient-to-tr from-amber-400 to-amber-300 text-amber-950 shadow-md ring-1 ring-amber-400/50'
          } ${isAnimating ? 'scale-110' : 'group-hover:scale-105'}`}
        >
          {isDark ? (
            <Moon
              className={`transition-transform duration-300 ${
                isAnimating ? 'rotate-[-30deg] scale-110' : 'rotate-0'
              } ${isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-white fill-white/20`}
            />
          ) : (
            <Sun
              className={`transition-transform duration-500 ${
                isAnimating ? 'rotate-180 scale-110' : 'rotate-0'
              } ${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-950 fill-amber-500/40`}
            />
          )}
        </span>
      </button>

      {/* Optional Mode Label */}
      {showLabel && (
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 select-none">
          {isDark ? 'Dark Mode' : 'Bright Mode'}
        </span>
      )}
    </div>
  );
}

export default ThemeToggle;
