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
  STALE_THRESHOLD_MS,
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
    expect(result.currentDevicesReporting).toBe(0);
    expect(result.currentPending).toBe(0);
    expect(result.currentRetryWaiting).toBe(0);
    expect(result.currentDeadLetter).toBe(0);
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
    // Recent snapshot should not be stale
    expect(snap.isStale).toBe(false);
  });

  it('aggregates totals across multiple device snapshots', async () => {
    const rows = [
      makeRow({ id: 'dev-a--drv-1', device_id: 'dev-a', driver_id: 'drv-1', pending_count: 2, retry_waiting_count: 1, dead_letter_count: 0 }),
      makeRow({ id: 'dev-b--drv-2', device_id: 'dev-b', driver_id: 'drv-2', pending_count: 0, retry_waiting_count: 2, dead_letter_count: 3 }),
      makeRow({ id: 'dev-c--drv-3', device_id: 'dev-c', driver_id: 'drv-3', pending_count: 1, retry_waiting_count: 0, dead_letter_count: 1 }),
    ];
    const client = makeSupabaseStub(rows);
    const result = await getFleetDiagnostics(client);

    // All three snapshots are fresh (just created), so current == total
    expect(result.totalDevicesReporting).toBe(3);
    expect(result.totalPending).toBe(3);       // 2 + 0 + 1
    expect(result.totalRetryWaiting).toBe(3);  // 1 + 2 + 0
    expect(result.totalDeadLetter).toBe(4);    // 0 + 3 + 1

    expect(result.currentDevicesReporting).toBe(3);
    expect(result.currentPending).toBe(3);
    expect(result.currentRetryWaiting).toBe(3);
    expect(result.currentDeadLetter).toBe(4);
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
      // newest-first, as Supabase would return with ORDER BY reported_at DESC
      makeRow({ id: 'dev-c--drv-3', device_id: 'dev-c', reported_at: new Date(now).toISOString() }),
      makeRow({ id: 'dev-a--drv-1', device_id: 'dev-a', reported_at: new Date(now - 1000).toISOString() }),
      // oldest
      makeRow({ id: 'dev-b--drv-2', device_id: 'dev-b', reported_at: new Date(now - 5000).toISOString() }),
    ];
    const client = makeSupabaseStub(rows);
    const result = await getFleetDiagnostics(client);

    // Order is preserved exactly as returned (newest-first from Supabase)
    expect(result.snapshots.map(s => s.deviceId)).toEqual(['dev-c', 'dev-a', 'dev-b']);
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

  it('marks snapshots older than STALE_THRESHOLD_MS as isStale=true', async () => {
    const now = Date.now();
    const staleAge = STALE_THRESHOLD_MS + 60_000; // 1 min past the threshold
    const rows = [
      makeRow({ id: 'fresh--drv-1', device_id: 'fresh', reported_at: new Date(now - 1000).toISOString() }),
      makeRow({ id: 'stale--drv-2', device_id: 'stale', reported_at: new Date(now - staleAge).toISOString() }),
    ];
    const client = makeSupabaseStub(rows);
    const result = await getFleetDiagnostics(client);

    const freshSnap = result.snapshots.find((s) => s.deviceId === 'fresh')!;
    const staleSnap = result.snapshots.find((s) => s.deviceId === 'stale')!;
    expect(freshSnap.isStale).toBe(false);
    expect(staleSnap.isStale).toBe(true);
  });

  it('excludes stale snapshots from current* totals but includes them in total* totals', async () => {
    const now = Date.now();
    const staleAge = STALE_THRESHOLD_MS + 60_000;
    const rows = [
      // Two fresh snapshots
      makeRow({
        id: 'fresh-a--drv-1', device_id: 'fresh-a', driver_id: 'drv-1',
        pending_count: 3, retry_waiting_count: 1, dead_letter_count: 2,
        reported_at: new Date(now - 1000).toISOString(),
      }),
      makeRow({
        id: 'fresh-b--drv-2', device_id: 'fresh-b', driver_id: 'drv-2',
        pending_count: 1, retry_waiting_count: 0, dead_letter_count: 0,
        reported_at: new Date(now - 5000).toISOString(),
      }),
      // One stale snapshot — should be excluded from current* totals
      makeRow({
        id: 'stale-c--drv-3', device_id: 'stale-c', driver_id: 'drv-3',
        pending_count: 10, retry_waiting_count: 5, dead_letter_count: 7,
        reported_at: new Date(now - staleAge).toISOString(),
      }),
    ];
    const client = makeSupabaseStub(rows);
    const result = await getFleetDiagnostics(client);

    // Current totals — stale snapshot excluded
    expect(result.currentDevicesReporting).toBe(2);
    expect(result.currentPending).toBe(4);        // 3 + 1
    expect(result.currentRetryWaiting).toBe(1);   // 1 + 0
    expect(result.currentDeadLetter).toBe(2);     // 2 + 0

    // Grand totals — stale snapshot included
    expect(result.totalDevicesReporting).toBe(3);
    expect(result.totalPending).toBe(14);         // 3 + 1 + 10
    expect(result.totalRetryWaiting).toBe(6);     // 1 + 0 + 5
    expect(result.totalDeadLetter).toBe(9);       // 2 + 0 + 7

    // All three snapshots are still in the list
    expect(result.snapshots).toHaveLength(3);
  });

  it('sets isStale=true when reportedAt is missing/empty', async () => {
    const row = makeRow({ reported_at: '' });
    const client = makeSupabaseStub([row]);
    const result = await getFleetDiagnostics(client);
    expect(result.snapshots[0].isStale).toBe(true);
    // Missing-timestamp snapshot is treated as stale and excluded from current totals
    expect(result.currentDevicesReporting).toBe(0);
    expect(result.totalDevicesReporting).toBe(1);
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
    expect(row.reported_at).toBeUndefined();
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

// ── post-replay fleet health reporting ────────────────────────────────────────

describe('post-replay fleet health reporting', () => {
  it('reports zero dead-letter count after a successful replay clears the item', async () => {
    const {
      reportQueueHealthToServer,
      enqueueTransaction,
      replayDeadLetterItem,
    } = await import('../offlineQueue');

    const tx = {
      id: 'tx-replay-fleet',
      timestamp: new Date().toISOString(),
      locationId: 'loc-2',
      locationName: 'Replay Location',
      driverId: 'drv-replay',
      driverName: 'Replay Driver',
      previousScore: 0,
      currentScore: 50,
      revenue: 10000,
      commission: 1500,
      ownerRetention: 1500,
      debtDeduction: 0,
      startupDebtDeduction: 0,
      expenses: 0,
      coinExchange: 0,
      extraIncome: 0,
      netPayable: 7000,
      gps: { lat: -6.8, lng: 39.3 },
      dataUsageKB: 5,
      isSynced: false,
      type: 'payout_request', // no rawInput needed — uses direct upsert path
    } as any;
    await enqueueTransaction(tx);

    // Dead-letter the item
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw[0].retryCount = MAX_RETRIES;
    raw[0].lastError = 'Upsert failed';
    raw[0].lastErrorCategory = 'transient';
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    // Before replay: fleet snapshot should show 1 dead-letter item
    const upsertBeforeMock = jest.fn().mockResolvedValue({ error: null });
    const clientBefore = { from: jest.fn().mockReturnValue({ upsert: upsertBeforeMock }) } as any;
    await reportQueueHealthToServer(clientBefore, 'drv-replay', 'Replay Driver', 'dev-replay');
    const [rowBefore] = upsertBeforeMock.mock.calls[0] as any[];
    expect(rowBefore.dead_letter_count).toBe(1);

    // Replay the dead-letter item successfully
    const replayClient = {
      from: jest.fn().mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) }),
    } as any;
    const replayResult = await replayDeadLetterItem(tx.id, { supabaseClient: replayClient });
    expect(replayResult.success).toBe(true);

    // After replay: fleet snapshot should report 0 dead-letter items
    const upsertAfterMock = jest.fn().mockResolvedValue({ error: null });
    const clientAfter = { from: jest.fn().mockReturnValue({ upsert: upsertAfterMock }) } as any;
    await reportQueueHealthToServer(clientAfter, 'drv-replay', 'Replay Driver', 'dev-replay');
    const [rowAfter] = upsertAfterMock.mock.calls[0] as any[];
    expect(rowAfter.dead_letter_count).toBe(0);
    expect(rowAfter.dead_letter_items).toHaveLength(0);
  });

  it('still reports the item as dead-letter after a failed replay', async () => {
    const {
      reportQueueHealthToServer,
      enqueueTransaction,
      replayDeadLetterItem,
    } = await import('../offlineQueue');

    const tx = {
      id: 'tx-replay-fail',
      timestamp: new Date().toISOString(),
      locationId: 'loc-3',
      locationName: 'Fail Location',
      driverId: 'drv-fail',
      driverName: 'Fail Driver',
      previousScore: 0,
      currentScore: 80,
      revenue: 15000,
      commission: 2000,
      ownerRetention: 2000,
      debtDeduction: 0,
      startupDebtDeduction: 0,
      expenses: 0,
      coinExchange: 0,
      extraIncome: 0,
      netPayable: 11000,
      gps: { lat: -6.8, lng: 39.3 },
      dataUsageKB: 5,
      isSynced: false,
      type: 'payout_request',
    } as any;
    await enqueueTransaction(tx);

    // Dead-letter the item
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw[0].retryCount = MAX_RETRIES;
    raw[0].lastError = 'Original error';
    raw[0].lastErrorCategory = 'permanent';
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    // Replay with a Supabase error — replay fails
    const replayClient = {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: { message: 'DB unavailable' } }),
      }),
    } as any;
    const replayResult = await replayDeadLetterItem(tx.id, { supabaseClient: replayClient });
    expect(replayResult.success).toBe(false);

    // After failed replay: fleet snapshot still shows 1 dead-letter item
    const upsertAfterMock = jest.fn().mockResolvedValue({ error: null });
    const clientAfter = { from: jest.fn().mockReturnValue({ upsert: upsertAfterMock }) } as any;
    await reportQueueHealthToServer(clientAfter, 'drv-fail', 'Fail Driver', 'dev-fail');
    const [rowAfter] = upsertAfterMock.mock.calls[0] as any[];
    expect(rowAfter.dead_letter_count).toBe(1);
    expect(rowAfter.dead_letter_items).toHaveLength(1);
  });
});
