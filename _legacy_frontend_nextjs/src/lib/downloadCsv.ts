import { getApiBase, getToken } from '@/lib/api';

/** Download a CSV (or any file) from an authenticated GET. */
export async function downloadAuthenticatedFile(pathWithQuery: string, filename: string): Promise<void> {
  const base = getApiBase();
  const token = getToken();
  const res = await fetch(`${base}${pathWithQuery}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = typeof err.detail === 'string' ? err.detail : res.statusText;
    throw new Error(msg || 'Download failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
