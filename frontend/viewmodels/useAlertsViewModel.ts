import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertsRepository } from './repositories';
import type { AlertModel } from './models';
import { useRealtimeTick } from '@/contexts/RealtimeContext';

export type SeverityFilter = 'All' | 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

export const SEVERITY_OPTIONS: SeverityFilter[] = ['All', 'Critical', 'High', 'Medium', 'Low', 'Info'];

export interface AlertsViewModel {
  items: AlertModel[];
  total: number;
  unread: number;
  loading: boolean;
  busy: boolean;
  query: string;
  severity: SeverityFilter;
  todayOnly: boolean;
  setQuery: (v: string) => void;
  setSeverity: (v: SeverityFilter) => void;
  toggleTodayOnly: () => void;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useAlertsViewModel(): AlertsViewModel {
  const realtimeTick = useRealtimeTick();
  const [items, setItems] = useState<AlertModel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<SeverityFilter>('All');
  const [todayOnly, setTodayOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await AlertsRepository.list({ q: query, severity, todayOnly });
      setItems(r.items);
      setTotal(r.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, severity, todayOnly]);

  useEffect(() => {
    const delay = query ? 350 : 0;
    const t = setTimeout(() => void load(), delay);
    return () => clearTimeout(t);
  }, [load, realtimeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = useMemo(() => items.filter((i) => !i.is_read).length, [items]);

  const markRead = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await AlertsRepository.markRead(id);
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const markAllRead = useCallback(async () => {
    setBusy(true);
    try {
      await AlertsRepository.markAllRead();
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  return {
    items,
    total,
    unread,
    loading,
    busy,
    query,
    severity,
    todayOnly,
    setQuery,
    setSeverity,
    toggleTodayOnly: () => setTodayOnly((v) => !v),
    refresh: load,
    markRead,
    markAllRead,
  };
}
