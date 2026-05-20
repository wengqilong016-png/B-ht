/**
 * __tests__/offlineQueueReplay.test.ts
 *
 * Focused tests for Stage-3 offline replay and idempotency hardening:
 *   - Collection entries with rawInput are replayed via submitCollection callback
 *   - Reset / payout requests are replayed via authoritative callbacks
 *   - Duplicate txId replay (server returns persisted row) is treated as success
 *   - Permanent errors dead-letter entries immediately
 *   - Transient errors apply exponential backoff
 *   - Collection entries with rawInput without a submitCollection callback are dead-lettered
 *   - Reset / payout requests without their callbacks are dead-lettered
 *   - classifyError correctly categorizes error messages
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import type { CollectionSubmissionInput, CollectionSubmissionResult } from '../services/collectionSubmissionService';

const mockPersistEvidencePhotoUrl = jest.fn<(...args: unknown[]) => Promise<string | null>>();

jest.mock('../services/evidenceStorage', () => ({
  persistEvidencePhotoUrl: (...args: unknown[]) => mockPersistEvidencePhotoUrl(...(args as [])),
}));

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
    photoUrl: 'data:image/jpeg;base64,queued-photo',
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
    photoUrl: null,
    aiScore: null,
    anomalyFlag: false,
    notes: null,
    expenseType: null,
    expenseCategory: null,
    reportedStatus: 'active',
  };
}

/** Minimal Supabase client stub that simulates a successful upsert. */
function makeSupabaseStub(upsertError: { message: string } | null = null) {
  return {
    from: () => ({
      upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: upsertError }),
    }),
  } as any;
}

// ── Force localStorage fallback (jsdom has no IDB) ────────────────────────────
let originalIndexedDB: typeof globalThis['indexedDB'];

