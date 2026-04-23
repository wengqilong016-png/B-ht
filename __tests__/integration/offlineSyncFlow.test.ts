/**
 * __tests__/integration/offlineSyncFlow.test.ts
 *
 * Integration test: Offline queue enqueue → flush pipeline.
 * Verifies that transactions enqueued via the offlineQueue module
 * are correctly stored in IndexedDB (mocked) and can be read back.
 */
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';

// ── Mock IndexedDB ────────────────────────────────────────────────────────
const idbStore = new Map<string, unknown>();

function makeMockIDBStore() {
  return {
    put: jest.fn((item: { id: string }) => {
      idbStore.set(item.id, item);
      return { set onsuccess(fn: () => void) { fn(); }, set onerror(_: unknown) {} };
    }),
    get: jest.fn((id: string) => {
      const result = idbStore.get(id);
      return { result, set onsuccess(fn: () => void) { fn(); }, set onerror(_: unknown) {} };
    }),
    getAll: jest.fn(() => {
      const result = [...idbStore.values()];
      return { result, set onsuccess(fn: () => void) { fn(); }, set onerror(_: unknown) {} };
    }),
    delete: jest.fn((id: string) => {
      idbStore.delete(id);
      return { set onsuccess(fn: () => void) { fn(); }, set onerror(_: unknown) {} };
    }),
    index: jest.fn(() => ({
      getAll: jest.fn((query?: { value?: unknown }) => ({
        result: [...idbStore.values()].filter((item) => {
          if (!query || query.value === undefined) return true;
          return (item as { isSynced?: boolean }).isSynced === query.value;
        }),
        set onsuccess(fn: () => void) { fn(); },
        set onerror(_: unknown) {},
      })),
    })),
    createIndex: jest.fn(),
    indexNames: { contains: jest.fn().mockReturnValue(true) },
  };
}

const mockObjectStore = makeMockIDBStore();

const mockDb = {
  objectStoreNames: { contains: jest.fn().mockReturnValue(true) },
  createObjectStore: jest.fn().mockReturnValue(mockObjectStore),
  transaction: jest.fn(() => ({
    objectStore: jest.fn(() => mockObjectStore),
  })),
  close: jest.fn(),
};

// Override global indexedDB (capture original to restore later)
const originalIndexedDB = globalThis.indexedDB;

