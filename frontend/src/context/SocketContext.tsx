'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

/**
 * Socket.IO is served by the Express API process, not by Next.js. Deriving the
 * default from NEXT_PUBLIC_API_URL (rather than window.location.origin) is what
 * makes live punches arrive at all: the browser page is on :3000, the socket
 * server is on :4000, and Next.js only proxies /api/* — not /socket.io/.
 */
function resolveWebSocketUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');
      return parsed.origin;
    } catch {
      // fall through to the origin default below
    }
  }

  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000';
}

const WS_URL = resolveWebSocketUrl();

/**
 * Single shared Socket.IO connection. Attendance, hiring and live-activity
 * screens subscribe to their own room events on this socket — opening a second
 * connection per screen would double the reconnect churn and leak handlers.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);

  // Initialize WebSocket connection only when user is authenticated and not on login page
  useEffect(() => {
    if (status !== 'authenticated' || (typeof window !== 'undefined' && window.location.pathname.startsWith('/login'))) {
      setSocket((prev) => {
        if (prev) prev.close();
        return null;
      });
      return;
    }

    // The socket authenticates with the same HttpOnly session cookie as the
    // REST API (`withCredentials`), and the server derives the user room from
    // the verified token — never from anything this client claims.
    const newSocket = io(WS_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    newSocket.on('connect', () => {});

    newSocket.on('disconnect', () => {});

    newSocket.on('connect_error', (err) => {
      console.warn('[SocketContext] Realtime reconnecting:', err?.message || err);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [status]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
