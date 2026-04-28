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

import * as Sentry from '@sentry/react';
import { SupabaseClient } from '@supabase/supabase-js';

import { appendCollectionSubmissionAudit } from './services/collectionSubmissionAudit';
import { isFailure } from './services/collectionSubmissionService';
import { persistEvidencePhotoUrl } from './services/evidenceStorage';
import { Transaction, safeRandomUUID } from './types';

import type { CollectionSubmissionInput, CollectionSubmissionResult } from './services/collectionSubmissionService';



const DB_NAME    = 'bahati_offline_db';
const DB_VERSION = 2;
const STORE_TX   = 'pending_transactions';
const QUEUE_STORAGE_KEY = 'bahati_offline_queue';
const MS_PER_DAY = 86_400_000;
export const MAX_RETRIES = 5;
const MISSING_COLLECTION_PHOTO_ERROR = 'Missing required collection evidence photoUrl';
const FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR = 'Evidence photo persistence failed for required collection photoUrl';

// ── Utility: Validate photoUrl is a proper HTTP(S) URL ───────────────────────
function isValidHttpUrl(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDataImageUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}

function getRequiredCollectionReplayPhotoUrl(entry: Transaction & Partial<QueueMeta>): string | null {
  const rawPhotoUrl = entry.rawInput?.photoUrl;
  if (typeof rawPhotoUrl === 'string' && rawPhotoUrl.trim()) {
    return rawPhotoUrl;
  }
  if (typeof entry.photoUrl === 'string' && entry.photoUrl.trim()) {
    return entry.photoUrl;
  }
  return null;
}
const BASE_BACKOFF_MS = 2_000; // 2 s → 4 s → 8 s → 16 s → 32 s

// ✅ 问题 8 修复：localStorage 可用性检查 + 内存缓存降级
// 某些浏览器（隐私模式、cross-origin iframe）会禁用或限制 localStorage
// 但直接 typeof 检查不足以检测实际的写入失败

function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;  // Node.js 环境
  if (typeof window.localStorage === 'undefined') return false;

  try {
    const test = '__storage_test__';
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;  // ✓ 完全可用
  } catch {
    return false;  // ❌ 禁用或配额满
  }
}

const memoryQueueCache = new Map<string, Array<Transaction & Partial<QueueMeta>>>();

function captureQueueMessage(message: string, extras: Record<string, unknown> = {}): void {
  try {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(extras)) {
        scope.setExtra?.(key, value);
      }
      Sentry.captureMessage(message);
    });
  } catch {
    // Best-effort only; queue behavior must not depend on telemetry.
  }
}

function captureQueueException(
  message: string,
  error: unknown,
  extras: Record<string, unknown> = {},
): void {
  try {
    Sentry.withScope((scope) => {
      scope.setExtra?.('queue_message', message);
      for (const [key, value] of Object.entries(extras)) {
        scope.setExtra?.(key, value);
      }
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(`${message}: ${String(error)}`);
      }
    });
  } catch {
    // Best-effort only; queue behavior must not depend on telemetry.
  }
}

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
  /** Evidence photo still needs to be persisted to storage before replay. */
  photoPending?: boolean;
  /** Most recent storage/persistence error for a queued evidence photo. */
  lastEvidenceError?: string;
}

function normalizeQueueMeta(item: Transaction & Partial<QueueMeta>): Transaction & QueueMeta {
  return {
    ...item,
    operationId: item.operationId ?? item.id,
    entityVersion: item.entityVersion ?? 1,
    _queuedAt: item._queuedAt ?? new Date().toISOString(),
    retryCount: item.retryCount ?? 0,
  };
}

function readLocalQueue(): Array<Transaction & QueueMeta> {
  if (!isLocalStorageAvailable()) {
    return (memoryQueueCache.get(QUEUE_STORAGE_KEY) ?? []).map(normalizeQueueMeta);
  }

  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Array<Transaction & Partial<QueueMeta>>).map(normalizeQueueMeta) : [];
  } catch {
    return [];
  }
}

