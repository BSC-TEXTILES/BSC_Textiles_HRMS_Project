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
  FolderLock,
  Database,
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
  AlertTriangle,
  CheckCircle,
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

interface NavSectionTheme {
  color: string;
  dotColor: string;
  activeGradient: string;
  hoverColor: string;
  iconColor: string;
}

interface NavSectionConfig {
  title: string;
  theme: NavSectionTheme;
  items: NavItem[];
}

function getBadgeClasses(badgeText: string, isActive: boolean) {
  if (isActive) return 'bg-white/20 text-white font-bold';
  switch (badgeText) {
    case 'Live ID':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-bold';
    case 'Dossier':
      return 'bg-teal-500/20 text-teal-300 border border-teal-400/40';
    case 'Settlement':
      return 'bg-amber-500/20 text-amber-300 border border-amber-400/40';
    case 'DigiLocker':
      return 'bg-sky-500/20 text-sky-300 border border-sky-400/40';
    case 'UIDAI':
      return 'bg-purple-500/20 text-purple-300 border border-purple-400/40';
    case 'Scanner':
      return 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40';
    case 'Daily':
      return 'bg-blue-500/20 text-blue-300 border border-blue-400/40';
    case 'Policy':
      return 'bg-rose-500/20 text-rose-300 border border-rose-400/40';
    case 'SQLite':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40';
    case 'RBAC':
      return 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/40';
    default:
      return 'bg-white/10 text-blue-100 border border-white/15';
  }
}

