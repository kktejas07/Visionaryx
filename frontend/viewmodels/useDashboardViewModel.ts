import { useCallback, useEffect, useState } from 'react';
import { DashboardRepository } from './repositories';
import type {
  OverviewModel,
  TrendPointModel,
  AlertPreviewModel,
} from './models';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeTick } from '@/contexts/RealtimeContext';
import { isEnrolleeRole } from '@/lib/roles';

export interface DashboardViewModel {
  user: ReturnType<typeof useAuth>['user'];
  overview: OverviewModel | null;
  trends: TrendPointModel[];
  recentAlerts: AlertPreviewModel[];
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  selectedDays: 7 | 30;
  isEnrollee: boolean;
  setSelectedDays: (d: 7 | 30) => void;
  refresh: () => Promise<void>;
  // derived
  bars: number[];
  nodes: number;
}

export function useDashboardViewModel(): DashboardViewModel {
  const { user } = useAuth();
  const realtimeTick = useRealtimeTick();
  const [overview, setOverview] = useState<OverviewModel | null>(null);
  const [trends, setTrends] = useState<TrendPointModel[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertPreviewModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDays, setSelectedDays] = useState<7 | 30>(7);

  const isEnrollee = isEnrolleeRole(user?.role);

  const load = useCallback(async () => {
    if (isEnrollee) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [o, tr, al] = await Promise.all([
        DashboardRepository.fetchOverview(),
        DashboardRepository.fetchTrends(selectedDays).catch(() => [] as TrendPointModel[]),
        DashboardRepository.fetchRecentAlerts(3).catch(() => ({ items: [] as AlertPreviewModel[] })),
      ]);
      setOverview(o);
      setTrends(tr);
      setRecentAlerts(al.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [isEnrollee, selectedDays]);

  useEffect(() => {
    void load();
  }, [load, realtimeTick]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const nodes = overview?.total_cameras && overview.total_cameras > 0 ? overview.total_cameras : 12;

  const trendRows = trends.length ? trends.slice(-selectedDays) : [];
  const maxBar = Math.max(1, ...trendRows.map((x) => x.count));
  const bars =
    trendRows.length > 0
      ? trendRows.map((x) => Math.max(0.08, x.count / maxBar))
      : selectedDays === 7
        ? [0.4, 0.65, 0.3, 0.85, 0.95, 0.5, 0.6]
        : Array.from({ length: 30 }, () => 0.3 + Math.random() * 0.5);

  return {
    user,
    overview,
    trends,
    recentAlerts,
    error,
    loading,
    refreshing,
    selectedDays,
    isEnrollee,
    setSelectedDays,
    refresh,
    bars,
    nodes,
  };
}
