'use client';

import React, { useEffect } from 'react';
import { useDashboardShellContext } from '@/context/DashboardShellContext';
import { DashboardLayoutFullShell } from './DashboardLayoutFullShell';

function DashboardLayoutPageSlot({
  children,
  activeShiftLabel,
  headerSearchSlot,
}: {
  children: React.ReactNode;
  activeShiftLabel?: string;
  headerSearchSlot?: React.ReactNode;
}) {
  const shell = useDashboardShellContext();

  useEffect(() => {
    if (headerSearchSlot !== undefined && shell?.setHeaderSearchSlot) {
      shell.setHeaderSearchSlot(headerSearchSlot);
      return () => {
        shell.setHeaderSearchSlot(null);
      };
    }
  }, [headerSearchSlot, shell]);

  useEffect(() => {
    if (activeShiftLabel !== undefined && shell?.setActiveShiftLabel) {
      shell.setActiveShiftLabel(activeShiftLabel);
      return () => {
        shell.setActiveShiftLabel(undefined);
      };
    }
  }, [activeShiftLabel, shell]);

  return <>{children}</>;
}

export function DashboardLayout({
  children,
  activeShiftLabel,
  headerSearchSlot,
}: {
  children: React.ReactNode;
  activeShiftLabel?: string;
  headerSearchSlot?: React.ReactNode;
}) {
  const shell = useDashboardShellContext();

  if (shell?.isShellMounted) {
    return (
      <DashboardLayoutPageSlot
        activeShiftLabel={activeShiftLabel}
        headerSearchSlot={headerSearchSlot}
      >
        {children}
      </DashboardLayoutPageSlot>
    );
  }

  return (
    <DashboardLayoutFullShell
      activeShiftLabel={activeShiftLabel}
      headerSearchSlot={headerSearchSlot}
    >
      {children}
    </DashboardLayoutFullShell>
  );
}

export { DashboardLayoutFullShell };
export default DashboardLayout;