// 改进的 localStorage 写入，with fallback to memory cache
function writeLocalQueue(queue: Array<Transaction & Partial<QueueMeta>>): void {
  if (!isLocalStorageAvailable()) {
    memoryQueueCache.set(QUEUE_STORAGE_KEY, queue);
    return;
  }

  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[OfflineQueue] localStorage write failed, using memory cache', err);
    memoryQueueCache.set(QUEUE_STORAGE_KEY, queue);
  }
}

function toTransactionUpsertPayload(entry: Transaction & Partial<QueueMeta>): Transaction {
  const {
    operationId: _operationId,
    entityVersion: _entityVersion,
    _queuedAt,
    retryCount: _retryCount,
    lastError: _lastError,
    nextRetryAt: _nextRetryAt,
    rawInput: _rawInput,
    lastErrorCategory: _lastErrorCategory,
    photoPending: _photoPending,
    lastEvidenceError: _lastEvidenceError,
    ...transaction
  } = entry;

  return { ...transaction, isSynced: true };
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
async function prepareCollectionEvidenceForQueue(
  tx: Transaction,
  rawInput?: CollectionSubmissionInput,
): Promise<{
  tx: Transaction & Pick<Partial<QueueMeta>, 'photoPending' | 'lastEvidenceError'>;
  rawInput?: CollectionSubmissionInput;
}> {
  if (!rawInput) {
    return { tx, rawInput };
  }

  const sourcePhotoUrl = rawInput.photoUrl ?? tx.photoUrl ?? null;
  const storedRawInput: CollectionSubmissionInput = { ...rawInput, photoUrl: null };

  if (!isDataImageUrl(sourcePhotoUrl)) {
    return {
      tx: { ...tx, photoUrl: sourcePhotoUrl ?? tx.photoUrl },
      rawInput: sourcePhotoUrl ? { ...storedRawInput, photoUrl: sourcePhotoUrl } : storedRawInput,
    };
  }

  try {
    const persistedPhotoUrl = await persistEvidencePhotoUrl(sourcePhotoUrl, {
      category: 'collection',
      entityId: rawInput.txId,
      driverId: rawInput.driverId,
      required: false,
    });

    if (isValidHttpUrl(persistedPhotoUrl)) {
      return {
        tx: { ...tx, photoUrl: persistedPhotoUrl, photoPending: false, lastEvidenceError: undefined },
        rawInput: { ...storedRawInput, photoUrl: persistedPhotoUrl },
      };
    }

    return {
      tx: {
        ...tx,
        photoUrl: sourcePhotoUrl,
        photoPending: true,
        lastEvidenceError: FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR,
      },
      rawInput: storedRawInput,
    };
  } catch (error) {
    return {
      tx: {
        ...tx,
        photoUrl: sourcePhotoUrl,
        photoPending: true,
        lastEvidenceError: error instanceof Error ? error.message : String(error),
      },
      rawInput: storedRawInput,
    };
  }
}

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
  // Avoid duplicating base64 in rawInput. If evidence can already be persisted,
  // store the public URL; otherwise keep the dataURL only on the queue entry and
  // mark it for a required persist attempt before replay.
  const prepared = await prepareCollectionEvidenceForQueue(tx, rawInput);
  const storedTx = prepared.tx;
  const storedRawInput = prepared.rawInput;

  const meta: QueueMeta = {
    operationId: generateOperationId(),
    entityVersion: Date.now(),
    _queuedAt: new Date().toISOString(),
    retryCount: 0,
    rawInput: storedRawInput,
    photoPending: storedTx.photoPending,
    lastEvidenceError: storedTx.lastEvidenceError,
  };

  try {
    const db    = await openDB();
    const store = db.transaction(STORE_TX, 'readwrite').objectStore(STORE_TX);
    await new Promise<void>((resolve, reject) => {
      const req = store.put({ ...storedTx, isSynced: false, ...meta });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    // Fallback: use writeLocalQueue which handles unavailable localStorage
    console.warn('[OfflineQueue] IDB unavailable, falling back to localStorage/memory cache', err);
    const list = readLocalQueue();
    const updated = [...list.filter(t => t.id !== tx.id), { ...storedTx, isSynced: false, ...meta }];
    writeLocalQueue(updated);
  }
}

// ── Read all pending (for local display / route map) ─────────────────────────
export async function getPendingTransactions(): Promise<Transaction[]> {
  try {
    const db = await openDB();
    return new Promise<Transaction[]>((resolve, reject) => {
      const store = db.transaction(STORE_TX, 'readonly').objectStore(STORE_TX);
      // IndexedDB keys cannot be booleans, so IDBKeyRange.only(false) throws
      // DataError in Chromium. Read all rows and filter in memory instead.
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as Transaction[]).filter((tx) => !tx.isSynced));
      };
      req.onerror   = () => { db.close(); reject(req.error); };
    });
  } catch {
    return readLocalQueue().filter(t => !t.isSynced);
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
    return readLocalQueue();
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
  // ✅ 数据验证：确保 authoritativeData 的关键字段有效
  if (authoritativeData) {
    // id 必须是字符串
    if (authoritativeData.id && typeof authoritativeData.id !== 'string') {
      throw new Error('Invalid authoritativeData: id must be string');
    }
    
    // currentScore 必须是有限数字
    if (authoritativeData.currentScore !== undefined) {
      if (typeof authoritativeData.currentScore !== 'number' || !isFinite(authoritativeData.currentScore)) {
        throw new Error(`Invalid authoritativeData: currentScore must be finite number, got ${authoritativeData.currentScore}`);
      }
    }
    
    // previousScore 必须是有限数字
    if (authoritativeData.previousScore !== undefined) {
      if (typeof authoritativeData.previousScore !== 'number' || !isFinite(authoritativeData.previousScore)) {
        throw new Error(`Invalid authoritativeData: previousScore must be finite number, got ${authoritativeData.previousScore}`);
      }
    }
    
    // timestamp 必须是有效日期
    if (authoritativeData.timestamp !== undefined) {
      if (typeof authoritativeData.timestamp !== 'string' || isNaN(Date.parse(authoritativeData.timestamp))) {
        throw new Error(`Invalid authoritativeData: timestamp must be valid ISO string, got ${authoritativeData.timestamp}`);
      }
    }
    
    // photoUrl 可选但不能是非字符串的真值
    if (authoritativeData.photoUrl !== undefined && authoritativeData.photoUrl !== null) {
      if (typeof authoritativeData.photoUrl !== 'string') {
        throw new Error(`Invalid authoritativeData: photoUrl must be string or null, got ${typeof authoritativeData.photoUrl}`);
      }
    }
  }
  
  const update = { ...authoritativeData, isSynced: true };
  try {
    const db    = await openDB();
    const txDb = db.transaction(STORE_TX, 'readwrite');
    const store = txDb.objectStore(STORE_TX);
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
    const list = readLocalQueue().map(t => t.id === id ? { ...t, ...update } : t);
    try { localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(list)); } catch (_) {}
  }
}

