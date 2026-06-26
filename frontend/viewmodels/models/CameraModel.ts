export interface CameraModel {
  id: string;
  camera_name: string;
  rtsp_url: string;
  is_enabled: boolean;
  status: 'active' | 'offline' | string;
}
