/**
 * __tests__/healthAlerts.test.ts
 *
 * Stage-8: focused tests for background health alert generation.
 *
 * Coverage:
 *   generateAlertsFromSnapshots:
 *     - Returns an empty array when there are no snapshots
 *     - Returns an empty array when all snapshots are healthy
 *     - Generates a critical alert for a device with dead-letter items
 *     - Generates a warning alert for a stale snapshot
 *     - Generates a warning alert when retry-waiting exceeds threshold
 *     - Generates an info alert when pending count exceeds threshold
 *     - Generates multiple alerts for the same device when multiple conditions hold
 *     - Sorts alerts: critical first, then warning, then info
 *     - Within same severity, alerts are sorted by driverName
 *     - Alert id is deterministic: `${type}--${snapshotId}`
 *     - Alert detectedAt is an ISO-8601 timestamp
 *
 *   Threshold boundary conditions:
 *     - Dead-letter alert fires at exactly DEAD_LETTER_ALERT_THRESHOLD
 *     - High-retry-waiting alert does NOT fire at exactly HIGH_RETRY_WAITING_THRESHOLD (requires >)
 *     - High-pending alert does NOT fire at exactly HIGH_PENDING_THRESHOLD (requires >)
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  generateAlertsFromSnapshots,
  fetchPersistedAlerts,
  DEAD_LETTER_ALERT_THRESHOLD,
  HIGH_RETRY_WAITING_THRESHOLD,
  HIGH_PENDING_THRESHOLD,
  type HealthAlert,
} from '../services/healthAlertService';
import { STALE_THRESHOLD_MS, type DeviceQueueSnapshot } from '../services/fleetDiagnosticsService';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a healthy, non-stale device snapshot. */
function makeSnapshot(overrides: Partial<DeviceQueueSnapshot> = {}): DeviceQueueSnapshot {
  return {
    id: 'device-abc--drv-1',
    deviceId: 'device-abc',
    driverId: 'drv-1',
    driverName: 'Ali Hassan',
    pendingCount: 0,
    retryWaitingCount: 0,
    deadLetterCount: 0,
    deadLetterItems: [],
    reportedAt: new Date().toISOString(),
    isStale: false,
    ...overrides,
  };
}

/** Returns an ISO timestamp `hoursAgo` hours in the past. */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

// ── generateAlertsFromSnapshots ───────────────────────────────────────────────