Object.defineProperty(global, 'indexedDB', {
  value: {
    open: jest.fn(() => {
      const req = {
        result: mockDb,
        set onsuccess(fn: () => void) { fn(); },
        set onerror(_: unknown) {},
        set onupgradeneeded(_: unknown) {},
      };
      return req;
    }),
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(global, 'IDBKeyRange', {
  value: {
    only: (value: unknown) => ({ value }),
  },
  writable: true,
  configurable: true,
});

// ── Mock Supabase client ──────────────────────────────────────────────────
jest.mock('../../supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    })),
    rpc: jest.fn<() => unknown>().mockReturnValue({
      abortSignal: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

// ── Mock audit service ────────────────────────────────────────────────────
jest.mock('../../services/collectionSubmissionAudit', () => ({
  appendCollectionSubmissionAudit: jest.fn(),
}));

jest.mock('../../services/evidenceStorage', () => ({
  persistEvidencePhotoUrl: jest.fn<() => Promise<string>>().mockResolvedValue('https://example.com/evidence/offline-sync.jpg'),
}));

import { makeTransaction, resetFixtureCounter } from '../helpers/fixtures';

beforeEach(() => {
  jest.clearAllMocks();
  idbStore.clear();
  resetFixtureCounter();
});

afterAll(() => {
  // Restore original indexedDB to avoid cross-test coupling
  Object.defineProperty(global, 'indexedDB', {
    value: originalIndexedDB,
    writable: true,
    configurable: true,
  });
});

describe('Offline Sync Flow (Integration)', () => {
  describe('enqueue and retrieve', () => {
    it('enqueues a transaction into the offline queue store', async () => {
      const { enqueueTransaction } = await import('../../offlineQueue');

      const tx = makeTransaction({ isSynced: false });
      const submissionInput = {
        txId: tx.id,
        locationId: tx.locationId,
        driverId: tx.driverId,
        currentScore: tx.currentScore,
        expenses: tx.expenses,
        tip: 0,
        startupDebtDeduction: 0,
        isOwnerRetaining: false,
        ownerRetention: null,
        coinExchange: 0,
        gps: tx.gps,
        photoUrl: null,
        aiScore: null,
        anomalyFlag: false,
        notes: null,
        expenseType: null,
        expenseCategory: null,
        reportedStatus: 'active' as const,
      };

      await enqueueTransaction(tx, submissionInput);

      // Verify IndexedDB put was called
      expect(mockObjectStore.put).toHaveBeenCalled();
      const putArg = mockObjectStore.put.mock.calls[0][0] as Record<string, unknown>;
      expect(putArg.isSynced).toBe(false);
      expect(putArg.id).toBe(tx.id);
    });

    it('stores transaction with queue metadata', async () => {
      const { enqueueTransaction } = await import('../../offlineQueue');

      const tx = makeTransaction({ id: 'meta-test-tx', isSynced: false });
      await enqueueTransaction(tx, {
        txId: tx.id,
        locationId: tx.locationId,
        driverId: tx.driverId,
        currentScore: tx.currentScore,
        expenses: 0,
        tip: 0,
        startupDebtDeduction: 0,
        isOwnerRetaining: false,
        ownerRetention: null,
        coinExchange: 0,
        gps: tx.gps,
        photoUrl: null,
        aiScore: null,
        anomalyFlag: false,
        notes: null,
        expenseType: null,
        expenseCategory: null,
        reportedStatus: 'active' as const,
      });

      const putArg = mockObjectStore.put.mock.calls[0][0] as Record<string, unknown>;
      // Queue meta fields should be present
      expect(putArg).toHaveProperty('operationId');
      expect(putArg).toHaveProperty('entityVersion');
      expect(putArg).toHaveProperty('_queuedAt');
      expect(putArg.retryCount).toBe(0);
    });

    it('strips photoUrl from rawInput to save space', async () => {
      const { enqueueTransaction } = await import('../../offlineQueue');

      const tx = makeTransaction({ isSynced: false });
      await enqueueTransaction(tx, {
        txId: tx.id,
        locationId: tx.locationId,
        driverId: tx.driverId,
        currentScore: tx.currentScore,
        expenses: 0,
        tip: 0,
        startupDebtDeduction: 0,
        isOwnerRetaining: false,
        ownerRetention: null,
        coinExchange: 0,
        gps: tx.gps,
        photoUrl: 'data:image/jpeg;base64,HUGE_PHOTO_DATA',
        aiScore: null,
        anomalyFlag: false,
        notes: null,
        expenseType: null,
        expenseCategory: null,
        reportedStatus: 'active' as const,
      });

      const putArg = mockObjectStore.put.mock.calls[0][0] as Record<string, unknown>;
      const rawInput = putArg.rawInput as Record<string, unknown> | undefined;
      expect(rawInput?.photoUrl).toBe('https://example.com/evidence/offline-sync.jpg');
      expect(putArg.photoUrl).toBe('https://example.com/evidence/offline-sync.jpg');
    });
  });

  describe('offline submit → reconnect → auto sync idempotency', () => {
    it('flushes an offline collection exactly once, clears pending work, and leaves no dead-letter residue', async () => {
      const { enqueueTransaction, flushQueue, getAllQueuedTransactions, getDeadLetterItems } = await import('../../offlineQueue');

      const photoUrl = 'data:image/jpeg;base64,offline-sync';
      const tx = makeTransaction({
        id: 'offline-sync-tx-1',
        isSynced: false,
        photoUrl,
      });
      const rawInput = {
        txId: tx.id,
        locationId: tx.locationId,
        driverId: tx.driverId,
        currentScore: tx.currentScore,
        expenses: tx.expenses,
        tip: 0,
        startupDebtDeduction: 0,
        isOwnerRetaining: false,
        ownerRetention: null,
        coinExchange: 0,
        gps: tx.gps,
        photoUrl,
        aiScore: null,
        anomalyFlag: false,
        notes: null,
        expenseType: null,
        expenseCategory: null,
        reportedStatus: 'active' as const,
      };

      await enqueueTransaction(tx, rawInput);

      const serverTx = {
        ...tx,
        isSynced: true,
        revenue: 250,
        netPayable: 180,
      };
      const submitCollection = jest.fn<() => Promise<unknown>>().mockResolvedValue({
        success: true,
        transaction: serverTx,
        source: 'server',
      });

      const firstFlush = await flushQueue({ from: jest.fn() } as any, {
        submitCollection: submitCollection as any,
      });
      const secondFlush = await flushQueue({ from: jest.fn() } as any, {
        submitCollection: submitCollection as any,
      });

      expect(firstFlush).toBe(1);
      expect(secondFlush).toBe(0);
      expect(submitCollection).toHaveBeenCalledTimes(1);

      const storedEntries = await getAllQueuedTransactions() as unknown as Array<Record<string, unknown>>;
      expect(storedEntries).toHaveLength(1);
      expect(storedEntries[0].isSynced).toBe(true);
      expect(storedEntries[0].revenue).toBe(250);
      expect(storedEntries[0].netPayable).toBe(180);

      const pendingEntries = storedEntries.filter((entry) => entry.isSynced !== true);
      expect(pendingEntries).toHaveLength(0);

      const deadLetters = await getDeadLetterItems();
      expect(deadLetters).toHaveLength(0);
    });
  });
});
