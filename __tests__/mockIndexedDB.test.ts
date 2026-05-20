/**
 * Self-test for the in-memory IndexedDB mock.
 * Verifies the mock behaves like a real IDB implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  installMockIndexedDB,
  cleanupMockIndexedDB,
  resetMockIdbData,
} from './helpers/mockIndexedDB';

describe('mockIndexedDB', () => {
  beforeEach(() => {
    resetMockIdbData();
    installMockIndexedDB();
  });

  afterEach(() => {
    cleanupMockIndexedDB();
  });

  it('exposes indexedDB on window', () => {
    expect('indexedDB' in window).toBe(true);
  });

  it('open() returns a request that resolves with a database', async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('test_db', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(db).toBeDefined();
    expect(db.objectStoreNames.contains('pending_transactions')).toBe(true);
  });

  it('put and get round-trip', async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('test_db', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // put
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction('pending_transactions', 'readwrite').objectStore('pending_transactions');
      const r = store.put({ id: 'tx-1', value: 42 });
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });

    // get
    const result = await new Promise<unknown>((resolve, reject) => {
      const store = db.transaction('pending_transactions', 'readonly').objectStore('pending_transactions');
      const r = store.get('tx-1');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });

    expect(result).toBeDefined();
    expect((result as Record<string, unknown>).value).toBe(42);
  });

  it('getAll returns all entries', async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('test_db', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const store = db.transaction('pending_transactions', 'readwrite').objectStore('pending_transactions');
    await new Promise<void>((resolve) => {
      store.put({ id: 'a', n: 1 }).onsuccess = () => resolve();
    });
    await new Promise<void>((resolve) => {
      store.put({ id: 'b', n: 2 }).onsuccess = () => resolve();
    });

    const all = await new Promise<unknown[]>((resolve, reject) => {
      const s2 = db.transaction('pending_transactions', 'readonly').objectStore('pending_transactions');
      const r = s2.getAll();
      r.onsuccess = () => resolve(r.result as unknown[]);
      r.onerror = () => reject(r.error);
    });

    expect(all).toHaveLength(2);
  });

  it('onupgradeneeded fires on first open', async () => {
    let upgraded = false;
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('fresh_db', 1);
      req.onupgradeneeded = () => { upgraded = true; };
      req.onsuccess = () => resolve();
    });
    expect(upgraded).toBe(true);
  });

  it('cleanupMockIndexedDB removes indexedDB', () => {
    cleanupMockIndexedDB();
    expect('indexedDB' in window).toBe(false);
    // Reinstall for afterEach cleanup
    installMockIndexedDB();
  });
});
