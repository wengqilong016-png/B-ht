/**
 * __tests__/repositories.test.ts
 *
 * Tests for all repository modules under repositories/.
 * Supabase client is mocked so no real network calls are made.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Supabase chainable query builder helper ────────────────────────────────

type QueryChain = {
  select: jest.Mock;
  insert: jest.Mock;
  upsert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  abortSignal: jest.Mock;
  single: jest.Mock;
};

function makeChain(resolvedValue: unknown): QueryChain {
  const chain: QueryChain = {
    select: jest.fn<() => QueryChain>().mockReturnThis(),
    insert: jest.fn<() => QueryChain>().mockReturnThis(),
    upsert: jest.fn<() => QueryChain>().mockReturnThis(),
    update: jest.fn<() => QueryChain>().mockReturnThis(),
    delete: jest.fn<() => QueryChain>().mockReturnThis(),
    eq: jest.fn<() => QueryChain>().mockReturnThis(),
    in: jest.fn<() => QueryChain>().mockReturnThis(),
    order: jest.fn<() => QueryChain>().mockReturnThis(),
    limit: jest.fn<() => QueryChain>().mockReturnThis(),
    abortSignal: jest.fn<() => QueryChain>().mockReturnThis(),
    single: jest.fn<() => Promise<unknown>>().mockResolvedValue(resolvedValue),
  };
  // Make the chain itself thenable (awaiting the chain resolves it)
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(resolvedValue);
  return chain;
}

// The supabase mock uses a factory that returns a fresh chain per test
let currentChainValue: unknown = { data: [], error: null };
const mockFrom = jest.fn<(table: string) => QueryChain>(() => makeChain(currentChainValue));
const mockUpdateAuth = jest.fn<() => Promise<unknown>>();
const mockSignOutAuth = jest.fn<() => Promise<unknown>>();

jest.mock('../supabaseClient', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: {
      updateUser: () => mockUpdateAuth(),
      signOut: () => mockSignOutAuth(),
    },
  },
}));

// Import repos after mock is in place
import { fetchDrivers, upsertDrivers, deleteDrivers, updateDriverPhone, updateDriverCoins } from '../repositories/driverRepository';
import { fetchLocations, upsertLocations, deleteLocations } from '../repositories/locationRepository';
import { fetchTransactions, upsertTransaction } from '../repositories/transactionRepository';
import { fetchSettlements, upsertSettlement } from '../repositories/settlementRepository';
import { insertAiLog, fetchAiLogs } from '../repositories/aiLogRepository';
import { updatePassword, signOut } from '../repositories/authRepository';

beforeEach(() => {
  jest.clearAllMocks();
});

// ══ driverRepository ════════════════════════════════════════════════════════

describe('driverRepository', () => {
  describe('fetchDrivers()', () => {
    it('returns rows on success', async () => {
      const rows = [{ id: 'drv-1', name: 'Alice' }];
      currentChainValue = { data: rows, error: null };

      const result = await fetchDrivers();
      expect(result).toEqual(rows);
      expect(mockFrom).toHaveBeenCalledWith('drivers');
    });

    it('throws when Supabase returns an error', async () => {
      currentChainValue = { data: null, error: new Error('DB error') };
      await expect(fetchDrivers()).rejects.toThrow('DB error');
    });

    it('returns empty array when data is null', async () => {
      currentChainValue = { data: null, error: null };
      const result = await fetchDrivers();
      expect(result).toEqual([]);
    });
  });

  describe('upsertDrivers()', () => {
    it('resolves without error on successful upsert', async () => {
      currentChainValue = { error: null };
      await expect(upsertDrivers([{ id: 'drv-1' }])).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      currentChainValue = { error: new Error('upsert failed') };
      await expect(upsertDrivers([{ id: 'drv-1' }])).rejects.toThrow('upsert failed');
    });
  });

  describe('deleteDrivers()', () => {
    it('resolves without error on successful delete', async () => {
      currentChainValue = { error: null };
      await expect(deleteDrivers(['drv-1', 'drv-2'])).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      currentChainValue = { error: new Error('delete failed') };
      await expect(deleteDrivers(['drv-1'])).rejects.toThrow('delete failed');
    });
  });

  describe('updateDriverPhone()', () => {
    it('resolves without error on successful update', async () => {
      currentChainValue = { error: null };
      await expect(updateDriverPhone('drv-1', '0711000000')).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      currentChainValue = { error: new Error('update failed') };
      await expect(updateDriverPhone('drv-1', '0711000000')).rejects.toThrow('update failed');
    });
  });

  describe('updateDriverCoins()', () => {
    it('resolves without error on successful update', async () => {
      currentChainValue = { error: null };
      await expect(updateDriverCoins('drv-1', 150)).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      currentChainValue = { error: new Error('coins update failed') };
      await expect(updateDriverCoins('drv-1', 150)).rejects.toThrow('coins update failed');
    });
  });
});

// ══ locationRepository ══════════════════════════════════════════════════════

describe('locationRepository', () => {
  describe('fetchLocations()', () => {
    it('returns rows on success', async () => {
      const rows = [{ id: 'loc-1', name: 'Shop A' }];
      currentChainValue = { data: rows, error: null };
      const result = await fetchLocations();
      expect(result).toEqual(rows);
      expect(mockFrom).toHaveBeenCalledWith('locations');
    });

    it('returns empty array when data is null', async () => {
      currentChainValue = { data: null, error: null };
      const result = await fetchLocations();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      currentChainValue = { data: null, error: new Error('loc error') };
      await expect(fetchLocations()).rejects.toThrow('loc error');
    });
  });

  describe('upsertLocations()', () => {
    it('resolves without error', async () => {
      currentChainValue = { error: null };
      await expect(upsertLocations([{ id: 'loc-1' }])).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      currentChainValue = { error: new Error('upsert loc error') };
      await expect(upsertLocations([{ id: 'loc-1' }])).rejects.toThrow('upsert loc error');
    });
  });

  describe('deleteLocations()', () => {
    it('resolves without error', async () => {
      currentChainValue = { error: null };
      await expect(deleteLocations(['loc-1'])).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      currentChainValue = { error: new Error('delete loc error') };
      await expect(deleteLocations(['loc-1'])).rejects.toThrow('delete loc error');
    });
  });
});

// ══ transactionRepository ═══════════════════════════════════════════════════

describe('transactionRepository', () => {
  describe('fetchTransactions()', () => {
    it('returns rows for admin (uses admin fields)', async () => {
      const rows = [{ id: 'tx-1' }];
      currentChainValue = { data: rows, error: null };
      const result = await fetchTransactions({ isDriver: false });
      expect(result).toEqual(rows);
      expect(mockFrom).toHaveBeenCalledWith('transactions');
    });

    it('returns rows for driver (uses driver fields)', async () => {
      const rows = [{ id: 'tx-2' }];
      currentChainValue = { data: rows, error: null };
      const result = await fetchTransactions({ isDriver: true });
      expect(result).toEqual(rows);
    });

    it('returns empty array when data is null', async () => {
      currentChainValue = { data: null, error: null };
      const result = await fetchTransactions({ isDriver: false });
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      currentChainValue = { data: null, error: new Error('tx error') };
      await expect(fetchTransactions({ isDriver: false })).rejects.toThrow('tx error');
    });

    it('applies driverIdFilter when provided', async () => {
      currentChainValue = { data: [], error: null };
      await fetchTransactions({ isDriver: true, driverIdFilter: 'drv-123' });
      const chain = mockFrom.mock.results.at(-1)?.value as QueryChain | undefined;
      expect(chain?.eq).toHaveBeenCalledWith('driverId', 'drv-123');
    });

    it('applies limit when provided', async () => {
      currentChainValue = { data: [], error: null };
      await fetchTransactions({ isDriver: false, limit: 50 });
      const chain = mockFrom.mock.results.at(-1)?.value as QueryChain | undefined;
      expect(chain?.limit).toHaveBeenCalledWith(50);
    });

    it('calls abortSignal when signal is provided', async () => {
      currentChainValue = { data: [], error: null };
      const signal = new AbortController().signal;
      await fetchTransactions({ isDriver: false, signal });
      const chain = mockFrom.mock.results.at(-1)?.value as QueryChain | undefined;
      expect(chain?.abortSignal).toHaveBeenCalledWith(signal);
    });
  });

  describe('upsertTransaction()', () => {
    it('resolves without error', async () => {
      currentChainValue = { error: null };
      await expect(upsertTransaction({ id: 'tx-1' })).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      currentChainValue = { error: new Error('upsert tx error') };
      await expect(upsertTransaction({ id: 'tx-1' })).rejects.toThrow('upsert tx error');
    });
  });
});

// ══ settlementRepository ════════════════════════════════════════════════════

describe('settlementRepository', () => {
  describe('fetchSettlements()', () => {
    it('returns rows on success', async () => {
      const rows = [{ id: 'set-1' }];
      currentChainValue = { data: rows, error: null };
      const result = await fetchSettlements();
      expect(result).toEqual(rows);
      expect(mockFrom).toHaveBeenCalledWith('daily_settlements');
      const chain = mockFrom.mock.results.at(-1)?.value as QueryChain | undefined;
      expect(chain?.select).toHaveBeenCalledWith(expect.stringContaining('transferProofUrl'));
      expect(chain?.select).toHaveBeenCalledWith(expect.stringContaining('checkInAt'));
      expect(chain?.select).toHaveBeenCalledWith(expect.stringContaining('hasCheckedOut'));
    });

    it('returns empty array when data is null', async () => {
      currentChainValue = { data: null, error: null };
      const result = await fetchSettlements();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      currentChainValue = { data: null, error: new Error('settle error') };
      await expect(fetchSettlements()).rejects.toThrow('settle error');
    });
  });

  describe('upsertSettlement()', () => {
    it('resolves without error', async () => {
      currentChainValue = { error: null };
      await expect(upsertSettlement({ id: 'set-1' })).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      currentChainValue = { error: new Error('upsert settle error') };
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
      currentChainValue = { error: null };
      await expect(insertAiLog(sampleLog as any)).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      currentChainValue = { error: new Error('insert log error') };
      await expect(insertAiLog(sampleLog as any)).rejects.toThrow('insert log error');
    });
  });

  describe('fetchAiLogs()', () => {
    it('returns rows on success', async () => {
      const rows = [sampleLog];
      currentChainValue = { data: rows, error: null };
      const result = await fetchAiLogs();
      expect(result).toEqual(rows);
      expect(mockFrom).toHaveBeenCalledWith('ai_logs');
    });

    it('returns empty array when data is null', async () => {
      currentChainValue = { data: null, error: null };
      const result = await fetchAiLogs();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      currentChainValue = { data: null, error: new Error('fetch log error') };
      await expect(fetchAiLogs()).rejects.toThrow('fetch log error');
    });
  });
});

// ══ authRepository ══════════════════════════════════════════════════════════

describe('authRepository', () => {
  describe('updatePassword()', () => {
    it('resolves without error on success', async () => {
      mockUpdateAuth.mockResolvedValue({ error: null });
      await expect(updatePassword('NewPass123!')).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      mockUpdateAuth.mockResolvedValue({ error: new Error('weak password') });
      await expect(updatePassword('abc')).rejects.toThrow('weak password');
    });
  });

  describe('signOut()', () => {
    it('resolves without error on success', async () => {
      mockSignOutAuth.mockResolvedValue({ error: null });
      await expect(signOut()).resolves.toBeUndefined();
    });

    it('throws when Supabase returns an error', async () => {
      mockSignOutAuth.mockResolvedValue({ error: new Error('sign out error') });
      await expect(signOut()).rejects.toThrow('sign out error');
    });
  });
});
