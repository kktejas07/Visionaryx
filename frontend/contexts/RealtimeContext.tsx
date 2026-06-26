/**
 * RealtimeContext — manages a single authenticated WebSocket per session.
 *
 * - Token comes via `?token=<jwt>` query string (`expo-secure-store` on
 *   native, `localStorage` on web).
 * - We expose `tick` (bumps when relevant events arrive — screens use it as
 *   a refresh signal) and `connected` (a green/grey dot in the UI).
 * - Automatic reconnect with exponential backoff up to 30s.
 * - 25-second ping/pong heartbeat keeps proxies from killing the socket.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { getStoredToken } from '@/lib/api';
import { getWsUrl } from '@/lib/wsUrl';

const REFRESH_TYPES = new Set([
  'face_recognized',
  'unknown_person_detected',
  'object_detected',
  'camera_status',
  'alert',
]);

type WsEvent = { type: string; data?: Record<string, unknown> };

interface RealtimeContextValue {
  tick: number;
  connected: boolean;
  lastEvent: WsEvent | null;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  tick: 0,
  connected: false,
  lastEvent: null,
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, tokenReady } = useAuth();
  const [tick, setTick] = useState(0);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const clearReconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const connectRef = useRef<() => Promise<void>>(async () => undefined);

  const scheduleReconnect = useCallback(() => {
    if (!user) return;
    clearReconnect();
    const delay = Math.min(30_000, 1000 * Math.pow(1.7, reconnectAttempt.current));
    reconnectTimer.current = setTimeout(() => {
      reconnectAttempt.current += 1;
      void connectRef.current();
    }, delay);
  }, [user, clearReconnect]);

  const connect = useCallback(async () => {
    if (!user) return;
    clearReconnect();
    try {
      wsRef.current?.close();
    } catch {
      /* noop */
    }
    const token = await getStoredToken();
    if (!token) return;

    const url = getWsUrl(token);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempt.current = 0;
      setConnected(true);
    };

    ws.onmessage = (e) => {
      if (typeof e.data === 'string' && e.data === 'pong') return;
      try {
        const msg = JSON.parse(e.data as string) as WsEvent;
        setLastEvent(msg);
        if (typeof msg.type === 'string' && REFRESH_TYPES.has(msg.type)) {
          bump();
        }
      } catch {
        /* ignore */
      }
    };

    ws.onerror = () => setConnected(false);

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (user) scheduleReconnect();
    };
  }, [user, bump, clearReconnect, scheduleReconnect]);

  connectRef.current = connect;

  useEffect(() => {
    if (!user || !tokenReady) {
      clearReconnect();
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
      setConnected(false);
      reconnectAttempt.current = 0;
      return;
    }
    void connect();
    return () => {
      clearReconnect();
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    };
  }, [user, tokenReady, connect, clearReconnect]);

  // Heartbeat
  useEffect(() => {
    if (!connected) return;
    if (pingTimer.current) clearInterval(pingTimer.current);
    pingTimer.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send('ping');
        } catch {
          /* noop */
        }
      }
    }, 25_000);
    return () => {
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
    };
  }, [connected]);

  // Reconnect on foregrounding (native).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active' && user) {
        void connect();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [user, connect]);

  // Soft poll fallback when socket is down.
  useEffect(() => {
    if (!user || connected) return;
    const id = setInterval(() => bump(), 30_000);
    return () => clearInterval(id);
  }, [user, connected, bump]);

  const value = useMemo(
    () => ({ tick, connected, lastEvent }),
    [tick, connected, lastEvent],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeTick(): number {
  return useContext(RealtimeContext).tick;
}
export function useRealtimeConnected(): boolean {
  return useContext(RealtimeContext).connected;
}
export function useLastRealtimeEvent(): WsEvent | null {
  return useContext(RealtimeContext).lastEvent;
}
