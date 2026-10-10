'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import api from '@/lib/api';
import { useNotifications } from '@/context/NotificationContext';
import { 
  LayoutDashboard,
  UserCheck,
  Users,
  Contact,
  UserMinus,
  Building2,
  ShieldCheck,
  Fingerprint,
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
  Search,
  MapPin,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Info,
  XCircle
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
    title: 'Core Overview',
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
      { title: 'Former Staff & F&F', href: '/employees/former', icon: UserMinus, badge: 'Settlement' },
      { title: 'Departments & Units', href: '/organization/departments', icon: Building2 },
    ],
  },
  {
    title: 'Verification & KYC',
    items: [
      { title: 'KYC Verification Hub', href: '/operations/kyc', icon: ShieldCheck, badge: 'DigiLocker' },
      { title: 'Digital Document Vault', href: '/employees/profile?tab=documents', icon: FileText, badge: 'UIDAI' },
    ],
  },
  {
    title: 'Time & Attendance',
    items: [
      { title: 'Biometric Punches', href: '/attendance/punches', icon: Fingerprint },
      { title: 'Floor Shifts & Rosters', href: '/attendance/shifts', icon: Calendar },
      { title: 'Lunch & Break Tracker', href: '/attendance/breaks', icon: Coffee },
      { title: 'Punch Corrections', href: '/attendance/corrections', icon: FileEdit },
      { title: 'Attendance Register', href: '/attendance/register', icon: ClipboardCheck },
      { title: 'Attendance Calculation', href: '/attendance/calculation', icon: Calculator },
    ],
  },
  {
    title: 'Payroll & Finance',
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

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { 
    notifications, 
    unreadCount, 
    isLoading, 
    fetchNotifications, 
    markAsRead, 
    markAllAsRead,
    fetchUnreadCount 
  } = useNotifications();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [selectedHub, setSelectedHub] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Close dropdowns on route changes
  useEffect(() => {
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
  }, [pathname]);

  // Persist sidebar collapsed state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bsc_sidebar_collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    }
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('bsc_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('bsc_token') || localStorage.getItem('token')) : null;
      if (!token) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent(pathname)}`;
      } else {
        // Verify token with backend /auth/me
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
          <div className="w-10 h-10 border-3 border-[#722F37] border-t-transparent rounded-full animate-spin" />
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
            <div className="w-10 h-10 border-3 border-[#722F37] border-t-transparent rounded-full animate-spin" />
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
      document.cookie = 'bsc_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
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
        // Employee KYC & DigiLocker Management Hub (Admin, HR, Location Manager)
        if (item.href === '/operations/kyc') {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'LOCATION_MANAGER'].includes(rawRole);
        }
        // Digital Document Vault is available to ALL authenticated personnel
        if (item.href.includes('tab=documents')) {
          return true;
        }
        // Admin-only system management
        if (item.href.startsWith('/admin')) {
          return rawRole === 'SUPER_ADMIN' || rawRole === 'ADMIN';
        }
        // Store floor & observation operations
        if (item.href.startsWith('/operations')) {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        // Employee Payslips self-service view is accessible to all authenticated staff
        if (item.href === '/payroll/payslips') {
          return true;
        }
        // Payroll master dashboard, salary structure, and statutory reports
        if (item.href.startsWith('/payroll') || item.href.startsWith('/incentives')) {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'].includes(rawRole);
        }
        // Department structure & organizational units
        if (item.href.startsWith('/organization')) {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        // Corporate governance reports
        if (item.href.startsWith('/reports')) {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        // Attendance calculations & manual corrections
        if (item.href === '/attendance/calculation' || item.href === '/attendance/corrections') {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        // Directory access
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
    if (notification.actionUrl) {
      setNotificationsOpen(false);
      router.push(notification.actionUrl);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setNotificationsOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#111317] text-[#18181B] dark:text-slate-100 font-sans antialiased">
      {/* SIDEBAR (Desktop) */}
      <aside 
        className={`fixed left-0 top-0 h-full ${
          isCollapsed ? 'w-20' : 'w-64'
        } bg-white dark:bg-[#15181E] border-r border-gray-200/90 dark:border-slate-800 shadow-[0_1px_4px_rgba(0,0,0,0.03)] dark:shadow-none z-50 flex flex-col justify-between overflow-y-auto no-scrollbar hidden lg:flex transition-all duration-200 ease-in-out`}
      >
        <div className="flex flex-col">
          {/* Top Logo Brand Header */}
          <div className={`h-14 flex items-center ${
            isCollapsed ? 'justify-center px-2' : 'px-4'
          } bg-white dark:bg-[#15181E] border-b border-gray-200/80 dark:border-slate-800 flex-shrink-0 transition-all`}>
            <div className={`flex items-center overflow-hidden ${isCollapsed ? '' : 'gap-2.5'}`}>
              <Logo variant="icon" size="sm" className="flex-shrink-0" />
              {!isCollapsed && (
                <div className="flex flex-col leading-tight truncate">
                  <span className="text-[14px] font-black tracking-tight text-[#18181B] dark:text-slate-100 truncate">BSC Textiles</span>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-[#722F37] dark:text-[#E8DCC6]">Since 1938</span>
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
                  <div className="my-2 border-t border-slate-100 dark:border-slate-800 mx-1" title={section.title} />
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const itemPath = item.href.split('?')[0];
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && !item.href.includes('?') && pathname.startsWith(itemPath));
                    const IconComponent = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={isCollapsed ? `${item.title} • ${section.title}` : undefined}
                        className={`flex items-center ${
                          isCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                        } rounded-lg text-xs transition-all ${
                          isActive
                            ? 'bg-[#722F37]/10 dark:bg-[#722F37]/25 text-[#722F37] dark:text-[#E8DCC6] font-semibold border-l-2 border-[#722F37]'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 font-medium'
                        }`}
                      >
                        <IconComponent className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#722F37] dark:text-[#E8DCC6]' : 'text-slate-500 dark:text-slate-400'}`} />
                        {!isCollapsed && <span className="truncate flex-1">{item.title}</span>}
                        {!isCollapsed && item.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#E8DCC6]/40 dark:bg-[#722F37]/30 text-[#722F37] dark:text-[#E8DCC6]">
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
        <div className="p-3 border-t border-gray-200/80 dark:border-slate-800 bg-white dark:bg-[#15181E] space-y-2">
          {!isCollapsed ? (
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200/70 dark:border-slate-700/60">
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">BSC Textiles Pvt. Ltd.</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">HRMS Enterprise v2.4</div>
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
            } rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors`}
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
                      const itemPath = i.href.split('?')[0];
                      const isItemActive = pathname === i.href || (i.href !== '/dashboard' && !i.href.includes('?') && pathname.startsWith(itemPath));
                      const IconComp = i.icon;
                      return (
                        <Link
                          key={i.href}
                          href={i.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                            isItemActive 
                              ? 'bg-[#722F37]/10 dark:bg-[#722F37]/25 text-[#722F37] dark:text-[#E8DCC6] font-semibold' 
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

      {/* TOP HEADER (Fixed) */}
      <header className={`fixed top-0 left-0 ${
        isCollapsed ? 'lg:left-20' : 'lg:left-64'
      } right-0 h-14 bg-white/95 dark:bg-[#15181E]/95 backdrop-blur-md border-b border-gray-200/90 dark:border-slate-800 shadow-[0_1px_4px_rgba(0,0,0,0.02)] dark:shadow-none z-40 flex items-center justify-between px-4 lg:px-6 transition-all duration-200 ease-in-out`}>
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          {/* Mobile Drawer Trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop Toggle Button in Top Header */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-[#722F37] dark:hover:text-[#E8DCC6] hover:bg-slate-100 dark:hover:bg-slate-800 hidden lg:flex items-center justify-center transition-colors"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Hub Location Dropdown */}
          <div className="relative flex items-center bg-gray-100 dark:bg-slate-800 rounded-lg px-2.5 py-1 text-xs border border-gray-200/80 dark:border-slate-700/80 hidden sm:flex">
            <MapPin className="w-3.5 h-3.5 text-[#722F37] dark:text-[#E8DCC6] mr-1.5" />
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="bg-transparent font-semibold text-xs text-[#18181B] dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="dark:bg-[#15181E]">All Outlets (Karnataka)</option>
              <option value="bel" className="dark:bg-[#15181E]">Belagavi Flagship (BEL-01)</option>
              <option value="dav" className="dark:bg-[#15181E]">Davanagere Hub (DAV-02)</option>
              <option value="shi" className="dark:bg-[#15181E]">Shivamogga Hub (SHI-03)</option>
            </select>
          </div>

          {/* Global Search Bar */}
          <div className="relative flex-1 flex items-center bg-white dark:bg-[#1A1D24] rounded-lg border border-gray-200 dark:border-slate-700 shadow-xs px-3 py-1">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Employee Code, Name, Department..."
              className="w-full bg-transparent text-xs text-[#18181B] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Right Header Cluster */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Real-time Clock */}
          <div className="hidden md:flex flex-col text-right pr-2">
            <div className="flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3 text-[#722F37] dark:text-[#E8DCC6]" />
              <span className="text-xs font-semibold text-[#18181B] dark:text-slate-100 font-mono">{currentTime || '14:22:08 IST'}</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Karnataka Zone • Shift A</span>
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
              className="relative flex items-center justify-center p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#722F37] dark:hover:text-[#E8DCC6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer border border-transparent"
              title="Notifications & System Alerts"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#722F37] text-white text-[10px] font-bold shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Popover */}
            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#1A1D24] rounded-xl shadow-xl border border-gray-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="p-3 bg-[#722F37] text-white flex items-center justify-between border-b border-[#5B232A]">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#E8DCC6]" />
                    <span className="text-xs font-bold tracking-tight">System Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[#E8DCC6] text-[10px] font-bold">
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

                <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-80 overflow-y-auto no-scrollbar">
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
                        className={`w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-3 text-left ${
                          !notification.isRead ? 'bg-slate-50/50 dark:bg-slate-800/50' : ''
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                          {getSeverityIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold text-[#18181B] dark:text-slate-100 ${!notification.isRead ? 'font-bold' : ''}`}>
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

                <div className="p-2.5 bg-slate-50 dark:bg-slate-900/80 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                  <Link
                    href="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-[#722F37] dark:text-[#E8DCC6] hover:underline font-semibold flex items-center gap-1"
                  >
                    View All Notifications
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                  <button
                    onClick={() => setNotificationsOpen(false)}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Capsule with Interactive Dropdown */}
          <div className="relative pl-2 border-l border-gray-200 dark:border-slate-800">
            <button
              onClick={() => {
                setProfileMenuOpen(!profileMenuOpen);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
              title="User Account & Profile"
              aria-label="User Account"
            >
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-[#18181B] dark:text-slate-100 leading-none">{userName}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 mt-0.5">{userRole}</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#722F37] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {userName.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'SA'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {/* Profile Menu Dropdown */}
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#1A1D24] rounded-xl shadow-xl border border-gray-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-gray-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-[#18181B] dark:text-slate-100 truncate">{userName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{userEmail}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#E8DCC6]/50 dark:bg-[#722F37]/30 text-[#722F37] dark:text-[#E8DCC6]">
                    {userRole}
                  </span>
                </div>

                <div className="p-1.5 space-y-0.5 text-xs">
                  <Link
                    href="/employees/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#722F37] dark:hover:text-[#E8DCC6] font-medium transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>My Profile & 360° Dossier</span>
                  </Link>

                  <Link
                    href="/my-desk"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#722F37] dark:hover:text-[#E8DCC6] font-medium transition-colors"
                  >
                    <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>My Desk Self-Service</span>
                  </Link>

                  {['SUPER_ADMIN', 'ADMIN'].includes(rawRole) && (
                    <Link
                      href="/admin"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#722F37] dark:hover:text-[#E8DCC6] font-medium transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span>Security & User RBAC</span>
                    </Link>
                  )}
                </div>

                <div className="p-1.5 border-t border-gray-100 dark:border-slate-800">
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
        isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      } pt-14 min-h-screen bg-[#F8F9FA] dark:bg-[#111317] transition-all duration-200 ease-in-out`}>
        <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}