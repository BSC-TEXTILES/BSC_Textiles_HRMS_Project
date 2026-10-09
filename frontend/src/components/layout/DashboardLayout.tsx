'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import api from '@/lib/api';
import { 
  Bell, 
  User, 
  CheckCheck, 
  ExternalLink, 
  LogOut, 
  ShieldCheck, 
  Clock, 
  Sparkles,
  ChevronDown
} from 'lucide-react';

interface NavSectionConfig {
  title: string;
  items: Array<{
    title: string;
    href: string;
    icon: string;
    badge?: string;
  }>;
}

const stitchNavigation: NavSectionConfig[] = [
  {
    title: 'Core Operations',
    items: [
      { title: 'Executive Dashboard', href: '/dashboard', icon: 'grid_view' },
      { title: 'My Desk Self-Service', href: '/my-desk', icon: 'person' },
    ],
  },
  {
    title: 'Workforce Directory',
    items: [
      { title: 'All Employees', href: '/employees', icon: 'badge' },
      { title: 'Profile 360 & Dossier', href: '/employees/profile', icon: 'person_search' },
      { title: 'Departments & Units', href: '/organization/departments', icon: 'corporate_fare' },
    ],
  },
  {
    title: 'KYC & DigiLocker',
    items: [
      { title: 'KYC Verification Hub', href: '/operations/kyc', icon: 'verified_user', badge: 'DigiLocker' },
      { title: 'Digital Document Vault', href: '/employees/profile?tab=documents', icon: 'shield_person', badge: 'UIDAI' },
    ],
  },
  {
    title: 'Time & Attendance',
    items: [
      { title: 'Biometric Punches', href: '/attendance/punches', icon: 'fingerprint' },
      { title: 'Floor Shifts & Rosters', href: '/attendance/shifts', icon: 'calendar_view_week' },
      { title: 'Lunch & Break Tracker', href: '/attendance/breaks', icon: 'coffee' },
      { title: 'Punch Corrections', href: '/attendance/corrections', icon: 'edit_calendar' },
      { title: 'Attendance Register', href: '/attendance/register', icon: 'fact_check' },
      { title: 'Attendance Calculation', href: '/attendance/calculation', icon: 'calculate' },
    ],
  },
  {
    title: 'Payroll Management',
    items: [
      { title: 'Payroll Dashboard', href: '/payroll', icon: 'payments' },
      { title: 'Employee Payslips', href: '/payroll/payslips', icon: 'receipt_long' },
      { title: 'Salary Structure', href: '/payroll/salary-structure', icon: 'account_balance_wallet' },
      { title: 'Payroll Reports', href: '/payroll/reports', icon: 'analytics' },
    ],
  },
  {
    title: 'Leave & Incentives',
    items: [
      { title: 'Leave Approvals', href: '/leaves', icon: 'event_busy' },
      { title: 'Incentive Calculation', href: '/incentives/calculation', icon: 'price_change' },
    ],
  },
  {
    title: 'Governance & Operations',
    items: [
      { title: 'Face Verification', href: '/operations/face-verification', icon: 'shield' },
      { title: 'Selling Points & Audits', href: '/operations/selling-points', icon: 'storefront' },
      { title: 'Observation Module', href: '/operations/observations', icon: 'visibility' },
      { title: 'Live Stream Monitor', href: '/operations/live-streams', icon: 'videocam' },
      { title: 'Governance Reports', href: '/reports', icon: 'summarize' },
      { title: 'Audit Logs & Security', href: '/admin/audit-logs', icon: 'rule' },
      { title: 'System Settings', href: '/admin/settings', icon: 'settings' },
    ],
  },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [selectedHub, setSelectedHub] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(3);

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
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#0058be] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 text-sm">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' && typeof window !== 'undefined' && !localStorage.getItem('bsc_token') && !localStorage.getItem('token')) {
    return null;
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

  const visibleNavigation = stitchNavigation
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

  return (
    <div className="min-h-screen bg-[#f8f9ff] dark:bg-[#090e17] text-[#0b1c30] dark:text-slate-100 font-sans antialiased">
      {/* SIDEBAR (Desktop) */}
      <aside 
        className={`fixed left-0 top-0 h-full ${
          isCollapsed ? 'w-20' : 'w-64'
        } bg-white dark:bg-[#0c1322] border-r border-slate-200/80 dark:border-slate-800 shadow-[0_1px_8px_rgba(0,0,0,0.03)] dark:shadow-none z-50 flex flex-col justify-between overflow-y-auto no-scrollbar hidden lg:flex transition-all duration-300 ease-in-out`}
      >
        <div className="flex flex-col">
          {/* Top Logo Brand Header */}
          <div className={`h-14 flex items-center ${
            isCollapsed ? 'justify-center px-2' : 'px-4'
          } bg-white dark:bg-[#0c1322] border-b border-slate-100 dark:border-slate-800 flex-shrink-0 transition-all`}>
            <div className={`flex items-center overflow-hidden ${isCollapsed ? '' : 'gap-2.5'}`}>
              <Logo variant="icon" size="sm" className="flex-shrink-0" />
              {!isCollapsed && (
                <div className="flex flex-col leading-tight truncate">
                  <span className="text-[15px] font-black tracking-tight text-[#0b1c30] dark:text-slate-100 truncate">BSC Textiles</span>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-[#0058be] dark:text-blue-400">Since 1938</span>
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
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={isCollapsed ? `${item.title} • ${section.title}` : undefined}
                        className={`flex items-center ${
                          isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
                        } rounded-lg text-xs transition-all ${
                          isActive
                            ? 'bg-[#e5eeff] dark:bg-[#15274d] text-[#0058be] dark:text-blue-400 font-bold shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-[#eff4ff] dark:hover:bg-[#131d33] hover:text-[#0b1c30] dark:hover:text-slate-100 font-medium'
                        }`}
                      >
                        <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${isActive ? 'text-[#0058be] dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          {item.icon}
                        </span>
                        {!isCollapsed && <span className="truncate flex-1">{item.title}</span>}
                        {!isCollapsed && item.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#dce9ff] dark:bg-blue-950/80 text-[#0058be] dark:text-blue-300">
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

        {/* Bottom Telemetry Card & User Logout */}
        <div className={`p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0c1322] space-y-2`}>
          {!isCollapsed ? (
            <div className="p-2.5 bg-[#eff4ff] dark:bg-[#131f38] rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Biometric Server</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0058be] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0058be]"></span>
                </span>
              </div>
              <div className="text-xs font-bold text-[#0b1c30] dark:text-slate-100">Synced Live</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">99.8% Terminal Uptime</div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-2 rounded-xl bg-[#eff4ff] dark:bg-[#131f38]" title="Biometric Server Live 99.8%">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0058be] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0058be]"></span>
              </span>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className={`w-full flex items-center justify-center ${
              isCollapsed ? 'p-2' : 'gap-2 px-3 py-1.5'
            } rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors`}
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 bg-white dark:bg-[#0c1322] h-full shadow-2xl flex flex-col justify-between overflow-y-auto no-scrollbar z-10 border-r border-slate-200 dark:border-slate-800">
            <div>
              <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Logo variant="icon" size="sm" />
                  <div className="flex flex-col leading-none">
                    <span className="font-black text-sm text-[#0b1c30] dark:text-slate-100">BSC Textiles</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400">Since 1938</span>
                  </div>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Mobile Theme Toggle */}
              <div className="p-2.5 mx-3 my-2 rounded-xl bg-slate-50 dark:bg-[#131f38] border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
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
                      return (
                        <Link
                          key={i.href}
                          href={i.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                            isItemActive ? 'bg-[#e5eeff] dark:bg-[#15274d] text-[#0058be] dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">{i.icon}</span>
                          <span>{i.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP HEADER (Fixed) */}
      <header className={`fixed top-0 left-0 ${
        isCollapsed ? 'lg:left-20' : 'lg:left-64'
      } right-0 h-14 bg-white/95 dark:bg-[#0c1322]/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800 shadow-[0_1px_8px_rgba(0,0,0,0.03)] dark:shadow-none z-40 flex items-center justify-between px-4 lg:px-6 transition-all duration-300 ease-in-out`}>
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          {/* Mobile Drawer Trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Open navigation menu"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>

          {/* Desktop 3-line Toggle Button in Top Header */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-[#0058be] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 hidden lg:flex items-center justify-center transition-colors"
            title={isCollapsed ? 'Expand Sidebar (Show full text)' : 'Collapse Sidebar (Show icons only)'}
            aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <span className="material-symbols-outlined text-[22px]">
              {isCollapsed ? 'menu' : 'menu_open'}
            </span>
          </button>

          {/* Hub Location Dropdown */}
          <div className="relative flex items-center bg-[#eff4ff] dark:bg-[#131f38] rounded-lg px-2.5 py-1 text-xs border border-slate-200/60 dark:border-slate-700/80 hidden sm:flex">
            <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[16px] mr-1.5">pin_drop</span>
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="bg-transparent font-semibold text-xs text-[#0b1c30] dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="dark:bg-[#0c1322]">All Hubs (Karnataka)</option>
              <option value="bel" className="dark:bg-[#0c1322]">Belagavi Flagship (BEL-01)</option>
              <option value="dav" className="dark:bg-[#0c1322]">Davanagere Hub (DAV-02)</option>
              <option value="shi" className="dark:bg-[#0c1322]">Shivamogga Hub (SHI-03)</option>
            </select>
          </div>

          {/* Global Search Bar */}
          <div className="relative flex-1 flex items-center bg-white dark:bg-[#131f38] rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-[0_1px_4px_rgba(0,0,0,0.02)] px-3 py-1">
            <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[18px] mr-2">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID (e.g. BSC-4029), Name, Dept..."
              className="w-full bg-transparent text-xs text-[#0b1c30] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Right Header Cluster */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Real-time Clock */}
          <div className="hidden md:flex flex-col text-right pr-2">
            <div className="flex items-center gap-1 justify-end">
              <span className="material-symbols-outlined text-[13px] text-[#0058be] dark:text-blue-400">schedule</span>
              <span className="text-xs font-bold text-[#0b1c30] dark:text-slate-100 font-mono">{currentTime || '14:22:08 IST'}</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Today • Shift A</span>
          </div>

          {/* Animated Dark / Bright Mode Toggle Switch */}
          <ThemeToggle size="md" />

          {/* Notification Icon & Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setProfileMenuOpen(false);
              }}
              className="relative flex items-center justify-center p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-[#0058be] dark:hover:text-blue-400 hover:bg-[#eff4ff] dark:hover:bg-slate-800 transition-colors cursor-pointer border border-transparent hover:border-blue-100 dark:hover:border-slate-700"
              title="Notifications & System Alerts"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300 hover:text-[#0058be] dark:hover:text-blue-400 transition-colors" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold shadow-sm">
                  {unreadNotifications}
                </span>
              )}
            </button>

            {/* Notification Dropdown Popover */}
            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#0f172a] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-3.5 bg-gradient-to-r from-slate-900 to-[#131b2e] dark:from-slate-950 dark:to-[#0f172a] text-white flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold tracking-tight">System Notifications</span>
                    {unreadNotifications > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold border border-amber-400/30">
                        {unreadNotifications} new
                      </span>
                    )}
                  </div>
                  {unreadNotifications > 0 && (
                    <button
                      onClick={() => setUnreadNotifications(0)}
                      className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark read
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto no-scrollbar">
                  <div className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">IoT Face Recognition Sync</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Belagavi Terminal-01 confirmed 99.8% biometric face match across 42 morning punch events.
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block font-mono">2 mins ago • BEL-01</span>
                    </div>
                  </div>

                  <div className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Early Login Incentive Credited</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        ₹1/sec early login incentive of ₹720 awarded for 12m early arrival on Shift A.
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block font-mono">14 mins ago • INCENTIVE</span>
                    </div>
                  </div>

                  <div className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Shift Roster Auto-Published</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Davanagere &amp; Shivamogga retail rosters synchronized for 3 shifts and 350+ artisans.
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block font-mono">1 hour ago • SHIFT-A</span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                  <Link
                    href="/operations/observations"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-[#0058be] dark:text-blue-400 hover:underline font-semibold flex items-center gap-1"
                  >
                    View Operations Log
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
          <div className="relative pl-2 border-l border-slate-200 dark:border-slate-800">
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
                <span className="text-xs font-bold text-[#0b1c30] dark:text-slate-100 leading-none">{userName}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mt-0.5">{userRole}</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#131b2e] dark:bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-blue-500/20">
                {userName.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'SA'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 hidden sm:block" />
            </button>

            {/* Profile Menu Dropdown */}
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#0f172a] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{userName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{userEmail}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-950/80 text-[#0058be] dark:text-blue-300">
                    {userRole}
                  </span>
                </div>

                <div className="p-1.5 space-y-0.5 text-xs">
                  <Link
                    href="/employees/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-[#eff4ff] dark:hover:bg-slate-800/80 hover:text-[#0058be] dark:hover:text-blue-400 font-medium transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>My Profile &amp; 360° Dossier</span>
                  </Link>

                  <Link
                    href="/my-desk"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-[#eff4ff] dark:hover:bg-slate-800/80 hover:text-[#0058be] dark:hover:text-blue-400 font-medium transition-colors"
                  >
                    <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>My Desk Self-Service</span>
                  </Link>

                  {['SUPER_ADMIN', 'ADMIN'].includes(rawRole) && (
                    <Link
                      href="/admin"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-[#eff4ff] dark:hover:bg-slate-800/80 hover:text-[#0058be] dark:hover:text-blue-400 font-medium transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span>Security &amp; User RBAC</span>
                    </Link>
                  )}
                </div>

                <div className="p-1.5 border-t border-slate-100 dark:border-slate-800">
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
      } pt-14 min-h-screen bg-[#f8f9ff] dark:bg-[#090e17] transition-all duration-300 ease-in-out`}>
        <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}