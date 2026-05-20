/**
 * Minimal in-memory IndexedDB mock for Jest.
 *
 * The real offlineQueue uses IndexedDB for the primary storage path and
 * falls back to localStorage only when `indexedDB` is absent.  This mock
 * lets us test the IDB path inside jsdom (which has no real IDB).
 *
 * Usage:
 *   import { installMockIndexedDB, cleanupMockIndexedDB, resetMockIdbData } from './helpers/mockIndexedDB';
 *
 *   beforeEach(() => { installMockIndexedDB(); });
 *   afterEach(()  => { cleanupMockIndexedDB(); });
 */

type IDBStoreMap = Map<string, Record<string, unknown>>;
type IDBStoreMetadata = { keyPath: string; indexes: Map<string, { keyPath: string; unique: boolean }> };

const _databases = new Map<string, { stores: Map<string, IDBStoreMap>; meta: Map<string, IDBStoreMetadata> }>();

function getOrCreateDb(name: string) {
  if (!_databases.has(name)) {
    _databases.set(name, { stores: new Map(), meta: new Map() });
  }
  return _databases.get(name)!;
}

/** Reset all mock data between tests. */
export function resetMockIdbData(): void {
  _databases.clear();
}

// ── IDBRequest (minimal promise-like) ────────────────────────────────────

class FakeIDBRequest {
  result: unknown = undefined;
  error: DOMException | null = null;
  readyState: string = 'pending';
  _successHandlers: Array<(e: unknown) => void> = [];
  _errorHandlers: Array<(e: unknown) => void> = [];

  get onsuccess(): ((e: unknown) => void) | null {
    return this._successHandlers.length > 0 ? this._successHandlers[this._successHandlers.length - 1] : null;
  }
  set onsuccess(handler: ((e: unknown) => void) | null) {
    if (handler) this._successHandlers.push(handler);
  }
  get onerror(): ((e: unknown) => void) | null {
    return this._errorHandlers.length > 0 ? this._errorHandlers[this._errorHandlers.length - 1] : null;
  }
  set onerror(handler: ((e: unknown) => void) | null) {
    if (handler) this._errorHandlers.push(handler);
  }

  _resolve(result: unknown) {
    this.result = result;
    this.readyState = 'done';
    const event = { target: this };
    for (const h of this._successHandlers) h(event);
  }

  _reject(err: DOMException) {
    this.error = err;
    this.readyState = 'done';
    const event = { target: this };
    for (const h of this._errorHandlers) h(event);
  }
}

// ── IDBObjectStore ───────────────────────────────────────────────────────

class FakeIDBObjectStore {
  private _store: IDBStoreMap;
  private _meta: IDBStoreMetadata;

  constructor(store: IDBStoreMap, meta: IDBStoreMetadata) {
    this._store = store;
    this._meta = meta;
  }

  get indexNames() {
    return {
      contains: (name: string) => this._meta.indexes.has(name),
      _indexes: this._meta.indexes,
    };
  }

  createIndex(name: string, keyPath: string, opts: { unique?: boolean } = {}) {
    this._meta.indexes.set(name, { keyPath, unique: !!opts.unique });
  }

  put(value: Record<string, unknown>): FakeIDBRequest {
    const req = new FakeIDBRequest();
    const key = value[this._meta.keyPath] as string;
    this._store.set(key, { ...value });
    queueMicrotask(() => req._resolve(key));
    return req;
  }

  get(key: string): FakeIDBRequest {
    const req = new FakeIDBRequest();
    queueMicrotask(() => req._resolve(this._store.get(key) ?? undefined));
    return req;
  }

  getAll(): FakeIDBRequest {
    const req = new FakeIDBRequest();
    queueMicrotask(() => req._resolve(Array.from(this._store.values())));
    return req;
  }

  delete(key: string): FakeIDBRequest {
    const req = new FakeIDBRequest();
    this._store.delete(key);
    queueMicrotask(() => req._resolve(undefined));
    return req;
  }
}

// ── IDBTransaction ────────────────────────────────────────────────────────

class FakeIDBTransaction {
  private _db: ReturnType<typeof getOrCreateDb>;

  constructor(db: ReturnType<typeof getOrCreateDb>, _storeName: string) {
    this._db = db;
  }

  objectStore(name: string): FakeIDBObjectStore {
    let store = this._db.stores.get(name);
    let meta = this._db.meta.get(name);
    if (!store) {
      store = new Map();
      this._db.stores.set(name, store);
    }
    if (!meta) {
      meta = { keyPath: 'id', indexes: new Map() };
      this._db.meta.set(name, meta);
    }
    return new FakeIDBObjectStore(store, meta);
  }
}

// ── IDBDatabase ───────────────────────────────────────────────────────────

