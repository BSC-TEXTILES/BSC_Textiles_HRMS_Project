/**
 * Left navigation model for the HRMS app shell.
 *
 * Every href here must point at a route that exists under `src/app`
 * (verified against the real page tree). Visibility is driven by two
 * complementary sources — never by the sidebar alone:
 *   1. `moduleKey` → the logged-in user's effective RBAC module access map
 *      (`GET /roles/rbac/modules`, see `lib/rbac.ts`);
 *   2. `roles` → the same route groups `middleware.ts` enforces, so an entry
 *      is never rendered for a route that would bounce to /403.
 * The Express API re-checks `authorize()` on every request, so hiding an entry
 * is cosmetic convenience, not the actual permission gate.
 */
import {
  LayoutDashboard,
  Cpu,
  UserCheck,
  Users,
  Contact,
  UserMinus,
  Building2,
  ShieldCheck,
  Fingerprint,
  FolderLock,
  Calendar,
  Coffee,
  FileEdit,
  ClipboardCheck,
  Calculator,
  Banknote,
  Receipt,
  Wallet,
  BarChart3,
  CalendarClock,
  Coins,
  ScanFace,
  Store,
  Eye,
  FileText,
  ShieldAlert,
  Settings,
  Clock,
  MapPin,
  QrCode,
  Database,
  HardDrive,
  Network,
  ClipboardList,
  UserCog,
  KeyRound,
  UserCheck as HistoryIcon,
  ListChecks,
  PartyPopper,
} from 'lucide-react';
import type { MyAccess } from '@/lib/rbac';
import { canEditModule, canViewModule } from '@/lib/rbac';
import {
  ADMIN_ROLES,
  OPERATIONS_ROUTE_ROLES,
  PAYROLL_ROUTE_ROLES,
  WORKFORCE_ROUTE_ROLES,
  roleInGroup,
} from '@/lib/roles';

const ADMIN = [...ADMIN_ROLES];
const WORKFORCE = [...WORKFORCE_ROUTE_ROLES];
const PAYROLL = [...PAYROLL_ROUTE_ROLES];
const OPERATIONS = [...OPERATIONS_ROUTE_ROLES];

export interface NavItem {
  title: string;
  href: string;
  icon: any;
  badge?: string;
  /** RBAC module key from the backend access map. */
  moduleKey?: string;
  /** Route roles, kept identical to `middleware.ts` rules. */
  roles?: readonly string[];
  /** When true the entry needs `edit` access on the module, not just view. */
  requiresEdit?: boolean;
}

export interface NavSectionTheme {
  color: string;
  dotColor: string;
  activeGradient: string;
  hoverColor: string;
  iconColor: string;
}

export interface NavSectionConfig {
  title: string;
  theme: NavSectionTheme;
  items: NavItem[];
}

const theme = (
  color: string,
  dotColor: string,
  activeGradient: string,
  hoverColor: string,
  iconColor: string
): NavSectionTheme => ({ color, dotColor, activeGradient, hoverColor, iconColor });

