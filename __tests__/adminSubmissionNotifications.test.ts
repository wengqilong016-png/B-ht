import { buildSubmissionNotification } from '../services/adminSubmissionNotifications';

import type { DriverFlowEvent } from '../types/models';

const baseEvent: DriverFlowEvent = {
  id: 'event-1',
  driverId: 'drv-1',
  flowId: 'flow-1',
  draftTxId: null,
  locationId: 'loc-1',
  step: 'complete',
  eventName: 'submit_success',
  onlineStatus: true,
  gpsPermission: 'unknown',
  hasPhoto: true,
  errorCategory: null,
  durationMs: null,
  createdAt: '2026-05-04T10:00:00.000Z',
  payload: {
    txId: 'tx-quick',
    driverName: 'RAJABU',
    locationName: 'Machine A',
    previousScore: 1000,
    currentScore: 1200,
    revenue: 40000,
    netPayable: 34000,
    source: 'server',
  },
};

describe('buildSubmissionNotification', () => {
  it('builds a clear admin notification for cloud submission success', () => {
    const notification = buildSubmissionNotification(baseEvent);

    expect(notification).toEqual(expect.objectContaining({
      type: 'driver_collection_success',
      level: 'info',
      entityType: 'transaction',
      entityId: 'tx-quick',
    }));
    expect(notification?.title).toContain('RAJABU');
    expect(notification?.message).toContain('Machine A');
    expect(notification?.message).toContain('TZS 40,000');
    expect(notification?.message).toContain('1,000 → 1,200');
    expect(notification?.message).toContain('tx-quick');
  });

  it('builds a warning notification for offline queued submissions', () => {
    const notification = buildSubmissionNotification({
      ...baseEvent,
      id: 'event-2',
      eventName: 'submit_offline_queued',
      payload: { ...baseEvent.payload, source: 'offline', fallbackReason: 'network timeout' },
    });

    expect(notification).toEqual(expect.objectContaining({
      type: 'driver_collection_offline',
      level: 'warning',
      entityId: 'tx-quick',
    }));
    expect(notification?.title).toContain('离线');
    expect(notification?.message).toContain('联网同步后');
  });

  it('returns null for unrelated driver flow events', () => {
    expect(buildSubmissionNotification({ ...baseEvent, eventName: 'machine_selected' })).toBeNull();
  });
});
