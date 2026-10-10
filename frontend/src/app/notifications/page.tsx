'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import api from '@/lib/api';
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
  MoreVertical,
  Download,
  RefreshCw,
  Clock,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { useNotifications, Notification } from '@/context/NotificationContext';

const TYPE_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  DANGER: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  WARNING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  INFO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  LOW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

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
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function NotificationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { 
    notifications, 
    unreadCount, 
    isLoading, 
    fetchNotifications, 
    markAsRead, 
    markAsUnread,
    markAllAsRead,
    deleteNotification,
    fetchUnreadCount 
  } = useNotifications();

  const [filters, setFilters] = useState({
    isRead: searchParams.get('isRead') || '',
    type: searchParams.get('type') || '',
    severity: searchParams.get('severity') || '',
    eventId: searchParams.get('eventId') || '',
    page: parseInt(searchParams.get('page') || '1'),
    limit: 20,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const fetchData = useCallback(async () => {
    const params = {
      ...filters,
      page: filters.page,
      limit: filters.limit,
    };
    
    // Remove empty filters
    Object.keys(params).forEach(key => {
      if (params[key as keyof typeof params] === '' || params[key as keyof typeof params] === null) {
        delete params[key as keyof typeof params];
      }
    });

    try {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
      
      const res = await api.get(`/notifications?${queryParams.toString()}`);
      // The context fetchNotifications doesn't return pagination data, so we need a separate call
      // For now, we'll use the context data but also fetch pagination separately
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [filters]);

  const { status: authStatus } = useSession();

  // Fetch with pagination data
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const fetchWithPagination = async () => {
      const params = {
        ...filters,
        page: filters.page,
        limit: filters.limit,
      };
      
      Object.keys(params).forEach(key => {
        if (params[key as keyof typeof params] === '' || params[key as keyof typeof params] === null) {
          delete params[key as keyof typeof params];
        }
      });

      try {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            queryParams.append(key, String(value));
          }
        });
        
        await api.get(`/notifications?${queryParams.toString()}`);
      } catch (err: any) {
        if (err?.response?.status !== 401 && !err?.isHandled401) {
          console.warn('Failed to fetch notifications:', err?.message || err);
        }
      }
    };
    
    fetchWithPagination();
    fetchUnreadCount();
  }, [authStatus, filters, fetchUnreadCount]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.set('page', '1');
    router.push(`/notifications?${newParams.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', String(newPage));
    router.push(`/notifications?${newParams.toString()}`);
  };

  const clearFilters = () => {
    setFilters({
      isRead: '',
      type: '',
      severity: '',
      eventId: '',
      page: 1,
      limit: 20,
    });
    router.push('/notifications');
  };

  const hasActiveFilters = filters.isRead || filters.type || filters.severity || filters.eventId;

  const handleNotificationAction = async (notification: Notification, action: 'read' | 'unread' | 'delete') => {
    try {
      switch (action) {
        case 'read':
          await markAsRead(notification.id);
          break;
        case 'unread':
          await markAsUnread(notification.id);
          break;
        case 'delete':
          await deleteNotification(notification.id);
          break;
      }
    } catch (err) {
      console.error(`Failed to ${action} notification:`, err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#18181B] dark:text-slate-100 flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#722F37] dark:text-[#E8DCC6]" />
            Notifications
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage and view all system notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={async () => {
                await markAllAsRead();
                fetchUnreadCount();
              }}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#722F37] rounded-lg hover:bg-[#5B232A] transition-colors flex items-center gap-1.5"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all as read
            </button>
          )}
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              hasActiveFilters 
                ? 'bg-[#722F37] text-white' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 dark:bg-white/10">
                {Object.values(filters).filter(v => v && v !== '').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <div className="bg-white dark:bg-[#1A1D24] rounded-xl border border-gray-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Read Status</label>
              <select
                value={filters.isRead}
                onChange={(e) => handleFilterChange('isRead', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#15181E] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#722F37]"
              >
                <option value="">All</option>
                <option value="false">Unread</option>
                <option value="true">Read</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Type</label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#15181E] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#722F37]"
              >
                <option value="">All</option>
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="DANGER">Danger</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Severity</label>
              <select
                value={filters.severity}
                onChange={(e) => handleFilterChange('severity', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#15181E] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#722F37]"
              >
                <option value="">All</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Event Type</label>
              <input
                type="text"
                value={filters.eventId}
                onChange={(e) => handleFilterChange('eventId', e.target.value)}
                placeholder="e.g., AUTH.REGISTER, EMP.CREATED"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#15181E] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#722F37]"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-[#722F37] dark:text-[#E8DCC6] hover:underline flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Notifications List */}
      <div className="bg-white dark:bg-[#1A1D24] rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#722F37] dark:text-[#E8DCC6] mx-auto mb-2" />
            <p className="text-slate-500 dark:text-slate-400">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-1">No notifications</h3>
            <p className="text-slate-500 dark:text-slate-400">You're all caught up!</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-4 ${
                    !notification.isRead ? 'bg-slate-50/50 dark:bg-slate-800/50 border-l-2 border-[#722F37]' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                    {getSeverityIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-sm font-semibold text-[#18181B] dark:text-slate-100 ${!notification.isRead ? 'font-bold' : ''}`}>
                            {notification.title}
                          </h4>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[notification.type]}`}>
                            {notification.type}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[notification.severity]}`}>
                            {notification.severity}
                          </span>
                          {notification.eventId && (
                            <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {notification.eventId}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimeAgo(notification.createdAt)}
                          </span>
                          {notification.locationId && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {notification.locationId}
                            </span>
                          )}
                          {notification.entityType && notification.entityId && (
                            <span className="flex items-center gap-1 font-mono">
                              {notification.entityType}: {notification.entityId.substring(0, 12)}...
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!notification.isRead && (
                          <button
                            onClick={() => handleNotificationAction(notification, 'read')}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#722F37] dark:hover:text-[#E8DCC6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Mark as read"
                          >
                            <CheckCheck className="w-4 h-4" />
                          </button>
                        )}
                        {notification.isRead && (
                          <button
                            onClick={() => handleNotificationAction(notification, 'unread')}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#722F37] dark:hover:text-[#E8DCC6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Mark as unread"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        {notification.actionUrl && (
                          <Link
                            href={notification.actionUrl}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#722F37] dark:hover:text-[#E8DCC6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Open related record"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => handleNotificationAction(notification, 'delete')}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Delete"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Page {filters.page} of {totalPages} ({total} total)
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(filters.page - 1)}
                    disabled={filters.page <= 1}
                    className="p-2 rounded-lg text-slate-500 hover:text-[#722F37] dark:hover:text-[#E8DCC6] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePageChange(filters.page + 1)}
                    disabled={filters.page >= totalPages}
                    className="p-2 rounded-lg text-slate-500 hover:text-[#722F37] dark:hover:text-[#E8DCC6] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-[#722F37]" />
      </div>
    }>
      <NotificationsContent />
    </Suspense>
  );
}