class FakeIDBDatabase {
  name: string;
  objectStoreNames: { contains: (name: string) => boolean };
  private _db: ReturnType<typeof getOrCreateDb>;

  constructor(name: string, db: ReturnType<typeof getOrCreateDb>) {
    this.name = name;
    this._db = db;
    this.objectStoreNames = {
      contains: (storeName: string) => db.stores.has(storeName),
    };
  }

  createObjectStore(name: string, opts: { keyPath?: string } = {}): FakeIDBObjectStore {
    const store = new Map<string, Record<string, unknown>>();
    this._db.stores.set(name, store);
    const meta: IDBStoreMetadata = { keyPath: opts.keyPath ?? 'id', indexes: new Map() };
    this._db.meta.set(name, meta);
    return new FakeIDBObjectStore(store, meta);
  }

  transaction(storeName: string, _mode?: string): FakeIDBTransaction {
    return new FakeIDBTransaction(this._db, storeName);
  }

  close() {
    // no-op
  }
}

// ── IDBOpenDBRequest ─────────────────────────────────────────────────────

class FakeIDBOpenDBRequest {
  result: FakeIDBDatabase | null = null;
  error: DOMException | null = null;
  transaction: FakeIDBTransaction | null = null;
  private _successHandlers: Array<(e: unknown) => void> = [];
  private _errorHandlers: Array<(e: unknown) => void> = [];
  private _upgradeNeededHandler: ((e: unknown) => void) | null = null;

  get onsuccess(): ((e: unknown) => void) | null {
    return this._successHandlers.length > 0 ? this._successHandlers[this._successHandlers.length - 1] : null;
  }
  set onsuccess(handler: ((e: unknown) => void) | null) {
    if (handler) this._successHandlers.push(handler);
  }
  get onerror(): ((e: unknown) => void) | null {
    return this._errorHandlers.length > 0 ? this._errorHandlers[this._errorHandlers.length - 1] : null;
  }
  set onerror(handler: ((e: unknown) => void) | null) {
    if (handler) this._errorHandlers.push(handler);
  }
  get onupgradeneeded(): ((e: unknown) => void) | null {
    return this._upgradeNeededHandler;
  }
  set onupgradeneeded(handler: ((e: unknown) => void) | null) {
    this._upgradeNeededHandler = handler;
  }

  _triggerSuccess() {
    for (const h of this._successHandlers) h({ target: this });
  }
  _triggerError() {
    for (const h of this._errorHandlers) h({ target: this });
  }
}

// ── Fake indexedDB object ─────────────────────────────────────────────────

let _originalIndexedDB: IDBFactory | undefined;

function createFakeIndexedDB(): IDBFactory {
  return {
    open: (name: string, _version?: number) => {
      const fakeReq = new FakeIDBOpenDBRequest();
      const req = fakeReq as unknown as IDBOpenDBRequest;

      // Schedule upgrade + success in microtask
      queueMicrotask(() => {
        try {
          const db = getOrCreateDb(name);

          // Auto-create default store if first open
          if (!db.stores.has('pending_transactions')) {
            const fakeDb = new FakeIDBDatabase(name, db);
            fakeReq.result = fakeDb;
            fakeReq.transaction = new FakeIDBTransaction(db, 'pending_transactions');

            // Fire user's upgrade handler if set
            if (fakeReq.onupgradeneeded) {
              fakeReq.onupgradeneeded({ target: fakeReq });
            } else {
              // Auto-create the store so basic tests don't need an upgrade handler
              fakeDb.createObjectStore('pending_transactions', { keyPath: 'id' });
            }
            fakeReq.transaction = null;
          }

          const fakeDb = new FakeIDBDatabase(name, db);
          fakeReq.result = fakeDb;
          fakeReq._triggerSuccess();
        } catch (err) {
          fakeReq.error = err as DOMException;
          fakeReq._triggerError();
        }
      });

      return req;
    },
  } as unknown as IDBFactory;
}

/** Install the in-memory IndexedDB mock on window. */
export function installMockIndexedDB(): void {
  if (typeof window === 'undefined') return;
  _originalIndexedDB = window.indexedDB;
  Object.defineProperty(window, 'indexedDB', {
    value: createFakeIndexedDB(),
    writable: true,
    configurable: true,
  });
}

/** Restore the original window.indexedDB (or remove it). */
export function cleanupMockIndexedDB(): void {
  if (typeof window === 'undefined') return;
  if (_originalIndexedDB !== undefined) {
    Object.defineProperty(window, 'indexedDB', {
      value: _originalIndexedDB,
      writable: true,
      configurable: true,
    });
  } else {
    // jsdom doesn't have indexedDB — remove it to return to original state
    try { delete (window as unknown as Record<string, unknown>).indexedDB; } catch { /* ignore */ }
  }
  _databases.clear();
}
