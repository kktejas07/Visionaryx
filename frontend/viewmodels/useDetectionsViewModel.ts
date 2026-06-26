import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRealtimeTick } from '@/contexts/RealtimeContext';

export interface DetectionItem {
  id: string;
  camera_name: string | null;
  user_name: string | null;
  status: 'known' | 'unknown' | string;
  confidence: number;
  timestamp: string;
}

export interface DetectionsViewModel {
  items: DetectionItem[];
  total: number;
  loading: boolean;
  query: string;
  setQuery: (v: string) => void;
  refresh: () => Promise<void>;
  knownCount: number;
  unknownCount: number;
}

export function useDetectionsViewModel(): DetectionsViewModel {
  const tick = useRealtimeTick();
  const [items, setItems] = useState<DetectionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (query.trim()) params.set('q', query.trim());
      const r = await api<{ items: DetectionItem[]; total: number }>(
        `/api/v1/detections?${params.toString()}`,
      );
      setItems(r.items);
      setTotal(r.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const delay = query ? 350 : 0;
    const t = setTimeout(() => void load(), delay);
    return () => clearTimeout(t);
  }, [query, load, tick]); // eslint-disable-line

  const knownCount = items.filter((i) => i.status === 'known').length;
  const unknownCount = items.filter((i) => i.status === 'unknown').length;

  return {
    items,
    total,
    loading,
    query,
    setQuery,
    refresh: load,
    knownCount,
    unknownCount,
  };
}
