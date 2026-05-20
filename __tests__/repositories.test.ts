/**
 * __tests__/repositories.test.ts
 *
 * Tests for all repository modules under repositories/.
 * Supabase client is mocked via the shared supabaseMock helper.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import {
  makeChain,
  setChainResult,
  setApplyFilters,
  makeSupabaseMock,
} from './helpers/supabaseMock';
import type { ChainMock } from './helpers/supabaseMock';

// Mutable reference — beforeEach replaces the chain so predicates don't leak
const mockState: { chain: ReturnType<typeof makeChain>; supabase: ReturnType<typeof makeSupabaseMock> } = {
  chain: makeChain(),
  supabase: {} as ReturnType<typeof makeSupabaseMock>,
};
mockState.supabase = makeSupabaseMock(mockState.chain);

jest.mock('../supabaseClient', () => ({
  supabase: mockState.supabase,
}));

function getMockFrom(): jest.Mock {
  return mockState.supabase.from as jest.Mock;
}
function getChain() {
  return mockState.chain;
}
function getUpdateAuth(): jest.Mock<() => Promise<{ data: unknown; error: unknown }>> {
  return mockState.supabase.auth.updateUser as unknown as jest.Mock<() => Promise<{ data: unknown; error: unknown }>>;
}
function getSignOutAuth(): jest.Mock<() => Promise<{ data: unknown; error: unknown }>> {
  return mockState.supabase.auth.signOut as unknown as jest.Mock<() => Promise<{ data: unknown; error: unknown }>>;
}

// Import repos after mock is in place
import { insertAiLog, fetchAiLogs } from '../repositories/aiLogRepository';
import { updatePassword, signOut } from '../repositories/authRepository';
import { fetchDrivers, updateDrivers, deleteDrivers, updateDriverPhone, updateDriverCoins } from '../repositories/driverRepository';
import { fetchLocations, upsertLocations, deleteLocations } from '../repositories/locationRepository';
import { fetchSettlements, upsertSettlement } from '../repositories/settlementRepository';
import { fetchTransactions, upsertTransaction } from '../repositories/transactionRepository';

beforeEach(() => {
  const newChain = makeChain();
  mockState.chain = newChain;
  // Mutate in place — the mock module exports hold a reference to mockState.supabase
  Object.assign(mockState.supabase, makeSupabaseMock(newChain));
  setChainResult([], null);
});

// ══ driverRepository ════════════════════════════════════════════════════════

describe('driverRepository', () => {
  describe('fetchDrivers()', () => {
    it('returns rows on success', async () => {
      const rows = [{ id: 'drv-1', name: 'Alice' }];
      setChainResult(rows, null);

      const result = await fetchDrivers();
      expect(result).toEqual(rows);
      expect(getMockFrom()).toHaveBeenCalledWith('drivers');
    });

    it('throws when Supabase returns an error', async () => {
      setChainResult(null, new Error('DB error'));
      await expect(fetchDrivers()).rejects.toThrow('DB error');
    });

    it('returns empty array when data is null', async () => {
      setChainResult(null, null);
      const result = await fetchDrivers();
      expect(result).toEqual([]);
    });
  });

  describe('updateDrivers()', () => {
    it('resolves without error on successful update', async () => {
      setChainResult(null, null);
      await expect(updateDrivers([{ id: 'drv-1', name: 'Alice' }])).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      setChainResult(null, new Error('update failed'));
      await expect(updateDrivers([{ id: 'drv-1', name: 'Alice' }])).rejects.toThrow('update failed');
    });
  });

  describe('deleteDrivers()', () => {
    it('resolves without error on successful delete', async () => {
      setChainResult(null, null);
      await expect(deleteDrivers(['drv-1', 'drv-2'])).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      setChainResult(null, new Error('delete failed'));
      await expect(deleteDrivers(['drv-1'])).rejects.toThrow('delete failed');
    });
  });

  describe('updateDriverPhone()', () => {
    it('resolves without error on successful update', async () => {
      setChainResult(null, null);
      await expect(updateDriverPhone('drv-1', '0711000000')).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      setChainResult(null, new Error('update failed'));
      await expect(updateDriverPhone('drv-1', '0711000000')).rejects.toThrow('update failed');
    });
  });

  describe('updateDriverCoins()', () => {
    it('resolves without error on successful update', async () => {
      setChainResult(null, null);
      await expect(updateDriverCoins('drv-1', 150)).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      setChainResult(null, new Error('coins update failed'));
      await expect(updateDriverCoins('drv-1', 150)).rejects.toThrow('coins update failed');
    });
  });
});

// ══ locationRepository ══════════════════════════════════════════════════════

describe('locationRepository', () => {
  describe('fetchLocations()', () => {
    it('returns rows on success', async () => {
      const rows = [{ id: 'loc-1', name: 'Shop A' }];
      setChainResult(rows, null);
      const result = await fetchLocations();
      expect(result).toEqual(rows);
      expect(getMockFrom()).toHaveBeenCalledWith('locations');
    });

    it('returns empty array when data is null', async () => {
      setChainResult(null, null);
      const result = await fetchLocations();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('loc error'));
      await expect(fetchLocations()).rejects.toThrow('loc error');
    });
  });

  describe('upsertLocations()', () => {
    it('resolves without error', async () => {
      setChainResult(null, null);
      await expect(upsertLocations([{ id: 'loc-1' }])).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('upsert loc error'));
      await expect(upsertLocations([{ id: 'loc-1' }])).rejects.toThrow('upsert loc error');
    });
  });

  describe('deleteLocations()', () => {
    it('resolves without error', async () => {
      setChainResult(null, null);
      await expect(deleteLocations(['loc-1'])).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('delete loc error'));
      await expect(deleteLocations(['loc-1'])).rejects.toThrow('delete loc error');
    });
  });
});

// ══ transactionRepository ═══════════════════════════════════════════════════

describe('transactionRepository', () => {
  describe('fetchTransactions()', () => {
    it('returns rows for admin (uses admin fields)', async () => {
      const rows = [{ id: 'tx-1' }];
      setChainResult(rows, null);
      const result = await fetchTransactions({ isDriver: false });
      expect(result).toEqual(rows);
      expect(getMockFrom()).toHaveBeenCalledWith('transactions');
    });

    it('returns rows for driver (uses driver fields)', async () => {
      const rows = [{ id: 'tx-2' }];
      setChainResult(rows, null);
      const result = await fetchTransactions({ isDriver: true });
      expect(result).toEqual(rows);
    });

    it('returns empty array when data is null', async () => {
      setChainResult(null, null);
      const result = await fetchTransactions({ isDriver: false });
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('tx error'));
      await expect(fetchTransactions({ isDriver: false })).rejects.toThrow('tx error');
    });

    it('applies driverIdFilter when provided', async () => {
      setChainResult([], null);
      await fetchTransactions({ isDriver: true, driverIdFilter: 'drv-123' });
      const chainEq = (getChain() as unknown as ChainMock).eq as jest.Mock;
      expect(chainEq).toHaveBeenCalledWith('driverId', 'drv-123');
    });

    it('returns only matching driver rows when driverIdFilter is provided', async () => {
      setChainResult(
        [
          { id: 'tx-1', driverId: 'drv-123' },
          { id: 'tx-2', driverId: 'drv-other' },
          { id: 'tx-3', driverId: 'drv-123' },
        ],
        null,
      );

      const result = await fetchTransactions({ isDriver: true, driverIdFilter: 'drv-123' });

      expect(result.map(tx => (tx as unknown as Record<string, unknown>).id)).toEqual(['tx-1', 'tx-3']);
    });

    it('throws when a driver-scoped response still contains another driver row', async () => {
      setChainResult(
        [
          { id: 'tx-1', driverId: 'drv-123' },
          { id: 'tx-2', driverId: 'drv-other' },
        ],
        null,
      );
      setApplyFilters(false);
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await expect(fetchTransactions({ isDriver: true, driverIdFilter: 'drv-123' }))
          .rejects
          .toThrow('RLS violation: fetched 1 transaction(s) with incorrect driverId');
      } finally {
        consoleError.mockRestore();
      }
    });

    it('applies limit when provided', async () => {
      setChainResult([], null);
      await fetchTransactions({ isDriver: false, limit: 50 });
      const chainLimit = (getChain() as unknown as ChainMock).limit as jest.Mock;
      expect(chainLimit).toHaveBeenCalledWith(50);
    });

    it('calls abortSignal when signal is provided', async () => {
      setChainResult([], null);
      const signal = new AbortController().signal;
      await fetchTransactions({ isDriver: false, signal });
      const chainAbortSignal = (getChain() as unknown as ChainMock).abortSignal as jest.Mock;
      expect(chainAbortSignal).toHaveBeenCalledWith(signal);
    });
  });

  describe('upsertTransaction()', () => {
    it('resolves without error', async () => {
      setChainResult(null, null);
      await expect(upsertTransaction({ id: 'tx-1' })).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('upsert tx error'));
      await expect(upsertTransaction({ id: 'tx-1' })).rejects.toThrow('upsert tx error');
    });
  });
});

// ══ settlementRepository ════════════════════════════════════════════════════

describe('settlementRepository', () => {
  describe('fetchSettlements()', () => {
    it('returns rows on success', async () => {
      const rows = [{ id: 'set-1' }];
      setChainResult(rows, null);
      const result = await fetchSettlements();
      expect(result).toEqual(rows);
      expect(getMockFrom()).toHaveBeenCalledWith('daily_settlements');
      const chainSelect = (getChain() as unknown as ChainMock).select as jest.Mock;
      expect(chainSelect).toHaveBeenCalledWith(expect.stringContaining('transferProofUrl'));
      expect(chainSelect).toHaveBeenCalledWith(expect.stringContaining('checkInAt'));
      expect(chainSelect).toHaveBeenCalledWith(expect.stringContaining('hasCheckedOut'));
    });

    it('returns empty array when data is null', async () => {
      setChainResult(null, null);
      const result = await fetchSettlements();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('settle error'));
      await expect(fetchSettlements()).rejects.toThrow('settle error');
    });

    it('returns only matching driver rows when driverIdFilter is provided', async () => {
      setChainResult(
        [
          { id: 'set-1', driverId: 'drv-1' },
          { id: 'set-2', driverId: 'drv-2' },
          { id: 'set-3', driverId: 'drv-1' },
        ],
        null,
      );

      const result = await fetchSettlements({ driverIdFilter: 'drv-1' });

      expect(result.map(s => (s as unknown as Record<string, unknown>).id)).toEqual(['set-1', 'set-3']);
    });
  });

  describe('upsertSettlement()', () => {
    it('resolves without error', async () => {
      setChainResult(null, null);
      await expect(upsertSettlement({ id: 'set-1' })).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('upsert settle error'));
      await expect(upsertSettlement({ id: 'set-1' })).rejects.toThrow('upsert settle error');
    });
  });
});

// ══ aiLogRepository ══════════════════════════════════════════════════════════

describe('aiLogRepository', () => {
  const sampleLog = {
    id: 'log-1',
    timestamp: '2026-01-01T00:00:00Z',
    driverId: 'drv-1',
    driverName: 'Alice',
    query: 'What is the score?',
    response: '100',
    imageUrl: null,
    modelUsed: 'gemini',
    relatedLocationId: null,
    relatedTransactionId: null,
    isSynced: true,
  };

  describe('insertAiLog()', () => {
    it('resolves without error on success', async () => {
      setChainResult(null, null);
      await expect(insertAiLog(sampleLog as any)).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('insert log error'));
      await expect(insertAiLog(sampleLog as any)).rejects.toThrow('insert log error');
    });
  });

  describe('fetchAiLogs()', () => {
    it('returns rows on success', async () => {
      const rows = [sampleLog];
      setChainResult(rows, null);
      const result = await fetchAiLogs();
      expect(result).toEqual(rows);
      expect(getMockFrom()).toHaveBeenCalledWith('ai_logs');
    });

    it('returns empty array when data is null', async () => {
      setChainResult(null, null);
      const result = await fetchAiLogs();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      setChainResult(null, new Error('fetch log error'));
      await expect(fetchAiLogs()).rejects.toThrow('fetch log error');
    });
  });
});

// ══ authRepository ══════════════════════════════════════════════════════════

describe('authRepository', () => {
  describe('updatePassword()', () => {
    it('resolves without error on success', async () => {
      getUpdateAuth().mockResolvedValue({ data: null, error: null });
      await expect(updatePassword('NewPass123!')).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      getUpdateAuth().mockResolvedValue({ data: null, error: new Error('weak password') });
      await expect(updatePassword('abc')).rejects.toThrow('weak password');
    });
  });

  describe('signOut()', () => {
    it('resolves without error on success', async () => {
      getSignOutAuth().mockResolvedValue({ data: null, error: null });
      await expect(signOut()).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      getSignOutAuth().mockResolvedValue({ data: null, error: new Error('sign out error') });
      await expect(signOut()).rejects.toThrow('sign out error');
    });
  });
});
