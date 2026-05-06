const mockFrom = jest.fn();

jest.mock('../supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  fetchAdminNotifications,
  mapAdminNotificationRow,
  markAdminNotificationsRead,
  notificationLevelForType,
} from '../services/adminNotifications';

import type { AdminNotificationRow } from '../services/adminNotifications';

const baseRow: AdminNotificationRow = {
  id: 'notif-1',
  type: 'driver_collection_failed',
  title: '收款失败：RAJABU',
  message: 'Machine A｜原因：network｜交易号 tx-1',
  timestamp: '2026-05-04T10:00:00.000Z',
  isRead: false,
  driverId: 'drv-1',
  relatedTransactionId: 'tx-1',
  relatedLocationId: 'loc-1',
  driverFlowEventId: 'event-1',
};

describe('adminNotifications service', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('maps public.notifications rows into NotificationItem fields', () => {
    const notification = mapAdminNotificationRow(baseRow);

    expect(notification).toEqual(expect.objectContaining({
      id: 'notif-1',
      type: 'driver_collection_failed',
      title: '收款失败：RAJABU',
      message: 'Machine A｜原因：network｜交易号 tx-1',
      level: 'critical',
      isRead: false,
      createdAt: '2026-05-04T10:00:00.000Z',
      driverId: 'drv-1',
      relatedTransactionId: 'tx-1',
      relatedLocationId: 'loc-1',
      driverFlowEventId: 'event-1',
      entityType: 'transaction',
      entityId: 'tx-1',
    }));
    expect(notification.metadata).toEqual(expect.objectContaining({
      source: 'notifications',
      rawType: 'driver_collection_failed',
      eventId: 'event-1',
      driverFlowEventId: 'event-1',
    }));
  });

  it.each([
    ['driver_collection_zero_revenue', 'critical'],
    ['failed', 'critical'],
    ['anomaly', 'critical'],
    ['driver_collection_offline', 'warning'],
    ['overflow', 'warning'],
    ['reset_locked', 'warning'],
    ['driver_collection_success', 'info'],
  ] as const)('maps %s notification type to %s level', (type, expectedLevel) => {
    expect(notificationLevelForType(type)).toBe(expectedLevel);
  });

  it('queries persistent admin notifications newest first', async () => {
    const limit = jest.fn().mockResolvedValue({ data: [baseRow], error: null });
    const order = jest.fn(() => ({ limit }));
    const select = jest.fn(() => ({ order }));
    mockFrom.mockReturnValue({ select });

    const notifications = await fetchAdminNotifications();

    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(select).toHaveBeenCalledWith('*');
    expect(order).toHaveBeenCalledWith('timestamp', { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
    expect(notifications).toHaveLength(1);
    expect(notifications?.[0]).toEqual(expect.objectContaining({ id: 'notif-1' }));
  });

  it('marks only requested unread notifications read in Supabase', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const inFilter = jest.fn(() => ({ eq }));
    const update = jest.fn(() => ({ in: inFilter }));
    mockFrom.mockReturnValue({ update });

    await expect(markAdminNotificationsRead(['notif-1', 'notif-1', 'notif-2'])).resolves.toBe(true);

    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(update).toHaveBeenCalledWith({ isRead: true });
    expect(inFilter).toHaveBeenCalledWith('id', ['notif-1', 'notif-2']);
    expect(eq).toHaveBeenCalledWith('isRead', false);
  });
});
