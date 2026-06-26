'use client';

import { useEffect, useRef, useState } from 'react';

export type WSEvent = {
  type: string;
  data: Record<string, unknown>;
};

export function useWebSocket(onMessage?: (event: WSEvent) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `ws://${host}:8000`;
    const ws = new WebSocket(`${wsUrl}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected to:', wsUrl);
      setConnected(true);
    };
    ws.onclose = (event) => {
      console.log('[WS] Disconnected from:', wsUrl, 'Code:', event.code, 'Reason:', event.reason);
      setConnected(false);
    };
    ws.onerror = () => {
      // Browser passes a generic Event here — logging it prints `{}`. Connection may still retry on reload.
      console.warn(
        `[WS] WebSocket error (check API/WebSocket at ${wsUrl}/ws — backend must be running).`,
      );
    };
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WSEvent;
        onMessageRef.current?.(event);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, []);

  return { connected };
}
