import type { NotificationItem } from '../contexts/NotificationContext';
import type { DriverFlowEvent } from '../types/models';

type SubmissionNotificationPayload = Omit<NotificationItem, 'id' | 'isRead' | 'createdAt'>;

const SUBMIT_EVENT_TYPES = new Set([
  'submit_success',
  'submit_offline_queued',
  'submit_failed',
]);

function formatMoney(value: unknown): string {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return `TZS ${Number.isFinite(amount) ? amount.toLocaleString() : '0'}`;
}

function formatScore(value: unknown): string {
  const score = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(score) ? score.toLocaleString() : '—';
}

function readString(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function buildSubmissionNotification(event: DriverFlowEvent): SubmissionNotificationPayload | null {
  if (!SUBMIT_EVENT_TYPES.has(event.eventName)) return null;

  const payload = event.payload ?? {};
  const txId = readString(payload, 'txId', event.draftTxId ?? event.id);
  const driverName = readString(payload, 'driverName', event.driverId);
  const locationName = readString(payload, 'locationName', event.locationId ?? 'Unknown machine');
  const scoreLine = `${formatScore(payload.previousScore)} → ${formatScore(payload.currentScore)}`;
  const revenueLine = formatMoney(payload.revenue);

  if (event.eventName === 'submit_offline_queued') {
    return {
      type: 'driver_collection_offline',
      title: `离线收款待同步：${driverName}`,
      message: `${locationName}｜${revenueLine}｜分数 ${scoreLine}｜联网同步后管理端可见｜交易号 ${txId}`,
      level: 'warning',
      entityType: 'transaction',
      entityId: txId,
      metadata: { eventId: event.id, driverId: event.driverId, locationId: event.locationId, eventName: event.eventName },
    };
  }

  if (event.eventName === 'submit_failed') {
    const reason = event.errorCategory || readString(payload, 'reason', '未知错误');
    return {
      type: 'driver_collection_failed',
      title: `收款失败：${driverName}`,
      message: `${locationName}｜分数 ${scoreLine}｜原因：${reason}｜交易号 ${txId}`,
      level: 'critical',
      entityType: 'transaction',
      entityId: txId,
      metadata: { eventId: event.id, driverId: event.driverId, locationId: event.locationId, eventName: event.eventName },
    };
  }

  return {
    type: 'driver_collection_success',
    title: `收款成功：${driverName}`,
    message: `${locationName}｜${revenueLine}｜分数 ${scoreLine}｜管理端已可见｜交易号 ${txId}`,
    level: 'info',
    entityType: 'transaction',
    entityId: txId,
    metadata: { eventId: event.id, driverId: event.driverId, locationId: event.locationId, eventName: event.eventName },
  };
}