beforeEach(() => {
  mockPersistEvidencePhotoUrl.mockReset();
  mockPersistEvidencePhotoUrl.mockResolvedValue('https://example.com/evidence/queued-photo.jpg');
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

// ── classifyError ─────────────────────────────────────────────────────────────

describe('classifyError', () => {
  it('classifies permission and unauthorized errors as permanent', async () => {
    const { classifyError } = await import('../offlineQueue');
    expect(classifyError('Forbidden: driver may not submit on behalf of another driver')).toBe('permanent');
    expect(classifyError('permission denied')).toBe('permanent');
    expect(classifyError('Unauthorized')).toBe('permanent');
  });

  it('classifies "authentication required" as transient (re-login can recover the session)', async () => {
    const { classifyError } = await import('../offlineQueue');
    expect(classifyError('Authentication required')).toBe('transient');
  });

  it('classifies not-found and validation errors as permanent', async () => {
    const { classifyError } = await import('../offlineQueue');
    expect(classifyError('Location not found')).toBe('permanent');
    expect(classifyError('Driver not found')).toBe('permanent');
    expect(classifyError('invalid input syntax')).toBe('permanent');
    expect(classifyError('violates foreign key constraint')).toBe('permanent');
  });

  it('classifies network and server errors as transient', async () => {
    const { classifyError } = await import('../offlineQueue');
    expect(classifyError('Network request failed')).toBe('transient');
    expect(classifyError('Failed to fetch')).toBe('transient');
    expect(classifyError('Internal Server Error')).toBe('transient');
    expect(classifyError('Service Unavailable')).toBe('transient');
    expect(classifyError('timeout')).toBe('transient');
  });

  it('classifies collection evidence failures for the retry path', async () => {
    const { classifyError } = await import('../offlineQueue');
    expect(classifyError('Missing required collection evidence photoUrl')).toBe('permanent');
    expect(classifyError('Evidence photo upload failed: Storage quota exceeded')).toBe('transient');
    expect(classifyError('Evidence photo persistence failed for required collection photoUrl')).toBe('permanent');
    expect(classifyError('Supabase not configured')).toBe('permanent');
  });
});

// ── flushQueue with submitCollection callback ─────────────────────────────────

describe('flushQueue — collection replay via submitCollection callback', () => {
  it('routes collection entries with rawInput through submitCollection callback', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx();
    const rawInput = makeRawInput(tx.id);
    await enqueueTransaction(tx, rawInput);

    const successResult: CollectionSubmissionResult = {
      success: true,
      transaction: { ...tx, isSynced: true } as any,
      source: 'server',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(successResult);

    const flushed = await flushQueue(makeSupabaseStub(), { submitCollection });

    expect(flushed).toBe(1);
    expect(submitCollection).toHaveBeenCalledTimes(1);
    // The callback receives the original raw inputs, not the local transaction
    const callArg = (submitCollection.mock.calls[0] as [CollectionSubmissionInput])[0];
    expect(callArg.txId).toBe(tx.id);
    expect(callArg.currentScore).toBe(200);

    // Entry should now be marked synced
    const all = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = all.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(true);
  });

  it('treats duplicate txId replay as success (server returns persisted row on conflict)', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx();
    const rawInput = makeRawInput(tx.id);
    await enqueueTransaction(tx, rawInput);

    // Simulate server returning the already-persisted row (ON CONFLICT DO NOTHING)
    // with different finance values than the local draft
    const persistedRow = { ...tx, revenue: 18000, netPayable: 15000, isSynced: true };
    const duplicateResult: CollectionSubmissionResult = {
      success: true,
      transaction: persistedRow as any,
      source: 'server',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(duplicateResult);

    const flushed = await flushQueue(makeSupabaseStub(), { submitCollection });

    // Must be treated as success even though finance values differ
    expect(flushed).toBe(1);
    const all = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const stored = all.find((t: any) => t.id === tx.id);
    expect(stored?.isSynced).toBe(true);
    // Authoritative server values must be written back to the stored entry
    expect(stored?.revenue).toBe(18000);
    expect(stored?.netPayable).toBe(15000);
  });

  it('replays an entry with an HTTP photo URL without uploading evidence again', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const httpPhotoUrl = 'https://example.com/evidence/already-persisted.jpg';
    const tx = makeTx({ photoUrl: httpPhotoUrl });
    const rawInput = { ...makeRawInput(tx.id), photoUrl: httpPhotoUrl };
    await enqueueTransaction(tx, rawInput);
    mockPersistEvidencePhotoUrl.mockClear();

    const successResult: CollectionSubmissionResult = {
      success: true,
      transaction: { ...tx, photoUrl: httpPhotoUrl, isSynced: true } as any,
      source: 'server',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(successResult);

    const flushed = await flushQueue(makeSupabaseStub(), { submitCollection });

    expect(flushed).toBe(1);
    expect(mockPersistEvidencePhotoUrl).not.toHaveBeenCalled();
    expect(submitCollection).toHaveBeenCalledTimes(1);
    const callArg = (submitCollection.mock.calls[0] as [CollectionSubmissionInput])[0];
    expect(callArg.photoUrl).toBe(httpPhotoUrl);
  });

  it('persists a pending dataURL photo once before replaying the collection', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const dataUrl = 'data:image/jpeg;base64,pending-photo';
    const publicUrl = 'https://example.com/evidence/pending-photo.jpg';
    const tx = makeTx({ photoUrl: dataUrl });
    const rawInput = makeRawInput(tx.id);
    await enqueueTransaction(tx, rawInput);

    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    localStorage.setItem('bahati_offline_queue', JSON.stringify(stored.map((entry: any) => (
      entry.id === tx.id
        ? { ...entry, photoUrl: dataUrl, rawInput: { ...entry.rawInput, photoUrl: null }, photoPending: true }
        : entry
    ))));
    mockPersistEvidencePhotoUrl.mockClear();
    mockPersistEvidencePhotoUrl.mockResolvedValue(publicUrl);

    const successResult: CollectionSubmissionResult = {
      success: true,
      transaction: { ...tx, photoUrl: publicUrl, isSynced: true } as any,
      source: 'server',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(successResult);

    const flushed = await flushQueue(makeSupabaseStub(), { submitCollection });

    expect(flushed).toBe(1);
    expect(mockPersistEvidencePhotoUrl).toHaveBeenCalledTimes(1);
    expect(mockPersistEvidencePhotoUrl.mock.calls[0]?.[1]).toMatchObject({ required: true });
    const callArg = (submitCollection.mock.calls[0] as [CollectionSubmissionInput])[0];
    expect(callArg.photoUrl).toBe(publicUrl);
    const updated = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const updatedEntry = updated.find((entry: any) => entry.id === tx.id);
    expect(updatedEntry?.photoPending).toBe(false);
    expect(updatedEntry?.photoUrl).toBe(publicUrl);
  });

  it('dead-letters a collection entry (does not upsert) when submitCollection callback is absent', async () => {
    const { enqueueTransaction, flushQueue, getDeadLetterItems } = await import('../offlineQueue');

    const tx = makeTx();
    const rawInput = makeRawInput(tx.id);
    await enqueueTransaction(tx, rawInput);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;

    // No submitCollection option → collection entry must NOT fall back to a direct upsert
    const flushed = await flushQueue(supabase);

    expect(flushed).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
    // Entry is dead-lettered immediately (permanent failure)
    const deadLetters = await getDeadLetterItems();
    expect(deadLetters.some(d => d.id === tx.id)).toBe(true);
  });

  it('dead-letters a collection entry with missing photoUrl before submitCollection', async () => {
    const { enqueueTransaction, flushQueue, getDeadLetterItems } = await import('../offlineQueue');

    const tx = makeTx({ photoUrl: null });
    const rawInput = makeRawInput(tx.id);
    await enqueueTransaction(tx, rawInput);

    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>();
    const flushed = await flushQueue(makeSupabaseStub(), { submitCollection });

    expect(flushed).toBe(0);
    expect(submitCollection).not.toHaveBeenCalled();
    const deadLetters = await getDeadLetterItems();
    const entry = deadLetters.find(d => d.id === tx.id) as any;
    expect(entry?.lastError).toBe('Missing required collection evidence photoUrl');
    expect(entry?.lastErrorCategory).toBe('permanent');
  });

  it('routes reset requests through submitResetRequest callback', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx({ type: 'reset_request', notes: 'jammed bill acceptor' });
    await enqueueTransaction(tx);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;
    const submitResetRequest = jest.fn<(tx: any) => Promise<any>>()
      .mockResolvedValue({ ...tx, isSynced: true, resetLocked: true });

    const flushed = await flushQueue(supabase, { submitResetRequest });

    expect(submitResetRequest).toHaveBeenCalledTimes(1);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(flushed).toBe(1);
  });

  it('routes payout requests through submitPayoutRequest callback', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx({ type: 'payout_request', payoutAmount: 25000 });
    await enqueueTransaction(tx);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;
    const submitPayoutRequest = jest.fn<(tx: any) => Promise<any>>()
      .mockResolvedValue({ ...tx, isSynced: true });

    const flushed = await flushQueue(supabase, { submitPayoutRequest });

    expect(submitPayoutRequest).toHaveBeenCalledTimes(1);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(flushed).toBe(1);
  });

  it('falls back to direct upsert only for legacy entries without authoritative callbacks', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx({ type: 'expense' });
    await enqueueTransaction(tx);

    const upsertMock = jest.fn<(payload: unknown) => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>();

    const flushed = await flushQueue(supabase, { submitCollection });

    expect(submitCollection).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        operationId: expect.anything(),
        entityVersion: expect.anything(),
        _queuedAt: expect.anything(),
        retryCount: expect.anything(),
      }),
    );
    expect(flushed).toBe(1);
  });

  it('dead-letters reset requests when submitResetRequest callback is absent', async () => {
    const { enqueueTransaction, flushQueue, getDeadLetterItems } = await import('../offlineQueue');

    const tx = makeTx({ type: 'reset_request' });
    await enqueueTransaction(tx);

    const flushed = await flushQueue(makeSupabaseStub());

    expect(flushed).toBe(0);
    const deadLetters = await getDeadLetterItems();
    expect(deadLetters.some(d => d.id === tx.id)).toBe(true);
  });

  it('dead-letters payout requests when submitPayoutRequest callback is absent', async () => {
    const { enqueueTransaction, flushQueue, getDeadLetterItems } = await import('../offlineQueue');

    const tx = makeTx({ type: 'payout_request', payoutAmount: 15000 });
    await enqueueTransaction(tx);

    const flushed = await flushQueue(makeSupabaseStub());

    expect(flushed).toBe(0);
    const deadLetters = await getDeadLetterItems();
    expect(deadLetters.some(d => d.id === tx.id)).toBe(true);
  });

  it('calls onProgress after each successful flush', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx1 = makeTx();
    const tx2 = makeTx();
    await enqueueTransaction(tx1, makeRawInput(tx1.id));
    await enqueueTransaction(tx2, makeRawInput(tx2.id));

    const successResult: CollectionSubmissionResult = {
      success: true,
      transaction: {} as any,
      source: 'server',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(successResult);
    const onProgress = jest.fn();

    await flushQueue(makeSupabaseStub(), { submitCollection, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect((onProgress.mock.calls[0] as number[])[0]).toBe(1); // flushed=1
    expect((onProgress.mock.calls[1] as number[])[0]).toBe(2); // flushed=2
  });
});

