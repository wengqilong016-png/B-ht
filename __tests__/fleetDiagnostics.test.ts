/**
 * __tests__/fleetDiagnostics.test.ts
 *
 * Stage-6: focused tests for fleet-wide queue diagnostics.
 *
 * Coverage:
 *   getFleetDiagnostics:
 *     - Returns an empty summary with zero totals when no rows exist
 *     - Correctly maps all DB column names to camelCase snapshot fields
 *     - Aggregates pending / retry-waiting / dead-letter counts across snapshots
 *     - Throws a descriptive error when the Supabase query fails
 *     - Newest-first ordering is preserved from the Supabase response
 *     - deadLetterItems array is forwarded from the JSONB column
 *
 *   reportQueueHealthToServer (integration with offlineQueue helpers):
 *     - Builds the correct upsert row shape from local queue state
 *     - Uses a stable device ID from localStorage
 *     - Silently swallows Supabase upsert errors (fire-and-forget safety)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  getFleetDiagnostics,
  type FleetDiagnosticsSummary,
  type DeviceQueueSnapshot,
} from '../services/fleetDiagnosticsService';
import { MAX_RETRIES } from '../offlineQueue';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a raw DB row as Supabase would return it. */
function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'device-abc--drv-1',
    device_id: 'device-abc',
    driver_id: 'drv-1',
    driver_name: 'Ali Hassan',
    pending_count: 0,
    retry_waiting_count: 0,
    dead_letter_count: 0,
    dead_letter_items: [],
    reported_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a minimal Supabase client stub. */
function makeSupabaseStub(rows: Record<string, unknown>[], queryError: { message: string } | null = null) {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: queryError ? null : rows,
          error: queryError,
        }),
      }),
    }),
  } as any;
}

// ── getFleetDiagnostics ───────────────────────────────────────────────────────