export const enterpriseNavigation: NavSectionConfig[] = [
  {
    title: 'Core Workspace',
    theme: theme(
      'text-sky-200',
      'bg-sky-400',
      'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-sky-300',
      'hover:text-white hover:bg-white/10',
      'text-sky-300 group-hover:text-white'
    ),
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, moduleKey: 'DASHBOARD' },
      { title: 'My Desk Self-Service', href: '/my-desk', icon: UserCheck },
      { title: 'Notifications', href: '/notifications', icon: CalendarClock },
    ],
  },
  {
    title: 'Employee Records',
    theme: theme(
      'text-emerald-200',
      'bg-emerald-400',
      'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-emerald-300',
      'hover:text-white hover:bg-white/10',
      'text-emerald-300 group-hover:text-white'
    ),
    items: [
      { title: 'Employee Details', href: '/employees', icon: Users, moduleKey: 'USERS', roles: WORKFORCE },
      { title: 'Active Employees', href: '/employees/active', icon: ListChecks, roles: WORKFORCE },
      {
        title: 'Inactive Employees',
        href: '/employees/inactive',
        icon: UserMinus,
        roles: WORKFORCE,
        badge: 'Exit / Block',
      },
      { title: 'Employee History', href: '/employees/history', icon: HistoryIcon, roles: WORKFORCE },
      { title: 'Profile 360 & Dossier', href: '/employees/profile', icon: Contact },
      {
        title: 'Analysis & Reports',
        href: '/employees/analysis',
        icon: BarChart3,
        badge: 'Analytics',
        roles: WORKFORCE,
      },
      {
        title: 'Document Management',
        href: '/employees/documents',
        icon: FolderLock,
        badge: 'Dossier',
        moduleKey: 'DOCUMENT_MANAGEMENT',
      },
      {
        title: 'Full & Final Settlement',
        href: '/employees/former',
        icon: Wallet,
        badge: 'Settlement',
        roles: [...WORKFORCE, ...PAYROLL],
      },
    ],
  },
  {
    title: 'Attendance Management',
    theme: theme(
      'text-amber-200',
      'bg-amber-400',
      'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-amber-300',
      'hover:text-white hover:bg-white/10',
      'text-amber-300 group-hover:text-white'
    ),
    items: [
      { title: 'Attendance Register', href: '/attendance/register', icon: ClipboardCheck },
      {
        title: 'Missed Punching Details',
        href: '/attendance/missed-punching',
        icon: Clock,
        badge: 'Attention',
        roles: WORKFORCE,
      },
      { title: 'Biometric Punches Ledger', href: '/attendance/punches', icon: Fingerprint },
      { title: 'Floor Shifts & Rosters', href: '/attendance/shifts', icon: Calendar },
      { title: 'Lunch & Break Tracker', href: '/attendance/breaks', icon: Coffee },
      {
        title: 'Punch Corrections',
        href: '/attendance/corrections',
        icon: FileEdit,
        moduleKey: 'ATTENDANCE_CORRECTIONS',
        roles: WORKFORCE,
      },
      {
        title: 'Attendance Calculation',
        href: '/attendance/calculation',
        icon: Calculator,
        roles: WORKFORCE,
      },
      {
        title: 'Late & Fine Management',
        href: '/attendance/late-fines',
        icon: ScanFace,
        badge: 'Policy',
        moduleKey: 'LATE_FINES',
        roles: WORKFORCE,
      },
      { title: 'Digital QR Passes', href: '/attendance/qr-codes', icon: QrCode, badge: 'Live ID' },
      {
        title: 'Biometric Device Manager',
        href: '/attendance/devices',
        icon: Cpu,
        badge: 'eSSL IoT',
        roles: WORKFORCE,
      },
    ],
  },
  {
    title: 'Organization & Locations',
    theme: theme(
      'text-violet-200',
      'bg-violet-400',
      'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-violet-300',
      'hover:text-white hover:bg-white/10',
      'text-violet-300 group-hover:text-white'
    ),
    items: [
      {
        title: 'Store / Location Management',
        href: '/organization/locations',
        icon: MapPin,
        badge: 'Hubs',
        moduleKey: 'STORES',
        roles: WORKFORCE,
      },
      { title: 'Departments & Units', href: '/organization/departments', icon: Building2, roles: WORKFORCE },
      { title: 'Designations', href: '/organization/designations', icon: UserCog, roles: WORKFORCE },
      { title: 'Floor Managers', href: '/organization/floor-managers', icon: Network, roles: WORKFORCE },
      { title: 'Holidays & Weekly Offs', href: '/organization/holidays', icon: PartyPopper, roles: WORKFORCE },
      {
        title: 'Approval Queue',
        href: '/organization/approvals',
        icon: ClipboardList,
        badge: 'Workflow',
        roles: WORKFORCE,
      },
    ],
  },
  {
    title: 'Payroll & Settlements',
    theme: theme(
      'text-rose-200',
      'bg-rose-400',
      'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-rose-300',
      'hover:text-white hover:bg-white/10',
      'text-rose-300 group-hover:text-white'
    ),
    items: [
      {
        title: 'Payroll & Payslips',
        href: '/payroll/payslips',
        icon: Receipt,
        moduleKey: 'SALARY_CADRES',
        roles: PAYROLL,
      },
      { title: 'Payroll Dashboard', href: '/payroll', icon: Banknote, roles: PAYROLL },
      {
        title: 'Salary Structure',
        href: '/payroll/salary-structure',
        icon: Wallet,
        moduleKey: 'SALARY_CADRES',
        requiresEdit: true,
        roles: PAYROLL,
      },
      { title: 'Payroll Reports', href: '/payroll/reports', icon: BarChart3, roles: PAYROLL },
      { title: 'Floor Salary Overview', href: '/payroll/floor-overview', icon: Store, roles: PAYROLL },
      { title: 'Leave Approvals', href: '/leaves', icon: CalendarClock },
      { title: 'Incentive Calculation', href: '/incentives/calculation', icon: Coins, roles: PAYROLL },
    ],
  },
  {
    title: 'Field Operations & KYC',
    theme: theme(
      'text-cyan-200',
      'bg-cyan-400',
      'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-cyan-300',
      'hover:text-white hover:bg-white/10',
      'text-cyan-300 group-hover:text-white'
    ),
    items: [
      { title: 'KYC Verification', href: '/operations/kyc', icon: ShieldCheck, badge: 'DigiLocker', roles: OPERATIONS },
      { title: 'Face Verification', href: '/operations/face-verification', icon: ScanFace, roles: OPERATIONS },
      { title: 'Selling Points & Counters', href: '/operations/selling-points', icon: Store, roles: OPERATIONS },
      { title: 'Observation Module', href: '/operations/observations', icon: Eye, roles: OPERATIONS },
      { title: 'Live Attendance Floor', href: '/operations/live-attendance', icon: LayoutDashboard, roles: OPERATIONS },
      { title: 'Live Streams', href: '/operations/live-streams', icon: Eye, roles: OPERATIONS },
      { title: 'Break Policy Ops', href: '/operations/breaks', icon: Coffee, roles: OPERATIONS },
      { title: 'Contactless QR Scanner', href: '/operations/qr-scanner', icon: QrCode, badge: 'Scanner' },
      { title: 'Time Shifts Board', href: '/operations/time-shifts', icon: Clock, roles: OPERATIONS },
    ],
  },
  {
    title: 'Reports & Administration',
    theme: theme(
      'text-indigo-200',
      'bg-indigo-400',
      'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-indigo-300',
      'hover:text-white hover:bg-white/10',
      'text-indigo-300 group-hover:text-white'
    ),
    items: [
      { title: 'Governance Reports', href: '/reports', icon: FileText, roles: WORKFORCE },
      { title: 'User & Role Management', href: '/admin/users', icon: UserCog, badge: 'RBAC', roles: ADMIN },
      {
        title: 'Roles & Permissions',
        href: '/admin/roles',
        icon: KeyRound,
        moduleKey: 'ROLES_PERMISSIONS',
        roles: ADMIN,
      },
      {
        title: 'Audit Logs & Security',
        href: '/admin/audit-logs',
        icon: ShieldAlert,
        moduleKey: 'AUDIT_LOGS',
        roles: ADMIN,
      },
      { title: 'System Settings', href: '/admin/settings', icon: Settings, roles: ADMIN },
      { title: 'Registration Approvals', href: '/admin/registrations', icon: ClipboardCheck, roles: ADMIN },
      { title: 'Database & Shards', href: '/admin/shards', icon: Database, badge: 'MySQL', roles: ADMIN },
      { title: 'Local DB & Backups', href: '/admin/local-database', icon: HardDrive, roles: ADMIN },
    ],
  },
];

