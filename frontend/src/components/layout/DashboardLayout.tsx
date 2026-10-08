'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { 
  LayoutDashboard, Users, Building2, MapPin, 
  Clock, Coffee, Eye, Shield, Video, MessageSquare,
  BarChart3, Settings, LogOut, User, Menu, X,
  ChevronDown, ChevronRight, Home, CreditCard,
  Stethoscope, ClipboardCheck, Fingerprint, 
  ScanLine, Activity, CalendarRange, FileBarChart,
  ShieldCheck, ShieldQuestion, Bell, Radio,
  Calculator, DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';

const navigation = [
  {
    title: 'Core Operations',
    items: [
      { title: 'Executive Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'My Desk', href: '/my-desk', icon: User },
    ],
  },
  {
    title: 'Staff Operations & Monitoring',
    items: [
      { title: 'Live Staff Tracking', href: '/operations/live-attendance', icon: Radio },
      { title: 'QR Code Scanner', href: '/operations/qr-scanner', icon: ScanLine },
      { title: 'Face Verification', href: '/operations/face-verification', icon: Shield },
      { title: 'Time & Shift Rules', href: '/operations/time-shifts', icon: Clock },
      { title: 'Tea & Lunch Breaks', href: '/operations/breaks', icon: Coffee },
      { title: 'Selling Points & Audits', href: '/operations/selling-points', icon: MapPin },
      { title: 'Observation Module', href: '/operations/observations', icon: Eye },
      { title: 'Live Stream Monitoring', href: '/operations/live-streams', icon: Video },
    ],
  },
  {
    title: 'Workforce Directory',
    items: [
      { title: 'All Employees', href: '/employees', icon: Users },
      { title: 'Profile 360 & Dossier', href: '/employees/profile', icon: User },
      { title: 'Departments & Units', href: '/organization/departments', icon: Building2 },
    ],
  },
  {
    title: 'Time & Attendance',
    items: [
      { title: 'Biometric Punches', href: '/attendance/punches', icon: Fingerprint },
      { title: 'Floor Shifts & Rosters', href: '/attendance/shifts', icon: CalendarRange },
      { title: 'Lunch & Break Tracker', href: '/attendance/breaks', icon: ScanLine },
      { title: 'Punch Corrections', href: '/attendance/corrections', icon: ClipboardCheck },
      { title: 'Attendance Register', href: '/attendance/register', icon: Activity },
      { title: 'Attendance Calculation Engine', href: '/attendance/calculation', icon: Calculator },
    ],
  },
  {
    title: 'Incentives & Payroll',
    items: [
      { title: 'Incentive Calculation', href: '/incentives/calculation', icon: DollarSign },
      { title: 'Leave Approvals', href: '/leaves', icon: Stethoscope },
      { title: 'Payroll & Payslips', href: '/payroll', icon: CreditCard },
    ],
  },
  {
    title: 'Reports & Governance',
    items: [
      { title: 'Reports & Exports', href: '/reports', icon: FileBarChart },
      { title: 'Audit Logs & Security', href: '/admin/audit-logs', icon: ShieldCheck },
    ],
  },
  {
    title: 'Organization',
    items: [
      { title: 'Locations', href: '/organization/locations', icon: MapPin },
      { title: 'Floor Managers', href: '/organization/floor-managers', icon: Users },
      { title: 'Designations & Grades', href: '/organization/designations', icon: ShieldQuestion },
      { title: 'Holiday Calendar', href: '/organization/holidays', icon: CalendarRange },
    ],
  },
  {
    title: 'Administration',
    items: [
      { title: 'Users', href: '/admin/users', icon: Users },
      { title: 'Roles & Permissions', href: '/admin/roles', icon: ShieldQuestion },
      { title: 'Settings', href: '/admin/settings', icon: Settings },
      { title: 'Backup & Recovery', href: '/admin/backup', icon: FileBarChart },
    ],
  },
];

function NavItem({ title, href, icon: Icon, isActive, isOpen }: { 
  title: string; 
  href: string; 
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  isOpen: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary-50 text-primary-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        isOpen ? '' : 'justify-center'
      )}
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-primary-600' : 'text-gray-400')} />
      {isOpen && <span>{title}</span>}
    </Link>
  );
}

function NavSection({ title, items, isOpen }: { 
  title: string; 
  items: { title: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
  isOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const pathname = usePathname();

  return (
    <div className={cn('border-t border-gray-200 pt-4 mt-4', !isOpen && 'hidden')}>
      <div className={cn('flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500', !isOpen && 'justify-center')}>
        {isOpen && <span>{title}</span>}
        {isOpen && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>
      {expanded && (
        <nav className="space-y-1 mt-2">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <NavItem
                key={item.href}
                title={item.title}
                href={item.href}
                icon={item.icon}
                isActive={isActive}
                isOpen={isOpen}
              />
            );
          })}
        </nav>
      )}
    </div>
  );
}

export function Sidebar({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-white border-r border-gray-200 transition-all duration-300',
        isOpen ? 'w-64' : 'w-20'
      )}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={cn('flex items-center justify-between h-16 px-4 border-b border-gray-200', !isOpen && 'justify-center')}>
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo variant="full" size="md" />
            {isOpen && (
              <span className="font-bold text-gray-900">BSC Textiles</span>
            )}
          </Link>
          {isOpen && (
            <button
              onClick={onToggle}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6" aria-label="Main navigation">
          {navigation.map((section) => (
            <NavSection
              key={section.title}
              title={section.title}
              items={section.items}
              isOpen={isOpen}
            />
          ))}
        </nav>

        {/* User Info */}
        <div className={cn('p-4 border-t border-gray-200', !isOpen && 'hidden')}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {session?.user?.name || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {session?.user?.email || ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('bsc_token');
                localStorage.removeItem('token');
                localStorage.removeItem('bsc_user');
              }
              signOut({ callbackUrl: '/login' });
            }}
            className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}

export function Header({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <header className={cn('fixed top-0 right-0 z-30 h-16 bg-white border-b border-gray-200 transition-all duration-300', isOpen ? 'left-64' : 'left-20')}>
      <div className="flex items-center justify-between h-full px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="hidden sm:block">
            <h1 className="text-lg font-semibold text-gray-900">
              {pathname.split('/').pop()?.replace(/-/g, ' ') || 'Dashboard'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">3</span>
          </button>
          
          <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600" />
            </div>
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-gray-900">{session?.user?.name}</p>
              <p className="text-xs text-gray-500">{session?.user?.role}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      <Header isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      <main className={cn('pt-16 transition-all duration-300', isSidebarOpen ? 'ml-64' : 'ml-20')}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}