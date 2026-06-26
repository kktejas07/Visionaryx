import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRealtimeTick } from '@/contexts/RealtimeContext';

export interface UserItem {
  id: string;
  name?: string | null;
  email: string;
  role?: string;
  is_active?: boolean;
  has_face_embedding?: boolean;
  image_path?: string | null;
}

export interface UsersViewModel {
  items: UserItem[];
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (v: string) => void;
  refresh: () => Promise<void>;
  add: (body: { email: string; password: string; role: string; name?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  updateRole: (id: string, role: string) => Promise<void>;
  sendEnrollLink: (id: string) => Promise<{ ok: boolean; enroll_url?: string; sent_to?: string }>;
  // derived
  filtered: UserItem[];
  enrolledCount: number;
  pendingCount: number;
  activeCount: number;
}

export function useUsersViewModel(): UsersViewModel {
  const tick = useRealtimeTick();
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ items: UserItem[]; total: number }>('/api/v1/users');
      setItems(r.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const add = useCallback(async (body: { email: string; password: string; role: string; name?: string }) => {
    await api('/api/v1/users', { method: 'POST', body: JSON.stringify(body) });
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    await api(`/api/v1/users/${id}`, { method: 'DELETE' });
    await load();
  }, [load]);

  const updateRole = useCallback(async (id: string, role: string) => {
    await api(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    await load();
  }, [load]);

  const sendEnrollLink = useCallback(async (id: string) => {
    return await api<{ ok: boolean; enroll_url?: string; sent_to?: string }>(
      `/api/v1/users/${id}/enrollment-link`,
      { method: 'POST' },
    );
  }, []);

  const filtered = query.trim()
    ? items.filter(
        (u) =>
          (u.name || '').toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  const enrolledCount = items.filter((u) => u.has_face_embedding).length;
  const pendingCount = items.filter((u) => !u.has_face_embedding).length;
  const activeCount = items.filter((u) => u.is_active !== false).length;

  return {
    items,
    loading,
    error,
    query,
    setQuery,
    refresh: load,
    add,
    remove,
    updateRole,
    sendEnrollLink,
    filtered,
    enrolledCount,
    pendingCount,
    activeCount,
  };
}
