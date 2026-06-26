import { api } from './api';

/**
 * Public browser origin for enrollment QR/links (e.g. https://visioryx.example.com).
 * Set NEXT_PUBLIC_APP_ORIGIN in production when the dashboard is served on a stable URL
 * (Cloudflare, reverse proxy) so QR codes are not tied to localhost or a wrong host.
 */
export function getPublicAppOrigin(): string {
  if (typeof window === 'undefined') return '';
  const fromEnv = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  return window.location.origin;
}

/**
 * Base URL for enrollment QR codes — same rules as emailed links:
 * 1) NEXT_PUBLIC_APP_ORIGIN (frontend .env) if set
 * 2) Backend "Public dashboard URL" (Email & SMTP) or PUBLIC_DASHBOARD_URL in backend/.env
 * 3) Current browser origin (often localhost — phones cannot open that)
 */
export async function getEnrollmentPublicBase(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined') return '';
  try {
    const r = await api<{ base_url: string }>('/api/v1/settings/enrollment-base-url');
    const b = (r.base_url || '').trim().replace(/\/$/, '');
    if (b) return b;
  } catch {
    // not admin or offline — fall back
  }
  return window.location.origin;
}

export function enrollmentBaseIsUnreachableFromOtherDevices(base: string): boolean {
  try {
    const u = new URL(base);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return true;
  }
}