describe('generateAlertsFromSnapshots', () => {
  it('returns an empty array when snapshots list is empty', () => {
    expect(generateAlertsFromSnapshots([])).toEqual([]);
  });

  it('returns an empty array when all snapshots are healthy', () => {
    const snapshots = [
      makeSnapshot({ id: 'dev-a--drv-1' }),
      makeSnapshot({ id: 'dev-b--drv-2', driverId: 'drv-2', driverName: 'Baraka Mwenda' }),
    ];
    expect(generateAlertsFromSnapshots(snapshots)).toEqual([]);
  });

  // ── Dead-letter alerts ──────────────────────────────────────────────────────

  it('generates a critical alert when dead-letter count meets the threshold', () => {
    const snapshot = makeSnapshot({ deadLetterCount: DEAD_LETTER_ALERT_THRESHOLD });
    const alerts = generateAlertsFromSnapshots([snapshot]);

    expect(alerts).toHaveLength(1);
    const alert = alerts[0];
    expect(alert.severity).toBe('critical');
    expect(alert.type).toBe('dead_letter_items');
    expect(alert.deviceId).toBe('device-abc');
    expect(alert.driverId).toBe('drv-1');
    expect(alert.driverName).toBe('Ali Hassan');
    expect(alert.message).toContain('dead-letter');
    expect(alert.message).toContain('Ali Hassan');
    expect(alert.id).toBe(`dead_letter_items--${snapshot.id}`);
  });

  it('does NOT generate a dead-letter alert when count is below threshold', () => {
    const snapshot = makeSnapshot({ deadLetterCount: DEAD_LETTER_ALERT_THRESHOLD - 1 });
    expect(generateAlertsFromSnapshots([snapshot])).toHaveLength(0);
  });

  // ── Stale snapshot alerts ───────────────────────────────────────────────────

  it('generates a warning alert for a stale snapshot', () => {
    const snapshot = makeSnapshot({
      isStale: true,
      reportedAt: hoursAgo(3),
    });
    const alerts = generateAlertsFromSnapshots([snapshot]);

    expect(alerts).toHaveLength(1);
    const alert = alerts[0];
    expect(alert.severity).toBe('warning');
    expect(alert.type).toBe('stale_snapshot');
    expect(alert.id).toBe(`stale_snapshot--${snapshot.id}`);
    expect(alert.message).toContain('stale');
  });

  it('does NOT generate a stale alert for a fresh snapshot', () => {
    const snapshot = makeSnapshot({ isStale: false, reportedAt: new Date().toISOString() });
    expect(generateAlertsFromSnapshots([snapshot])).toHaveLength(0);
  });

  // ── High retry-waiting alerts ───────────────────────────────────────────────

  it('generates a warning alert when retry-waiting count exceeds threshold', () => {
    const snapshot = makeSnapshot({ retryWaitingCount: HIGH_RETRY_WAITING_THRESHOLD + 1 });
    const alerts = generateAlertsFromSnapshots([snapshot]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].type).toBe('high_retry_waiting');
    expect(alerts[0].message).toContain(`${HIGH_RETRY_WAITING_THRESHOLD + 1}`);
  });

  it('does NOT generate a high-retry-waiting alert at exactly the threshold', () => {
    const snapshot = makeSnapshot({ retryWaitingCount: HIGH_RETRY_WAITING_THRESHOLD });
    expect(generateAlertsFromSnapshots([snapshot])).toHaveLength(0);
  });

  // ── High pending alerts ─────────────────────────────────────────────────────

  it('generates an info alert when pending count exceeds threshold', () => {
    const snapshot = makeSnapshot({ pendingCount: HIGH_PENDING_THRESHOLD + 1 });
    const alerts = generateAlertsFromSnapshots([snapshot]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('info');
    expect(alerts[0].type).toBe('high_pending');
    expect(alerts[0].message).toContain(`${HIGH_PENDING_THRESHOLD + 1}`);
  });

  it('does NOT generate a high-pending alert at exactly the threshold', () => {
    const snapshot = makeSnapshot({ pendingCount: HIGH_PENDING_THRESHOLD });
    expect(generateAlertsFromSnapshots([snapshot])).toHaveLength(0);
  });

  // ── Multiple alerts for one device ─────────────────────────────────────────

  it('generates multiple alerts for a single device that has several issues', () => {
    const snapshot = makeSnapshot({
      deadLetterCount: 2,
      isStale: true,
      reportedAt: hoursAgo(5),
      retryWaitingCount: HIGH_RETRY_WAITING_THRESHOLD + 3,
      pendingCount: HIGH_PENDING_THRESHOLD + 10,
    });
    const alerts = generateAlertsFromSnapshots([snapshot]);

    // All four conditions should fire
    expect(alerts).toHaveLength(4);
    const types = alerts.map((a) => a.type);
    expect(types).toContain('dead_letter_items');
    expect(types).toContain('stale_snapshot');
    expect(types).toContain('high_retry_waiting');
    expect(types).toContain('high_pending');
  });

  // ── Severity ordering ───────────────────────────────────────────────────────

  it('sorts alerts: critical first, then warning, then info', () => {
    const snapshots = [
      makeSnapshot({ id: 'dev-a--drv-1', driverId: 'drv-1', driverName: 'A', pendingCount: HIGH_PENDING_THRESHOLD + 1 }),
      makeSnapshot({ id: 'dev-b--drv-2', driverId: 'drv-2', driverName: 'B', isStale: true, reportedAt: hoursAgo(3) }),
      makeSnapshot({ id: 'dev-c--drv-3', driverId: 'drv-3', driverName: 'C', deadLetterCount: 1 }),
    ];
    const alerts = generateAlertsFromSnapshots(snapshots);

    expect(alerts.length).toBeGreaterThanOrEqual(3);
    const severities = alerts.map((a) => a.severity);
    // All criticals before all warnings before all infos
    const firstWarning = severities.indexOf('warning');
    const firstInfo = severities.indexOf('info');
    const lastCritical = severities.lastIndexOf('critical');
    expect(lastCritical).toBeLessThan(firstWarning === -1 ? Infinity : firstWarning);
    if (firstWarning !== -1 && firstInfo !== -1) {
      const lastWarning = severities.lastIndexOf('warning');
      expect(lastWarning).toBeLessThan(firstInfo);
    }
  });

  it('sorts within same severity by driverName', () => {
    const snapshots = [
      makeSnapshot({ id: 'dev-z--drv-z', driverId: 'drv-z', driverName: 'Zawadi Ngugi', deadLetterCount: 1 }),
      makeSnapshot({ id: 'dev-a--drv-a', driverId: 'drv-a', driverName: 'Amina Salim', deadLetterCount: 1 }),
      makeSnapshot({ id: 'dev-m--drv-m', driverId: 'drv-m', driverName: 'Mohamed Juma', deadLetterCount: 1 }),
    ];
    const alerts = generateAlertsFromSnapshots(snapshots);

    const names = alerts.map((a) => a.driverName);
    expect(names).toEqual(['Amina Salim', 'Mohamed Juma', 'Zawadi Ngugi']);
  });

  // ── ID determinism ──────────────────────────────────────────────────────────

  it('produces a deterministic id of the form `${type}--${snapshotId}`', () => {
    const snapshot = makeSnapshot({ id: 'device-xyz--drv-99', deadLetterCount: 1 });
    const alerts = generateAlertsFromSnapshots([snapshot]);

    expect(alerts[0].id).toBe('dead_letter_items--device-xyz--drv-99');
  });

  // ── detectedAt ──────────────────────────────────────────────────────────────

  it('sets detectedAt to an ISO-8601 timestamp close to now', () => {
    const before = Date.now();
    const snapshot = makeSnapshot({ deadLetterCount: 1 });
    const alerts = generateAlertsFromSnapshots([snapshot]);
    const after = Date.now();

    const ts = new Date(alerts[0].detectedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ── fetchPersistedAlerts ──────────────────────────────────────────────────────

/** Build a minimal Supabase client stub that returns persisted alert rows. */
function makeAlertClientStub(
  rows: Record<string, unknown>[],
  queryError: { message: string } | null = null,
) {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        is: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: queryError ? null : rows,
            error: queryError,
          }),
        }),
      }),
    }),
  } as any;
}

