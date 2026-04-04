/**
 * offlineQueue.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * IndexedDB-backed offline queue for driver transactions.
 *
 * Key design goals:
 *   - Works in Safari (iOS 15.4+), Chrome, Firefox
 *   - Falls back gracefully if IDB is unavailable
 *   - Each queued item ≤ ~150KB (photo already resized before submission)
 *   - Background-sync-compatible: provides a `flushQueue()` for sync events
 *   - Idempotent: each queued item carries an operationId and entityVersion
 *   - Retry-aware: exponential backoff with dead-letter visibility
 */

import { Transaction, safeRandomUUID } from './types';
import { SupabaseClient } from '@supabase/supabase-js';
import type { CollectionSubmissionInput, CollectionSubmissionResult } from './services/collectionSubmissionService';
import { appendCollectionSubmissionAudit } from './services/collectionSubmissionAudit';

const DB_NAME    = 'bahati_offline_db';
const DB_VERSION = 2;
const STORE_TX   = 'pending_transactions';
const MS_PER_DAY = 86_400_000;
export const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2_000; // 2 s → 4 s → 8 s → 16 s → 32 s

/** Metadata attached to every queued entry for idempotent, retry-aware sync. */
export interface QueueMeta {
  /** Unique operation identifier (used as idempotency key on the server side) */
  operationId: string;
  /** Monotonic version — lets the server discard stale overwrites */
  entityVersion: number;
  /** ISO-8601 timestamp when the item was first enqueued */
  _queuedAt: string;
  /** Number of flush attempts so far */
  retryCount: number;
  /** ISO-8601 timestamp of the last sync error (if any) */
  lastError?: string;
  /** Earliest ISO-8601 timestamp at which the next retry is allowed */
  nextRetryAt?: string;
  /**
   * Raw collection inputs captured at enqueue time.
   * When present, replay routes through `submit_collection_v2` instead of a
   * direct upsert so the server remains the authority for finance computation.
   */
  rawInput?: CollectionSubmissionInput;
  /**
   * Error category from the most-recent flush attempt.
   *   'transient' — network / server error; safe to retry.
   *   'permanent' — validation / auth / not-found; retry will not help.
   */
  lastErrorCategory?: 'transient' | 'permanent';
}

/**
 * Options for `flushQueue`.
 */