async function updateQueuedEvidencePhoto(
  id: string,
  photoUrl: string,
  rawInput?: CollectionSubmissionInput,
): Promise<void> {
  try {
    const db = await openDB();
    const txDb = db.transaction(STORE_TX, 'readwrite');
    const store = txDb.objectStore(STORE_TX);
    const item = await new Promise<(Transaction & Partial<QueueMeta>) | undefined>((res, rej) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (item) {
      await new Promise<void>((res, rej) => {
        const r = store.put({
          ...item,
          photoUrl,
          rawInput: rawInput ? { ...rawInput, photoUrl } : item.rawInput,
          photoPending: false,
          lastEvidenceError: undefined,
        });
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
    db.close();
  } catch {
    const list = readLocalQueue();
    const updated = list.map(t =>
      t.id === id
        ? {
            ...t,
            photoUrl,
            rawInput: rawInput ? { ...rawInput, photoUrl } : t.rawInput,
            photoPending: false,
            lastEvidenceError: undefined,
          }
        : t,
    );
    writeLocalQueue(updated);
  }
}

async function persistQueuedEvidencePhoto(
  entry: Transaction & Partial<QueueMeta>,
): Promise<{ success: true; photoUrl: string } | { success: false; error: string; category: 'transient' | 'permanent' }> {
  const replayPhotoUrl = getRequiredCollectionReplayPhotoUrl(entry);
  if (!replayPhotoUrl) {
    return {
      success: false,
      error: MISSING_COLLECTION_PHOTO_ERROR,
      category: classifyError(MISSING_COLLECTION_PHOTO_ERROR),
    };
  }

  if (isValidHttpUrl(replayPhotoUrl)) {
    return { success: true, photoUrl: replayPhotoUrl };
  }

  if (!entry.photoPending && !isDataImageUrl(replayPhotoUrl)) {
    return {
      success: false,
      error: FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR,
      category: classifyError(FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR),
    };
  }

  try {
    const persistedPhotoUrl = await persistEvidencePhotoUrl(replayPhotoUrl, {
      category: 'collection',
      entityId: entry.rawInput?.txId ?? entry.id,
      driverId: entry.rawInput?.driverId ?? entry.driverId,
      required: true,
    });

    if (!isValidHttpUrl(persistedPhotoUrl)) {
      return {
        success: false,
        error: FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR,
        category: classifyError(FAILED_COLLECTION_PHOTO_PERSISTENCE_ERROR),
      };
    }

    await updateQueuedEvidencePhoto(entry.id, persistedPhotoUrl, entry.rawInput);
    return { success: true, photoUrl: persistedPhotoUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      category: classifyError(message),
    };
  }
}

// ── Remove synced entries older than N days (housekeeping) ───────────────────
export async function pruneOldSynced(daysOld = 7): Promise<void> {
  try {
    const db    = await openDB();
    const cutoff = new Date(Date.now() - daysOld * MS_PER_DAY).toISOString();
    await new Promise<void>((resolve, reject) => {
      const txn  = db.transaction(STORE_TX, 'readwrite');
      const store = txn.objectStore(STORE_TX);
      const idx  = store.index('timestamp');
      const req  = idx.openCursor(IDBKeyRange.upperBound(cutoff));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return; // cursor exhausted — transaction will complete
        const item = cursor.value as (Transaction & { isSynced: boolean });
        if (item.isSynced) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      // Resolve when the IDB transaction itself completes (after all cursor ops).
      txn.oncomplete = () => { db.close(); resolve(); };
      txn.onerror   = () => { db.close(); reject(txn.error); };
    });
  } catch {
    // ignore
  }
}

// ── Flush queue → Supabase (called by App on reconnect) ──────────────────────

/**
 * Module-level mutex that prevents concurrent `flushQueue` invocations.
 * Without this guard, two simultaneous flush triggers (e.g. an online-transition
 * event firing while a 60-second interval tick also fires) would both read the
 * same pending items from IDB and submit them twice, wasting server round-trips
 * and risking duplicate-submission errors on non-idempotent legacy entries.
 */
let _isFlushing = false;

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
 *
 * Concurrent calls: if a flush is already in progress, the new call returns 0
 * immediately.  The in-progress flush will process all pending items; the
 * caller can retry on the next scheduled interval.
 */
export async function flushQueue(
  supabaseClient: SupabaseClient,
  options?: FlushOptions,
): Promise<number> {
  // Prevent concurrent flushes from double-submitting the same queued entries.
  if (_isFlushing) return 0;
  _isFlushing = true;

  // ✅ 问题 6 修复：添加整体超时保护，防止 flushQueue 无限卡顿
  // 如果单个 submitCollection 超时，后续所有项都会被阻塞
  // 120s 是合理的超时阈值，足以处理慢速网络，但防止无限等待
  const QUEUE_FLUSH_TIMEOUT_MS = 120_000;
  const startTime = Date.now();

  try {
  const pending = await getPendingTransactions();
  if (pending.length === 0) return 0;

  const now = Date.now();
  let flushed = 0;

  for (const tx of pending) {
    // ✅ 检查整体超时：如果已经超过 120s，停止处理新项
    if (Date.now() - startTime > QUEUE_FLUSH_TIMEOUT_MS) {
      console.warn(
        `[OfflineQueue] flushQueue timeout after ${QUEUE_FLUSH_TIMEOUT_MS}ms. ` +
        `Processed ${flushed}/${pending.length} items. ` +
        'Stopping to prevent indefinite blocking. Remaining items will retry later.'
      );
      break; // ← 强制停止，留在队列中待下次重试
    }

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

        const replayPhoto = await persistQueuedEvidencePhoto(entry);
        if (!replayPhoto.success) {
          await recordRetryFailure(tx.id, replayPhoto.error, replayPhoto.category);
          continue;
        }

        const replayInput: CollectionSubmissionInput = {
          ...entry.rawInput,
          photoUrl: replayPhoto.photoUrl,
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
          const failResult = isFailure(result)
            ? result
            : { success: false as const, error: 'Unknown collection replay failure' };
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
          const category = failResult.kind === 'config' ? 'permanent' : classifyError(failResult.error);
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
        .upsert(toTransactionUpsertPayload(entry));
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
  } finally {
    _isFlushing = false;
  }
}

/**
 * Classify a flush error as 'permanent' or 'transient'.
 *
 * Permanent errors will never succeed on retry (auth failure, not-found,
 * validation).  The entry is dead-lettered immediately.
 * Transient errors may succeed once connectivity or the server recovers.
 *
 * ✅ 问题 9 修复：完善分类逻辑，新增常见错误模式
 */
export function classifyError(msg: string): 'transient' | 'permanent' {
  const lower = msg.toLowerCase();
  
  // ✅ 新增：transient 错误信号（网络/服务器问题，可重试）
  const transientSignals = [
    'timeout',
    'network error',
    'fetch failed',
    'connection reset',
    'econnrefused',
    'econnreset',
    'etimedout',
    'dns',
    'socket hang up',
    '500 internal server error',
    '502 bad gateway',
    '503 service unavailable',
    '504 gateway timeout',
    'request aborted',
    'offline',
    'evidence photo upload failed',
  ];
  if (transientSignals.some(s => lower.includes(s))) return 'transient';

  // ✅ 新增：permanent 错误信号（不可重试，立即 dead-letter）
  const permanentSignals = [
    'missing required collection evidence photourl',
    'missing required',
    'forbidden',
    // 'authentication required' is intentionally excluded: an expired JWT is
    // a transient condition — the user can re-login and the item should retry.
    'not found',
    'invalid',
    'permission denied',
    'unauthorized',
    'violates',        // DB constraint violations (foreign key, check, etc.)
    'bad request',     // 400 errors - client sent malformed data
    'validation error',
    'schema mismatch',
    'duplicate key',   // already exists, retry won't help
    'constraint',
    'supabase not configured',
    'evidence photo persistence failed',
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
      if (newRetry >= MAX_RETRIES) {
        captureQueueMessage('offline_queue_dead_lettered', {
          txId: id,
          errorMessage,
          errorCategory: category,
          retryCount: newRetry,
        });
      }
    }
    db.close();
  } catch {
    // IDB unavailable — update localStorage fallback with retry/dead-letter metadata
    try {
      const list = readLocalQueue();
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
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
      const updatedEntry = updated.find(t => t.id === id);
      if ((updatedEntry?.retryCount ?? 0) >= MAX_RETRIES) {
        captureQueueMessage('offline_queue_dead_lettered', {
          txId: id,
          errorMessage,
          errorCategory: category,
          retryCount: updatedEntry?.retryCount ?? MAX_RETRIES,
        });
      }
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

/** Permanently remove one dead-letter item after an operator decides it cannot be replayed. */
export async function discardDeadLetterItem(id: string): Promise<boolean> {
  const all = await getAllQueuedTransactions();
  const entry = all.find(tx => tx.id === id) as (Transaction & Partial<QueueMeta>) | undefined;
  if (!entry || entry.isSynced || (entry.retryCount ?? 0) < MAX_RETRIES) {
    return false;
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const txDb = db.transaction(STORE_TX, 'readwrite');
      const store = txDb.objectStore(STORE_TX);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
    return true;
  } catch {
    const list = readLocalQueue();
    const updated = list.filter(tx => tx.id !== id);
    if (updated.length === list.length) return false;
    writeLocalQueue(updated);
    return true;
  }
}

/**
 * Reset all dead-letter items back to a retryable state.
 *
 * Clears `retryCount` to 0 and removes `nextRetryAt` so every entry is
 * eligible on the next `flushQueue` pass.  Use this after the underlying
 * issue has been resolved (e.g. re-login after an expired JWT).
 *
 * Returns the number of items that were reset.
 */
export async function resetDeadLetterItems(): Promise<number> {
  try {
    const deadItems = await getDeadLetterItems();
    if (deadItems.length === 0) return 0;

    let db: IDBDatabase | undefined;
    let count = 0;

    try {
      db = await openDB();
      for (const tx of deadItems) {
        await new Promise<void>((resolve, reject) => {
          const t = db!.transaction(STORE_TX, 'readwrite');
          const store = t.objectStore(STORE_TX);
          const req = store.get(tx.id);
          req.onsuccess = () => {
            const entry = req.result as (Transaction & Partial<QueueMeta>) | undefined;
            if (!entry) { resolve(); return; }
            entry.retryCount = 0;
            entry.nextRetryAt = undefined;
            entry.lastError = undefined;
            entry.lastErrorCategory = undefined;
            const put = store.put(entry);
            put.onsuccess = () => { count++; resolve(); };
            put.onerror = () => reject(put.error);
          };
          req.onerror = () => reject(req.error);
        });
      }
    } finally {
      db?.close();
    }

    return count;
  } catch {
    try {
      const list = readLocalQueue();
      let count = 0;
      const updated = list.map(entry => {
        if (entry.isSynced || (entry.retryCount ?? 0) < MAX_RETRIES) return entry;
        count++;
        return {
          ...entry,
          retryCount: 0,
          nextRetryAt: undefined,
          lastError: undefined,
          lastErrorCategory: undefined,
        };
      });
      if (count === 0) return 0;
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
      return count;
    } catch {
      return 0;
    }
  }
}

/**
 * Clear the `nextRetryAt` backoff timestamp for every non-dead-letter item,
 * making them immediately eligible for `flushQueue`.
 *
 * Call this before a manual "Retry Now" so that items stuck in exponential
 * backoff don't silently get skipped.  Does NOT touch `retryCount` — the
 * retry budget is preserved so permanent errors still dead-letter correctly.
 *
 * Returns the number of items whose backoff was cleared.
 */
export async function resetRetryBackoff(): Promise<number> {
  try {
    const all = await getAllQueuedTransactions();
    const now = Date.now();
    let db: IDBDatabase | undefined;
    let count = 0;

    try {
      db = await openDB();
      for (const tx of all) {
        const entry = tx as Transaction & Partial<QueueMeta>;
        if (entry.isSynced) continue;
        if ((entry.retryCount ?? 0) >= MAX_RETRIES) continue; // dead-letter, skip
        if (!entry.nextRetryAt) continue; // no backoff set, nothing to clear
        if (new Date(entry.nextRetryAt).getTime() <= now) continue; // already eligible

        await new Promise<void>((resolve, reject) => {
          const t = db!.transaction(STORE_TX, 'readwrite');
          const store = t.objectStore(STORE_TX);
          const req = store.get(entry.id);
          req.onsuccess = () => {
            const e = req.result as (Transaction & Partial<QueueMeta>) | undefined;
            if (!e) { resolve(); return; }
            e.nextRetryAt = undefined;
            const put = store.put(e);
            put.onsuccess = () => { count++; resolve(); };
            put.onerror = () => reject(put.error);
          };
          req.onerror = () => reject(req.error);
        });
      }
    } finally {
      db?.close();
    }

    return count;
  } catch {
    try {
      const list = readLocalQueue();
      const now = Date.now();
      let count = 0;
      const updated = list.map(entry => {
        if (entry.isSynced) return entry;
        if ((entry.retryCount ?? 0) >= MAX_RETRIES) return entry;
        if (!entry.nextRetryAt) return entry;
        if (new Date(entry.nextRetryAt).getTime() <= now) return entry;
        count++;
        return {
          ...entry,
          nextRetryAt: undefined,
        };
      });
      if (count === 0) return 0;
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
      return count;
    } catch {
      return 0;
    }
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

      const replayPhoto = await persistQueuedEvidencePhoto(entry);
      if (!replayPhoto.success) {
        await _updateDeadLetterError(id, replayPhoto.error, replayPhoto.category);
        return { success: false, error: replayPhoto.error };
      }

      const replayInput: CollectionSubmissionInput = {
        ...entry.rawInput,
        photoUrl: replayPhoto.photoUrl,
      };

      const result = await options.submitCollection(replayInput);
      if (result.success) {
        await markSynced(id, result.transaction);
        return { success: true, transaction: result.transaction };
      } else {
        const failureResult = isFailure(result)
          ? result
          : { success: false as const, error: 'Unknown collection replay failure' };
        const category = failureResult.kind === 'config' ? 'permanent' : classifyError(failureResult.error);
        await _updateDeadLetterError(id, failureResult.error, category);
        captureQueueMessage('offline_queue_manual_replay_failed', {
          txId: id,
          errorMessage: failureResult.error,
          errorCategory: category,
          entryType: entry.type ?? 'collection',
        });
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
      .upsert(toTransactionUpsertPayload(entry));
    if (!error) {
      await markSynced(id);
      return { success: true };
    }

    await _updateDeadLetterError(id, error.message, classifyError(error.message));
    captureQueueMessage('offline_queue_manual_replay_failed', {
      txId: id,
      errorMessage: error.message,
      errorCategory: classifyError(error.message),
      entryType: entry.type ?? 'legacy',
    });
    return { success: false, error: error.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await _updateDeadLetterError(id, msg, classifyError(msg));
    captureQueueException('offline_queue_manual_replay_failed', e, {
      txId: id,
      errorMessage: msg,
      errorCategory: classifyError(msg),
      entryType: entry.type ?? 'legacy',
    });
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
      const list = readLocalQueue();
      const updated = list.map(t =>
        t.id === id ? { ...t, lastError: errorMessage, lastErrorCategory: errorCategory } : t,
      );
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {
      // Truly best-effort
    }
  }
}

// ── Fleet-wide queue health reporting ────────────────────────────────────────

const DEVICE_ID_KEY = 'bahati_device_id';

/**
 * Returns a stable per-device identifier persisted in localStorage or memory cache.
 * A new UUID is generated on first call and reused on subsequent visits.
 * 
 * ✅ 问题 8 修复：支持无 localStorage 环境（隐私模式等）
 */
export function getOrCreateDeviceId(): string {
  if (!isLocalStorageAvailable()) {
    // Fallback: use memory cache
    const MEMORY_DEVICE_ID_KEY = '__device_id__';
    if (!memoryQueueCache.has(MEMORY_DEVICE_ID_KEY)) {
      memoryQueueCache.set(MEMORY_DEVICE_ID_KEY, [{ id: safeRandomUUID() } as any]);
    }
    const cached = memoryQueueCache.get(MEMORY_DEVICE_ID_KEY);
    return (cached?.[0]?.id) ?? safeRandomUUID();
  }

  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = safeRandomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (err) {
    // localStorage 写入失败，使用内存存储
    console.warn('[OfflineQueue] localStorage unavailable for deviceId, using memory cache', err);
    const MEMORY_DEVICE_ID_KEY = '__device_id__';
    if (!memoryQueueCache.has(MEMORY_DEVICE_ID_KEY)) {
      memoryQueueCache.set(MEMORY_DEVICE_ID_KEY, [{ id: safeRandomUUID() } as any]);
    }
    const cached = memoryQueueCache.get(MEMORY_DEVICE_ID_KEY);
    return (cached?.[0]?.id) ?? `ephemeral-${Math.random().toString(36).slice(2)}`;
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
      captureQueueMessage('offline_queue_health_report_failed', {
        driverId,
        driverName,
        deviceId: id,
        errorMessage: error.message,
        pendingCount: summary.pending,
        retryWaitingCount: summary.retryWaiting,
        deadLetterCount: summary.deadLetter,
      });
    }
  } catch (err) {
    console.warn('[reportQueueHealthToServer] Unexpected error:', err);
    captureQueueException('offline_queue_health_report_unexpected_error', err, {
      driverId,
      driverName,
      deviceId,
    });
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
          // Resolve EXIF once to avoid repeated (window as any) casts.
          // Depends on global window.EXIF (exif-js loaded via <script> tag in index.html).
          // Gracefully returns null if the library is unavailable (ad-blockers, slow networks).
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
