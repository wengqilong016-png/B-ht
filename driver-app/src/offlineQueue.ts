/**
 * offlineQueue.ts
 * IndexedDB-backed offline queue for driver transactions.
 * DB name: bahati-driver-v1, store: pendingTx
 */

import { Transaction } from './types';
import { SupabaseClient } from '@supabase/supabase-js';

const DB_NAME = 'bahati-driver-v1';
const DB_VERSION = 1;
const STORE_NAME = 'pendingTx';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('isSynced', 'isSynced', { unique: false });
        store.createIndex('driverId', 'driverId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueTx(tx: Transaction): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
      const req = store.put({ ...tx, isSynced: false });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    console.warn('[Bahati] IDB unavailable, using localStorage fallback', err);
    try {
      const raw = localStorage.getItem('bahati_driver_queue') || '[]';
      const list = JSON.parse(raw) as Transaction[];
      const updated = [...list.filter((t) => t.id !== tx.id), { ...tx, isSynced: false }];
      localStorage.setItem('bahati_driver_queue', JSON.stringify(updated));
    } catch (_) {}
  }
}

export async function flushQueue(
  supabaseClient: SupabaseClient
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;

  try {
    const db = await openDB();
    const pending = await new Promise<Transaction[]>((resolve, reject) => {
      const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
      const idx = store.index('isSynced');
      const req = idx.getAll(IDBKeyRange.only(false));
      req.onsuccess = () => resolve(req.result as Transaction[]);
      req.onerror = () => reject(req.error);
    });

    for (const tx of pending) {
      try {
        const { data, error } = await supabaseClient
          .from('transactions')
          .upsert(
            {
              id: tx.id,
              timestamp: tx.timestamp,
              locationId: tx.locationId,
              locationName: tx.locationName,
              driverId: tx.driverId,
              driverName: tx.driverName,
              previousScore: tx.previousScore,
              currentScore: tx.currentScore,
              revenue: tx.revenue,
              commission: tx.commission,
              netPayable: tx.netPayable,
              expenses: tx.expenses,
              coinExchange: tx.coinExchange,
              notes: tx.notes,
              gps: tx.gps,
              isSynced: true,
            },
            { onConflict: 'id' }
          )
          .select('id')
          .single();

        if (error || !data) {
          failed++;
          continue;
        }

        // Verify server confirmed the same ID
        if (data.id === tx.id) {
          const writeDb = await openDB();
          await new Promise<void>((res, rej) => {
            const store = writeDb
              .transaction(STORE_NAME, 'readwrite')
              .objectStore(STORE_NAME);
            const req = store.put({ ...tx, isSynced: true });
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          });
          writeDb.close();
          synced++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    db.close();
  } catch (err) {
    console.warn('[Bahati] IDB flush failed, trying localStorage', err);
    // Fallback: try localStorage queue
    try {
      const raw = localStorage.getItem('bahati_driver_queue') || '[]';
      const list = JSON.parse(raw) as Transaction[];
      const pending = list.filter((t) => !t.isSynced);

      for (const tx of pending) {
        try {
          const { error } = await supabaseClient.from('transactions').upsert(
            {
              id: tx.id,
              timestamp: tx.timestamp,
              locationId: tx.locationId,
              locationName: tx.locationName,
              driverId: tx.driverId,
              driverName: tx.driverName,
              previousScore: tx.previousScore,
              currentScore: tx.currentScore,
              revenue: tx.revenue,
              commission: tx.commission,
              netPayable: tx.netPayable,
              expenses: tx.expenses,
              coinExchange: tx.coinExchange,
              notes: tx.notes,
              gps: tx.gps,
            },
            { onConflict: 'id' }
          );
          if (!error) {
            synced++;
            const updated = list.map((t) =>
              t.id === tx.id ? { ...t, isSynced: true } : t
            );
            localStorage.setItem('bahati_driver_queue', JSON.stringify(updated));
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
    } catch (_) {}
  }

  return { synced, failed };
}

export async function getPendingCount(): Promise<number> {
  try {
    const db = await openDB();
    const count = await new Promise<number>((resolve, reject) => {
      const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
      const idx = store.index('isSynced');
      const req = idx.count(IDBKeyRange.only(false));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return count;
  } catch {
    try {
      const raw = localStorage.getItem('bahati_driver_queue') || '[]';
      const list = JSON.parse(raw) as Transaction[];
      return list.filter((t) => !t.isSynced).length;
    } catch {
      return 0;
    }
  }
}

export async function getAllPending(): Promise<Transaction[]> {
  try {
    const db = await openDB();
    const items = await new Promise<Transaction[]>((resolve, reject) => {
      const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
      const idx = store.index('isSynced');
      const req = idx.getAll(IDBKeyRange.only(false));
      req.onsuccess = () => resolve(req.result as Transaction[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
  } catch {
    try {
      const raw = localStorage.getItem('bahati_driver_queue') || '[]';
      const list = JSON.parse(raw) as Transaction[];
      return list.filter((t) => !t.isSynced);
    } catch {
      return [];
    }
  }
}
