'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Initialize theme on client mount - defaults to 'light' (Bright Mode) for BSC HRMS
  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('bsc_theme') as Theme | null;
      if (storedTheme === 'dark') {
        setThemeState('dark');
        applyThemeClass('dark', false);
      } else {
        // Default to Bright Mode
        setThemeState('light');
        applyThemeClass('light', false);
      }
    } catch {
      setThemeState('light');
      applyThemeClass('light', false);
    }
    setMounted(true);
  }, []);

  const applyThemeClass = (newTheme: Theme, animate = true) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (animate) {
      root.classList.add('theme-transitioning');
    }

    if (newTheme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }

    if (animate) {
      window.setTimeout(() => {
        root.classList.remove('theme-transitioning');
      }, 400);
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyThemeClass(newTheme, true);
    try {
      localStorage.setItem('bsc_theme', newTheme);
    } catch (e) {
      console.error('Failed to persist theme:', e);
    }
  };

  const toggleTheme = () => {
    // Read directly from DOM to avoid stale React state closures
    const isCurrentlyDark = typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : theme === 'dark';
    const nextTheme: Theme = isCurrentlyDark ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: mounted ? theme === 'dark' : false,
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
