import { api } from '@/lib/api';
import type { CameraModel } from '@/viewmodels/models/CameraModel';

export const CamerasRepository = {
  list(): Promise<CameraModel[]> {
    return api<CameraModel[]>('/api/v1/cameras');
  },
  streamStatus(): Promise<{ active_camera_ids: string[] }> {
    return api('/api/v1/stream/status');
  },
  create(body: { camera_name: string; rtsp_url: string; is_enabled?: boolean }): Promise<CameraModel> {
    return api('/api/v1/cameras', { method: 'POST', body: JSON.stringify(body) });
  },
  patch(id: string, body: Partial<{ camera_name: string; rtsp_url: string; is_enabled: boolean }>): Promise<CameraModel> {
    return api(`/api/v1/cameras/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  remove(id: string): Promise<{ ok: boolean }> {
    return api(`/api/v1/cameras/${id}`, { method: 'DELETE' });
  },
};
