'use client';

import { ReactNode } from 'react';
import { MyAccess, RbacAction, canAction, isWidgetVisible, useAccessSnapshot } from '@/lib/rbac';

interface CanProps {
  module: string;
  action?: RbacAction;
  /** Pass an already-loaded access object to skip the shared-store read. */
  access?: MyAccess;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only when the signed-in user's role grants the action.
 * Cosmetic by design — the API enforces the same rule; this just stops the UI
 * from offering a control that would be rejected.
 */
export function Can({ module, action = 'view', access, fallback = null, children }: CanProps) {
  const snapshot = useAccessSnapshot();
  const resolved = access ?? snapshot;
  if (resolved.loading) return <>{fallback}</>;
  return canAction(resolved, module, action) ? <>{children}</> : <>{fallback}</>;
}

export function useCan(module: string, action: RbacAction = 'view', access?: MyAccess): boolean {
  const snapshot = useAccessSnapshot();
  return canAction(access ?? snapshot, module, action);
}

/** Dashboard sections appear only for roles whose widget visibility includes them. */
export function WidgetGate({
  widgetKey,
  access,
  fallback = null,
  children,
}: {
  widgetKey: string;
  access?: MyAccess;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const snapshot = useAccessSnapshot();
  const resolved = access ?? snapshot;
  return isWidgetVisible(resolved, widgetKey) ? <>{children}</> : <>{fallback}</>;
}
