/**
 * Mask credentials in RTSP/RTSPS URLs for display (user:pass before @).
 */
export function maskRtspUrl(url: string): string {
  const s = url.trim();
  if (!s) return '—';
  return s.replace(/^(rtsp[s]?:\/\/)([^@/?#]+)(@)/i, '$1••••••••$3');
}