/** Build a raw DB row as Supabase would return it from `health_alerts`. */
function makeAlertRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'dead_letter_items--device-abc--drv-1',
    alert_type: 'dead_letter_items',
    severity: 'critical',
    device_id: 'device-abc',
    driver_id: 'drv-1',
    driver_name: 'Ali Hassan',
    message: 'Ali Hassan: 1 dead-letter item — manual replay required',
    detected_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('fetchPersistedAlerts', () => {
  it('returns an empty array when the health_alerts table has no active rows', async () => {
    const client = makeAlertClientStub([]);
    const alerts = await fetchPersistedAlerts(client);
    expect(alerts).toEqual([]);
  });

  it('maps DB columns to HealthAlert fields correctly', async () => {
    const row = makeAlertRow();
    const client = makeAlertClientStub([row]);
    const alerts = await fetchPersistedAlerts(client);

    expect(alerts).toHaveLength(1);
    const alert = alerts[0];
    expect(alert.id).toBe(row['id']);
    expect(alert.type).toBe(row['alert_type']);
    expect(alert.severity).toBe(row['severity']);
    expect(alert.deviceId).toBe(row['device_id']);
    expect(alert.driverId).toBe(row['driver_id']);
    expect(alert.driverName).toBe(row['driver_name']);
    expect(alert.message).toBe(row['message']);
    expect(alert.detectedAt).toBe(row['detected_at']);
  });

  it('sorts returned alerts: critical first, warning second, info last', async () => {
    const rows = [
      makeAlertRow({ id: 'high_pending--dev-a--drv-a', alert_type: 'high_pending', severity: 'info', driver_name: 'A' }),
      makeAlertRow({ id: 'stale_snapshot--dev-b--drv-b', alert_type: 'stale_snapshot', severity: 'warning', driver_name: 'B' }),
      makeAlertRow({ id: 'dead_letter_items--dev-c--drv-c', alert_type: 'dead_letter_items', severity: 'critical', driver_name: 'C' }),
    ];
    const client = makeAlertClientStub(rows);
    const alerts = await fetchPersistedAlerts(client);

    expect(alerts[0].severity).toBe('critical');
    expect(alerts[1].severity).toBe('warning');
    expect(alerts[2].severity).toBe('info');
  });

  it('sorts within the same severity by driverName', async () => {
    const rows = [
      makeAlertRow({ id: 'dead_letter_items--dev-z', alert_type: 'dead_letter_items', severity: 'critical', driver_name: 'Zawadi Ngugi' }),
      makeAlertRow({ id: 'dead_letter_items--dev-a', alert_type: 'dead_letter_items', severity: 'critical', driver_name: 'Amina Salim' }),
      makeAlertRow({ id: 'dead_letter_items--dev-m', alert_type: 'dead_letter_items', severity: 'critical', driver_name: 'Mohamed Juma' }),
    ];
    const client = makeAlertClientStub(rows);
    const alerts = await fetchPersistedAlerts(client);

    const names = alerts.map((a) => a.driverName);
    expect(names).toEqual(['Amina Salim', 'Mohamed Juma', 'Zawadi Ngugi']);
  });

  it('throws a descriptive error when the Supabase query fails', async () => {
    const client = makeAlertClientStub([], { message: 'permission denied' });
    await expect(fetchPersistedAlerts(client)).rejects.toThrow('Health alerts query failed: permission denied');
  });

  it('queries only unresolved (resolved_at IS NULL) alerts', async () => {
    const client = makeAlertClientStub([]);
    await fetchPersistedAlerts(client);

    // Verify .is('resolved_at', null) was called on the query chain
    const fromCall = (client.from as ReturnType<typeof jest.fn>).mock.results[0].value;
    const selectCall = fromCall.select.mock.results[0].value;
    expect(selectCall.is).toHaveBeenCalledWith('resolved_at', null);
  });
});
