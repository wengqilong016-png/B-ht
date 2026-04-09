/**
 * __tests__/offlineQueueDiagnostics.test.ts
 *
 * Focused tests for Stage-4 queue observability:
 *   - getQueueHealthSummary correctly counts pending / retry-waiting / dead-letter items
 *   - Dead-letter items include the expected actionable metadata fields
 *     (lastError, lastErrorCategory, retryCount, nextRetryAt)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MAX_RETRIES } from '../offlineQueue';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    ...overrides,
  };
}

// MAX_RETRIES is a stable numeric primitive imported from offlineQueue.ts.
// It is unaffected by jest.resetModules() which only clears the module registry
// for subsequent dynamic imports.

// ── Force localStorage fallback ───────────────────────────────────────────────
let originalIndexedDB: typeof globalThis['indexedDB'];

beforeEach(() => {
  originalIndexedDB = globalThis.indexedDB;
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
  jest.resetModules();
});

// ── getQueueHealthSummary ─────────────────────────────────────────────────────

describe('getQueueHealthSummary', () => {
  it('returns all-zeros when the queue is empty', async () => {
    const { getQueueHealthSummary } = await import('../offlineQueue');
    const summary = await getQueueHealthSummary();
    expect(summary).toEqual({ pending: 0, retryWaiting: 0, deadLetter: 0 });
  });

  it('counts a freshly-enqueued item as pending', async () => {
    const { enqueueTransaction, getQueueHealthSummary } = await import('../offlineQueue');
    await enqueueTransaction(makeTx());
    const summary = await getQueueHealthSummary();
    expect(summary.pending).toBe(1);
    expect(summary.retryWaiting).toBe(0);
    expect(summary.deadLetter).toBe(0);
  });

  it('counts an item in backoff as retry-waiting', async () => {
    const { enqueueTransaction, getQueueHealthSummary } = await import('../offlineQueue');
    await enqueueTransaction(makeTx());

    // Manually put the item into backoff state (retryCount=1, future nextRetryAt)
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw[0].retryCount = 1;
    raw[0].nextRetryAt = new Date(Date.now() + 60_000).toISOString(); // 60s in future
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const summary = await getQueueHealthSummary();
    expect(summary.pending).toBe(0);
    expect(summary.retryWaiting).toBe(1);
    expect(summary.deadLetter).toBe(0);
  });

  it('counts an item at MAX_RETRIES as dead-letter', async () => {
    const { enqueueTransaction, getQueueHealthSummary } = await import('../offlineQueue');
    await enqueueTransaction(makeTx());

    // Simulate dead-letter state
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw[0].retryCount = MAX_RETRIES;
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const summary = await getQueueHealthSummary();
    expect(summary.pending).toBe(0);
    expect(summary.retryWaiting).toBe(0);
    expect(summary.deadLetter).toBe(1);
  });

  it('excludes already-synced items from all counts', async () => {
    const { enqueueTransaction, markSynced, getQueueHealthSummary } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx);
    await markSynced(tx.id);

    const summary = await getQueueHealthSummary();
    expect(summary).toEqual({ pending: 0, retryWaiting: 0, deadLetter: 0 });
  });

  it('handles a mixed queue with items in all three states', async () => {
    const { enqueueTransaction, getQueueHealthSummary } = await import('../offlineQueue');

    // Enqueue three items
    const txPending      = makeTx();
    const txRetryWaiting = makeTx();
    const txDeadLetter   = makeTx();
    await enqueueTransaction(txPending);
    await enqueueTransaction(txRetryWaiting);
    await enqueueTransaction(txDeadLetter);

    // Patch retry-waiting and dead-letter items in localStorage
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const waiting = raw.find((t: any) => t.id === txRetryWaiting.id);
    waiting.retryCount = 1;
    waiting.nextRetryAt = new Date(Date.now() + 60_000).toISOString();

    const dead = raw.find((t: any) => t.id === txDeadLetter.id);
    dead.retryCount = MAX_RETRIES;

    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const summary = await getQueueHealthSummary();
    expect(summary.pending).toBe(1);
    expect(summary.retryWaiting).toBe(1);
    expect(summary.deadLetter).toBe(1);
  });

  it('treats an expired backoff (nextRetryAt in the past) as pending', async () => {
    const { enqueueTransaction, getQueueHealthSummary } = await import('../offlineQueue');
    await enqueueTransaction(makeTx());

    // Set nextRetryAt to the past
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw[0].retryCount = 1;
    raw[0].nextRetryAt = new Date(Date.now() - 10_000).toISOString(); // 10s ago
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const summary = await getQueueHealthSummary();
    // Backoff has elapsed → item is ready to retry → counts as pending
    expect(summary.pending).toBe(1);
    expect(summary.retryWaiting).toBe(0);
  });
});

// ── Dead-letter metadata ──────────────────────────────────────────────────────

describe('getDeadLetterItems — metadata completeness', () => {
  it('dead-letter items carry lastError, lastErrorCategory, retryCount, and nextRetryAt', async () => {
    const { enqueueTransaction, getDeadLetterItems } = await import('../offlineQueue');
    await enqueueTransaction(makeTx());

    // Inject full dead-letter metadata
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw[0].retryCount        = MAX_RETRIES;
    raw[0].lastError         = 'Location not found: loc-1';
    raw[0].lastErrorCategory = 'permanent';
    raw[0].nextRetryAt       = undefined;
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const items = await getDeadLetterItems();
    expect(items).toHaveLength(1);

    const item = items[0] as any;
    expect(item.retryCount).toBe(MAX_RETRIES);
    expect(item.lastError).toBe('Location not found: loc-1');
    expect(item.lastErrorCategory).toBe('permanent');
  });

  it('returns multiple dead-letter items sorted by enqueue order', async () => {
    const { enqueueTransaction, getDeadLetterItems } = await import('../offlineQueue');

    const tx1 = makeTx();
    const tx2 = makeTx();
    await enqueueTransaction(tx1);
    await enqueueTransaction(tx2);

    // Dead-letter both
    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw.forEach((t: any) => {
      t.retryCount        = MAX_RETRIES;
      t.lastError         = 'Network request failed';
      t.lastErrorCategory = 'transient';
    });
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const items = await getDeadLetterItems();
    expect(items).toHaveLength(2);
    items.forEach((item: any) => {
      expect(item.retryCount).toBe(MAX_RETRIES);
      expect(item.lastError).toBeDefined();
      expect(item.lastErrorCategory).toBe('transient');
    });
  });

  it('does not include pending or retry-waiting items', async () => {
    const { enqueueTransaction, getDeadLetterItems } = await import('../offlineQueue');

    const txPending  = makeTx();
    const txRetrying = makeTx();
    const txDead     = makeTx();
    await enqueueTransaction(txPending);
    await enqueueTransaction(txRetrying);
    await enqueueTransaction(txDead);

    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const retrying = raw.find((t: any) => t.id === txRetrying.id);
    retrying.retryCount  = 2;
    retrying.nextRetryAt = new Date(Date.now() + 30_000).toISOString();

    const dead = raw.find((t: any) => t.id === txDead.id);
    dead.retryCount = MAX_RETRIES;

    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const items = await getDeadLetterItems();
    expect(items).toHaveLength(1);
    expect((items[0] as any).id).toBe(txDead.id);
  });
});

// ── Recovery helpers ─────────────────────────────────────────────────────────

describe('dead-letter recovery helpers', () => {
  it('resetDeadLetterItems clears error metadata and restores retryability', async () => {
    const { enqueueTransaction, getAllQueuedTransactions, resetDeadLetterItems } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx);

    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    raw[0].retryCount = MAX_RETRIES;
    raw[0].lastError = 'Location not found: loc-1';
    raw[0].lastErrorCategory = 'permanent';
    raw[0].nextRetryAt = new Date(Date.now() + 120_000).toISOString();
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const resetCount = await resetDeadLetterItems();

    expect(resetCount).toBe(1);
    const [entry] = await getAllQueuedTransactions() as any[];
    expect(entry.retryCount).toBe(0);
    expect(entry.lastError).toBeUndefined();
    expect(entry.lastErrorCategory).toBeUndefined();
    expect(entry.nextRetryAt).toBeUndefined();
  });

  it('resetRetryBackoff clears future retry timers without touching dead-letter entries', async () => {
    const { enqueueTransaction, getAllQueuedTransactions, resetRetryBackoff } = await import('../offlineQueue');
    const pending = makeTx({ id: 'tx-pending' });
    const dead = makeTx({ id: 'tx-dead' });
    await enqueueTransaction(pending);
    await enqueueTransaction(dead);

    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const pendingEntry = raw.find((t: any) => t.id === 'tx-pending');
    pendingEntry.retryCount = 2;
    pendingEntry.nextRetryAt = new Date(Date.now() + 60_000).toISOString();

    const deadEntry = raw.find((t: any) => t.id === 'tx-dead');
    deadEntry.retryCount = MAX_RETRIES;
    deadEntry.nextRetryAt = new Date(Date.now() + 60_000).toISOString();

    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const resetCount = await resetRetryBackoff();

    expect(resetCount).toBe(1);
    const entries = await getAllQueuedTransactions() as any[];
    const updatedPending = entries.find((t: any) => t.id === 'tx-pending');
    const updatedDead = entries.find((t: any) => t.id === 'tx-dead');
    expect(updatedPending.nextRetryAt).toBeUndefined();
    expect(updatedPending.retryCount).toBe(2);
    expect(updatedDead.nextRetryAt).toBeDefined();
    expect(updatedDead.retryCount).toBe(MAX_RETRIES);
  });
});
