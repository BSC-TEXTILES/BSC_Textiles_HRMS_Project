'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, KeyRound, Network, ShieldCheck, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MyAccess } from '@/lib/rbac';

const LINKS = [
  { href: '/admin/access', label: 'Overview', icon: ShieldCheck, moduleKey: 'ROLES_PERMISSIONS' },
  { href: '/admin/roles', label: 'Role Management', icon: KeyRound, moduleKey: 'ROLES_PERMISSIONS' },
  { href: '/admin/module-access', label: 'Module Access', icon: Network, moduleKey: 'MODULE_ACCESS' },
  { href: '/admin/users', label: 'Users', icon: Users, moduleKey: 'USERS' },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ClipboardList, moduleKey: 'AUDIT_LOGS' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, moduleKey: 'SETTINGS' },
];

/**
 * Tabs across the access-control area. The collapsible left sidebar carries the
 * same destinations; this keeps the current section visible while the admin
 * moves between overview, roles and the matrix.
 */
export function AccessNav({ access }: { access: MyAccess }) {
  const pathname = usePathname();
  const visible = LINKS.filter((link) => (access.source !== 'rbac' ? true : access.access[link.moduleKey] !== 'none'));
  if (visible.length === 0) return null;

  return (
    <nav
      aria-label="Access control sections"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-gray-200 px-1 pb-px dark:border-slate-700"
    >
      {visible.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-[#1346a1] text-[#1346a1] dark:text-blue-300 dark:border-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
