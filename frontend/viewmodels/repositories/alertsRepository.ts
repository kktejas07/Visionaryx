import { api } from '@/lib/api';
import type { AlertModel } from '@/viewmodels/models/AlertModel';

export interface AlertFilters {
  q?: string;
  severity?: string;
  cameraId?: string | null;
  todayOnly?: boolean;
  limit?: number;
  offset?: number;
}

export const AlertsRepository = {
  async list(filters: AlertFilters = {}): Promise<{ items: AlertModel[]; total: number }> {
    const params = new URLSearchParams({
      limit: String(filters.limit ?? 50),
      offset: String(filters.offset ?? 0),
    });
    if (filters.q?.trim()) params.set('q', filters.q.trim());
    if (filters.severity && filters.severity !== 'All') params.set('severity', filters.severity.toLowerCase());
    if (filters.cameraId) params.set('camera_id', filters.cameraId);
    if (filters.todayOnly) params.set('today_only', 'true');
    return api(`/api/v1/alerts?${params.toString()}`);
  },
  markRead(id: string) {
    return api(`/api/v1/alerts/${id}/read`, { method: 'PATCH' });
  },
  markAllRead() {
    return api('/api/v1/alerts/mark-all-read', { method: 'POST' });
  },
};
