'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { canViewModule, useMyAccess } from '@/lib/rbac';

/**
 * Client-side route guard for the access-control screens.
 *
 * The middleware can only gate by the role in the session token; it cannot see
 * the module matrix. So opening a restricted URL lands here, which bounces to
 * the same /403 page the middleware uses. Data is still refused server-side —
 * this exists so the user gets an explanation rather than an empty table.
 */
export function RequireModule({ module, children }: { module: string; children: ReactNode }) {
  const access = useMyAccess();
  const pathname = usePathname();
  const router = useRouter();
  const denied = !access.loading && access.source === 'rbac' && !canViewModule(access, module);

  useEffect(() => {
    if (denied) router.replace(`/403?from=${encodeURIComponent(pathname)}`);
  }, [denied, pathname, router]);

  if (access.loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center gap-2 text-sm text-gray-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking your access…
      </div>
    );
  }
  if (denied) return null;
  return <>{children}</>;
}
