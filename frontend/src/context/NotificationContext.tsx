'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { Socket } from 'socket.io-client';
import api from '@/lib/api';
import { useSocket } from '@/context/SocketContext';

export interface Notification {
  id: string;
  userId: string;
  locationId: string | null;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  eventId: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  correlationId: string | null;
  metadata: any;
  deliveryStatus: any;
  dedupKey: string | null;
  expiresAt: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface PaginatedNotifications {
  notifications: Notification[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  fetchNotifications: (params?: any) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAsUnread: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  socket: Socket | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

/**
 * Realtime transport is the single Socket.IO connection owned by SocketContext
 * (the provider is nested inside it). Notification events ride the same
 * connection as live punches and hiring updates — a second connection per
 * feature would double the reconnect churn and leak handlers on unmount.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) return;

    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data?.unreadCount || 0);
    } catch (err: any) {
      if (err?.response?.status !== 401) {
        console.warn('[NotificationContext] Could not fetch unread count:', err?.message || err);
      }
    }
  }, []);

  const fetchNotifications = useCallback(async (params: any = {}) => {
    if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) return;

    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
      const res = await api.get(`/notifications?${queryParams.toString()}`);
      setNotifications(res?.data?.notifications || []);
      setUnreadCount(res?.data?.unreadCount || 0);
    } catch (err: any) {
      if (err?.response?.status !== 401) {
        setError(err.response?.data?.error || 'Failed to fetch notifications');
        console.warn('[NotificationContext] Could not fetch notifications:', err?.message || err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err: any) {
      console.warn('Failed to mark as read:', err?.message || err);
    }
  }, []);

  const markAsUnread = useCallback(async (id: string) => {
    try {
      await api.post(`/notifications/${id}/unread`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: false, readAt: null } : n));
      setUnreadCount(prev => prev + 1);
    } catch (err: any) {
      console.warn('Failed to mark as unread:', err?.message || err);
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err: any) {
      console.warn('Failed to delete notification:', err?.message || err);
    }
  }, []);

  // Realtime notifications on the shared socket. The server derives the user
  // room from the verified access token — never from anything the client
  // claims — so this subscription cannot see anyone else's feed.
  useEffect(() => {
    if (!socket || status !== 'authenticated') return;

    const onNewNotification = (data: { notification: Notification }) => {
      if (!data?.notification) return;
      setNotifications(prev => [data.notification, ...prev]);
      setUnreadCount(prev => prev + 1);

      // Show browser notification if permitted
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted' && document.visibilityState === 'hidden') {
        new window.Notification(data.notification.title, {
          body: data.notification.message,
          icon: '/icon.png',
          tag: data.notification.id,
        });
      }
    };

    socket.on('notification:new', onNewNotification);
    return () => {
      socket.off('notification:new', onNewNotification);
    };
  }, [socket, status]);

  // Fetch initial data only when authenticated and not on login page
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/login')) {
      return;
    }
    if (status === 'authenticated') {
      fetchUnreadCount();
      fetchNotifications({ limit: 10 });
    } else if (status === 'unauthenticated') {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [status, fetchUnreadCount, fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err: any) {
      console.warn('Failed to mark all as read:', err?.message || err);
    }
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      isLoading,
      error,
      fetchNotifications,
      fetchUnreadCount,
      markAsRead,
      markAsUnread,
      markAllAsRead,
      deleteNotification,
      socket,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
