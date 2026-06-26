import { api } from '@/lib/api';
import type { OverviewModel, TrendPointModel, AlertPreviewModel } from '@/viewmodels/models/DashboardModel';

export const DashboardRepository = {
  fetchOverview(): Promise<OverviewModel> {
    return api<OverviewModel>('/api/v1/analytics/overview');
  },
  fetchTrends(days: number): Promise<TrendPointModel[]> {
    return api<TrendPointModel[]>(`/api/v1/analytics/detection-trends?days=${days}`);
  },
  fetchRecentAlerts(limit = 3): Promise<{ items: AlertPreviewModel[] }> {
    return api<{ items: AlertPreviewModel[] }>(`/api/v1/alerts?limit=${limit}&offset=0`);
  },
};
