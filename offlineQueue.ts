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
 */

import { Transaction } from './types';
import { SupabaseClient } from '@supabase/supabase-js';

const DB_NAME    = 'bahati_offline_db';
const DB_VERSION = 1;
const STORE_TX   = 'pending_transactions';
const MS_PER_DAY = 86_400_000;

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
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Enqueue (save when offline) ───────────────────────────────────────────────
export async function enqueueTransaction(tx: Transaction): Promise<void> {
  try {
    const db    = await openDB();
    const store = db.transaction(STORE_TX, 'readwrite').objectStore(STORE_TX);
    await new Promise<void>((resolve, reject) => {
      const req = store.put({ ...tx, isSynced: false, _queuedAt: new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    // Fallback: localStorage
    console.warn('[OfflineQueue] IDB unavailable, falling back to localStorage', err);
    const raw  = localStorage.getItem('bahati_offline_queue') || '[]';
    const list = JSON.parse(raw) as Transaction[];
    const updated = [...list.filter(t => t.id !== tx.id), { ...tx, isSynced: false }];
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
export async function markSynced(id: string): Promise<void> {
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
        const r = store.put({ ...item, isSynced: true });
        r.onsuccess = () => res();
        r.onerror   = () => rej(r.error);
      });
    }
    db.close();
  } catch {
    const raw  = localStorage.getItem('bahati_offline_queue') || '[]';
    const list = (JSON.parse(raw) as Transaction[]).map(t => t.id === id ? { ...t, isSynced: true } : t);
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
export async function flushQueue(
  supabaseClient: SupabaseClient,
  onProgress?: (flushed: number, total: number) => void
): Promise<number> {
  const pending = await getPendingTransactions();
  if (pending.length === 0) return 0;

  let flushed = 0;
  for (const tx of pending) {
    try {
      const { error } = await supabaseClient
        .from('transactions')
        .upsert({ ...tx, isSynced: true });
      if (!error) {
        await markSynced(tx.id);
        flushed++;
        onProgress?.(flushed, pending.length);
      } else {
        console.warn('[OfflineQueue] upsert error for', tx.id, ':', error.message);
      }
    } catch (e) {
      console.warn('[OfflineQueue] flush failed for', tx.id, e);
    }
  }
  return flushed;
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
