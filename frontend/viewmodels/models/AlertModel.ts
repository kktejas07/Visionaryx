export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AlertModel {
  id: string;
  alert_type: string;
  severity: AlertSeverity | string;
  message: string;
  is_read: boolean;
  timestamp: string;
  camera_id?: string | null;
  camera_name?: string | null;
}