describe('getFleetDiagnostics', () => {
  it('returns all-zero summary when no rows exist', async () => {
    const client = makeSupabaseStub([]);
    const result = await getFleetDiagnostics(client);

    expect(result.totalDevicesReporting).toBe(0);
    expect(result.totalPending).toBe(0);
    expect(result.totalRetryWaiting).toBe(0);
    expect(result.totalDeadLetter).toBe(0);
    expect(result.snapshots).toHaveLength(0);
    expect(result.fetchedAt).toBeTruthy();
  });

  it('maps DB column names to camelCase snapshot fields', async () => {
    const row = makeRow({
      pending_count: 3,
      retry_waiting_count: 2,
      dead_letter_count: 1,
      dead_letter_items: [{ txId: 'tx-1', retryCount: MAX_RETRIES, locationId: 'loc-1' }],
    });
    const client = makeSupabaseStub([row]);
    const result = await getFleetDiagnostics(client);

    expect(result.snapshots).toHaveLength(1);
    const snap = result.snapshots[0];
    expect(snap.id).toBe('device-abc--drv-1');
    expect(snap.deviceId).toBe('device-abc');
    expect(snap.driverId).toBe('drv-1');
    expect(snap.driverName).toBe('Ali Hassan');
    expect(snap.pendingCount).toBe(3);
    expect(snap.retryWaitingCount).toBe(2);
    expect(snap.deadLetterCount).toBe(1);
    expect(snap.deadLetterItems).toHaveLength(1);
    expect(snap.deadLetterItems[0].txId).toBe('tx-1');
  });

  it('aggregates totals across multiple device snapshots', async () => {
    const rows = [
      makeRow({ id: 'dev-a--drv-1', device_id: 'dev-a', driver_id: 'drv-1', pending_count: 2, retry_waiting_count: 1, dead_letter_count: 0 }),
      makeRow({ id: 'dev-b--drv-2', device_id: 'dev-b', driver_id: 'drv-2', pending_count: 0, retry_waiting_count: 2, dead_letter_count: 3 }),
      makeRow({ id: 'dev-c--drv-3', device_id: 'dev-c', driver_id: 'drv-3', pending_count: 1, retry_waiting_count: 0, dead_letter_count: 1 }),
    ];
    const client = makeSupabaseStub(rows);
    const result = await getFleetDiagnostics(client);

    expect(result.totalDevicesReporting).toBe(3);
    expect(result.totalPending).toBe(3);       // 2 + 0 + 1
    expect(result.totalRetryWaiting).toBe(3);  // 1 + 2 + 0
    expect(result.totalDeadLetter).toBe(4);    // 0 + 3 + 1
  });

  it('throws a descriptive error when the Supabase query fails', async () => {
    const client = makeSupabaseStub([], { message: 'permission denied for table queue_health_reports' });
    await expect(getFleetDiagnostics(client)).rejects.toThrow(
      'Fleet diagnostics query failed: permission denied for table queue_health_reports',
    );
  });

  it('preserves snapshot ordering returned by Supabase (newest-first)', async () => {
    const now = Date.now();
    const rows = [
      makeRow({ id: 'dev-a--drv-1', device_id: 'dev-a', reported_at: new Date(now - 1000).toISOString() }),
      makeRow({ id: 'dev-b--drv-2', device_id: 'dev-b', reported_at: new Date(now - 5000).toISOString() }),
      makeRow({ id: 'dev-c--drv-3', device_id: 'dev-c', reported_at: new Date(now).toISOString() }),
    ];
    const client = makeSupabaseStub(rows);
    const result = await getFleetDiagnostics(client);

    // Order is preserved exactly as returned (newest-first from Supabase)
    expect(result.snapshots.map(s => s.deviceId)).toEqual(['dev-a', 'dev-b', 'dev-c']);
  });

  it('forwards dead_letter_items JSONB array as DeadLetterSummaryItem[]', async () => {
    const deadLetterItems = [
      {
        txId: 'tx-dead-1',
        operationId: 'op-1',
        lastError: 'Location not found',
        lastErrorCategory: 'permanent',
        retryCount: MAX_RETRIES,
        locationId: 'loc-1',
        locationName: 'Shop A',
        queuedAt: new Date().toISOString(),
      },
    ];
    const row = makeRow({ dead_letter_count: 1, dead_letter_items: deadLetterItems });
    const client = makeSupabaseStub([row]);
    const result = await getFleetDiagnostics(client);

    const items = result.snapshots[0].deadLetterItems;
    expect(items).toHaveLength(1);
    expect(items[0].txId).toBe('tx-dead-1');
    expect(items[0].lastError).toBe('Location not found');
    expect(items[0].lastErrorCategory).toBe('permanent');
    expect(items[0].retryCount).toBe(MAX_RETRIES);
    expect(items[0].locationName).toBe('Shop A');
  });

  it('defaults missing dead_letter_items to empty array', async () => {
    const row = makeRow({ dead_letter_items: null });
    const client = makeSupabaseStub([row]);
    const result = await getFleetDiagnostics(client);
    expect(result.snapshots[0].deadLetterItems).toEqual([]);
  });
});

// ── reportQueueHealthToServer ─────────────────────────────────────────────────

// Force localStorage fallback (jsdom has no IndexedDB).
let originalIndexedDB: typeof globalThis['indexedDB'];
beforeEach(() => {
  originalIndexedDB = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', {
    value: undefined, configurable: true, writable: true,
  });
  localStorage.clear();
});
afterEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: originalIndexedDB, configurable: true, writable: true,
  });
  localStorage.clear();
  jest.resetModules();
});

