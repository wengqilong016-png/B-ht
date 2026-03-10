export type NotificationEventType =
  | 'driver_online'
  | 'driver_offline'
  | 'driver_idle'
  | 'machine_stale'
  | 'machine_high_risk'
  | 'pending_approval'
  | 'anomaly_detected';

export interface NotificationItem {
  id: string;
  type: NotificationEventType;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'critical';
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
  metadata?: Record<string, unknown>;
}
