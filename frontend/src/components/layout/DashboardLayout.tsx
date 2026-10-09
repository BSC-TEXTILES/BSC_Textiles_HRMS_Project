'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Logo } from '@/components/ui/Logo';
import api from '@/lib/api';

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
    title: 'Leave & Payroll',
    items: [
      { title: 'Leave Approvals', href: '/leaves', icon: 'event_busy' },
      { title: 'Payroll & Payslips', href: '/payroll', icon: 'payments' },
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
        // Admin-only system management
        if (item.href.startsWith('/admin')) {
          return rawRole === 'SUPER_ADMIN' || rawRole === 'ADMIN';
        }
        // Store floor & observation operations
        if (item.href.startsWith('/operations')) {
          return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'].includes(rawRole);
        }
        // Payroll runs & incentive formula calculations
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
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] font-sans antialiased">
      {/* SIDEBAR (Desktop) */}
      <aside 
        className={`fixed left-0 top-0 h-full ${
          isCollapsed ? 'w-20' : 'w-64'
        } bg-white border-r border-slate-200/80 shadow-[0_1px_8px_rgba(0,0,0,0.03)] z-50 flex flex-col justify-between overflow-y-auto hidden lg:flex transition-all duration-300 ease-in-out`}
      >
        <div className="flex flex-col">
          {/* Top Logo Brand Header & 3-line Toggle */}
          <div className={`h-14 flex items-center ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          } bg-white border-b border-slate-100 flex-shrink-0 transition-all`}>
            {!isCollapsed && (
              <div className="flex items-center gap-2.5 overflow-hidden">
                <Logo variant="icon" size="sm" />
                <div className="flex flex-col leading-tight truncate">
                  <span className="text-[15px] font-bold tracking-tight text-[#0b1c30] truncate">BSC Textiles</span>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">HRMS Portal</span>
                </div>
              </div>
            )}

            {/* 3-line Toggle Button (Hamburger / Collapse) */}
            <button
              onClick={toggleSidebar}
              className={`p-1.5 rounded-lg text-slate-500 hover:text-[#0058be] hover:bg-[#eff4ff] transition-colors flex items-center justify-center flex-shrink-0 ${
                isCollapsed ? 'w-10 h-10' : ''
              }`}
              title={isCollapsed ? 'Expand Sidebar (Show full text)' : 'Collapse Sidebar (Show icons only)'}
              aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              <span className="material-symbols-outlined text-[22px]">
                {isCollapsed ? 'menu' : 'menu_open'}
              </span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className={`flex flex-col gap-1 ${isCollapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
            {visibleNavigation.map((section) => (
              <div key={section.title} className="mb-2">
                {!isCollapsed ? (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    {section.title}
                  </div>
                ) : (
                  <div className="my-2 border-t border-slate-100 mx-1" title={section.title} />
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={isCollapsed ? `${item.title} • ${section.title}` : undefined}
                        className={`flex items-center ${
                          isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
                        } rounded-lg text-xs transition-all ${
                          isActive
                            ? 'bg-[#e5eeff] text-[#0058be] font-bold shadow-sm'
                            : 'text-slate-600 hover:bg-[#eff4ff] hover:text-[#0b1c30] font-medium'
                        }`}
                      >
                        <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${isActive ? 'text-[#0058be]' : 'text-slate-500'}`}>
                          {item.icon}
                        </span>
                        {!isCollapsed && <span className="truncate flex-1">{item.title}</span>}
                        {!isCollapsed && item.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#dce9ff] text-[#0058be]">
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
        <div className={`p-3 border-t border-slate-100 bg-white space-y-2`}>
          {!isCollapsed ? (
            <div className="p-2.5 bg-[#eff4ff] rounded-xl border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Biometric Server</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0058be] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0058be]"></span>
                </span>
              </div>
              <div className="text-xs font-bold text-[#0b1c30]">Synced Live</div>
              <div className="text-[11px] text-slate-500">99.8% Terminal Uptime</div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-2 rounded-xl bg-[#eff4ff]" title="Biometric Server Live 99.8%">
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
            } rounded-lg text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 transition-colors`}
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
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto z-10">
            <div>
              <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Logo variant="icon" size="sm" />
                  <span className="font-bold text-sm text-[#0b1c30]">BSC Textiles</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <nav className="p-3 space-y-2">
                {visibleNavigation.map((sec) => (
                  <div key={sec.title}>
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {sec.title}
                    </div>
                    {sec.items.map((i) => (
                      <Link
                        key={i.href}
                        href={i.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                          pathname === i.href ? 'bg-[#e5eeff] text-[#0058be] font-bold' : 'text-slate-600'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">{i.icon}</span>
                        <span>{i.title}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </nav>
            </div>

            <div className="p-3 border-t border-slate-100">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50"
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
      } right-0 h-14 bg-white/95 backdrop-blur-xl border-b border-slate-200/80 shadow-[0_1px_8px_rgba(0,0,0,0.03)] z-40 flex items-center justify-between px-4 lg:px-6 transition-all duration-300 ease-in-out`}>
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          {/* Mobile Drawer Trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation menu"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>

          {/* Desktop 3-line Toggle Button in Top Header */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-600 hover:text-[#0058be] hover:bg-slate-100 hidden lg:flex items-center justify-center transition-colors"
            title={isCollapsed ? 'Expand Sidebar (Show full text)' : 'Collapse Sidebar (Show icons only)'}
            aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <span className="material-symbols-outlined text-[22px]">
              {isCollapsed ? 'menu' : 'menu_open'}
            </span>
          </button>

          {/* Hub Location Dropdown */}
          <div className="relative flex items-center bg-[#eff4ff] rounded-lg px-2.5 py-1 text-xs border border-slate-200/60 hidden sm:flex">
            <span className="material-symbols-outlined text-[#0058be] text-[16px] mr-1.5">pin_drop</span>
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="bg-transparent font-semibold text-xs text-[#0b1c30] focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Hubs (Karnataka)</option>
              <option value="bel">Belagavi Flagship (BEL-01)</option>
              <option value="dav">Davanagere Hub (DAV-02)</option>
              <option value="shi">Shivamogga Hub (SHI-03)</option>
            </select>
          </div>

          {/* Global Search Bar */}
          <div className="relative flex-1 flex items-center bg-white rounded-lg border border-slate-200/80 shadow-[0_1px_4px_rgba(0,0,0,0.02)] px-3 py-1">
            <span className="material-symbols-outlined text-slate-400 text-[18px] mr-2">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID (e.g. BSC-4029), Name, Dept..."
              className="w-full bg-transparent text-xs text-[#0b1c30] placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Right Header Cluster */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Real-time Clock */}
          <div className="hidden md:flex flex-col text-right pr-2">
            <div className="flex items-center gap-1 justify-end">
              <span className="material-symbols-outlined text-[13px] text-[#0058be]">schedule</span>
              <span className="text-xs font-bold text-[#0b1c30] font-mono">{currentTime || '14:22:08 IST'}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Today • Shift A</span>
          </div>

          {/* Notification Icon */}
          <div className="relative flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-white text-[9px] font-bold">
              3
            </span>
          </div>

          {/* User Profile Capsule */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold text-[#0b1c30] leading-none">{userName}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-0.5">{userRole}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#131b2e] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {userName.split(' ').map(n => n[0]).join('').slice(0, 2) || 'SA'}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT CONTAINER */}
      <main className={`${
        isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
      } pt-14 min-h-screen transition-all duration-300 ease-in-out`}>
        <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}