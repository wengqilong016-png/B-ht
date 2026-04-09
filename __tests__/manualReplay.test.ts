/**
 * __tests__/manualReplay.test.ts
 *
 * Stage-5: focused tests for manual replay of dead-letter items.
 *
 * Coverage:
 *   - getReplayIneligibilityReason guards (already-synced, not-dead-letter, eligible)
 *   - replayDeadLetterItem routes collection entries through submitCollection callback
 *   - replayDeadLetterItem routes reset / payout requests through authoritative callbacks
 *   - replayDeadLetterItem falls back to direct upsert only for legacy entries
 *   - Successful replay marks the entry synced with server-authoritative data
 *   - Failed replay keeps the entry in dead-letter with updated lastError
 *   - Missing submitCollection callback is rejected without touching the queue
 *   - Non-existent entry returns a descriptive error
 *   - Already-synced entry is rejected without performing any network call
 *   - Non-dead-letter (pending) entry is rejected
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { MAX_RETRIES } from '../offlineQueue';

import type { CollectionSubmissionInput, CollectionSubmissionResult } from '../services/collectionSubmissionService';

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

/** Minimal Supabase client stub that simulates a successful upsert by default. */
function makeSupabaseStub(upsertError: { message: string } | null = null) {
  return {
    from: () => ({
      upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: upsertError }),
    }),
  } as any;
}

/** Seed localStorage so the entry appears dead-lettered (retryCount = MAX_RETRIES). */
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

// ── Force localStorage fallback (jsdom has no IDB) ────────────────────────────
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

// ── getReplayIneligibilityReason ──────────────────────────────────────────────

describe('getReplayIneligibilityReason', () => {
  it('returns null for a dead-letter, unsynced entry (eligible)', async () => {
    const { getReplayIneligibilityReason } = await import('../offlineQueue');
    const entry = makeTx({ retryCount: MAX_RETRIES, isSynced: false });
    expect(getReplayIneligibilityReason(entry)).toBeNull();
  });

  it('returns a reason for an already-synced entry', async () => {
    const { getReplayIneligibilityReason } = await import('../offlineQueue');
    const entry = makeTx({ retryCount: MAX_RETRIES, isSynced: true });
    expect(getReplayIneligibilityReason(entry)).toMatch(/already synced/i);
  });

  it('returns a reason for a pending entry (not dead-lettered)', async () => {
    const { getReplayIneligibilityReason } = await import('../offlineQueue');
    const entry = makeTx({ retryCount: 0, isSynced: false });
    expect(getReplayIneligibilityReason(entry)).toMatch(/not in dead-letter state/i);
  });

  it('returns a reason for a retry-waiting entry (below MAX_RETRIES)', async () => {
    const { getReplayIneligibilityReason } = await import('../offlineQueue');
    const entry = makeTx({ retryCount: MAX_RETRIES - 1, isSynced: false });
    expect(getReplayIneligibilityReason(entry)).toMatch(/not in dead-letter state/i);
  });
});

// ── replayDeadLetterItem — eligibility guards ─────────────────────────────────

describe('replayDeadLetterItem — eligibility guards', () => {
  it('returns an error for a non-existent entry id', async () => {
    const { replayDeadLetterItem } = await import('../offlineQueue');
    const result = await replayDeadLetterItem('does-not-exist', {
      supabaseClient: makeSupabaseStub(),
    });
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/not found/i);
  });

  it('rejects an already-synced entry without calling submitCollection', async () => {
    const { enqueueTransaction, markSynced, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx, makeRawInput(tx.id));
    deadLetterEntry(tx.id);
    await markSynced(tx.id);

    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>();
    const result = await replayDeadLetterItem(tx.id, {
      supabaseClient: makeSupabaseStub(),
      submitCollection,
    });

    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/already synced/i);
    expect(submitCollection).not.toHaveBeenCalled();
  });

  it('rejects a pending (not dead-lettered) entry without any network call', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx, makeRawInput(tx.id));
    // Do NOT dead-letter it — retryCount stays at 0

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>();

    const result = await replayDeadLetterItem(tx.id, { supabaseClient: supabase, submitCollection });

    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/not in dead-letter state/i);
    expect(submitCollection).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

// ── replayDeadLetterItem — collection replay path ─────────────────────────────