const enterpriseNavigation: NavSectionConfig[] = [
  {
    title: 'Core Operations',
    theme: {
      color: 'text-sky-200',
      dotColor: 'bg-sky-400',
      activeGradient: 'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-sky-300',
      hoverColor: 'hover:text-white hover:bg-white/10',
      iconColor: 'text-sky-300 group-hover:text-white',
    },
    items: [
      { title: 'Executive Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'My Desk Self-Service', href: '/my-desk', icon: UserCheck },
    ],
  },
  {
    title: 'Workforce Directory',
    theme: {
      color: 'text-emerald-200',
      dotColor: 'bg-emerald-400',
      activeGradient: 'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-emerald-300',
      hoverColor: 'hover:text-white hover:bg-white/10',
      iconColor: 'text-emerald-300 group-hover:text-white',
    },
    items: [
      { title: 'All Employees', href: '/employees', icon: Users },
      { title: 'Profile 360 & Dossier', href: '/employees/profile', icon: Contact },
      { title: 'Employee Documents', href: '/employees/documents', icon: FolderLock, badge: 'Dossier' },
      { title: 'Departments & Units', href: '/organization/departments', icon: Building2 },
      { title: 'Former Staff & F&F', href: '/employees/former', icon: UserMinus, badge: 'Settlement' },
    ],
  },
  {
    title: 'KYC & DigiLocker',
    theme: {
      color: 'text-purple-200',
      dotColor: 'bg-purple-400',
      activeGradient: 'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-purple-300',
      hoverColor: 'hover:text-white hover:bg-white/10',
      iconColor: 'text-purple-300 group-hover:text-white',
    },
    items: [
      { title: 'KYC Verification', href: '/operations/kyc', icon: ShieldCheck, badge: 'DigiLocker' },
      { title: 'Digital Document Verification', href: '/employees/profile?tab=documents', icon: FileText, badge: 'UIDAI' },
    ],
  },
  {
    title: 'QR Code Attendance',
    theme: {
      color: 'text-cyan-200',
      dotColor: 'bg-cyan-400',
      activeGradient: 'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-cyan-300',
      hoverColor: 'hover:text-white hover:bg-white/10',
      iconColor: 'text-cyan-300 group-hover:text-white',
    },
    items: [
      { title: 'Digital QR Passes', href: '/attendance/qr-codes', icon: QrCode, badge: 'Live ID' },
      { title: 'Contactless QR Scanner', href: '/operations/qr-scanner', icon: ScanFace, badge: 'Scanner' },
    ],
  },
  {
    title: 'Time & Attendance',
    theme: {
      color: 'text-amber-200',
      dotColor: 'bg-amber-400',
      activeGradient: 'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-amber-300',
      hoverColor: 'hover:text-white hover:bg-white/10',
      iconColor: 'text-amber-300 group-hover:text-white',
    },
    items: [
      { title: 'Biometric Punches', href: '/attendance/punches', icon: Fingerprint },
      { title: 'Digital QR Passes', href: '/attendance/qr-codes', icon: QrCode, badge: 'Daily' },
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
    theme: {
      color: 'text-rose-200',
      dotColor: 'bg-rose-400',
      activeGradient: 'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-rose-300',
      hoverColor: 'hover:text-white hover:bg-white/10',
      iconColor: 'text-rose-300 group-hover:text-white',
    },
    items: [
      { title: 'Payroll Dashboard', href: '/payroll', icon: Banknote },
      { title: 'Employee Payslips', href: '/payroll/payslips', icon: Receipt },
      { title: 'Salary Structure', href: '/payroll/salary-structure', icon: Wallet },
      { title: 'Payroll Reports', href: '/payroll/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Leave & Incentives',
    theme: {
      color: 'text-fuchsia-200',
      dotColor: 'bg-fuchsia-400',
      activeGradient: 'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-fuchsia-300',
      hoverColor: 'hover:text-white hover:bg-white/10',
      iconColor: 'text-fuchsia-300 group-hover:text-white',
    },
    items: [
      { title: 'Leave Approvals', href: '/leaves', icon: CalendarClock },
      { title: 'Incentive Calculation', href: '/incentives/calculation', icon: Coins },
    ],
  },
  {
    title: 'Operations & Audits',
    theme: {
      color: 'text-indigo-200',
      dotColor: 'bg-indigo-400',
      activeGradient: 'bg-[#092b69] text-white shadow-md border-l-[3.5px] border-indigo-300',
      hoverColor: 'hover:text-white hover:bg-white/10',
      iconColor: 'text-indigo-300 group-hover:text-white',
    },
    items: [
      { title: 'Face Verification', href: '/operations/face-verification', icon: ScanFace },
      { title: 'Selling Points & Audits', href: '/operations/selling-points', icon: Store },
      { title: 'Observation Module', href: '/operations/observations', icon: Eye },
      { title: 'Governance Reports', href: '/reports', icon: FileText },
      { title: 'Local Database & Backups', href: '/admin/local-database', icon: Database, badge: 'SQLite' },
      { title: 'Audit Logs & Security', href: '/admin/audit-logs', icon: ShieldAlert },
      { title: 'Roles & Permissions', href: '/admin/roles', icon: ShieldCheck, badge: 'RBAC' },
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

export function DashboardLayout({
  children,
  activeShiftLabel,
}: {
  children: React.ReactNode;
  activeShiftLabel?: string;
}) {
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
          if (item.href === '/operations/qr-scanner') return true;
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
    setNotificationsOpen(false);
    router.push(`/notifications?id=${notification.id}`);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setNotificationsOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] dark:bg-[#070c18] text-[#0b1c30] dark:text-slate-100 font-sans antialiased transition-colors duration-200">
      {/* SIDEBAR (Desktop) */}
      <aside 
        className={`fixed left-0 top-0 h-full ${
          isCollapsed ? 'w-20' : 'w-64'
        } bg-[#1346a1] border-r border-[#1a55c2] text-slate-100 shadow-xl z-50 flex flex-col justify-between overflow-y-auto no-scrollbar hidden lg:flex transition-all duration-200 ease-in-out`}
      >
        <div className="flex flex-col">
          {/* Top Logo Brand Header */}
          <div className={`h-14 flex items-center ${
            isCollapsed ? 'justify-center px-2' : 'px-4'
          } bg-[#0e3882] border-b border-[#1a55c2] flex-shrink-0 transition-all`}>
            <div className={`flex items-center overflow-hidden ${isCollapsed ? '' : 'gap-2.5'}`}>
              <div className="w-8 h-8 rounded-full bg-white/10 p-1 flex items-center justify-center shrink-0 border border-white/20 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/bsc_logo.png" alt="BSC Textiles" className="w-full h-full object-contain" />
              </div>
              {!isCollapsed && (
                <div className="flex flex-col leading-tight truncate">
                  <span className="text-[14px] font-bold tracking-tight text-white truncate">BSC Textiles</span>
                  <span className="text-[9px] font-semibold tracking-wider uppercase text-blue-200/90">Since 1938</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className={`flex flex-col gap-1 ${isCollapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
            {visibleNavigation.map((section) => {
              const theme = section.theme;
              return (
                <div key={section.title} className="mb-2.5">
                  {!isCollapsed ? (
                    <div className={`px-3 pt-2 pb-1 text-[10.5px] font-extrabold uppercase tracking-wider ${theme.color} flex items-center gap-1.5 truncate`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${theme.dotColor} shrink-0 shadow-2xs`} />
                      <span className="truncate">{section.title}</span>
                    </div>
                  ) : (
                    <div className="my-1.5 flex justify-center items-center" title={section.title}>
                      <span className={`w-2 h-1 rounded-full ${theme.dotColor}`} />
                    </div>
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
                          className={`group flex items-center ${
                            isCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                          } rounded-xl text-xs transition-all duration-150 ${
                            isActive
                              ? `${theme.activeGradient} font-semibold shadow-md`
                              : `text-blue-100/90 hover:text-white ${theme.hoverColor} font-medium`
                          }`}
                        >
                          <IconComponent className={`w-4 h-4 flex-shrink-0 transition-all duration-150 ${
                            isActive ? 'text-white' : `${theme.iconColor}`
                          }`} />
                          {!isCollapsed && <span className="truncate flex-1">{item.title}</span>}
                          {!isCollapsed && item.badge && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getBadgeClasses(item.badge, isActive)}`}>
                              {item.badge === 'Live ID' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-1" />}
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Bottom Application Meta & Sign Out */}
        <div className="p-3 border-t border-[#1a55c2] bg-[#0e3882] space-y-2.5">
          {!isCollapsed ? (
            <div className="p-3 rounded-xl bg-black/15 border border-white/15 shadow-xs relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-400/10 rounded-full blur-xl pointer-events-none group-hover:bg-blue-400/20 transition-all" />
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-bold text-white tracking-tight">
                  BSC Textiles Pvt. Ltd.
                </span>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded-full border border-emerald-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Hub
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-blue-200/90 font-medium">Davangere HQ</span>
                <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/40">
                  HRMS Enterprise v2.4
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-1.5 px-1 rounded-lg bg-white/10 border border-white/15 text-[9px] font-bold text-blue-200 font-mono shadow-xs" title="BSC Textiles HRMS Enterprise v2.4">
              v2.4
            </div>
          )}

          <button
            onClick={handleSignOut}
            className={`w-full flex items-center justify-center ${
              isCollapsed ? 'p-2' : 'gap-2 px-3 py-2'
            } rounded-xl text-xs font-bold text-rose-200 bg-rose-500/20 border border-rose-300/30 hover:bg-gradient-to-r hover:from-rose-600 hover:to-red-600 hover:text-white hover:border-transparent hover:shadow-md hover:shadow-rose-600/30 active:scale-[0.98] transition-all duration-200 group`}
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className="w-4 h-4 text-rose-300 group-hover:text-white transition-transform group-hover:-translate-x-0.5" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 bg-[#1346a1] h-full shadow-2xl flex flex-col justify-between overflow-y-auto no-scrollbar z-10 border-r border-[#1a55c2] text-slate-100">
            <div>
              <div className="h-14 flex items-center justify-between px-4 bg-[#0e3882] border-b border-[#1a55c2]">
                <div className="flex items-center gap-2">
                  <Logo variant="icon" size="sm" />
                  <div className="flex flex-col leading-none">
                    <span className="font-bold text-sm text-white">BSC Textiles</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-200/90">Since 1938</span>
                  </div>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-blue-200 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Theme Toggle */}
              <div className="p-2.5 mx-3 my-2 rounded-lg bg-white/10 border border-white/15 flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-100">Theme</span>
                <ThemeToggle showLabel={true} size="sm" />
              </div>

              <nav className="p-3 space-y-2.5">
                {visibleNavigation.map((sec) => {
                  const theme = sec.theme;
                  return (
                    <div key={sec.title}>
                      <div className={`px-3 py-1 text-[10.5px] font-extrabold uppercase tracking-wider ${theme.color} flex items-center gap-1.5 truncate`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${theme.dotColor} shrink-0`} />
                        <span className="truncate">{sec.title}</span>
                      </div>
                      <div className="space-y-0.5 mt-1">
                        {sec.items.map((i) => {
                          const itemPath = i.href.split('?')[0];
                          const isItemActive = pathname === i.href || (i.href !== '/dashboard' && !i.href.includes('?') && pathname.startsWith(itemPath));
                          const IconComp = i.icon;
                          return (
                            <Link
                              key={i.href}
                              href={i.href}
                              onClick={() => setMobileMenuOpen(false)}
                              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all ${
                                isItemActive 
                                  ? `${theme.activeGradient} font-semibold shadow-md` 
                                  : `text-blue-100/90 hover:text-white ${theme.hoverColor} font-medium`
                              }`}
                            >
                              <IconComp className={`w-4 h-4 ${isItemActive ? 'text-white' : `${theme.iconColor}`}`} />
                              <span className="flex-1 truncate">{i.title}</span>
                              {i.badge && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getBadgeClasses(i.badge, isItemActive)}`}>
                                  {i.badge === 'Live ID' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-1" />}
                                  {i.badge}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </nav>
            </div>

            {/* Mobile Footer & Sign Out */}
            <div className="p-3 border-t border-[#1a55c2] bg-[#0e3882] space-y-2.5">
              <div className="p-3 rounded-xl bg-black/15 border border-white/15 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11.5px] font-bold text-white">
                    BSC Textiles Pvt. Ltd.
                  </span>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded-full border border-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live Hub
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-blue-200/90 font-medium">Davangere HQ</span>
                  <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/40">
                    HRMS Enterprise v2.4
                  </span>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-200 bg-rose-500/20 border border-rose-300/30 hover:bg-gradient-to-r hover:from-rose-600 hover:to-red-600 hover:text-white hover:border-transparent hover:shadow-md hover:shadow-rose-600/30 active:scale-[0.98] transition-all duration-200 group"
              >
                <LogOut className="w-4 h-4 text-rose-300 group-hover:text-white transition-transform group-hover:-translate-x-0.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP HEADER (Fixed) */}
      <header className={`fixed top-0 left-0 ${
        isCollapsed ? 'lg:left-20' : 'lg:left-64'
      } right-0 h-14 bg-gradient-to-r from-[#003882] via-[#004ca3] to-[#0058be] dark:from-[#002860] dark:via-[#003b82] dark:to-[#004ca3] border-b border-[#002f6c] dark:border-[#001f4d] shadow-sm z-40 flex items-center justify-between px-4 lg:px-6 transition-all duration-200 ease-in-out text-white`}>
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          {/* Mobile Drawer Trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop Toggle Button in Top Header */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 hidden lg:flex items-center justify-center transition-colors"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Hub Location Dropdown */}
          <div className="relative flex items-center bg-white/15 hover:bg-white/20 rounded-lg px-2.5 py-1 text-xs border border-white/25 hidden sm:flex text-white backdrop-blur-xs transition-colors">
            <MapPin className="w-3.5 h-3.5 text-sky-200 mr-1.5" />
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="bg-transparent font-semibold text-xs text-white focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-[#09152b] text-white">All Hubs (Karnataka)</option>
              <option value="bel" className="bg-[#09152b] text-white">Belagavi Flagship (BEL-01)</option>
              <option value="dav" className="bg-[#09152b] text-white">Davanagere Hub (DAV-02)</option>
              <option value="shi" className="bg-[#09152b] text-white">Shivamogga Hub (SHI-03)</option>
            </select>
          </div>

          {/* Global Search Bar */}
          <div className="relative flex-1 flex items-center bg-white/15 focus-within:bg-white/25 focus-within:border-white/40 rounded-lg border border-white/25 shadow-inner px-3 py-1 transition-all">
            <Search className="w-3.5 h-3.5 text-sky-200 mr-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID (e.g. BSC-4029), Name, Dept..."
              className="w-full !bg-transparent !border-none text-xs text-white placeholder:text-white/80 focus:outline-none"
            />
          </div>
        </div>

        {/* Right Header Cluster */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Real-time Clock */}
          <div className="hidden md:flex flex-col text-right pr-2">
            <div className="flex items-center gap-1.5 justify-end">
              <Clock className="w-3.5 h-3.5 text-sky-200" />
              <span className="text-xs font-semibold text-white font-mono">{currentTime || '19:16:52 IST'}</span>
            </div>
            <span className="text-[10px] text-sky-200 font-medium">
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
              className="relative flex items-center justify-center p-2 rounded-lg text-white/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer border border-transparent"
              title="Notifications & System Alerts"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 text-white" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold shadow-xs ring-2 ring-[#004ca3]">
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
          <div className="relative pl-2 border-l border-white/20">
            <button
              onClick={() => {
                setProfileMenuOpen(!profileMenuOpen);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-left"
              title="User Account & Profile"
              aria-label="User Account"
            >
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-white leading-none">{userName}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-sky-200 mt-0.5">{userRole}</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-white text-[#004ca3] flex items-center justify-center font-bold text-xs shadow-xs ring-1 ring-white/30">
                {userName.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'SA'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-white/70 hidden sm:block" />
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
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#0058be] dark:hover:text-white font-medium transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>My Profile & 360° Dossier</span>
                  </Link>

                  <Link
                    href="/my-desk"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#0058be] dark:hover:text-white font-medium transition-colors"
                  >
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>My Desk Self-Service</span>
                  </Link>

                  {['SUPER_ADMIN', 'ADMIN'].includes(rawRole) && (
                    <Link
                      href="/admin"
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
        isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      } pt-14 min-h-screen bg-[#f4f6fa] dark:bg-[#070c18] transition-all duration-200 ease-in-out`}>
        <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-5 lg:p-6 space-y-5">
          {children}
        </div>
      </main>
    </div>
  );
}