// ── Error categorization in replay ────────────────────────────────────────────

describe('flushQueue — error categorization', () => {
  it('dead-letters entries that receive a permanent error immediately (no more retries)', async () => {
    const { enqueueTransaction, flushQueue, getDeadLetterItems } = await import('../offlineQueue');

    const tx = makeTx();
    const rawInput = makeRawInput(tx.id);
    await enqueueTransaction(tx, rawInput);

    const permanentError: CollectionSubmissionResult = {
      success: false,
      error: 'Location not found: loc-1',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(permanentError);

    await flushQueue(makeSupabaseStub(), { submitCollection });

    // Entry should appear in dead-letter immediately after a single permanent failure
    const deadLetters = await getDeadLetterItems();
    expect(deadLetters.some(d => d.id === tx.id)).toBe(true);
  });

  it('increments retryCount (does not dead-letter) for transient errors', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx();
    const rawInput = makeRawInput(tx.id);
    await enqueueTransaction(tx, rawInput);

    const transientError: CollectionSubmissionResult = {
      success: false,
      error: 'Network request failed',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(transientError);

    await flushQueue(makeSupabaseStub(), { submitCollection });

    // retryCount should be incremented to 1, NOT to MAX_RETRIES (5)
    const all = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = all.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(false);
    expect(entry?.retryCount).toBe(1);
    expect(entry?.lastErrorCategory).toBe('transient');
    // nextRetryAt must be set (backoff applied)
    expect(entry?.nextRetryAt).toBeDefined();
  });

  it('skips entries that are already in dead-letter state on subsequent flush calls', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx();
    const rawInput = makeRawInput(tx.id);
    await enqueueTransaction(tx, rawInput);

    // Simulate the entry being at MAX_RETRIES already (dead-letter state)
    const all = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    all[0].retryCount = 5; // MAX_RETRIES
    localStorage.setItem('bahati_offline_queue', JSON.stringify(all));

    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>();
    const flushed = await flushQueue(makeSupabaseStub(), { submitCollection });

    // Dead-letter entries must not be replayed
    expect(submitCollection).not.toHaveBeenCalled();
    expect(flushed).toBe(0);
  });
});

