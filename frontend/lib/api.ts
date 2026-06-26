import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getApiBase } from './config';

const TOKEN_KEY = 'visionaryx_token';

const isWeb = Platform.OS === 'web';

async function webGet(key: string): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
async function webSet(key: string, value: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* noop */
  }
}
async function webDel(key: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* noop */
  }
}

function networkHint(): string {
  const base = getApiBase();
  const isLocal =
    base.includes('localhost') ||
    base.includes('127.0.0.1') ||
    base.includes('0.0.0.0');
  if (isLocal) {
    return ' On a physical phone, localhost is the phone itself — set EXPO_PUBLIC_API_URL=http://<YOUR_MAC_LAN_IP>:8000 in mobile/.env (same Wi‑Fi as the phone), then stop Metro and run: npm run start:clear.';
  }
  return ' Check the backend is running (uvicorn --host 0.0.0.0 --port 8000), same Wi‑Fi, macOS firewall allows port 8000, and iOS Settings → Privacy → Local Network → Expo Go is ON.';
}

/** Shown when connection test fails — same text is useful for sign-in errors. */
export const LAN_TROUBLESHOOTING = `Common fixes (same Wi‑Fi but still failing):
• iPhone: Settings → Privacy & Security → Local Network → turn ON for Expo Go.
• Mac IP changes: run \`ipconfig getifaddr en0\` and update mobile/.env EXPO_PUBLIC_API_URL, then npm run start:clear.
• Backend must listen on all interfaces: uvicorn … --host 0.0.0.0 --port 8000
• macOS firewall: System Settings → Network → Firewall — allow Python/terminal or port 8000 for testing.
• Guest / “isolated” Wi‑Fi often blocks device-to-device; use your main LAN.`;

/** GET /health — no auth. Use from login to verify the phone can reach the laptop API. */
export async function testApiReachable(): Promise<{ ok: boolean; detail: string }> {
  const base = getApiBase();
  try {
    const res = await fetchWithHelp(`${base}/health`, { method: 'GET' }, 12_000);
    const body = await res.text();
    const line = `HTTP ${res.status}\n${body.slice(0, 400)}`;
    if (!res.ok) {
      return { ok: false, detail: line };
    }
    return { ok: true, detail: line };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

const DEFAULT_TIMEOUT_MS = 45_000;

/** FastAPI returns `detail` as string (HTTPException) or list (422 validation). */
function formatErrorBody(err: Record<string, unknown>, status: number): string {
  const detail = err.detail;
  if (typeof detail === 'string') {
    return status === 401 || status === 403 ? detail : `${detail} (HTTP ${status})`;
  }
  if (Array.isArray(detail)) {
    const parts = detail.map((item: unknown) => {
      if (item && typeof item === 'object' && 'msg' in item) {
        const o = item as { loc?: unknown[]; msg?: string };
        const loc = Array.isArray(o.loc) ? o.loc.filter((x) => x !== 'body').join('.') : '';
        return loc ? `${loc}: ${o.msg ?? ''}` : (o.msg ?? JSON.stringify(item));
      }
      return JSON.stringify(item);
    });
    return `Invalid request (HTTP ${status}): ${parts.join('; ')}`;
  }
  if (detail != null) return `HTTP ${status}: ${JSON.stringify(detail)}`;
  if (typeof err.message === 'string') return `${err.message} (HTTP ${status})`;
  return `HTTP ${status}: request failed`;
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    if (text) parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 240) || res.statusText}`);
  }
  throw new Error(formatErrorBody(parsed, res.status));
}

async function fetchWithHelp(url: string, opts?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const merged: RequestInit = {
    ...opts,
    signal: opts?.signal ? mergeAbortSignals(opts.signal, controller.signal) : controller.signal,
  };
  try {
    return await fetch(url, merged);
  } catch (e) {
    const aborted =
      (e instanceof Error && e.name === 'AbortError') ||
      (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError');
    if (aborted) {
      throw new Error(
        `Request timed out after ${timeoutMs / 1000}s. Check EXPO_PUBLIC_API_URL, Wi‑Fi, and that the API is reachable.`,
      );
    }
    const raw = e instanceof Error ? e.message : String(e);
    if (
      raw.includes('Network request failed') ||
      raw.includes('Failed to fetch') ||
      raw.includes('NetworkError') ||
      raw.includes('ECONNREFUSED')
    ) {
      throw new Error(`Cannot reach ${getApiBase()} (${raw}).${networkHint()}`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const c = new AbortController();
  const onAbort = () => c.abort();
  if (a.aborted || b.aborted) {
    c.abort();
    return c.signal;
  }
  a.addEventListener('abort', onAbort);
  b.addEventListener('abort', onAbort);
  return c.signal;
}

export async function getStoredToken(): Promise<string | null> {
  try {
    if (isWeb) return webGet(TOKEN_KEY);
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  if (isWeb) return webSet(TOKEN_KEY, token);
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  if (isWeb) return webDel(TOKEN_KEY);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function publicApi<T>(
  path: string,
  opts?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const isFormData = opts?.body instanceof FormData;
  const base = getApiBase();
  const res = await fetchWithHelp(
    `${base}${path}`,
    {
      ...opts,
      headers: {
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        ...opts?.headers,
      },
    },
    timeoutMs,
  );
  await throwIfNotOk(res);
  return res.json();
}

/** Same as `api` but uses an explicit Bearer token (e.g. right after login, parallel with SecureStore). */
export async function apiWithToken<T>(
  accessToken: string,
  path: string,
  opts?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const isFormData = opts?.body instanceof FormData;
  const base = getApiBase();
  const res = await fetchWithHelp(
    `${base}${path}`,
    {
      ...opts,
      headers: {
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${accessToken}`,
        ...opts?.headers,
      },
    },
    timeoutMs,
  );
  await throwIfNotOk(res);
  return res.json();
}

export async function api<T>(path: string, opts?: RequestInit, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<T> {
  const token = await getStoredToken();
  const isFormData = opts?.body instanceof FormData;
  const base = getApiBase();
  const res = await fetchWithHelp(
    `${base}${path}`,
    {
      ...opts,
      headers: {
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts?.headers,
      },
    },
    timeoutMs,
  );
  await throwIfNotOk(res);
  return res.json();
}

export function streamMjpegUrl(cameraId: string, token: string): string {
  const base = getApiBase();
  const q = new URLSearchParams({ token });
  return `${base}/api/v1/stream/${cameraId}/frame?${q.toString()}`;
}
