export interface OverviewModel {
  total_users: number;
  total_cameras: number;
  active_cameras: number;
  detections_today: number;
  unknown_detections_today: number;
  detection_trend_7d: number;
}

export interface TrendPointModel {
  date: string;
  count: number;
}

export interface AlertPreviewModel {
  id: string;
  alert_type: string;
  message: string;
  timestamp: string;
  severity?: string;
  camera_name?: string;
}
