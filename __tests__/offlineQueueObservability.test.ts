import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { MAX_RETRIES } from '../offlineQueue';

import type { CollectionSubmissionInput, CollectionSubmissionResult } from '../services/collectionSubmissionService';

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
    photoUrl: 'https://example.com/evidence/queued-photo.jpg',
    dataUsageKB: 10,
    isSynced: false,
    type: 'collection',
    ...overrides,
  };
}

function makeRawInput(txId: string): CollectionSubmissionInput {
  return {
    txId,
    locationId: 'loc-1',
    driverId: 'drv-1',
    currentScore: 200,
    expenses: 0,
    tip: 0,
    startupDebtDeduction: 0,
    isOwnerRetaining: true,
    ownerRetention: null,
    coinExchange: 0,
    gps: { lat: -6.8, lng: 39.3 },
    photoUrl: 'https://example.com/evidence/queued-photo.jpg',
    aiScore: null,
    anomalyFlag: false,
    notes: null,
    expenseType: null,
    expenseCategory: null,
    reportedStatus: 'active',
  };
}

function deadLetterEntry(id: string): void {
  const raw = JSON.parse(localStorage.getItem('bahati_offline_queue') || '[]');
  const updated = raw.map((t: any) =>
    t.id === id
      ? {
          ...t,
          retryCount: MAX_RETRIES,
          lastError: 'Location not found',
          lastErrorCategory: 'permanent',
        }
      : t,
  );
  localStorage.setItem('bahati_offline_queue', JSON.stringify(updated));
}

let originalIndexedDB: typeof globalThis['indexedDB'];

beforeEach(() => {
  originalIndexedDB = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  localStorage.clear();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: originalIndexedDB,
    configurable: true,
    writable: true,
  });
  localStorage.clear();
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('offlineQueue observability', () => {
  it('emits a Sentry message when a flush permanently dead-letters an entry', async () => {
    const Sentry = await import('@sentry/react');
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx();
    await enqueueTransaction(tx, makeRawInput(tx.id));

    const permanentError: CollectionSubmissionResult = {
      success: false,
      error: 'Location not found: loc-1',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(permanentError);

    await flushQueue({ from: () => ({ upsert: jest.fn() }) } as any, { submitCollection });

    expect((Sentry.captureMessage as jest.Mock).mock.calls).toContainEqual(['offline_queue_dead_lettered']);
    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue') || '[]');
    expect(stored[0].retryCount).toBe(MAX_RETRIES);
  });

  it('emits a Sentry message when manual replay fails and remains dead-lettered', async () => {
    const Sentry = await import('@sentry/react');
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');

    const tx = makeTx();
    await enqueueTransaction(tx, makeRawInput(tx.id));
    deadLetterEntry(tx.id);

    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue({ success: false, error: 'Network request failed' });

    const result = await replayDeadLetterItem(tx.id, {
      supabaseClient: { from: () => ({ upsert: jest.fn() }) } as any,
      submitCollection,
    });

    expect(result.success).toBe(false);
    expect((Sentry.captureMessage as jest.Mock).mock.calls).toContainEqual(['offline_queue_manual_replay_failed']);
    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue') || '[]');
    expect(stored[0].retryCount).toBe(MAX_RETRIES);
    expect(stored[0].lastError).toBe('Network request failed');
  });

  it('reports queue health with actionable dead-letter summary fields', async () => {
    const Sentry = await import('@sentry/react');
    const { enqueueTransaction, reportQueueHealthToServer } = await import('../offlineQueue');

    const pending = makeTx({ id: 'tx-pending' });
    const dead = makeTx({ id: 'tx-dead' });
    await enqueueTransaction(pending);
    await enqueueTransaction(dead);

    const raw = JSON.parse(localStorage.getItem('bahati_offline_queue') || '[]');
    const deadEntry = raw.find((t: any) => t.id === 'tx-dead');
    deadEntry.retryCount = MAX_RETRIES;
    deadEntry.lastError = 'Location not found: loc-1';
    deadEntry.lastErrorCategory = 'permanent';
    localStorage.setItem('bahati_offline_queue', JSON.stringify(raw));

    const upsert = jest.fn(async (..._args: any[]) => ({ error: null }));
    const supabase = {
      from: jest.fn(() => ({ upsert })),
    } as any;

    await reportQueueHealthToServer(supabase, 'drv-1', 'Test Driver');

    expect(supabase.from).toHaveBeenCalledWith('queue_health_reports');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        driver_id: 'drv-1',
        driver_name: 'Test Driver',
        pending_count: 1,
        dead_letter_count: 1,
        dead_letter_items: [
          expect.objectContaining({
            txId: 'tx-dead',
            lastError: 'Location not found: loc-1',
            lastErrorCategory: 'permanent',
            retryCount: MAX_RETRIES,
            locationId: 'loc-1',
          }),
        ],
      }),
      { onConflict: 'id' },
    );
    expect(localStorage.getItem('bahati_device_id')).toBeTruthy();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('logs and captures unexpected queue health reporting failures', async () => {
    const Sentry = await import('@sentry/react');
    const { reportQueueHealthToServer } = await import('../offlineQueue');

    const supabase = {
      from: jest.fn(() => ({
        upsert: jest.fn(async (..._args: any[]) => {
          throw new Error('queue report offline');
        }),
      })),
    } as any;

    await reportQueueHealthToServer(supabase, 'drv-9', 'Driver Nine', 'device-9');

    expect(console.warn).toHaveBeenCalledWith(
      '[reportQueueHealthToServer] Unexpected error:',
      expect.any(Error),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
