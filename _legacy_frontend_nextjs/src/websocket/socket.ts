/**
 * Visioryx - WebSocket Client
 * Real-time events: face_recognized, unknown_person_detected, object_detected, camera_status
 * Phase 2 implementation
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

export type WSEventType =
  | 'face_recognized'
  | 'unknown_person_detected'
  | 'object_detected'
  | 'camera_status';

export interface WSEvent {
  type: WSEventType;
  data: Record<string, unknown>;
}

export function createWebSocket(onMessage: (event: WSEvent) => void): WebSocket | null {
  if (typeof window === 'undefined') return null;
  try {
    const ws = new WebSocket(`${WS_URL}/ws`);
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WSEvent;
        onMessage(event);
      } catch {
        // ignore parse errors
      }
    };
    return ws;
  } catch {
    return null;
  }
}
