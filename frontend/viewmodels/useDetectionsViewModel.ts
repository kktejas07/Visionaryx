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
  totalPages: number;
  loading: boolean;
  page: number;
  pageSize: number;
  query: string;
  setQuery: (v: string) => void;
  setPageSize: (v: number) => void;
  goToPage: (pageNum: number) => Promise<void>;
  refresh: () => Promise<void>;
  knownCount: number;
  unknownCount: number;
}

const PAGE_SIZES = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

export function useDetectionsViewModel(): DetectionsViewModel {
  const tick = useRealtimeTick();
  const [items, setItems] = useState<DetectionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(0);

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  const fetchPage = useCallback(async (pageNum: number, size: number) => {
    const offset = pageNum * size;
    const params = new URLSearchParams({ limit: String(size), offset: String(offset) });
    if (query.trim()) params.set('q', query.trim());
    const r = await api<{ items: DetectionItem[]; total: number }>(
      `/api/v1/detections?${params.toString()}`,
    );
    setItems(r.items);
    setTotal(r.total);
    return r;
  }, [query]);

  const goToPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    setPage(pageNum);
    try {
      await fetchPage(pageNum, pageSize);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setPage(0);
    try {
      await fetchPage(0, pageSize);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, pageSize]);

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
    totalPages,
    loading,
    page,
    pageSize,
    query,
    setQuery,
    setPageSize,
    goToPage,
    refresh: load,
    knownCount,
    unknownCount,
  };
}