/**
 * Sidebar filtering: role group first (mirrors middleware), then the effective
 * RBAC module access map when the user is governed by it.
 */
export function isNavItemAllowed(
  item: NavItem,
  role: string,
  access: MyAccess | null
): boolean {
  if (item.roles && !roleInGroup(role, item.roles)) return false;

  if (item.moduleKey && access && !access.loading && access.source === 'rbac') {
    return item.requiresEdit
      ? canEditModule(access, item.moduleKey)
      : canViewModule(access, item.moduleKey);
  }

  return true;
}

export function buildVisibleNavigation(
  role: string,
  access: MyAccess | null
): NavSectionConfig[] {
  return enterpriseNavigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isNavItemAllowed(item, role, access)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Longest-prefix winner is the active entry, so `/employees/inactive` highlights
 * "Inactive Employees" rather than "Employee Details", and a nested/dynamic
 * route such as `/employees/profile/emp_bsc_1604` highlights the deepest
 * matching entry.
 */
export function computeActiveHref(pathname: string, sections: NavSectionConfig[]): string | null {
  let best: string | null = null;
  let bestLen = -1;

  for (const section of sections) {
    for (const item of section.items) {
      const itemPath = item.href.split('?')[0];
      const matches = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
      if (matches && itemPath.length > bestLen) {
        bestLen = itemPath.length;
        best = item.href;
      }
    }
  }

  return best;
}

/** Kept for backwards compatibility with any page importing the old helper. */
export function isNavItemActive(pathname: string, itemHref: string): boolean {
  const itemPath = itemHref.split('?')[0];
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
