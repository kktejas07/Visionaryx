/**
 * Builds the WebSocket URL for VisionaryX realtime channel.
 * Uses the same origin as the REST API, swapping http→ws and https→wss.
 */
import { getApiBase } from './config';

export function getWsUrl(token?: string | null): string {
  const base = getApiBase().replace(/^http/, 'ws');
  const url = `${base}/api/v1/ws`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}
