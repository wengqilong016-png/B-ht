import { supabase } from '../supabaseClient';

import type { NotificationEventType, NotificationItem } from '../contexts/NotificationContext';

export interface AdminNotificationRow {
  id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  timestamp: string | null;
  isRead: boolean | null;
  driverId: string | null;
  relatedTransactionId: string | null;
  relatedLocationId: string | null;
  driverFlowEventId?: string | null;
}

const DEFAULT_NOTIFICATION_TYPE: NotificationEventType = 'admin_notification';
const DEFAULT_TIMESTAMP = '1970-01-01T00:00:00.000Z';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeType(type: string | null | undefined): string {
  return (type ?? '').trim().toLowerCase();
}

function mapNotificationType(type: string | null | undefined): NotificationEventType {
  const trimmed = type?.trim();
  return trimmed ? trimmed as NotificationEventType : DEFAULT_NOTIFICATION_TYPE;
}

export function notificationLevelForType(type: string | null | undefined): NotificationItem['level'] {
  const normalized = normalizeType(type);
  if (
    normalized.includes('zero_revenue')
    || normalized.includes('failed')
    || normalized.includes('anomaly')
  ) {
    return 'critical';
  }
  if (
    normalized.includes('offline')
    || normalized.includes('overflow')
    || normalized.includes('reset_locked')
  ) {
    return 'warning';
  }
  return 'info';
}

function inferEntity(row: Pick<AdminNotificationRow, 'driverId' | 'relatedTransactionId' | 'relatedLocationId'>): Pick<NotificationItem, 'entityType' | 'entityId'> {
  if (row.relatedTransactionId) {
    return { entityType: 'transaction', entityId: row.relatedTransactionId };
  }
  if (row.relatedLocationId) {
    return { entityType: 'location', entityId: row.relatedLocationId };
  }
  if (row.driverId) {
    return { entityType: 'driver', entityId: row.driverId };
  }
  return {};
}

export function mapAdminNotificationRow(row: AdminNotificationRow): NotificationItem {
  const driverId = readString(row.driverId);
  const relatedTransactionId = readString(row.relatedTransactionId);
  const relatedLocationId = readString(row.relatedLocationId);
  const driverFlowEventId = readString(row.driverFlowEventId);
  const type = mapNotificationType(row.type);

  return {
    id: row.id,
    type,
    title: readString(row.title) ?? '通知',
    message: readString(row.message) ?? '',
    level: notificationLevelForType(row.type),
    ...inferEntity({ driverId, relatedTransactionId, relatedLocationId }),
    isRead: row.isRead === true,
    createdAt: readString(row.timestamp) ?? DEFAULT_TIMESTAMP,
    driverId,
    relatedTransactionId,
    relatedLocationId,
    driverFlowEventId,
    metadata: {
      source: 'notifications',
      rawType: row.type,
      driverId,
      relatedTransactionId,
      relatedLocationId,
      driverFlowEventId,
      eventId: driverFlowEventId,
    },
  };
}

export async function fetchAdminNotifications(limit = 200): Promise<NotificationItem[] | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[adminNotifications] fetch failed:', error.message);
      return null;
    }

    return (data ?? []).map((row) => mapAdminNotificationRow(row as AdminNotificationRow));
  } catch (error) {
    console.warn('[adminNotifications] fetch failed:', error);
    return null;
  }
}

export async function markAdminNotificationsRead(ids: string[]): Promise<boolean> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return true;
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ isRead: true })
      .in('id', uniqueIds)
      .eq('isRead', false);

    if (error) {
      console.warn('[adminNotifications] mark read failed:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[adminNotifications] mark read failed:', error);
    return false;
  }
}
