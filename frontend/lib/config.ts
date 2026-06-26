let _customApiBase: string | null = null;
let _customDashboardBase: string | null = null;
let _fetchedApiBase: string | null = null;

export function setCustomApiBase(url: string | null): void {
  _customApiBase = url;
}

export function setCustomDashboardBase(url: string | null): void {
  _customDashboardBase = url;
}

export async function fetchPublicApiUrl(): Promise<void> {
  if (_customApiBase || _fetchedApiBase) return;
  try {
    const u = process.env.EXPO_PUBLIC_API_URL;
    const base = u && u.length > 0 ? u.replace(/\/$/, '') : 'http://localhost:8001';
    const res = await fetch(`${base}/api/v1/meta/version`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data.public_api_url) {
        _fetchedApiBase = data.public_api_url;
      }
    }
  } catch {}
}

/**
 * Backend API base (FastAPI server.py), e.g. https://<preview>.preview.emergentagent.com
 * Routes prefixed with /api are proxied to the backend (port 8001) by the platform ingress.
 */
export function getApiBase(): string {
  // Priority: custom URL > env var > localhost
  if (_customApiBase) return _customApiBase;
  const u = process.env.EXPO_PUBLIC_API_URL;
  if (u && u.length > 0 && u.startsWith('http')) return u.replace(/\/$/, '');
  // Fallback to localhost for development (only if nothing else is set)
  return 'http://localhost:8001';
}

/** Next.js dashboard — open SMTP / admin pages in browser (same LAN as API). */
export function getDashboardBase(): string {
  if (_customDashboardBase) return _customDashboardBase;
  const u = process.env.EXPO_PUBLIC_DASHBOARD_URL;
  if (u && u.length > 0) return u.replace(/\/$/, '');
  return 'http://localhost:3000';
}
