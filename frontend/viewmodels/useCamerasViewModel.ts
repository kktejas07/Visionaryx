import { useCallback, useEffect, useState } from 'react';
import { CamerasRepository } from './repositories';
import type { CameraModel } from './models';
import { useRealtimeTick } from '@/contexts/RealtimeContext';

export interface CamerasViewModel {
  items: CameraModel[];
  activeIds: Set<string>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  query: string;
  setQuery: (v: string) => void;
  refresh: () => Promise<void>;
  toggle: (id: string, enabled: boolean) => Promise<void>;
  add: (body: { camera_name: string; rtsp_url: string }) => Promise<void>;
  update: (id: string, patch: { camera_name?: string; rtsp_url?: string; is_enabled?: boolean }) => Promise<void>;
  update: (id: string, body: { camera_name: string; rtsp_url: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  // derived
  filtered: CameraModel[];
  totalActive: number;
  totalOffline: number;
}

export function useCamerasViewModel(): CamerasViewModel {
  const tick = useRealtimeTick();
  const [items, setItems] = useState<CameraModel[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, status] = await Promise.all([
        CamerasRepository.list(),
        CamerasRepository.streamStatus().catch(() => ({ active_camera_ids: [] as string[] })),
      ]);
      setItems(list);
      setActiveIds(new Set(status.active_camera_ids));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cameras');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    await CamerasRepository.patch(id, { is_enabled: enabled });
    await load();
  }, [load]);

  const add = useCallback(async (body: { camera_name: string; rtsp_url: string }) => {
    await CamerasRepository.create(body);
    await load();
  }, [load]);

  const update = useCallback(
    async (id: string, patch: { camera_name?: string; rtsp_url?: string; is_enabled?: boolean }) => {
      await CamerasRepository.patch(id, patch);
      await load();
    },
    [load],
  );

  const remove = useCallback(async (id: string) => {
    await CamerasRepository.remove(id);
    await load();
  }, [load]);

  const filtered = query.trim()
    ? items.filter(
        (c) =>
          c.camera_name.toLowerCase().includes(query.toLowerCase()) ||
          c.rtsp_url.toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  const totalActive = items.filter((i) => i.is_enabled && i.status === 'active').length;
  const totalOffline = items.length - totalActive;

  return {
    items,
    activeIds,
    loading,
    refreshing,
    error,
    query,
    setQuery,
    refresh,
    toggle,
    add,
    update,
    remove,
    filtered,
    totalActive,
    totalOffline,
  };
}
