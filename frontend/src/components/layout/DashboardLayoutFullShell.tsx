'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import api from '@/lib/api';
import { useNotifications } from '@/context/NotificationContext';
import { GlobalHeaderSearch } from '@/components/layout/GlobalHeaderSearch';
import { useDashboardShellContext } from '@/context/DashboardShellContext';
import { 
  LayoutDashboard,
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
  Bell, 
  User, 
  CheckCheck, 
  ExternalLink, 
  LogOut, 
  Clock, 
  ChevronDown,
  Menu,
  X,
  MapPin,
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  QrCode
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: any;
  badge?: string;
}

interface NavSectionConfig {
  title: string;
  items: NavItem[];
}

const enterpriseNavigation: NavSectionConfig[] = [
  {
    title: 'Core Operations',
    items: [
      { title: 'Executive Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'My Desk Self-Service', href: '/my-desk', icon: UserCheck },
    ],
  },
  {
    title: 'Workforce Directory',
    items: [
      { title: 'All Employees', href: '/employees', icon: Users },
      { title: 'Profile 360 & Dossier', href: '/employees/profile', icon: Contact },
      { title: 'Analysis', href: '/employees/analysis', icon: BarChart3, badge: 'Analytics' },
      { title: 'Employee Documents', href: '/employees/documents', icon: FolderLock, badge: 'Dossier' },
      { title: 'Departments & Units', href: '/organization/departments', icon: Building2 },
      { title: 'Former Staff & F&F', href: '/employees/former', icon: UserMinus, badge: 'Settlement' },
    ],
  },
  {
    title: 'KYC & DigiLocker',
    items: [
      { title: 'KYC Verification', href: '/operations/kyc', icon: ShieldCheck, badge: 'DigiLocker' },
      { title: 'Digital Document Verification', href: '/employees/profile?tab=documents', icon: FileText, badge: 'UIDAI' },
    ],
  },
  {
    title: 'QR Code Attendance',
    items: [
      { title: 'Digital QR Passes', href: '/attendance/qr-codes', icon: QrCode, badge: 'Live ID' },
      { title: 'Contactless QR Scanner', href: '/operations/qr-scanner', icon: ScanFace, badge: 'Scanner' },
    ],
  },
  {
    title: 'Time & Attendance',
    items: [
      { title: 'Biometric Punches', href: '/attendance/punches', icon: Fingerprint },
      { title: 'Floor Shifts & Rosters', href: '/attendance/shifts', icon: Calendar },
      { title: 'Late & Fine Management', href: '/attendance/late-fines', icon: AlertTriangle, badge: 'Policy' },
      { title: 'Lunch & Break Tracker', href: '/attendance/breaks', icon: Coffee },
      { title: 'Punch Corrections', href: '/attendance/corrections', icon: FileEdit },
      { title: 'Attendance Register', href: '/attendance/register', icon: ClipboardCheck },
      { title: 'Attendance Calculation', href: '/attendance/calculation', icon: Calculator },
    ],
  },
  {
    title: 'Payroll Management',
    items: [
      { title: 'Payroll Dashboard', href: '/payroll', icon: Banknote },
      { title: 'Employee Payslips', href: '/payroll/payslips', icon: Receipt },
      { title: 'Salary Structure', href: '/payroll/salary-structure', icon: Wallet },
      { title: 'Payroll Reports', href: '/payroll/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Leave & Incentives',
    items: [
      { title: 'Leave Approvals', href: '/leaves', icon: CalendarClock },
      { title: 'Incentive Calculation', href: '/incentives/calculation', icon: Coins },
    ],
  },
  {
    title: 'Operations & Audits',
    items: [
      { title: 'Face Verification', href: '/operations/face-verification', icon: ScanFace },
      { title: 'Selling Points & Audits', href: '/operations/selling-points', icon: Store },
      { title: 'Observation Module', href: '/operations/observations', icon: Eye },
      { title: 'Governance Reports', href: '/reports', icon: FileText },
      { title: 'Audit Logs & Security', href: '/admin/audit-logs', icon: ShieldAlert },
      { title: 'System Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

function getSeverityIcon(type: string) {
  switch (type) {
    case 'CRITICAL': return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    case 'DANGER': return <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
    case 'WARNING': return <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case 'INFO': return <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    default: return <Info className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function isNavItemActive(pathname: string, itemHref: string): boolean {
  const itemPath = itemHref.split('?')[0];
  if (pathname === itemHref || pathname === itemPath) return true;

  if (itemPath === '/dashboard') return pathname === '/dashboard';
  
  if (itemPath === '/employees') {
    return (
      pathname === '/employees' ||
      (pathname.startsWith('/employees/') &&
        !pathname.startsWith('/employees/documents') &&
        !pathname.startsWith('/employees/profile') &&
        !pathname.startsWith('/employees/analysis') &&
        !pathname.startsWith('/employees/former'))
    );
  }

  if (itemPath === '/payroll') {
    return pathname === '/payroll';
  }

  if (itemPath === '/attendance') {
    return pathname === '/attendance';
  }

  if (itemPath === '/organization') {
    return pathname === '/organization';
  }

  // Nested routes e.g. /employees/profile/123 matches /employees/profile
  return pathname.startsWith(itemPath + '/');
}

export function DashboardLayoutFullShell({
  children,
  activeShiftLabel: localShiftLabel,
  headerSearchSlot: localSearchSlot,
}: {
  children: React.ReactNode;
  activeShiftLabel?: string;
  headerSearchSlot?: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const shellContext = useDashboardShellContext();

  const { 
    notifications, 
    unreadCount, 
    isLoading, 
    fetchNotifications, 
    markAsRead, 
    markAllAsRead,
  } = useNotifications();

  // Use shell context states if mounted, fallback to local
  const isCollapsed = shellContext ? shellContext.isCollapsed : false;
  const toggleSidebar = shellContext ? shellContext.toggleSidebar : () => {};
  const mobileMenuOpen = shellContext ? shellContext.mobileMenuOpen : false;
  const setMobileMenuOpen = shellContext ? shellContext.setMobileMenuOpen : () => {};
  const selectedHub = shellContext ? shellContext.selectedHub : 'all';
  const setSelectedHub = shellContext ? shellContext.setSelectedHub : () => {};
  const activeShiftLabel = shellContext?.activeShiftLabel ?? localShiftLabel;
  const headerSearchSlot = shellContext?.headerSearchSlot ?? localSearchSlot;
  const pendingPath = shellContext ? shellContext.pendingPath : null;
  const setPendingPath = shellContext ? shellContext.setPendingPath : () => {};

  const [currentTime, setCurrentTime] = useState<string>('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Close dropdowns and release body scroll on route change
  useEffect(() => {
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }, [pathname]);

  // Auth redirect check
  useEffect(() => {
    if (status === 'unauthenticated') {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('bsc_token') || localStorage.getItem('token')) : null;
      if (!token) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent(pathname)}`;
      } else {
        api.get('/auth/me').catch(() => {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('bsc_token');
            localStorage.removeItem('token');
            localStorage.removeItem('bsc_user');
            document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            window.location.href = `/login?callbackUrl=${encodeURIComponent(pathname)}`;
          }
        });
      }
    }
  }, [status, pathname]);

  // Clock timer (single persistent interval)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' IST'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#111317] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#0058be] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 dark:text-slate-400 text-xs font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    const hasToken = typeof window !== 'undefined' ? (localStorage.getItem('bsc_token') || localStorage.getItem('token')) : null;
    if (!hasToken) {
      return (
        <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#111317] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-[#0058be] border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-600 dark:text-slate-400 text-xs font-medium">Redirecting to login...</p>
          </div>
        </div>
      );
    }
  }

  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bsc_token');
      localStorage.removeItem('token');
      localStorage.removeItem('bsc_user');
      document.cookie = 'bsc_token=; path=/; max-age=0';
      document.cookie = 'token=; path=/; max-age=0';
    }
    api.post('/auth/logout').catch(() => {});
    signOut({ callbackUrl: '/login' });
  };

  const userName = session?.user?.name || 'S. B. Angadi';
  const userRole = session?.user?.role?.replace(/_/g, ' ') || 'Super Admin';
  const userEmail = session?.user?.email || 'admin@bsctextiles.com';
  const rawRole = session?.user?.role || 'SUPER_ADMIN';

  const visibleNavigation = enterpriseNavigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.href === '/operations/kyc') {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'LOCATION_MANAGER'].includes(rawRole);
        }
        if (item.href.includes('tab=documents')) {
          return true;
        }
        if (item.href.startsWith('/admin')) {
          return rawRole === 'SUPER_ADMIN' || rawRole === 'ADMIN';
        }
        if (item.href.startsWith('/operations')) {
          if (item.href === '/operations/qr-scanner') return true;
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        if (item.href === '/payroll/payslips') {
          return true;
        }
        if (item.href.startsWith('/payroll') || item.href.startsWith('/incentives')) {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'].includes(rawRole);
        }
        if (item.href.startsWith('/organization')) {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        if (item.href.startsWith('/reports')) {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        if (item.href === '/attendance/calculation' || item.href === '/attendance/corrections') {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        if (item.href === '/employees' && !['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole)) {
          return false;
        }
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const handleNotificationClick = async (notification: any) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }
    setNotificationsOpen(false);
    router.push(`/notifications?id=${notification.id}`, { scroll: false });
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setNotificationsOpen(false);
  };

  const handleLinkClick = (href: string, e: React.MouseEvent) => {
    const isCurrent = pathname === href || (href === '/dashboard' && pathname === '/dashboard');
    if (isCurrent) {
      e.preventDefault();
      return;
    }
    setPendingPath(href);
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] dark:bg-[#070c18] text-[#0b1c30] dark:text-slate-100 font-sans antialiased transition-colors duration-200">
      {/* SIDEBAR (Desktop - Stays mounted across all routes) */}
      <aside 
        className={`fixed left-0 top-0 h-full ${
          isCollapsed ? 'w-20' : 'w-72'
        } bg-white dark:bg-[#090f1d] border-r border-slate-200/80 dark:border-[#152038] text-slate-700 dark:text-slate-200 shadow-sm dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)] z-50 flex flex-col justify-between overflow-y-auto no-scrollbar hidden lg:flex transition-all duration-200 ease-in-out`}
      >
        <div className="flex flex-col">
          {/* Top Logo Brand Header */}
          <div className={`h-14 flex items-center ${
            isCollapsed ? 'justify-center px-2' : 'px-4'
          } bg-white dark:bg-[#090f1d] border-b border-slate-100 dark:border-slate-800/40 flex-shrink-0 transition-all`}>
            <div className={`flex items-center overflow-hidden ${isCollapsed ? '' : 'gap-2.5'}`}>
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 p-1 flex items-center justify-center shrink-0 shadow-xs border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/bsc_logo.png" alt="BSC Textiles" className="w-full h-full object-contain" />
              </div>
              {!isCollapsed && (
                <div className="flex flex-col leading-tight truncate">
                  <span className="text-[14px] font-bold tracking-tight text-[#0b1c30] dark:text-white truncate">BSC Textiles</span>
                  <span className="text-[9px] font-bold tracking-wider uppercase text-[#0058be] dark:text-[#3b82f6]">Since 1938</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className={`flex flex-col gap-1 ${isCollapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
            {visibleNavigation.map((section) => (
              <div key={section.title} className="mb-2">
                {!isCollapsed ? (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
                    {section.title}
                  </div>
                ) : (
                  <div className="my-2 border-t border-slate-200 dark:border-[#152038] mx-1" title={section.title} />
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = isNavItemActive(pathname, item.href);
                    const isPending = pendingPath === item.href;
                    const IconComponent = item.icon;
                    return (
                      <Link
                        key={`${section.title}-${item.href}`}
                        href={item.href}
                        scroll={false}
                        prefetch={true}
                        onClick={(e) => handleLinkClick(item.href, e)}
                        title={isCollapsed ? `${item.title} • ${section.title}` : undefined}
                        className={`flex items-center ${
                          isCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                        } rounded-lg text-xs transition-all relative ${
                          isActive
                            ? 'bg-[#0058be] text-white font-semibold shadow-sm'
                            : 'text-slate-600 dark:text-slate-300 hover:text-[#0058be] dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60 font-medium'
                        }`}
                      >
                        <IconComponent className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-400 group-hover:text-[#0058be] dark:group-hover:text-white'}`} />
                        {!isCollapsed && <span className="truncate flex-1">{item.title}</span>}
                        {isPending && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-ping mr-1" />
                        )}
                        {!isCollapsed && item.badge && !isPending && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-50 dark:bg-[#14264d] text-[#0058be] dark:text-blue-300 border border-blue-200 dark:border-blue-700/50">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom Application Meta & Sign Out */}
        <div className="p-3 border-t border-slate-200 dark:border-[#152038] bg-white dark:bg-[#090f1d] space-y-2">
          {!isCollapsed ? (
            <div className="px-3 py-2 bg-slate-50 dark:bg-[#0e172a] rounded-lg border border-slate-200 dark:border-[#1e2d4d]">
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">BSC Textiles Pvt. Ltd.</div>
              <div className="text-[10px] text-slate-400 font-mono">HRMS Enterprise v2.4</div>
            </div>
          ) : (
            <div className="text-center py-1 text-[9px] font-bold text-slate-400 font-mono" title="BSC HRMS v2.4">
              v2.4
            </div>
          )}

          <button
            onClick={handleSignOut}
            className={`w-full flex items-center justify-center ${
              isCollapsed ? 'p-2' : 'gap-2 px-3 py-1.5'
            } rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors`}
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 bg-white dark:bg-[#15181E] h-full shadow-2xl flex flex-col justify-between overflow-y-auto no-scrollbar z-10 border-r border-gray-200 dark:border-slate-800">
            <div>
              <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Logo variant="icon" size="sm" />
                  <div className="flex flex-col leading-none">
                    <span className="font-black text-sm text-[#18181B] dark:text-slate-100">BSC Textiles</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#722F37] dark:text-[#E8DCC6]">Since 1938</span>
                  </div>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Theme Toggle */}
              <div className="p-2.5 mx-3 my-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Theme</span>
                <ThemeToggle showLabel={true} size="sm" />
              </div>

              <nav className="p-3 space-y-2">
                {visibleNavigation.map((sec) => (
                  <div key={sec.title}>
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {sec.title}
                    </div>
                    {sec.items.map((i) => {
                      const isItemActive = isNavItemActive(pathname, i.href);
                      const IconComp = i.icon;
                      return (
                        <Link
                          key={`${sec.title}-${i.href}`}
                          href={i.href}
                          scroll={false}
                          prefetch={true}
                          onClick={(e) => {
                            setMobileMenuOpen(false);
                            handleLinkClick(i.href, e);
                          }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                            isItemActive 
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 font-semibold' 
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                          <span>{i.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>

            <div className="p-3 border-t border-gray-200 dark:border-slate-800">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left"
              >
                <LogOut className="w-4 h-4 text-red-500 dark:text-red-400" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP HEADER (Fixed - Stays mounted across all routes) */}
      <header className={`fixed top-0 left-0 ${
        isCollapsed ? 'lg:left-20' : 'lg:left-72'
      } right-0 h-14 bg-white dark:bg-[#090f1d] border-b border-slate-100 dark:border-slate-800/40 shadow-xs dark:shadow-[0_1px_4px_rgba(0,0,0,0.2)] z-40 flex items-center justify-between px-4 lg:px-6 transition-all duration-200 ease-in-out`}>
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          {/* Mobile Drawer Trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#0058be] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop Toggle Button in Top Header */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#0058be] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 hidden lg:flex items-center justify-center transition-colors"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Hub Location Dropdown (Global state persistent across all modules) */}
          <div className="relative flex items-center bg-slate-100 dark:bg-[#10192e] rounded-lg px-2.5 py-1 text-xs border border-slate-200 dark:border-[#1f2d4e] hidden sm:flex text-slate-700 dark:text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-[#0058be] dark:text-[#3b82f6] mr-1.5" />
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="bg-transparent font-semibold text-xs text-[#0b1c30] dark:text-white focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-white dark:bg-[#090f1d] text-[#0b1c30] dark:text-white">All Hubs (Karnataka)</option>
              <option value="bel" className="bg-white dark:bg-[#090f1d] text-[#0b1c30] dark:text-white">Belagavi Flagship (BEL-01)</option>
              <option value="dav" className="bg-white dark:bg-[#090f1d] text-[#0b1c30] dark:text-white">Davanagere Hub (DAV-02)</option>
              <option value="shi" className="bg-white dark:bg-[#090f1d] text-[#0b1c30] dark:text-white">Shivamogga Hub (SHI-03)</option>
            </select>
          </div>

          {/* Global Search Bar or Page Custom Slot */}
          {headerSearchSlot ? (
            headerSearchSlot
          ) : (
            <GlobalHeaderSearch />
          )}
        </div>

        {/* Right Header Cluster */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Real-time Clock */}
          <div className="hidden md:flex flex-col text-right pr-2">
            <div className="flex items-center gap-1.5 justify-end">
              <Clock className="w-3.5 h-3.5 text-[#0058be] dark:text-[#3b82f6]" />
              <span className="text-xs font-semibold text-[#0b1c30] dark:text-white font-mono">{currentTime || '19:16:52 IST'}</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Today • {activeShiftLabel || 'Shift A'}
            </span>
          </div>

          {/* Dark / Bright Mode Toggle */}
          <ThemeToggle size="md" />

          {/* Notification Icon & Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setProfileMenuOpen(false);
                if (!notificationsOpen && !isLoading) {
                  fetchNotifications({ limit: 10 });
                }
              }}
              className="relative flex items-center justify-center p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#0058be] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border border-transparent"
              title="Notifications & System Alerts"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Popover */}
            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#0e172a] rounded-xl shadow-xl border border-slate-200 dark:border-[#1e2d4d] z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 text-slate-900 dark:text-slate-100">
                <div className="p-3 bg-[#0058be] text-white flex items-center justify-between border-b border-blue-700">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-white" />
                    <span className="text-xs font-bold tracking-tight">System Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[11px] text-white/80 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto no-scrollbar">
                  {isLoading ? (
                    <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-xs">
                      Loading notifications...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-xs">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-start gap-3 text-left ${
                          !notification.isRead ? 'bg-blue-50/50 dark:bg-slate-800/40' : ''
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                          {getSeverityIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold text-slate-900 dark:text-white ${!notification.isRead ? 'font-bold' : ''}`}>
                            {notification.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                            {notification.message}
                          </p>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block font-mono">
                            {formatTimeAgo(notification.createdAt)} {notification.locationId ? `• ${notification.locationId}` : ''}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-[#0b1220] border-t border-slate-200 dark:border-[#1e2d4d] flex items-center justify-between text-[11px]">
                  <Link
                    href="/notifications"
                    scroll={false}
                    onClick={() => setNotificationsOpen(false)}
                    className="text-[#0058be] dark:text-[#3b82f6] hover:underline font-semibold flex items-center gap-1"
                  >
                    View All Notifications
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                  <button
                    onClick={() => setNotificationsOpen(false)}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Capsule with Interactive Dropdown */}
          <div className="relative pl-1">
            <button
              onClick={() => {
                setProfileMenuOpen(!profileMenuOpen);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
              title="User Account & Profile"
              aria-label="User Account"
            >
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-[#0b1c30] dark:text-white leading-none">{userName}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 mt-0.5">{userRole}</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#0058be] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {userName.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'SA'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {/* Profile Menu Dropdown */}
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#0e172a] rounded-xl shadow-xl border border-slate-200 dark:border-[#1e2d4d] z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 text-slate-900 dark:text-slate-100">
                <div className="p-3 bg-slate-50 dark:bg-[#090f1d] border-b border-slate-200 dark:border-[#1e2d4d]">
                  <p className="text-xs font-bold text-[#0b1c30] dark:text-white truncate">{userName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{userEmail}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 dark:bg-blue-950 text-[#0058be] dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {userRole}
                  </span>
                </div>

                <div className="p-1.5 space-y-0.5 text-xs">
                  <Link
                    href="/employees/profile"
                    scroll={false}
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#0058be] dark:hover:text-white font-medium transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>My Profile & 360° Dossier</span>
                  </Link>

                  <Link
                    href="/my-desk"
                    scroll={false}
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#0058be] dark:hover:text-white font-medium transition-colors"
                  >
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>My Desk Self-Service</span>
                  </Link>

                  {['SUPER_ADMIN', 'ADMIN'].includes(rawRole) && (
                    <Link
                      href="/admin"
                      scroll={false}
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#0058be] dark:hover:text-white font-medium transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-slate-400" />
                      <span>Security & User RBAC</span>
                    </Link>
                  )}
                </div>

                <div className="p-1.5 border-t border-slate-200 dark:border-[#1e2d4d]">
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      handleSignOut();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4 text-red-500 dark:text-red-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT CONTAINER */}
      <main className={`${
        isCollapsed ? 'lg:pl-20' : 'lg:pl-72'
      } pt-14 min-h-screen bg-[#f4f6fa] dark:bg-[#070c18] transition-all duration-200 ease-in-out`}>
        <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-5 lg:p-6 space-y-5">
          {children}
        </div>
      </main>
    </div>
  );
}

export default DashboardLayoutFullShell;