export interface FlushOptions {
  /**
   * When provided, collection entries that carry `rawInput` are replayed
   * through this callback instead of a direct Supabase upsert.
   * Inject `submitCollectionV2` from `services/collectionSubmissionService`
   * at the call site.
   */
  submitCollection?: (input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>;
  submitResetRequest?: (tx: Transaction) => Promise<Transaction>;
  submitPayoutRequest?: (tx: Transaction) => Promise<Transaction>;
  /** Called after each successful individual flush. */
  onProgress?: (flushed: number, total: number) => void;
}

// ── Open / init ───────────────────────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TX)) {
        const store = db.createObjectStore(STORE_TX, { keyPath: 'id' });
        store.createIndex('driverId',  'driverId',  { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('isSynced',  'isSynced',  { unique: false });
        store.createIndex('retryCount', 'retryCount', { unique: false });
      } else {
        // v1 → v2 migration: add retryCount index if missing
        const txn = (e.target as IDBOpenDBRequest).transaction!;
        const store = txn.objectStore(STORE_TX);
        if (!store.indexNames.contains('retryCount')) {
          store.createIndex('retryCount', 'retryCount', { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Generate a short unique operation ID */
function generateOperationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `op-${ts}-${rand}`;
}

// ── Enqueue (save when offline) ───────────────────────────────────────────────
/**
 * Enqueue a transaction for later replay when connectivity is restored.
 *
 * @param tx        The locally-computed transaction (used for optimistic UI).
 * @param rawInput  The raw collection inputs captured at submission time.
 *                  When provided, replay will call `submit_collection_v2`
 *                  so the server recomputes finance authoritatively instead of
 *                  accepting locally-computed values.
 */
export async function enqueueTransaction(tx: Transaction, rawInput?: CollectionSubmissionInput): Promise<void> {
  // Strip photoUrl from the stored rawInput copy to avoid duplicating the
  // (potentially large) base64 payload that is already on tx.photoUrl.
  // During replay, flushQueue reconstructs photoUrl from the stored tx entry.
  const storedRawInput: CollectionSubmissionInput | undefined = rawInput
    ? { ...rawInput, photoUrl: null }
    : undefined;

  const meta: QueueMeta = {
    operationId: generateOperationId(),
    entityVersion: Date.now(),
    _queuedAt: new Date().toISOString(),
    retryCount: 0,
    rawInput: storedRawInput,
  };

  try {
    const db    = await openDB();
    const store = db.transaction(STORE_TX, 'readwrite').objectStore(STORE_TX);
    await new Promise<void>((resolve, reject) => {
      const req = store.put({ ...tx, isSynced: false, ...meta });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    // Fallback: localStorage
    console.warn('[OfflineQueue] IDB unavailable, falling back to localStorage', err);
    const raw  = localStorage.getItem('bahati_offline_queue') || '[]';
    const list = JSON.parse(raw) as Transaction[];
    const updated = [...list.filter(t => t.id !== tx.id), { ...tx, isSynced: false, ...meta }];
    try { localStorage.setItem('bahati_offline_queue', JSON.stringify(updated)); } catch (_) {}
  }
}

// ── Read all pending (for local display / route map) ─────────────────────────
export async function getPendingTransactions(): Promise<Transaction[]> {
  try {
    const db = await openDB();
    return new Promise<Transaction[]>((resolve, reject) => {
      const store = db.transaction(STORE_TX, 'readonly').objectStore(STORE_TX);
      const idx   = store.index('isSynced');
      const req   = idx.getAll(IDBKeyRange.only(false));
      req.onsuccess = () => { db.close(); resolve(req.result as Transaction[]); };
      req.onerror   = () => { db.close(); reject(req.error); };
    });
  } catch {
    const raw = localStorage.getItem('bahati_offline_queue') || '[]';
    return (JSON.parse(raw) as Transaction[]).filter(t => !t.isSynced);
  }
}

// ── Get ALL queued (including synced, for route replay) ───────────────────────
export async function getAllQueuedTransactions(): Promise<Transaction[]> {
  try {
    const db = await openDB();
    return new Promise<Transaction[]>((resolve, reject) => {
      const store = db.transaction(STORE_TX, 'readonly').objectStore(STORE_TX);
      const req   = store.getAll();
      req.onsuccess = () => { db.close(); resolve(req.result as Transaction[]); };
      req.onerror   = () => { db.close(); reject(req.error); };
    });
  } catch {
    const raw = localStorage.getItem('bahati_offline_queue') || '[]';
    return JSON.parse(raw) as Transaction[];
  }
}

// ── Mark as synced ────────────────────────────────────────────────────────────
/**
 * Mark a queued entry as synced.
 *
 * When `authoritativeData` is provided (e.g. the server-returned transaction
 * from a successful `submitCollection` replay), its fields are merged into the
 * stored entry so locally-computed finance values are replaced by the
 * server-authoritative values before the entry is marked synced.
 */
export async function markSynced(id: string, authoritativeData?: Partial<Transaction>): Promise<void> {
  const update = { ...authoritativeData, isSynced: true };
  try {
    const db    = await openDB();
    const tx_db = db.transaction(STORE_TX, 'readwrite');
    const store = tx_db.objectStore(STORE_TX);
    const item  = await new Promise<Transaction | undefined>((res, rej) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
    if (item) {
      await new Promise<void>((res, rej) => {
        const r = store.put({ ...item, ...update });
        r.onsuccess = () => res();
        r.onerror   = () => rej(r.error);
      });
    }
    db.close();
  } catch {
    const raw  = localStorage.getItem('bahati_offline_queue') || '[]';
    const list = (JSON.parse(raw) as Transaction[]).map(t => t.id === id ? { ...t, ...update } : t);
    try { localStorage.setItem('bahati_offline_queue', JSON.stringify(list)); } catch (_) {}
  }
}

// ── Remove synced entries older than N days (housekeeping) ───────────────────
export async function pruneOldSynced(daysOld = 7): Promise<void> {
  try {
    const db    = await openDB();
    const store = db.transaction(STORE_TX, 'readwrite').objectStore(STORE_TX);
    const cutoff = new Date(Date.now() - daysOld * MS_PER_DAY).toISOString();
    const idx  = store.index('timestamp');
    const req  = idx.openCursor(IDBKeyRange.upperBound(cutoff));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { db.close(); return; }
      const item = cursor.value as (Transaction & { isSynced: boolean });
      if (item.isSynced) cursor.delete();
      cursor.continue();
    };
  } catch {
    // ignore
  }
}

// ── Flush queue → Supabase (called by App on reconnect) ──────────────────────
/**
 * Replay all pending offline entries against the server.
 *
 * Collection entries that carry `rawInput` are replayed through the
 * server-authoritative `submit_collection_v2` entrypoint (via the injected
 * `options.submitCollection` callback) so finance values are always
 * recomputed on the server.  If `submitCollection` is not provided for a
 * collection entry, the entry is dead-lettered immediately (permanent error)
 * rather than falling back to a direct upsert of locally-computed values.
 * Only non-collection / legacy entries without `rawInput` use the direct
 * upsert fallback.
 *
 * On success, the authoritative transaction returned by the server is written
 * back into the queued entry so locally-computed finance values are replaced
 * by the persisted row before the entry is marked synced.
 *
 * Duplicate `txId` replay: the server's ON CONFLICT DO NOTHING semantics
 * cause it to return the already-persisted row, which this function treats
 * as a successful sync and marks the local entry synced.
 *
 * Error categorization:
 *   - 'permanent' errors (auth, not-found, validation) dead-letter the entry
 *     immediately (retryCount jumps to MAX_RETRIES) so they stop consuming
 *     retry budget and remain visible for admin inspection.
 *   - 'transient' errors (network, server-side 5xx) apply exponential backoff
 *     and will be retried on the next flush call.
 */
export async function flushQueue(
  supabaseClient: SupabaseClient,
  options?: FlushOptions,
): Promise<number> {
  const pending = await getPendingTransactions();
  if (pending.length === 0) return 0;

  const now = Date.now();
  let flushed = 0;

  for (const tx of pending) {
    const entry = tx as Transaction & Partial<QueueMeta>;

    // Skip items whose backoff period hasn't elapsed yet
    if (entry.nextRetryAt && new Date(entry.nextRetryAt).getTime() > now) {
      continue;
    }

    // Skip dead-letter items (exceeded max retries) — they remain visible to admins
    const retryCount = entry.retryCount ?? 0;
    if (retryCount >= MAX_RETRIES) {
      continue;
    }

    try {
      // ── Collection replay path ───────────────────────────────────────────
      // When the entry has rawInput, it MUST be replayed through the
      // server-authoritative submitCollection callback so finance is
      // recomputed on the server.  If the callback is not provided, this is
      // treated as a permanent replay-path misconfiguration — dead-letter the
      // entry immediately instead of silently falling back to a direct upsert
      // of locally-computed finance values.
      if (entry.rawInput) {
        if (!options?.submitCollection) {
          await recordRetryFailure(
            tx.id,
            'submitCollection callback unavailable for collection replay',
            'permanent',
          );
          continue;
        }

        // Reconstruct photoUrl from the stored tx entry rather than rawInput,
        // since photoUrl is stripped from rawInput at enqueue time to avoid
        // storing duplicate base64 payloads.
        const replayInput: CollectionSubmissionInput = {
          ...entry.rawInput,
          photoUrl: entry.rawInput.photoUrl ?? (entry.photoUrl ?? null),
        };

        const result = await options.submitCollection(replayInput);
        if (result.success) {
          appendCollectionSubmissionAudit({
            timestamp: new Date().toISOString(),
            event: 'queue_flush_success',
            txId: result.transaction.id,
            locationId: result.transaction.locationId,
            locationName: result.transaction.locationName,
            driverId: result.transaction.driverId,
            resolvedScore: result.transaction.currentScore,
            previousScore: result.transaction.previousScore,
            source: 'server',
            metadata: {
              paymentStatus: result.transaction.paymentStatus,
              approvalStatus: result.transaction.approvalStatus,
            },
          });
          // Write the server-authoritative transaction back into the queued
          // entry so locally-computed finance values are replaced by the
          // persisted row before marking synced.  This also handles duplicate
          // txId replay: the server returns the already-persisted row and we
          // treat that as a success.
          await markSynced(tx.id, result.transaction);
          flushed++;
          options.onProgress?.(flushed, pending.length);
        } else {
          // Cast to narrow the union: TypeScript's control flow narrowing is not
          // reliably applied to discriminated unions in this project's tsconfig.
          const failResult = result as { success: false; error: string };
          appendCollectionSubmissionAudit({
            timestamp: new Date().toISOString(),
            event: 'queue_flush_failure',
            txId: tx.id,
            locationId: tx.locationId,
            locationName: tx.locationName,
            driverId: tx.driverId,
            resolvedScore: tx.currentScore,
            previousScore: tx.previousScore,
            source: 'offline',
            reason: failResult.error,
          });
          const category = classifyError(failResult.error);
          await recordRetryFailure(tx.id, failResult.error, category);
        }
        continue;
      }

      if (entry.type === 'reset_request') {
        if (!options?.submitResetRequest) {
          await recordRetryFailure(
            tx.id,
            'submitResetRequest callback unavailable for reset request replay',
            'permanent',
          );
          continue;
        }

        const result = await options.submitResetRequest(entry);
        await markSynced(tx.id, result);
        flushed++;
        options.onProgress?.(flushed, pending.length);
        continue;
      }

      if (entry.type === 'payout_request') {
        if (!options?.submitPayoutRequest) {
          await recordRetryFailure(
            tx.id,
            'submitPayoutRequest callback unavailable for payout request replay',
            'permanent',
          );
          continue;
        }

        const result = await options.submitPayoutRequest(entry);
        await markSynced(tx.id, result);
        flushed++;
        options.onProgress?.(flushed, pending.length);
        continue;
      }

      // ── Generic upsert fallback (legacy entries without authoritative callbacks) ──
      const { error } = await supabaseClient
        .from('transactions')
        .upsert({ ...tx, isSynced: true });
      if (!error) {
        await markSynced(tx.id);
        flushed++;
        options?.onProgress?.(flushed, pending.length);
      } else {
        const category = classifyError(error.message);
        await recordRetryFailure(tx.id, error.message, category);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordRetryFailure(tx.id, msg, classifyError(msg));
    }
  }
  return flushed;
}

/**
 * Classify a flush error as 'permanent' or 'transient'.
 *
 * Permanent errors will never succeed on retry (auth failure, not-found,
 * validation).  The entry is dead-lettered immediately.
 * Transient errors may succeed once connectivity or the server recovers.
 */
export function classifyError(msg: string): 'transient' | 'permanent' {
  const lower = msg.toLowerCase();
  const permanentSignals = [
    'forbidden',
    'authentication required',
    'not found',
    'invalid',
    'permission denied',
    'unauthorized',
    'violates',        // DB constraint violations (foreign key, check, etc.)
  ];
  if (permanentSignals.some(s => lower.includes(s))) return 'permanent';
  return 'transient';
}

/** Update retry metadata with exponential backoff after a flush failure. */
async function recordRetryFailure(
  id: string,
  errorMessage: string,
  category: 'transient' | 'permanent' = 'transient',
): Promise<void> {
  try {
    const db    = await openDB();
    const txDb  = db.transaction(STORE_TX, 'readwrite');
    const store = txDb.objectStore(STORE_TX);
    const item  = await new Promise<(Transaction & Partial<QueueMeta>) | undefined>((res, rej) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
    if (item) {
      // Permanent errors skip to MAX_RETRIES so the entry is dead-lettered
      // on the next flush pass and stops consuming retry budget.
      const newRetry = category === 'permanent'
        ? MAX_RETRIES
        : (item.retryCount ?? 0) + 1;
      const backoffMs = category === 'permanent'
        ? 0
        : BASE_BACKOFF_MS * Math.pow(2, Math.min(newRetry - 1, 4));
      await new Promise<void>((res, rej) => {
        const r = store.put({
          ...item,
          retryCount: newRetry,
          lastError: errorMessage,
          lastErrorCategory: category,
          nextRetryAt: backoffMs > 0
            ? new Date(Date.now() + backoffMs).toISOString()
            : undefined,
        });
        r.onsuccess = () => res();
        r.onerror   = () => rej(r.error);
      });
    }
    db.close();
  } catch {
    // IDB unavailable — update localStorage fallback with retry/dead-letter metadata
    try {
      const raw  = localStorage.getItem('bahati_offline_queue') || '[]';
      const list = JSON.parse(raw) as Array<Transaction & Partial<QueueMeta>>;
      const updated = list.map(t => {
        if (t.id !== id) return t;
        const newRetry = category === 'permanent'
          ? MAX_RETRIES
          : (t.retryCount ?? 0) + 1;
        const backoffMs = category === 'permanent'
          ? 0
          : BASE_BACKOFF_MS * Math.pow(2, Math.min(newRetry - 1, 4));
        return {
          ...t,
          retryCount: newRetry,
          lastError: errorMessage,
          lastErrorCategory: category,
          nextRetryAt: backoffMs > 0
            ? new Date(Date.now() + backoffMs).toISOString()
            : undefined,
        };
      });
      localStorage.setItem('bahati_offline_queue', JSON.stringify(updated));
    } catch (_) {
      // Truly best-effort
    }
  }
}

/** Get transactions that have exceeded max retries (dead-letter items). */
export async function getDeadLetterItems(): Promise<Transaction[]> {
  try {
    const all = await getAllQueuedTransactions();
    return all.filter(tx => {
      const entry = tx as Transaction & Partial<QueueMeta>;
      return !entry.isSynced && (entry.retryCount ?? 0) >= MAX_RETRIES;
    });
  } catch {
    return [];
  }
}

// ── Queue size (for badge display) ───────────────────────────────────────────
export async function getQueueSize(): Promise<number> {
  try {
    const pending = await getPendingTransactions();
    return pending.length;
  } catch {
    return 0;
  }
}

// ── Queue health summary (for diagnostics / operator view) ────────────────────

/**
 * Breakdown of queued entry states for operator/support visibility.
 *
 *   pending      – not synced, within retry budget, not currently in backoff.
 *   retryWaiting – not synced, within retry budget, but backoff timer has not
 *                  yet elapsed; will be retried on the next flush pass.
 *   deadLetter   – not synced, exceeded max retries; will NOT be auto-retried
 *                  and must be inspected or manually resolved.
 */
export interface QueueHealthSummary {
  pending: number;
  retryWaiting: number;
  deadLetter: number;
}

/**
 * Compute a point-in-time health summary of the offline queue.
 * Returns zeros if the queue cannot be read.
 */
export async function getQueueHealthSummary(): Promise<QueueHealthSummary> {
  try {
    const all = await getAllQueuedTransactions();
    const now = Date.now();
    let pending = 0;
    let retryWaiting = 0;
    let deadLetter = 0;
    for (const tx of all) {
      const entry = tx as Transaction & Partial<QueueMeta>;
      if (entry.isSynced) continue;
      const retryCount = entry.retryCount ?? 0;
      if (retryCount >= MAX_RETRIES) {
        deadLetter++;
      } else if (entry.nextRetryAt && new Date(entry.nextRetryAt).getTime() > now) {
        retryWaiting++;
      } else {
        pending++;
      }
    }
    return { pending, retryWaiting, deadLetter };
  } catch {
    return { pending: 0, retryWaiting: 0, deadLetter: 0 };
  }
}

// ── Manual replay of dead-letter items ───────────────────────────────────────

/**
 * Replay eligibility rules for dead-letter items.
 *
 * An item is eligible for manual replay when ALL of the following hold:
 *   1. It is not already synced.
 *   2. Its retryCount has reached MAX_RETRIES (it is in dead-letter state).
 *
 * Collection entries (with rawInput) use the server-authoritative
 * submit_collection_v2 path when a submitCollection callback is supplied.
 * Entries without rawInput fall back to a direct upsert.
 *
 * Returns null when the item is eligible, or a human-readable reason string
 * when it is not.
 */
export function getReplayIneligibilityReason(
  entry: Transaction & Partial<QueueMeta>,
): string | null {
  if (entry.isSynced) return 'already synced';
  if ((entry.retryCount ?? 0) < MAX_RETRIES) return 'not in dead-letter state';
  return null; // eligible
}

/** Options for a manual replay attempt. */
export interface ManualReplayOptions {
  /**
   * Server-authoritative collection submission callback.
   * Required for entries that carry rawInput (collection transactions).
   * Inject `submitCollectionV2` from `services/collectionSubmissionService`.
   */
  submitCollection?: (input: CollectionSubmissionInput) => Promise<CollectionSubmissionResult>;
  submitResetRequest?: (tx: Transaction) => Promise<Transaction>;
  submitPayoutRequest?: (tx: Transaction) => Promise<Transaction>;
  /** Supabase client used for the direct-upsert fallback path. */
  supabaseClient: SupabaseClient;
}

/** Discriminated result returned by `replayDeadLetterItem`. */
export type ManualReplayResult =
  | { success: true; transaction?: Transaction }
  | { success: false; error: string };

/**
 * Manually replay a single dead-letter queue entry.
 *
 * Routing:
 *   - Collection entries (rawInput present) → submitCollection callback when
 *     supplied, otherwise returns an eligibility error without touching state.
 *   - Non-collection / legacy entries (no rawInput) → direct upsert via
 *     supabaseClient.
 *
 * On success:
 *   The entry is marked synced; server-authoritative finance values are merged
 *   back into the stored entry (same as the normal flush path).
 *
 * On failure:
 *   The entry remains in dead-letter state with lastError updated to the new
 *   error so the operator can see the most-recent failure reason.
 *   retryCount is NOT reset so the item stays visible in the dead-letter list.
 */
export async function replayDeadLetterItem(
  id: string,
  options: ManualReplayOptions,
): Promise<ManualReplayResult> {
  // Load the target entry
  let entry: (Transaction & Partial<QueueMeta>) | undefined;
  try {
    const all = await getAllQueuedTransactions();
    entry = all.find(t => t.id === id) as (Transaction & Partial<QueueMeta>) | undefined;
  } catch {
    return { success: false, error: 'Failed to read queue entry' };
  }

  if (!entry) {
    return { success: false, error: 'Queue entry not found' };
  }

  const ineligible = getReplayIneligibilityReason(entry);
  if (ineligible) {
    return { success: false, error: `Not eligible for replay: ${ineligible}` };
  }

  try {
    // ── Collection replay path ───────────────────────────────────────────────
    if (entry.rawInput) {
      if (!options.submitCollection) {
        return {
          success: false,
          error: 'submitCollection callback required to replay a collection entry through the authoritative path',
        };
      }

      // Reconstruct photoUrl from the stored tx entry (stripped from rawInput at enqueue time).
      const replayInput: CollectionSubmissionInput = {
        ...entry.rawInput,
        photoUrl: entry.rawInput.photoUrl ?? (entry.photoUrl ?? null),
      };

      const result = await options.submitCollection(replayInput);
      if (result.success) {
        await markSynced(id, result.transaction);
        return { success: true, transaction: result.transaction };
      } else {
        // Failure: update lastError while keeping the entry in dead-letter state.
        // retryCount stays at MAX_RETRIES so the item remains visible for the operator.
        // Cast to narrow the union: TypeScript's control flow narrowing is not
        // reliably applied to discriminated unions in this project's tsconfig.
        const failureResult = result as { success: false; error: string };
        await _updateDeadLetterError(id, failureResult.error, classifyError(failureResult.error));
        return { success: false, error: failureResult.error };
      }
    }

    if (entry.type === 'reset_request') {
      if (!options.submitResetRequest) {
        return {
          success: false,
          error: 'submitResetRequest callback required to replay a reset request through the authoritative path',
        };
      }

      const result = await options.submitResetRequest(entry);
      await markSynced(id, result);
      return { success: true, transaction: result };
    }

    if (entry.type === 'payout_request') {
      if (!options.submitPayoutRequest) {
        return {
          success: false,
          error: 'submitPayoutRequest callback required to replay a payout request through the authoritative path',
        };
      }

      const result = await options.submitPayoutRequest(entry);
      await markSynced(id, result);
      return { success: true, transaction: result };
    }

    // ── Direct upsert fallback (legacy entries) ─────────────────────────────
    const { error } = await options.supabaseClient
      .from('transactions')
      .upsert({ ...entry, isSynced: true });
    if (!error) {
      await markSynced(id);
      return { success: true };
    }

    await _updateDeadLetterError(id, error.message, classifyError(error.message));
    return { success: false, error: error.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await _updateDeadLetterError(id, msg, classifyError(msg));
    return { success: false, error: msg };
  }
}

/**
 * Update the lastError and lastErrorCategory fields of a dead-letter entry
 * without changing its retryCount (keeps it in dead-letter state after a
 * failed manual replay).
 */
async function _updateDeadLetterError(
  id: string,
  errorMessage: string,
  errorCategory: 'transient' | 'permanent',
): Promise<void> {
  try {
    const db    = await openDB();
    const txDb  = db.transaction(STORE_TX, 'readwrite');
    const store = txDb.objectStore(STORE_TX);
    const item  = await new Promise<(Transaction & Partial<QueueMeta>) | undefined>((res, rej) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
    if (item) {
      await new Promise<void>((res, rej) => {
        const r = store.put({ ...item, lastError: errorMessage, lastErrorCategory: errorCategory });
        r.onsuccess = () => res();
        r.onerror   = () => rej(r.error);
      });
    }
    db.close();
  } catch {
    try {
      const raw  = localStorage.getItem('bahati_offline_queue') || '[]';
      const list = JSON.parse(raw) as Array<Transaction & Partial<QueueMeta>>;
      const updated = list.map(t =>
        t.id === id ? { ...t, lastError: errorMessage, lastErrorCategory: errorCategory } : t,
      );
      localStorage.setItem('bahati_offline_queue', JSON.stringify(updated));
    } catch (_) {
      // Truly best-effort
    }
  }
}

// ── Fleet-wide queue health reporting ────────────────────────────────────────

const DEVICE_ID_KEY = 'bahati_device_id';

/**
 * Returns a stable per-device identifier persisted in localStorage.
 * A new UUID is generated on first call and reused on subsequent visits.
 */
export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = safeRandomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // In environments without localStorage (e.g. tests with no storage) fall back
    // to a session-scoped value.
    return `ephemeral-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Dead-letter item summary stored inside queue_health_reports.dead_letter_items.
 * Contains only the fields needed for admin visibility — no raw user data.
 */
export interface DeadLetterSummaryItem {
  txId: string;
  operationId?: string;
  lastError?: string;
  lastErrorCategory?: 'transient' | 'permanent';
  retryCount: number;
  locationId: string;
  locationName?: string;
  queuedAt?: string;
}

/**
 * Reports the current local queue health to Supabase so admins can view
 * fleet-wide aggregated diagnostics without accessing each device directly.
 *
 * Upserts one row per `(deviceId, driverId)` pair into `queue_health_reports`.
 * Safe to call fire-and-forget after every successful flush; errors are logged
 * but never re-thrown to avoid disrupting the sync path.
 *
 * @param supabaseClient  Authenticated Supabase client.
 * @param driverId        The driver whose queue is being reported.
 * @param driverName      Human-readable name for admin display.
 * @param deviceId        Optional stable device ID; auto-created when omitted.
 */
export async function reportQueueHealthToServer(
  supabaseClient: SupabaseClient,
  driverId: string,
  driverName: string,
  deviceId?: string,
): Promise<void> {
  try {
    const id = deviceId ?? getOrCreateDeviceId();
    const [summary, deadItems] = await Promise.all([
      getQueueHealthSummary(),
      getDeadLetterItems(),
    ]);

    const deadLetterItems: DeadLetterSummaryItem[] = deadItems.map((tx) => {
      const meta = tx as Transaction & Partial<QueueMeta>;
      return {
        txId: tx.id,
        operationId: meta.operationId,
        lastError: meta.lastError,
        lastErrorCategory: meta.lastErrorCategory,
        retryCount: meta.retryCount ?? 0,
        locationId: tx.locationId,
        locationName: tx.locationName,
        queuedAt: meta._queuedAt,
      };
    });

    const row = {
      id: `${id}--${driverId}`,
      device_id: id,
      driver_id: driverId,
      driver_name: driverName,
      pending_count: summary.pending,
      retry_waiting_count: summary.retryWaiting,
      dead_letter_count: summary.deadLetter,
      dead_letter_items: deadLetterItems,
      // reported_at is set server-side by trigger to avoid clock-skew issues.
    };

    const { error } = await supabaseClient
      .from('queue_health_reports')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.warn('[reportQueueHealthToServer] Upsert failed:', error.message);
    }
  } catch (err) {
    console.warn('[reportQueueHealthToServer] Unexpected error:', err);
  }
}

// ── Extract GPS from EXIF metadata of a base64 image ─────────────────────────
export function extractGpsFromExif(
  imageDataUrl: string
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image')) {
      resolve(null);
      return;
    }
    try {
      // Convert data URL to ArrayBuffer for EXIF parsing
      const base64 = imageDataUrl.split(',')[1];
      if (!base64) { resolve(null); return; }
      const binary  = atob(base64);
      const bytes   = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // Use EXIF.js via img element (most compatible approach)
      const img = new Image();
      img.onload = () => {
        try {
          // Resolve EXIF once to avoid repeated (window as any) casts
          const EXIFLib = (window as any).EXIF;
          if (!EXIFLib) { resolve(null); return; }
          EXIFLib.getData(img, function(this: HTMLImageElement) {
            const lat    = EXIFLib.getTag(this, 'GPSLatitude');
            const latRef = EXIFLib.getTag(this, 'GPSLatitudeRef');
            const lng    = EXIFLib.getTag(this, 'GPSLongitude');
            const lngRef = EXIFLib.getTag(this, 'GPSLongitudeRef');

            if (lat && lng) {
              const toDecimal = (dms: number[]) =>
                dms[0] + dms[1] / 60 + dms[2] / 3600;
              const latDec = toDecimal(lat) * (latRef === 'S' ? -1 : 1);
              const lngDec = toDecimal(lng) * (lngRef === 'W' ? -1 : 1);
              if (isFinite(latDec) && isFinite(lngDec) && (latDec !== 0 || lngDec !== 0)) {
                resolve({ lat: latDec, lng: lngDec });
                return;
              }
            }
            resolve(null);
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = imageDataUrl;
    } catch {
      resolve(null);
    }
  });
}

// ── Estimate location from last known GPS (dead-reckoning fallback) ───────────
export function estimateLocationFromContext(
  lastKnownGps: { lat: number; lng: number } | null,
  locationCoords: { lat: number; lng: number } | null
): { lat: number; lng: number; isEstimated: boolean } | null {
  // Prefer machine's registered coordinates (most accurate for "at site")
  if (locationCoords && locationCoords.lat !== 0) {
    return { ...locationCoords, isEstimated: true };
  }
  // Fall back to last known GPS
  if (lastKnownGps) {
    return { ...lastKnownGps, isEstimated: true };
  }
  return null;
}