describe('reportQueueHealthToServer', () => {
  it('upserts a row with correct shape from local queue state', async () => {
    const { reportQueueHealthToServer, enqueueTransaction } = await import('../offlineQueue');

    // Add a pending transaction to the local queue
    await enqueueTransaction({
      id: 'tx-pending',
      timestamp: new Date().toISOString(),
      locationId: 'loc-1',
      locationName: 'Test Location',
      driverId: 'drv-1',
      driverName: 'Test Driver',
      previousScore: 0,
      currentScore: 100,
      revenue: 20000,
      commission: 3000,
      ownerRetention: 3000,
      debtDeduction: 0,
      startupDebtDeduction: 0,
      expenses: 0,
      coinExchange: 0,
      extraIncome: 0,
      netPayable: 17000,
      gps: { lat: -6.8, lng: 39.3 },
      dataUsageKB: 10,
      isSynced: false,
      type: 'collection',
    } as any);

    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    const client = { from: jest.fn().mockReturnValue({ upsert: upsertMock }) } as any;

    await reportQueueHealthToServer(client, 'drv-1', 'Test Driver', 'device-test');

    expect(client.from).toHaveBeenCalledWith('queue_health_reports');
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const [row] = upsertMock.mock.calls[0] as any[];
    expect(row.id).toBe('device-test--drv-1');
    expect(row.device_id).toBe('device-test');
    expect(row.driver_id).toBe('drv-1');
    expect(row.driver_name).toBe('Test Driver');
    expect(row.pending_count).toBe(1);
    expect(row.retry_waiting_count).toBe(0);
    expect(row.dead_letter_count).toBe(0);
    expect(Array.isArray(row.dead_letter_items)).toBe(true);
    expect(typeof row.reported_at).toBe('string');
  });

  it('uses a stable device ID from localStorage when none is provided', async () => {
    const { reportQueueHealthToServer, getOrCreateDeviceId } = await import('../offlineQueue');
    const stableId = getOrCreateDeviceId();

    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    const client = { from: jest.fn().mockReturnValue({ upsert: upsertMock }) } as any;

    await reportQueueHealthToServer(client, 'drv-2', 'Jane Driver');

    const [row] = upsertMock.mock.calls[0] as any[];
    expect(row.id).toBe(`${stableId}--drv-2`);
    expect(row.device_id).toBe(stableId);
  });

  it('silently swallows Supabase upsert errors without throwing', async () => {
    const { reportQueueHealthToServer } = await import('../offlineQueue');
    const upsertMock = jest.fn().mockResolvedValue({ error: { message: 'network error' } });
    const client = { from: jest.fn().mockReturnValue({ upsert: upsertMock }) } as any;

    // Should not throw
    await expect(
      reportQueueHealthToServer(client, 'drv-1', 'Test Driver', 'dev-1'),
    ).resolves.toBeUndefined();
  });

  it('includes dead-letter items in the upsert row', async () => {
    const { reportQueueHealthToServer, enqueueTransaction } = await import('../offlineQueue');

    const tx = {
      id: 'tx-dead',
      timestamp: new Date().toISOString(),
      locationId: 'loc-1',
      locationName: 'Dead Location',
      driverId: 'drv-1',
      driverName: 'Test Driver',
      previousScore: 0,
      currentScore: 100,
      revenue: 20000,
      commission: 3000,
      ownerRetention: 3000,
      debtDeduction: 0,
      startupDebtDeduction: 0,
      expenses: 0,
      coinExchange: 0,
      extraIncome: 0,
      netPayable: 17000,
      gps: { lat: -6.8, lng: 39.3 },
      dataUsageKB: 10,
      isSynced: false,
      type: 'collection',
    } as any;
    await enqueueTransaction(tx);

    // Manually dead-letter the item
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw[0].retryCount = MAX_RETRIES;
    raw[0].lastError = 'Location not found';
    raw[0].lastErrorCategory = 'permanent';
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    const client = { from: jest.fn().mockReturnValue({ upsert: upsertMock }) } as any;

    await reportQueueHealthToServer(client, 'drv-1', 'Test Driver', 'dev-1');

    const [row] = upsertMock.mock.calls[0] as any[];
    expect(row.dead_letter_count).toBe(1);
    expect(row.dead_letter_items).toHaveLength(1);
    expect(row.dead_letter_items[0].txId).toBe('tx-dead');
    expect(row.dead_letter_items[0].lastError).toBe('Location not found');
    expect(row.dead_letter_items[0].lastErrorCategory).toBe('permanent');
    expect(row.dead_letter_items[0].locationName).toBe('Dead Location');
  });
});
