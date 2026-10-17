'use client';

/**
 * Reusable Socket.IO hook for the Organization Management module.
 *
 * Subscribes to the existing backend Socket.IO server and listens for
 * `organization:changed` events, invoking the provided callback so the
 * UI can refetch live data. Automatically joins the `organization` room
 * and the `location:<id>` room when a location is selected.
 *
 * Returns a `lastSync` timestamp so the UI can display "last updated"
 * without fabricating data.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

export interface UseOrganizationSocketOptions {
  /** Called whenever an `organization:changed` event is received. */
  onChange: (payload: any) => void;
  /** Location ID to join the `location:<id>` room (optional). */
  locationId?: string;
  /** Whether the live-updates toggle is enabled (default true). */
  enabled?: boolean;
}

export function useOrganizationSocket({ onChange, locationId, enabled = true }: UseOrganizationSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep the latest callback in a ref so the socket listener always calls
  // the most recent version without needing to reconnect.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    // Cookie-authenticated handshake; the server verifies the session before it
    // lets this socket join the organisation rooms.
    const socket = io(WS_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join:organization');
      if (locationId) {
        socket.emit('join:location', locationId);
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('organization:changed', (payload: any) => {
      setLastSync(new Date());
      onChangeRef.current(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]); // intentionally not depending on locationId to avoid reconnect on filter change

  // Join / leave location room when locationId changes without reconnecting
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    socket.emit('join:organization');
    if (locationId) {
      socket.emit('join:location', locationId);
    }
  }, [locationId, connected]);

  return { connected, lastSync };
}