// ── Offline-to-online transition ──────────────────────────────────────────────

describe('offline-to-online transition', () => {
  it('queues multiple entries offline and flushes all on reconnect', async () => {
    const { enqueueTransaction, flushQueue, getPendingTransactions } = await import('../offlineQueue');

    const tx1 = makeTx();
    const tx2 = makeTx();
    const tx3 = makeTx();

    await enqueueTransaction(tx1, makeRawInput(tx1.id));
    await enqueueTransaction(tx2, makeRawInput(tx2.id));
    await enqueueTransaction(tx3, makeRawInput(tx3.id));

    // All three should be pending before flush
    const pending = await getPendingTransactions();
    expect(pending).toHaveLength(3);

    const successResult: CollectionSubmissionResult = {
      success: true,
      transaction: {} as any,
      source: 'server',
    };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue(successResult);

    const flushed = await flushQueue(makeSupabaseStub(), { submitCollection });

    expect(flushed).toBe(3);
    expect(submitCollection).toHaveBeenCalledTimes(3);

    // All entries should now be marked synced
    const remaining = await getPendingTransactions();
    expect(remaining).toHaveLength(0);
  });

  it('rawInput carries the original score so server can recompute finance correctly', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx({ currentScore: 350 });
    const rawInput = makeRawInput(tx.id);
    rawInput.currentScore = 350;
    rawInput.expenses = 5000;
    rawInput.tip = 1000;

    await enqueueTransaction(tx, rawInput);

    let capturedInput: CollectionSubmissionInput | null = null;
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>(
      async (input) => {
        capturedInput = input;
        return { success: true, transaction: {} as any, source: 'server' };
      }
    );

    await flushQueue(makeSupabaseStub(), { submitCollection });

    // The callback must receive the exact raw inputs captured at enqueue time
    expect(capturedInput).not.toBeNull();
    expect(capturedInput!.currentScore).toBe(350);
    expect(capturedInput!.expenses).toBe(5000);
    expect(capturedInput!.tip).toBe(1000);
    // Pre-computed finance must NOT be forwarded to the server via rawInput
    expect(capturedInput!).not.toHaveProperty('revenue');
    expect(capturedInput!).not.toHaveProperty('netPayable');
  });

  it('prevents concurrent flush calls from double-submitting the same queued entry', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const tx = makeTx();
    await enqueueTransaction(tx, makeRawInput(tx.id));

    let resolveSubmission: ((value: CollectionSubmissionResult) => void) | null = null;
    const pendingSubmission = new Promise<CollectionSubmissionResult>((resolve) => {
      resolveSubmission = resolve;
    });
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockImplementation(() => pendingSubmission);

    const firstFlush = flushQueue(makeSupabaseStub(), { submitCollection });
    const secondFlush = flushQueue(makeSupabaseStub(), { submitCollection });

    expect(await secondFlush).toBe(0);
    await new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      const waitForSubmission = () => {
        if (submitCollection.mock.calls.length === 1) {
          resolve();
          return;
        }
        if (Date.now() - startedAt > 1_000) {
          reject(new Error('submitCollection was not invoked by the in-flight flush'));
          return;
        }
        setTimeout(waitForSubmission, 0);
      };
      waitForSubmission();
    });
    expect(submitCollection).toHaveBeenCalledTimes(1);

    if (!resolveSubmission) {
      throw new Error('Expected resolveSubmission to be set');
    }

    const finishSubmission = resolveSubmission as (value: CollectionSubmissionResult) => void;
    finishSubmission({
      success: true,
      transaction: { ...tx, isSynced: true } as any,
      source: 'server',
    });

    expect(await firstFlush).toBe(1);
    expect(submitCollection).toHaveBeenCalledTimes(1);
  });

  // ── 离线 replay 时间戳排序测试 (M4 coverage) ────────────────────────────

  it('sorts same-location entries by timestamp ascending before replay', async () => {
    const { enqueueTransaction, flushQueue, getPendingTransactions } = await import('../offlineQueue');

    const baseTime = new Date('2026-05-19T10:00:00Z');
    const tx1 = makeTx({
      id: 'tx-order-1',
      locationId: 'loc-same',
      timestamp: new Date(baseTime.getTime() + 2000).toISOString(), // +2s
    });
    const tx2 = makeTx({
      id: 'tx-order-2',
      locationId: 'loc-same',
      timestamp: new Date(baseTime.getTime() + 1000).toISOString(), // +1s (earlier)
    });

    // Enqueue tx1 first (later timestamp), then tx2 (earlier timestamp)
    await enqueueTransaction(tx1, makeRawInput('tx-order-1'));
    await enqueueTransaction(tx2, makeRawInput('tx-order-2'));

    // Pending should contain both in enqueue order (tx1, tx2)
    const pending = await getPendingTransactions();
    expect(pending).toHaveLength(2);

    // Collect submission order
    const submissionOrder: string[] = [];
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>(
      async (input) => {
        submissionOrder.push(input.txId);
        return { success: true, transaction: {} as any, source: 'server' };
      }
    );

    const flushed = await flushQueue(makeSupabaseStub(), { submitCollection });

    // sort() should reorder by timestamp ascending → tx-order-2 (earlier) first
    expect(submissionOrder).toEqual(['tx-order-2', 'tx-order-1']);
    expect(flushed).toBe(2);
  });

  it('preserves chronological order when entries are already in timestamp order', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const baseTime = new Date('2026-05-19T10:00:00Z');
    const tx1 = makeTx({
      id: 'tx-chrono-1',
      locationId: 'loc-same',
      timestamp: new Date(baseTime.getTime()).toISOString(), // +0s
    });
    const tx2 = makeTx({
      id: 'tx-chrono-2',
      locationId: 'loc-same',
      timestamp: new Date(baseTime.getTime() + 1000).toISOString(), // +1s
    });

    // Enqueue in chronological order
    await enqueueTransaction(tx1, makeRawInput('tx-chrono-1'));
    await enqueueTransaction(tx2, makeRawInput('tx-chrono-2'));

    const submissionOrder: string[] = [];
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>(
      async (input) => {
        submissionOrder.push(input.txId);
        return { success: true, transaction: {} as any, source: 'server' };
      }
    );

    await flushQueue(makeSupabaseStub(), { submitCollection });

    // Already in order → sort should preserve chronological sequence
    expect(submissionOrder).toEqual(['tx-chrono-1', 'tx-chrono-2']);
  });

  it('sorts mixed-location entries globally by timestamp', async () => {
    const { enqueueTransaction, flushQueue } = await import('../offlineQueue');

    const baseTime = new Date('2026-05-19T10:00:00Z');
    const tx1 = makeTx({
      id: 'tx-mix-1',
      locationId: 'loc-a',
      timestamp: new Date(baseTime.getTime() + 3000).toISOString(),
    });
    const tx2 = makeTx({
      id: 'tx-mix-2',
      locationId: 'loc-b',
      timestamp: new Date(baseTime.getTime() + 1000).toISOString(),
    });
    const tx3 = makeTx({
      id: 'tx-mix-3',
      locationId: 'loc-a',
      timestamp: new Date(baseTime.getTime() + 2000).toISOString(),
    });

    await enqueueTransaction(tx1, makeRawInput('tx-mix-1'));
    await enqueueTransaction(tx2, makeRawInput('tx-mix-2'));
    await enqueueTransaction(tx3, makeRawInput('tx-mix-3'));

    const submissionOrder: string[] = [];
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>(
      async (input) => {
        submissionOrder.push(input.txId);
        return { success: true, transaction: {} as any, source: 'server' };
      }
    );

    await flushQueue(makeSupabaseStub(), { submitCollection });

    // Sorted by timestamp ascending across all locations
    expect(submissionOrder).toEqual(['tx-mix-2', 'tx-mix-3', 'tx-mix-1']);
  });
});
