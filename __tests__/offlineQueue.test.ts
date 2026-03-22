/**
 * __tests__/offlineQueue.test.ts
 * Tests for the IndexedDB-backed offline transaction queue.
 *
 * jsdom does not ship a real IndexedDB implementation, so these tests exercise
 * the localStorage fallback path by removing indexedDB from the window object.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ── helpers ────────────────────────────────────────────────────────────────────

/** Minimal valid Transaction stub for testing. */
function makeTx(overrides: Partial<Record<string, unknown>> = {}): any {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    locationId: 'loc-1',
    locationName: 'Test Location',
    driverId: 'drv-1',
    driverName: 'Test Driver',
    previousScore: 100,
    currentScore: 200,
    revenue: 100,
    commission: 15,
    ownerRetention: 85,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 85,
    gps: { lat: -6.8, lng: 39.3 },
    dataUsageKB: 10,
    isSynced: false,
    ...overrides,
  };
}

// ── Setup: force localStorage fallback by making indexedDB unavailable ─────────
let originalIndexedDB: typeof globalThis['indexedDB'];

beforeEach(() => {
  originalIndexedDB = globalThis.indexedDB;
  // Remove indexedDB so the queue falls back to localStorage
  Object.defineProperty(globalThis, 'indexedDB', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  localStorage.clear();
});

afterEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: originalIndexedDB,
    configurable: true,
    writable: true,
  });
  localStorage.clear();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('offlineQueue — localStorage fallback', () => {
  it('enqueueTransaction stores a transaction with isSynced=false', async () => {
    const { enqueueTransaction } = await import('../offlineQueue');
    const tx = makeTx({ isSynced: true }); // even if caller passes true, queue overrides to false
    await enqueueTransaction(tx);

    const raw = localStorage.getItem('bahati_offline_queue');
    expect(raw).not.toBeNull();
    const list = JSON.parse(raw!);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(tx.id);
    expect(list[0].isSynced).toBe(false);
  });

  it('enqueueTransaction deduplicates by id', async () => {
    const { enqueueTransaction } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx);
    await enqueueTransaction({ ...tx, revenue: 999 }); // same id, different data

    const list = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    expect(list).toHaveLength(1);
    expect(list[0].revenue).toBe(999);
  });

  it('getPendingTransactions returns only unsynced items', async () => {
    // Seed localStorage manually with mixed sync states
    const syncedTx  = makeTx({ isSynced: true });
    const pendingTx = makeTx({ isSynced: false });
    localStorage.setItem(
      'bahati_offline_queue',
      JSON.stringify([syncedTx, pendingTx])
    );

    const { getPendingTransactions } = await import('../offlineQueue');
    const result = await getPendingTransactions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(pendingTx.id);
  });

  it('getPendingTransactions returns [] when queue is empty', async () => {
    const { getPendingTransactions } = await import('../offlineQueue');
    const result = await getPendingTransactions();
    expect(result).toHaveLength(0);
  });

  it('markSynced marks the matching transaction as isSynced=true', async () => {
    const { enqueueTransaction, markSynced, getPendingTransactions } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx);

    // Confirm it is pending before marking
    let pending = await getPendingTransactions();
    expect(pending).toHaveLength(1);

    await markSynced(tx.id);

    pending = await getPendingTransactions();
    expect(pending).toHaveLength(0);

    // Verify it still exists in raw storage with isSynced=true
    const all = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const found = all.find((t: any) => t.id === tx.id);
    expect(found?.isSynced).toBe(true);
  });

  it('enqueueTransaction includes QueueMeta fields', async () => {
    const { enqueueTransaction } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx);

    const list = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    expect(list).toHaveLength(1);
    const entry = list[0];
    expect(entry.operationId).toBeDefined();
    expect(typeof entry.operationId).toBe('string');
    expect(entry.operationId).toMatch(/^op-/);
    expect(entry.entityVersion).toBeDefined();
    expect(typeof entry.entityVersion).toBe('number');
    expect(entry._queuedAt).toBeDefined();
    expect(entry.retryCount).toBe(0);
  });

  it('getQueueSize reflects the number of pending transactions', async () => {
    const { enqueueTransaction, getQueueSize } = await import('../offlineQueue');
    expect(await getQueueSize()).toBe(0);

    await enqueueTransaction(makeTx());
    expect(await getQueueSize()).toBe(1);

    await enqueueTransaction(makeTx());
    expect(await getQueueSize()).toBe(2);
  });

  it('estimateLocationFromContext prefers locationCoords over lastKnownGps', async () => {
    const { estimateLocationFromContext } = await import('../offlineQueue');
    const locationCoords = { lat: -6.8, lng: 39.3 };
    const lastKnownGps   = { lat: -1.0, lng: 37.0 };
    const result = estimateLocationFromContext(lastKnownGps, locationCoords);
    expect(result?.lat).toBe(locationCoords.lat);
    expect(result?.lng).toBe(locationCoords.lng);
    expect(result?.isEstimated).toBe(true);
  });

  it('estimateLocationFromContext falls back to lastKnownGps when locationCoords is null', async () => {
    const { estimateLocationFromContext } = await import('../offlineQueue');
    const lastKnownGps = { lat: -1.0, lng: 37.0 };
    const result = estimateLocationFromContext(lastKnownGps, null);
    expect(result?.lat).toBe(lastKnownGps.lat);
    expect(result?.isEstimated).toBe(true);
  });

  it('estimateLocationFromContext returns null when both inputs are null', async () => {
    const { estimateLocationFromContext } = await import('../offlineQueue');
    expect(estimateLocationFromContext(null, null)).toBeNull();
  });
});