describe('replayDeadLetterItem — collection replay (rawInput present)', () => {
  it('routes through submitCollection callback and marks entry synced on success', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx, makeRawInput(tx.id));
    deadLetterEntry(tx.id);

    const serverTx = { ...tx, revenue: 19000, netPayable: 16000, isSynced: true };
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue({ success: true, transaction: serverTx as any, source: 'server' });

    const result = await replayDeadLetterItem(tx.id, {
      supabaseClient: makeSupabaseStub(),
      submitCollection,
    });

    expect(result.success).toBe(true);
    expect((result as any).transaction.revenue).toBe(19000);
    expect(submitCollection).toHaveBeenCalledTimes(1);

    // Entry should be marked synced in the store
    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = stored.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(true);
    // Server-authoritative finance values must be written back
    expect(entry?.revenue).toBe(19000);
    expect(entry?.netPayable).toBe(16000);
  });

  it('passes the correct raw inputs to submitCollection (not pre-computed finance)', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx({ currentScore: 350 });
    const raw = makeRawInput(tx.id);
    raw.currentScore = 350;
    raw.expenses = 5000;
    await enqueueTransaction(tx, raw);
    deadLetterEntry(tx.id);

    let capturedInput: CollectionSubmissionInput | null = null;
    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>(
      async (input) => {
        capturedInput = input;
        return { success: true, transaction: {} as any, source: 'server' };
      },
    );

    await replayDeadLetterItem(tx.id, { supabaseClient: makeSupabaseStub(), submitCollection });

    expect(capturedInput).not.toBeNull();
    expect(capturedInput!.currentScore).toBe(350);
    expect(capturedInput!.expenses).toBe(5000);
    // Pre-computed finance fields must NOT appear on the raw input
    expect(capturedInput!).not.toHaveProperty('revenue');
    expect(capturedInput!).not.toHaveProperty('netPayable');
  });

  it('keeps entry in dead-letter with updated lastError on submitCollection failure', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx, makeRawInput(tx.id));
    deadLetterEntry(tx.id);

    const submitCollection = jest.fn<(input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>>()
      .mockResolvedValue({ success: false, error: 'Network request failed' });

    const result = await replayDeadLetterItem(tx.id, {
      supabaseClient: makeSupabaseStub(),
      submitCollection,
    });

    expect(result.success).toBe(false);
    expect((result as any).error).toBe('Network request failed');

    // Entry must remain in dead-letter state (retryCount unchanged)
    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = stored.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(false);
    expect(entry?.retryCount).toBe(MAX_RETRIES); // dead-letter state preserved
    expect(entry?.lastError).toBe('Network request failed');
    expect(entry?.lastErrorCategory).toBe('transient');
  });

  it('rejects collection replay when submitCollection callback is not supplied', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx();
    await enqueueTransaction(tx, makeRawInput(tx.id));
    deadLetterEntry(tx.id);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;

    // No submitCollection → must return an error without calling upsert
    const result = await replayDeadLetterItem(tx.id, { supabaseClient: supabase });

    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/submitCollection callback required/i);
    expect(upsertMock).not.toHaveBeenCalled();

    // Entry must remain unsynced
    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = stored.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(false);
  });
});

// ── replayDeadLetterItem — authoritative request replay / legacy fallback ─────

describe('replayDeadLetterItem — request replay and legacy fallback (no rawInput)', () => {
  it('uses submitResetRequest for reset requests and marks synced on success', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx({ type: 'reset_request' });
    await enqueueTransaction(tx); // no rawInput
    deadLetterEntry(tx.id);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;
    const submitResetRequest = jest.fn<(tx: any) => Promise<any>>()
      .mockResolvedValue({ ...tx, isSynced: true, resetLocked: true });

    const result = await replayDeadLetterItem(tx.id, { supabaseClient: supabase, submitResetRequest });

    expect(result.success).toBe(true);
    expect(submitResetRequest).toHaveBeenCalledTimes(1);
    expect(upsertMock).not.toHaveBeenCalled();

    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = stored.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(true);
  });

  it('uses submitPayoutRequest for payout requests and marks synced on success', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx({ type: 'payout_request', payoutAmount: 25000 });
    await enqueueTransaction(tx);
    deadLetterEntry(tx.id);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;
    const submitPayoutRequest = jest.fn<(tx: any) => Promise<any>>()
      .mockResolvedValue({ ...tx, isSynced: true });

    const result = await replayDeadLetterItem(tx.id, { supabaseClient: supabase, submitPayoutRequest });

    expect(result.success).toBe(true);
    expect(submitPayoutRequest).toHaveBeenCalledTimes(1);
    expect(upsertMock).not.toHaveBeenCalled();

    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = stored.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(true);
  });

  it('rejects reset replay when submitResetRequest callback is not supplied', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx({ type: 'reset_request' });
    await enqueueTransaction(tx);
    deadLetterEntry(tx.id);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;

    const result = await replayDeadLetterItem(tx.id, { supabaseClient: supabase });

    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/submitResetRequest callback required/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects payout replay when submitPayoutRequest callback is not supplied', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx({ type: 'payout_request', payoutAmount: 12000 });
    await enqueueTransaction(tx);
    deadLetterEntry(tx.id);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;

    const result = await replayDeadLetterItem(tx.id, { supabaseClient: supabase });

    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/submitPayoutRequest callback required/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('uses direct upsert for legacy entries without authoritative callbacks', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx({ type: 'expense' });
    await enqueueTransaction(tx);
    deadLetterEntry(tx.id);

    const upsertMock = jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ upsert: upsertMock }) } as any;

    const result = await replayDeadLetterItem(tx.id, { supabaseClient: supabase });

    expect(result.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = stored.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(true);
  });

  it('keeps legacy entries in dead-letter with updated lastError on upsert failure', async () => {
    const { enqueueTransaction, replayDeadLetterItem } = await import('../offlineQueue');
    const tx = makeTx({ type: 'expense' });
    await enqueueTransaction(tx);
    deadLetterEntry(tx.id);

    const supabase = {
      from: () => ({ upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({ error: { message: 'Service Unavailable' } }) }),
    } as any;

    const result = await replayDeadLetterItem(tx.id, { supabaseClient: supabase });

    expect(result.success).toBe(false);
    expect((result as any).error).toBe('Service Unavailable');

    const stored = JSON.parse(localStorage.getItem('bahati_offline_queue')!);
    const entry = stored.find((t: any) => t.id === tx.id);
    expect(entry?.isSynced).toBe(false);
    expect(entry?.retryCount).toBe(MAX_RETRIES);
    expect(entry?.lastError).toBe('Service Unavailable');
    expect(entry?.lastErrorCategory).toBe('transient');
  });
});
