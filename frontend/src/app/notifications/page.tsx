'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { 
  Bell,
  Filter,
  X,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  XCircle,
  Info,
  Loader2,
  Clock,
  MapPin,
  ExternalLink,
  Search,
  UserCheck,
  UserX,
  Copy,
  Check,
  Shield,
  User,
  ArrowRight,
  Trash2,
  RefreshCw,
  Sparkles,
  Layers,
  Inbox
} from 'lucide-react';
import { useNotifications, Notification } from '@/context/NotificationContext';

const TYPE_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  DANGER: { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
  WARNING: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  INFO: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
};

const SEVERITY_BADGES: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200', text: 'Critical' },
  HIGH: { bg: 'bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200', text: 'High' },
  MEDIUM: { bg: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200', text: 'Medium' },
  LOW: { bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300', text: 'Standard' },
};

function getNotificationIcon(type: string, eventId: string | null) {
  if (eventId === 'AUTH.REGISTER') {
    return <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
  }
  if (eventId?.startsWith('AUTH.')) {
    return <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
  }
  switch (type) {
    case 'CRITICAL': return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    case 'DANGER': return <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
    case 'WARNING': return <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case 'INFO': return <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    default: return <Bell className="w-4 h-4 text-slate-500 dark:text-slate-400" />;
  }
}

function formatRelativeTime(dateString: string): string {
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
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatExactDateTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }) + ' IST';
  } catch {
    return dateString;
  }
}

function parseCandidateInfo(notification: Notification) {
  if (notification.metadata && typeof notification.metadata === 'object') {
    const meta = notification.metadata;
    if (meta.email || meta.fullName) {
      return {
        fullName: meta.fullName || 'Candidate',
        email: meta.email || '',
        role: meta.role || 'Sales Associate',
      };
    }
  }

  // Fallback to regex parse on message string
  const msg = notification.message || '';
  const match = msg.match(/submitted by\s+([^()]+)\s+\(([^)]+)\)/i);
  if (match) {
    return {
      fullName: match[1].trim(),
      email: match[2].trim(),
      role: 'Registered Candidate',
    };
  }

  return null;
}

function NotificationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || '';
  const isHrOrAdmin = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE'].includes(userRole);

  const { 
    unreadCount, 
    markAsRead, 
    markAsUnread, 
    markAllAsRead, 
    deleteNotification, 
    fetchUnreadCount 
  } = useNotifications();

  // Active filter states
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD' | 'REGISTRATION' | 'SECURITY' | 'OPERATIONS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Data states
  const [items, setItems] = useState<Notification[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected Notification Detail Drawer
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Fetch paginated notification list from API
  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params: Record<string, any> = {
        page,
        limit,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      };

      if (activeTab === 'UNREAD') params.isRead = 'false';
      if (activeTab === 'REGISTRATION') params.eventId = 'AUTH.REGISTER';
      if (severityFilter) params.severity = severityFilter;

      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
      });

      const res = await api.get(`/notifications?${query.toString()}`);
      const data = res.data;

      let fetchedList: Notification[] = data?.notifications || [];

      // Tab specific client filtering if backend doesn't support fuzzy prefix
      if (activeTab === 'SECURITY') {
        fetchedList = fetchedList.filter(n => n.eventId?.startsWith('AUTH.') || n.eventId?.startsWith('SEC.'));
      } else if (activeTab === 'OPERATIONS') {
        fetchedList = fetchedList.filter(n => n.eventId?.startsWith('ATTENDANCE.') || n.eventId?.startsWith('LEAVE.') || n.eventId?.startsWith('PAYROLL.'));
      }

      setItems(fetchedList);
      setTotalItems(data?.pagination?.total || fetchedList.length);
      setTotalPages(data?.pagination?.totalPages || 1);

      // Deep link handle: if ?id= is in URL, automatically select that notification
      const requestedId = searchParams.get('id');
      if (requestedId) {
        const found = fetchedList.find(n => n.id === requestedId);
        if (found) {
          setSelectedNotification(found);
          if (!found.isRead) markAsRead(found.id);
        } else {
          // Fetch specific notification directly
          api.get(`/notifications/${requestedId}`)
            .then(detailRes => {
              if (detailRes.data) {
                setSelectedNotification(detailRes.data);
                if (!detailRes.data.isRead) markAsRead(detailRes.data.id);
              }
            })
            .catch(() => {
              // Gracefully ignore not found
            });
        }
      }
    } catch (err: any) {
      if (err?.response?.status !== 401 && !err?.isHandled401) {
        console.warn('Failed to load notifications:', err?.message || err);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, limit, activeTab, severityFilter, searchParams, markAsRead]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Client-side text filter for search query
  const displayedNotifications = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(n => 
      n.title.toLowerCase().includes(q) ||
      n.message.toLowerCase().includes(q) ||
      (n.eventId && n.eventId.toLowerCase().includes(q)) ||
      (n.locationId && n.locationId.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  // Handle row click: open detail view, mark as read, update URL
  const handleSelectNotification = async (notification: Notification) => {
    setSelectedNotification(notification);
    if (!notification.isRead) {
      await markAsRead(notification.id);
      setItems(prev => prev.map(item => item.id === notification.id ? { ...item, isRead: true } : item));
    }
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('id', notification.id);
    window.history.replaceState({}, '', currentUrl.toString());
  };

  const handleCloseDrawer = () => {
    setSelectedNotification(null);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('id');
    window.history.replaceState({}, '', currentUrl.toString());
  };

  // Keyboard escape listener to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    toast.success('Candidate email copied to clipboard');
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleApproveRegistration = async (notification: Notification) => {
    if (!notification.entityId) {
      toast.error('No entity ID attached to registration notification');
      return;
    }
    setActionInProgress(true);
    try {
      await api.post(`/auth/approve/${notification.entityId}`, {
        role: 'SALES_EMPLOYEE',
      });
      toast.success('Candidate registration approved successfully!');
      loadNotifications(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Approval failed');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRejectRegistration = async (notification: Notification) => {
    if (!notification.entityId) {
      toast.error('No entity ID attached to registration notification');
      return;
    }
    const reason = window.prompt('Please provide a reason for rejecting this candidate registration:', 'Candidate documentation incomplete');
    if (!reason) return;

    setActionInProgress(true);
    try {
      await api.post(`/auth/reject/${notification.entityId}`, { reason });
      toast.success('Registration has been rejected');
      loadNotifications(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Rejection failed');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDeleteItem = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
      setItems(prev => prev.filter(n => n.id !== notificationId));
      if (selectedNotification?.id === notificationId) {
        handleCloseDrawer();
      }
      toast.success('Notification removed');
    } catch (err: any) {
      toast.error('Could not delete notification');
    }
  };

  const handleToggleReadStatus = async (notification: Notification) => {
    if (notification.isRead) {
      await markAsUnread(notification.id);
      setItems(prev => prev.map(n => n.id === notification.id ? { ...n, isRead: false } : n));
      setSelectedNotification(prev => prev ? { ...prev, isRead: false } : null);
      toast.success('Marked as unread');
    } else {
      await markAsRead(notification.id);
      setItems(prev => prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n));
      setSelectedNotification(prev => prev ? { ...prev, isRead: true } : null);
      toast.success('Marked as read');
    }
  };

  const candidateData = selectedNotification ? parseCandidateInfo(selectedNotification) : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Enterprise Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-[#0058be]/10 dark:bg-[#0058be]/20 text-[#0058be] dark:text-[#60a5fa]">
                <Bell className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  System Notifications & Audit Dispatch
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Official enterprise activity stream, employee onboarding dossiers, and operational alerts across showrooms.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <button
              onClick={() => loadNotifications(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors"
              title="Refresh notification stream"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {unreadCount > 0 && (
              <button
                onClick={async () => {
                  await markAllAsRead();
                  setItems(prev => prev.map(n => ({ ...n, isRead: true })));
                  fetchUnreadCount();
                  toast.success('All notifications marked as read');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0058be] text-white hover:bg-[#0047a0] shadow-xs transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read ({unreadCount})
              </button>
            )}

            <Link
              href="/admin/registrations"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Registration Queue
            </Link>
          </div>
        </div>

        {/* Category Tabs & Quick Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0f172a] p-2 rounded-xl border border-slate-200/80 dark:border-[#1e293b] shadow-xs">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {[
              { id: 'ALL', label: 'All Alerts', count: totalItems },
              { id: 'UNREAD', label: 'Unread', count: unreadCount },
              { id: 'REGISTRATION', label: 'Registrations', icon: User },
              { id: 'SECURITY', label: 'Auth & Security', icon: Shield },
              { id: 'OPERATIONS', label: 'Operations', icon: Layers },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-[#0058be] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search Input & Severity Filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search candidate, email, ID..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <select
              value={severityFilter}
              onChange={e => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
            >
              <option value="">All Severity</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>

        {/* Notifications Master Feed */}
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200/80 dark:border-[#1e293b] shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#0058be] mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading notifications...</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Connecting to enterprise message broker</p>
            </div>
          ) : displayedNotifications.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Inbox className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No notifications found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                {searchQuery || severityFilter || activeTab !== 'ALL'
                  ? 'No alerts match your current filter settings. Try adjusting search criteria or selecting All Alerts.'
                  : 'All caught up! New employee registrations, biometric notices, and store alerts will show here in real time.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {displayedNotifications.map((notification) => {
                const isSelected = selectedNotification?.id === notification.id;
                const candidate = parseCandidateInfo(notification);
                const isReg = notification.eventId === 'AUTH.REGISTER';
                const badge = TYPE_BADGES[notification.type] || TYPE_BADGES.INFO;

                return (
                  <div
                    key={notification.id}
                    onClick={() => handleSelectNotification(notification)}
                    className={`p-4 sm:p-5 transition-all cursor-pointer flex items-start gap-3.5 sm:gap-4 relative ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/20 border-l-4 border-[#0058be]'
                        : !notification.isRead
                        ? 'bg-slate-50/60 dark:bg-slate-800/40 border-l-4 border-amber-500 hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
                        : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Event Type Icon Avatar */}
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-center shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type, notification.eventId)}
                    </div>

                    {/* Notification Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-sm font-semibold tracking-tight ${
                            !notification.isRead 
                              ? 'text-slate-950 dark:text-white font-bold' 
                              : 'text-slate-800 dark:text-slate-200'
                          }`}>
                            {notification.title}
                          </h3>

                          {/* Read indicator */}
                          {!notification.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="Unread" />
                          )}

                          {/* Event Tag */}
                          {notification.eventId && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {notification.eventId}
                            </span>
                          )}

                          {/* Severity Pill */}
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${badge.bg} ${badge.text} border ${badge.border}`}>
                            {notification.severity}
                          </span>
                        </div>

                        {/* Relative Time */}
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap flex items-center gap-1 shrink-0 font-mono">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>

                      {/* Message preview */}
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {notification.message}
                      </p>

                      {/* Quick Registration Candidate Metadata preview pill */}
                      {isReg && candidate && (
                        <div className="mt-2.5 inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 text-xs text-emerald-900 dark:text-emerald-200">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="font-semibold">{candidate.fullName}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">•</span>
                          <span className="font-mono text-[11px]">{candidate.email}</span>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 bg-emerald-200/60 dark:bg-emerald-800/60 rounded text-emerald-800 dark:text-emerald-200">
                            Awaiting Review
                          </span>
                        </div>
                      )}

                      {/* Location & Entity Footer */}
                      <div className="flex items-center gap-4 mt-2.5 text-[11px] text-slate-400 dark:text-slate-500 flex-wrap">
                        {notification.locationId && (
                          <span className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-400">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            Facility: {notification.locationId}
                          </span>
                        )}
                        {notification.entityId && (
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            Ref: {notification.entityType ? `${notification.entityType}#` : ''}{notification.entityId.substring(0, 14)}...
                          </span>
                        )}
                        <span className="text-[#0058be] dark:text-[#60a5fa] font-medium flex items-center gap-1 hover:underline ml-auto">
                          Click to inspect details <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div>
                Showing page <span className="font-semibold text-slate-900 dark:text-white">{page}</span> of{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{totalPages}</span> ({totalItems} records)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* NOTIFICATION DETAIL SLIDE-OVER DRAWER */}
        {selectedNotification && (
          <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
              onClick={handleCloseDrawer}
            />

            <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
              <div className="w-screen max-w-xl bg-white dark:bg-[#0e172a] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
                {/* Drawer Header */}
                <div className="px-6 py-4.5 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-xs">
                      {getNotificationIcon(selectedNotification.type, selectedNotification.eventId)}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                        Notification Dossier
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        Event ID: {selectedNotification.eventId || 'GENERIC.NOTIFICATION'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCloseDrawer}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                      title="Close drawer (Esc)"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Drawer Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Status & Timing Ribbon */}
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        TYPE_BADGES[selectedNotification.type]?.bg || 'bg-slate-100'
                      } ${
                        TYPE_BADGES[selectedNotification.type]?.text || 'text-slate-700'
                      }`}>
                        {selectedNotification.type}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        SEVERITY_BADGES[selectedNotification.severity]?.bg || 'bg-slate-100 text-slate-700'
                      }`}>
                        Severity: {selectedNotification.severity}
                      </span>
                    </div>

                    <div className="text-right text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {formatExactDateTime(selectedNotification.createdAt)}
                    </div>
                  </div>

                  {/* Main Title & Message */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedNotification.title}
                    </h3>
                    <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
                      {selectedNotification.message}
                    </div>
                  </div>

                  {/* SPECIAL CANDIDATE DOSSIER CARD (If AUTH.REGISTER) */}
                  {selectedNotification.eventId === 'AUTH.REGISTER' && candidateData && (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                          <UserCheck className="w-4 h-4" />
                          New Employee Registration Profile
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-200/60 dark:bg-emerald-800/60 text-emerald-900 dark:text-emerald-200">
                          Pending Approval
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                          <span className="text-slate-400 block mb-0.5 font-medium">Candidate Name</span>
                          <span className="text-slate-900 dark:text-slate-100 font-semibold text-sm">
                            {candidateData.fullName}
                          </span>
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                          <span className="text-slate-400 block mb-0.5 font-medium">Designation / Role</span>
                          <span className="text-slate-900 dark:text-slate-100 font-semibold text-sm">
                            {candidateData.role || 'Sales Associate'}
                          </span>
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900/40 sm:col-span-2">
                          <span className="text-slate-400 block mb-0.5 font-medium">Official Email Address</span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-900 dark:text-slate-100 font-mono font-medium">
                              {candidateData.email}
                            </span>
                            <button
                              onClick={() => handleCopyEmail(candidateData.email)}
                              className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-medium flex items-center gap-1 transition-colors"
                            >
                              {copiedEmail ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              {copiedEmail ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-100 dark:border-emerald-900/40 sm:col-span-2">
                          <span className="text-slate-400 block mb-0.5 font-medium">Assigned Facility / Location</span>
                          <span className="text-slate-900 dark:text-slate-100 font-medium">
                            {selectedNotification.locationId || 'BEL-01'} • Belagavi Flagship Showroom
                          </span>
                        </div>
                      </div>

                      {/* Direct HR Approvals Action Block */}
                      {isHrOrAdmin && (
                        <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 space-y-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                            Direct HR Workflow Actions:
                          </span>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <button
                              onClick={() => handleApproveRegistration(selectedNotification)}
                              disabled={actionInProgress}
                              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Approve Candidate Account
                            </button>
                            <button
                              onClick={() => handleRejectRegistration(selectedNotification)}
                              disabled={actionInProgress}
                              className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              Reject Registration
                            </button>
                            <Link
                              href="/admin/registrations"
                              className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition-colors flex items-center gap-1.5"
                            >
                              Open Full Queue <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resource Link if actionUrl present */}
                  {selectedNotification.actionUrl && (
                    <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-blue-900 dark:text-blue-300">
                          Linked Application Record
                        </h4>
                        <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5 font-mono">
                          {selectedNotification.actionUrl}
                        </p>
                      </div>
                      <Link
                        href={selectedNotification.actionUrl === '/admin/registrations' ? '/admin/registrations' : selectedNotification.actionUrl}
                        className="px-3 py-1.5 rounded-lg bg-[#0058be] text-white hover:bg-[#0047a0] font-semibold text-xs flex items-center gap-1 transition-colors shrink-0"
                      >
                        Navigate
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  )}

                  {/* System & Audit Telemetry */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Technical Audit Telemetry
                    </h4>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
                      <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                        <span className="text-slate-500">Record ID:</span>
                        <span className="text-slate-800 dark:text-slate-200">{selectedNotification.id}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                        <span className="text-slate-500">Correlation ID:</span>
                        <span className="text-slate-800 dark:text-slate-200">{selectedNotification.correlationId || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60 dark:border-slate-800">
                        <span className="text-slate-500">Target Entity:</span>
                        <span className="text-slate-800 dark:text-slate-200">
                          {selectedNotification.entityType || 'None'} / {selectedNotification.entityId || 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">Delivery State:</span>
                        <span className="text-emerald-600 font-semibold">DELIVERED</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className="p-4 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleReadStatus(selectedNotification)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      {selectedNotification.isRead ? 'Mark as unread' : 'Mark as read'}
                    </button>
                    <button
                      onClick={() => handleDeleteItem(selectedNotification.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>

                  <button
                    onClick={handleCloseDrawer}
                    className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 font-semibold text-xs transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-[#0058be]" />
      </div>
    }>
      <NotificationsContent />
    </Suspense>
  );
}