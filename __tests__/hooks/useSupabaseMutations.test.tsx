/**
 * Tests for useSupabaseMutations — the central React Query mutation hook.
 *
 * Covers: syncOfflineData, updateDrivers, updateLocations, registerLocation,
 * deleteLocations, deleteDrivers, updateTransaction, submitTransaction,
 * createSettlement, reviewSettlement, approveExpenseRequest,
 * reviewAnomalyTransaction, approveResetRequest, approvePayoutRequest, logAI.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';

// ── Mock dependencies ──────────────────────────────────────────────────────

jest.mock('../../offlineQueue', () => ({
  enqueueTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  flushQueue: jest.fn<() => Promise<number>>().mockResolvedValue(0) as unknown as () => Promise<number>,
  resetRetryBackoff: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  reportQueueHealthToServer: jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('../../services/collectionSubmissionService', () => ({
  submitCollectionV2: jest.fn(),
}));

jest.mock('../../services/driverManagementService', () => ({
  deleteDriverAccount: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
}));

jest.mock('../../services/localDB', () => ({
  localDB: {
    get: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/supabaseRoleScope', () => ({
  getTransactionQueryScope: jest.fn<() => { cacheScope: string }>().mockReturnValue({ cacheScope: 'admin-all' }),
  getSettlementQueryScope: jest.fn<() => { cacheScope: string }>().mockReturnValue({ cacheScope: 'admin-all' }),
}));

jest.mock('../../repositories/driverRepository', () => ({
  updateDrivers: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updateDriverCoins: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('../../repositories/locationRepository', () => ({
  upsertLocationsWithSignal: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  deleteLocations: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('../../repositories/transactionRepository', () => ({
  upsertTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('../../repositories/settlementRepository', () => ({
  createSettlement: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'ds-new' }),
  reviewSettlement: jest.fn<() => Promise<{ id: string; driverId: string; status: string }>>().mockResolvedValue({ id: 'ds-1', driverId: 'drv-1', status: 'confirmed' }),
}));

jest.mock('../../repositories/approvalRepository', () => ({
  approveExpenseRequest: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  approvePayoutRequest: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  approveResetRequest: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  reviewAnomalyTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('../../repositories/requestRepository', () => ({
  createPayoutRequest: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  createResetRequest: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('../../repositories/aiLogRepository', () => ({
  insertAiLog: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('../../utils/settlementRules', () => ({
  shouldApplySettlementDriverCoinUpdate: jest.fn(() => ({ shouldApply: false, coinBalance: 0 })),
}));

jest.mock('../../utils/stripClientFields', () => ({
  stripClientFields: jest.fn((v: unknown) => v),
}));

import { makeChain, setChainResult, makeSupabaseMock } from '../helpers/supabaseMock';
import { renderHook } from '../helpers/test-utils';

// Mutable reference so jest.mock factory (hoisted) can see the mock after beforeEach runs
const mockState = {
  supabase: {} as ReturnType<typeof makeSupabaseMock>,
  chain: makeChain(),
};
mockState.supabase = makeSupabaseMock(mockState.chain);

jest.mock('../../supabaseClient', () => ({
  supabase: mockState.supabase,
  default: mockState.supabase,
}));

import { useSupabaseMutations } from '../../hooks/useSupabaseMutations';
import { updateDrivers as repoUpdateDrivers } from '../../repositories/driverRepository';
import { upsertLocationsWithSignal, deleteLocations as repoDeleteLocations } from '../../repositories/locationRepository';
import { flushQueue, enqueueTransaction, resetRetryBackoff, reportQueueHealthToServer } from '../../offlineQueue';

// ── Helpers ────────────────────────────────────────────────────────────────

function setupHook(isOnline = true, user?: { id: string; role: 'admin' | 'driver'; driverId?: string; name: string; username: string }, onMutationError?: (err: unknown) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  const { result } = renderHook(
    () => useSupabaseMutations(isOnline, user as any, onMutationError),
    { wrapper: Wrapper },
  );

  return { result, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.chain = makeChain();
  Object.assign(mockState.supabase, makeSupabaseMock(mockState.chain));
  setChainResult([], null);
});

// ═══════════════════════════════════════════════════════════════════════════

describe('useSupabaseMutations', () => {
  // ── syncOfflineData ────────────────────────────────────────────────────

  describe('syncOfflineData', () => {
    it('is a mutation with mutate/mutateAsync', () => {
      const { result } = setupHook();
      expect(result.current.syncOfflineData).toBeDefined();
      expect(typeof result.current.syncOfflineData.mutate).toBe('function');
      expect(typeof result.current.syncOfflineData.mutateAsync).toBe('function');
    });

    it('calls flushQueue and resetRetryBackoff on success', async () => {
      const { result } = setupHook(true, { id: 'u1', role: 'admin', name: 'Admin', username: 'admin' });
      (flushQueue as any).mockResolvedValue(2);

      await act(async () => {
        await result.current.syncOfflineData.mutateAsync();
      });

      expect(resetRetryBackoff as any).toHaveBeenCalled();
      expect(flushQueue as any).toHaveBeenCalled();
    });

    it('reports queue health for driver users', async () => {
      const { result } = setupHook(true, { id: 'u1', role: 'driver', driverId: 'drv-1', name: 'Driver', username: 'driver' });
      (flushQueue as any).mockResolvedValue(1);

      await act(async () => {
        await result.current.syncOfflineData.mutateAsync();
      });

      expect(reportQueueHealthToServer as any).toHaveBeenCalledWith(
        mockState.supabase,
        'drv-1',
        'Driver',
      );
    });

    it('does not report queue health for admin users', async () => {
      const { result } = setupHook(true, { id: 'u1', role: 'admin', name: 'Admin', username: 'admin' });
      (flushQueue as any).mockResolvedValue(1);

      await act(async () => {
        await result.current.syncOfflineData.mutateAsync();
      });

      expect(reportQueueHealthToServer as any).not.toHaveBeenCalled();
    });

    it('skips sync when offline and browser offline', async () => {
      const originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      const { result } = setupHook(false, { id: 'u1', role: 'admin', name: 'Admin', username: 'admin' });

      await act(async () => {
        await result.current.syncOfflineData.mutateAsync();
      });

      expect(flushQueue as any).not.toHaveBeenCalled();

      // Restore
      if (originalOnLine) {
        Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine);
      }
    });
  });

  // ── updateDrivers ──────────────────────────────────────────────────────

  describe('updateDrivers', () => {
    it('calls repo updateDrivers when online', async () => {
      const { result } = setupHook(true);
      const drivers = [{ id: 'drv-1', name: 'Alice' }] as any[];

      await act(async () => {
        await result.current.updateDrivers.mutateAsync(drivers);
      });

      expect(repoUpdateDrivers).toHaveBeenCalled();
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);
      const drivers = [{ id: 'drv-1', name: 'Alice' }] as any[];

      await act(async () => {
        const p = result.current.updateDrivers.mutateAsync(drivers);
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });

    it('calls onMutationError on error', async () => {
      const onError = jest.fn();
      const { result } = setupHook(true, undefined, onError);
      (repoUpdateDrivers as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('DB fail'));

      await act(async () => {
        await result.current.updateDrivers.mutateAsync([{ id: 'drv-1' }] as any[]).catch(() => {});
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('rolls back optimistic update on error', async () => {
      const { result, queryClient } = setupHook(true);
      const originalDrivers = [{ id: 'drv-old', name: 'Bob' }] as any[];
      queryClient.setQueryData(['drivers'], originalDrivers);
      (repoUpdateDrivers as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('fail'));

      await act(async () => {
        await result.current.updateDrivers.mutateAsync([{ id: 'drv-new' }] as any[]).catch(() => {});
      });

      const restored = queryClient.getQueryData(['drivers']);
      expect(restored).toEqual(originalDrivers);
    });
  });

  // ── updateLocations ────────────────────────────────────────────────────

  describe('updateLocations', () => {
    it('calls upsertLocationsWithSignal when online', async () => {
      const { result } = setupHook(true);
      const locations = [{ id: 'loc-1', name: 'Shop' }] as any[];

      await act(async () => {
        await result.current.updateLocations.mutateAsync(locations);
      });

      expect(upsertLocationsWithSignal).toHaveBeenCalled();
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.updateLocations.mutateAsync([{ id: 'loc-1' }] as any[]);
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });

    it('rolls back on error', async () => {
      const { result, queryClient } = setupHook(true);
      const original = [{ id: 'loc-old' }] as any[];
      queryClient.setQueryData(['locations'], original);
      (upsertLocationsWithSignal as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(new Error('fail'));

      await act(async () => {
        await result.current.updateLocations.mutateAsync([{ id: 'loc-new' }] as any[]).catch(() => {});
      });

      expect(queryClient.getQueryData(['locations'])).toEqual(original);
    });
  });

  // ── registerLocation ───────────────────────────────────────────────────

  describe('registerLocation', () => {
    it('adds new location optimistically with isSynced: false', async () => {
      const { result, queryClient } = setupHook(true);
      queryClient.setQueryData(['locations'], [{ id: 'existing' }] as any[]);

      await act(async () => {
        await result.current.registerLocation.mutateAsync({ id: 'new-loc' } as any);
      });

      const cached = queryClient.getQueryData(['locations']) as any[];
      expect(cached).toHaveLength(2);
      expect(cached.find((l: any) => l.id === 'new-loc').isSynced).toBe(false);
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.registerLocation.mutateAsync({ id: 'loc-1' } as any);
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });
  });

  // ── deleteLocations ────────────────────────────────────────────────────

  describe('deleteLocations', () => {
    it('calls repo deleteLocations when online', async () => {
      const { result } = setupHook(true);

      await act(async () => {
        await result.current.deleteLocations.mutateAsync(['loc-1', 'loc-2']);
      });

      expect(repoDeleteLocations).toHaveBeenCalledWith(['loc-1', 'loc-2']);
    });

    it('removes locations optimistically', async () => {
      const { result, queryClient } = setupHook(true);
      queryClient.setQueryData(['locations'], [
        { id: 'loc-keep' }, { id: 'loc-del' },
      ] as any[]);

      await act(async () => {
        await result.current.deleteLocations.mutateAsync(['loc-del']);
      });

      const cached = queryClient.getQueryData(['locations']) as any[];
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe('loc-keep');
    });

    it('does not throw when offline (silently skips server delete)', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        await result.current.deleteLocations.mutateAsync(['loc-1']);
      });
    });
  });

  // ── deleteDrivers ──────────────────────────────────────────────────────

  describe('deleteDrivers', () => {
    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.deleteDrivers.mutateAsync(['drv-1']);
        await expect(p).rejects.toThrow(/offline/);
      });
    });

    it('removes drivers optimistically', async () => {
      const { result, queryClient } = setupHook(true);
      queryClient.setQueryData(['drivers'], [
        { id: 'drv-keep' }, { id: 'drv-del' },
      ] as any[]);

      await act(async () => {
        await result.current.deleteDrivers.mutateAsync(['drv-del']);
      });

      const cached = queryClient.getQueryData(['drivers']) as any[];
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe('drv-keep');
    });
  });

  // ── submitTransaction ──────────────────────────────────────────────────

  describe('submitTransaction', () => {
    it('calls upsertTransaction when online', async () => {
      const { upsertTransaction: repoUpsert } = await import('../../repositories/transactionRepository');
      const { result, queryClient } = setupHook(true);
      queryClient.setQueryData(['transactions', 'admin-all'], []);

      const tx = { id: 'tx-1', locationId: 'loc-1', driverId: 'drv-1' } as any;

      await act(async () => {
        await result.current.submitTransaction.mutateAsync(tx);
      });

      expect(repoUpsert).toHaveBeenCalled();
    });

    it('enqueues to offline queue when offline', async () => {
      const { result, queryClient } = setupHook(false);
      queryClient.setQueryData(['transactions', 'admin-all'], []);

      const tx = { id: 'tx-1', locationId: 'loc-1', driverId: 'drv-1', photoUrl: null } as any;

      await act(async () => {
        await result.current.submitTransaction.mutateAsync(tx);
      });

      expect(enqueueTransaction as any).toHaveBeenCalled();
    });

    it('adds transaction optimistically with isSynced: false', async () => {
      const { result, queryClient } = setupHook(true);
      queryClient.setQueryData(['transactions', 'admin-all'], []);

      await act(async () => {
        await result.current.submitTransaction.mutateAsync({ id: 'tx-new' } as any);
      });

      const cached = queryClient.getQueryData(['transactions', 'admin-all']) as any[];
      expect(cached).toHaveLength(1);
      expect(cached[0].isSynced).toBe(false);
    });
  });

  // ── createSettlement ───────────────────────────────────────────────────

  describe('createSettlement', () => {
    it('calls repo and updates query cache on success', async () => {
      const { createSettlement: repoCreateSettlement } = await import('../../repositories/settlementRepository');
      const { result, queryClient } = setupHook(true);
      queryClient.setQueryData(['dailySettlements', 'admin-all'], []);

      const settlement = { id: 'ds-1', driverId: 'drv-1', date: '2026-01-01' } as any;

      await act(async () => {
        await result.current.createSettlement.mutateAsync(settlement);
      });

      expect(repoCreateSettlement).toHaveBeenCalled();
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.createSettlement.mutateAsync({ id: 'ds-1' } as any);
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });
  });

  // ── reviewSettlement ───────────────────────────────────────────────────

  describe('reviewSettlement', () => {
    it('calls repo reviewSettlement when online', async () => {
      const { reviewSettlement: repoReviewSettlement } = await import('../../repositories/settlementRepository');
      const { result } = setupHook(true);

      await act(async () => {
        await result.current.reviewSettlement.mutateAsync({
          settlementId: 'ds-1',
          status: 'confirmed' as const,
          note: 'OK',
        });
      });

      expect(repoReviewSettlement).toHaveBeenCalledWith('ds-1', 'confirmed', 'OK');
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.reviewSettlement.mutateAsync({
          settlementId: 'ds-1',
          status: 'confirmed' as const,
        });
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });
  });

  // ── approveExpenseRequest ──────────────────────────────────────────────

  describe('approveExpenseRequest', () => {
    it('calls repo approveExpenseRequest', async () => {
      const { approveExpenseRequest } = await import('../../repositories/approvalRepository');
      const { result, queryClient } = setupHook(true);
      queryClient.setQueryData(['transactions', 'admin-all'], []);

      await act(async () => {
        await result.current.approveExpenseRequest.mutateAsync({ txId: 'tx-1', approve: true });
      });

      expect(approveExpenseRequest).toHaveBeenCalledWith('tx-1', true);
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.approveExpenseRequest.mutateAsync({ txId: 'tx-1', approve: true });
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });
  });

  // ── approveResetRequest ────────────────────────────────────────────────

  describe('approveResetRequest', () => {
    it('calls repo approveResetRequest', async () => {
      const { approveResetRequest } = await import('../../repositories/approvalRepository');
      const { result } = setupHook(true);

      await act(async () => {
        await result.current.approveResetRequest.mutateAsync({ txId: 'tx-1', approve: true });
      });

      expect(approveResetRequest).toHaveBeenCalledWith('tx-1', true);
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.approveResetRequest.mutateAsync({ txId: 'tx-1', approve: true });
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });
  });

  // ── approvePayoutRequest ───────────────────────────────────────────────

  describe('approvePayoutRequest', () => {
    it('calls repo approvePayoutRequest', async () => {
      const { approvePayoutRequest } = await import('../../repositories/approvalRepository');
      const { result } = setupHook(true);

      await act(async () => {
        await result.current.approvePayoutRequest.mutateAsync({ txId: 'tx-1', approve: true });
      });

      expect(approvePayoutRequest).toHaveBeenCalledWith('tx-1', true);
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.approvePayoutRequest.mutateAsync({ txId: 'tx-1', approve: true });
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });
  });

  // ── reviewAnomalyTransaction ───────────────────────────────────────────

  describe('reviewAnomalyTransaction', () => {
    it('calls repo reviewAnomalyTransaction', async () => {
      const { reviewAnomalyTransaction } = await import('../../repositories/approvalRepository');
      const { result } = setupHook(true);

      await act(async () => {
        await result.current.reviewAnomalyTransaction.mutateAsync({ txId: 'tx-1', approve: true });
      });

      expect(reviewAnomalyTransaction).toHaveBeenCalledWith('tx-1', true);
    });

    it('throws when offline', async () => {
      const { result } = setupHook(false);

      await act(async () => {
        const p = result.current.reviewAnomalyTransaction.mutateAsync({ txId: 'tx-1', approve: true });
        await expect(p).rejects.toThrow(/offline|online mode|离线/i);
      });
    });
  });

  // ── logAI ──────────────────────────────────────────────────────────────

  describe('logAI', () => {
    it('calls insertAiLog', async () => {
      const { insertAiLog } = await import('../../repositories/aiLogRepository');
      const { result } = setupHook(true);

      const logEntry = {
        id: 'log-1', driverId: 'drv-1', driverName: 'Alice',
        query: 'score', response: '100', modelUsed: 'gemini',
        timestamp: '2026-01-01T00:00:00Z', isSynced: true,
      } as any;

      await act(async () => {
        await result.current.logAI.mutateAsync(logEntry);
      });

      expect(insertAiLog).toHaveBeenCalledWith(expect.objectContaining({ id: 'log-1' }));
    });
  });

  // ── Hook returns all mutations ─────────────────────────────────────────

  describe('return value', () => {
    it('returns all 14 mutation handles', () => {
      const { result } = setupHook();
      const keys = [
        'syncOfflineData', 'updateDrivers', 'updateLocations',
        'registerLocation', 'deleteLocations', 'deleteDrivers',
        'updateTransaction', 'submitTransaction', 'createSettlement',
        'reviewSettlement', 'approveExpenseRequest', 'reviewAnomalyTransaction',
        'approveResetRequest', 'approvePayoutRequest', 'logAI',
      ];
      for (const key of keys) {
        expect(result.current).toHaveProperty(key);
        expect(typeof result.current[key as keyof typeof result.current]?.mutate).toBe('function');
      }
    });
  });
});
