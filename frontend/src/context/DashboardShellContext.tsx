'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';

export interface DashboardShellContextType {
  isShellMounted: boolean;
  selectedHub: string;
  setSelectedHub: (hub: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeShiftLabel?: string;
  setActiveShiftLabel: (label?: string) => void;
  headerSearchSlot: React.ReactNode | null;
  setHeaderSearchSlot: (slot: React.ReactNode | null) => void;
  pendingPath: string | null;
  setPendingPath: (path: string | null) => void;
}

const DashboardShellContext = createContext<DashboardShellContextType | null>(null);

export function DashboardShellProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [selectedHub, setSelectedHubState] = useState<string>('all');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [activeShiftLabel, setActiveShiftLabel] = useState<string | undefined>(undefined);
  const [headerSearchSlot, setHeaderSearchSlot] = useState<React.ReactNode | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // Initialize persisted state from localStorage on client mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedHub = localStorage.getItem('bsc_selected_hub');
      if (savedHub) {
        setSelectedHubState(savedHub);
      }
      const savedCollapsed = localStorage.getItem('bsc_sidebar_collapsed');
      if (savedCollapsed !== null) {
        setIsCollapsed(savedCollapsed === 'true');
      }
    }
  }, []);

  const setSelectedHub = useCallback((hub: string) => {
    setSelectedHubState(hub);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bsc_selected_hub', hub);
      window.dispatchEvent(new CustomEvent('bsc:hub-changed', { detail: { hub } }));
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('bsc_sidebar_collapsed', String(next));
      }
      return next;
    });
  }, []);

  // Listen to external hub change events (e.g. from dashboard page)
  useEffect(() => {
    const handleExtHubChange = (e: any) => {
      if (e?.detail?.hub && e.detail.hub !== selectedHub) {
        setSelectedHubState(e.detail.hub);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('bsc:hub-changed-external', handleExtHubChange);
      return () => window.removeEventListener('bsc:hub-changed-external', handleExtHubChange);
    }
  }, [selectedHub]);

  // Clear pending path and mobile menu on route change
  useEffect(() => {
    setPendingPath(null);
    setMobileMenuOpen(false);
    // Release any lingering drawer/modal body scroll lock
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }, [pathname]);

  const value = useMemo<DashboardShellContextType>(
    () => ({
      isShellMounted: true,
      selectedHub,
      setSelectedHub,
      isCollapsed,
      setIsCollapsed,
      toggleSidebar,
      mobileMenuOpen,
      setMobileMenuOpen,
      activeShiftLabel,
      setActiveShiftLabel,
      headerSearchSlot,
      setHeaderSearchSlot,
      pendingPath,
      setPendingPath,
    }),
    [
      selectedHub,
      setSelectedHub,
      isCollapsed,
      toggleSidebar,
      mobileMenuOpen,
      activeShiftLabel,
      headerSearchSlot,
      pendingPath,
    ]
  );

  return (
    <DashboardShellContext.Provider value={value}>
      {children}
    </DashboardShellContext.Provider>
  );
}

export function useDashboardShellContext() {
  return useContext(DashboardShellContext);
}
