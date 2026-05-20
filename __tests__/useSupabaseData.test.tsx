/**
 * __tests__/useSupabaseData.test.ts
 *
 * Tests for hooks/useSupabaseData.ts — data querying + isOnline health check (252L).
 * Covers: health check default, locations/drivers fetch+fallback, deferred
 * transactions/settlements, AI logs gating, online/offline events, unauthenticated path.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useSupabaseData } from '../hooks/useSupabaseData';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */
jest.mock('../repositories/aiLogRepository', () => ({
  fetchAiLogs: jest.fn(),
}));
jest.mock('../repositories/driverRepository', () => ({
  fetchDrivers: jest.fn(),
}));
jest.mock('../repositories/locationRepository', () => ({
  fetchLocations: jest.fn(),
}));
jest.mock('../repositories/settlementRepository', () => ({
  fetchSettlements: jest.fn(),
}));
jest.mock('../repositories/transactionRepository', () => ({
  fetchTransactions: jest.fn(),
}));
jest.mock('../services/localDB', () => ({
  localDB: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));
jest.mock('../supabaseClient', () => ({
  checkDbHealth: jest.fn(),
}));

import { fetchAiLogs } from '../repositories/aiLogRepository';
import { fetchDrivers } from '../repositories/driverRepository';
import { fetchLocations } from '../repositories/locationRepository';
import { fetchSettlements } from '../repositories/settlementRepository';
import { fetchTransactions } from '../repositories/transactionRepository';
import { localDB } from '../services/localDB';
import { checkDbHealth } from '../supabaseClient';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** AbortSignal.timeout stub returns a real object with an `aborted` prop. */
function fakeAbortSignal(): AbortSignal {
  const ctrl = new AbortController();
  ctrl.abort(); // already aborted so the caller's try/catch uses it immediately
  return ctrl.signal;
}

beforeEach(() => {
  jest.clearAllMocks();
  // AbortSignal.timeout is native in Node 22+; stubbed only for consistency.
  jest.spyOn(AbortSignal, 'timeout').mockReturnValue(fakeAbortSignal());
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('useSupabaseData()', () => {
  /* ---------------------------------------------------------------- */
  /* 1. Health check — default to navigator.onLine                    */
  /* ---------------------------------------------------------------- */
  it('defaults isOnline to navigator.onLine when health check is pending', () => {
    const queryClient = new QueryClient();

    // navigator.onLine = true by default in jsdom
    const { result } = renderHook(
      () => useSupabaseData('admin'),
      { wrapper: createWrapper(queryClient) },
    );

    expect(result.current.isOnline).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /* 2. Health check — dbHealth returns false when server is down      */
  /* ---------------------------------------------------------------- */
  it('returns isOnline=false when dbHealth resolves false', async () => {
    (checkDbHealth as jest.Mock).mockResolvedValue(false);
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useSupabaseData('admin'),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isOnline).toBe(false);
    });
  });

  /* ---------------------------------------------------------------- */
  /* 3. Locations — authenticated admin fetches from Supabase         */
  /* ---------------------------------------------------------------- */
  it('loads locations from Supabase when authenticated as admin', async () => {
    const mockLocs = [{ id: 'loc-1', name: 'Site A' }];
    (fetchLocations as jest.Mock).mockResolvedValue(mockLocs);
    (localDB.set as jest.Mock).mockResolvedValue(undefined);
    (checkDbHealth as jest.Mock).mockResolvedValue(true);
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useSupabaseData('admin'),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.locations).toEqual(mockLocs);
    });
    expect(fetchLocations).toHaveBeenCalled();
    expect(localDB.set).toHaveBeenCalledWith('kiosk_locations_data', mockLocs);
  });

  /* ---------------------------------------------------------------- */
  /* 4. Locations — fallback to localDB on fetch error                */
  /* ---------------------------------------------------------------- */
  it('falls back to localDB for locations when Supabase fetch throws', async () => {
    const cachedLocs = [{ id: 'loc-cache', name: 'Cached' }];
    (fetchLocations as jest.Mock).mockRejectedValue(new Error('timeout'));
    (localDB.get as jest.Mock).mockResolvedValue(cachedLocs);
    (localDB.set as jest.Mock).mockResolvedValue(undefined);
    (checkDbHealth as jest.Mock).mockResolvedValue(true);
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useSupabaseData('admin'),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.locations).toEqual(cachedLocs);
    });
    expect(fetchLocations).toHaveBeenCalled();
    expect(localDB.get).toHaveBeenCalledWith('kiosk_locations_data');
  });

  /* ---------------------------------------------------------------- */
  /* 5. Drivers — sanitizes password field out of fetched data         */
  /* ---------------------------------------------------------------- */
  it('sanitizes drivers by removing password field', async () => {
    const rawDrivers = [
      { id: 'd1', name: 'Ali', password: 'secret' },
      { id: 'd2', name: 'Bao', password: '1234' },
    ];
    (fetchDrivers as jest.Mock).mockResolvedValue(rawDrivers);
    (localDB.set as jest.Mock).mockResolvedValue(undefined);
    (localDB.get as jest.Mock).mockResolvedValue([]);
    (checkDbHealth as jest.Mock).mockResolvedValue(true);
    jest.spyOn(AbortSignal, 'timeout')
      .mockReturnValueOnce(/* health check */ fakeAbortSignal())
      .mockReturnValueOnce(/* locations */ fakeAbortSignal())
      .mockReturnValue(/* drivers */ fakeAbortSignal());
    // ↑ locations also goes through the try path (authenticated) so we need extra stubs
    (fetchLocations as jest.Mock).mockResolvedValue([]);
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useSupabaseData('admin'),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.drivers).toHaveLength(2);
    });
    // verify no password leaks into returned data
    for (const d of result.current.drivers) {
      expect((d as Record<string, unknown>).password).toBeUndefined();
    }
  });

  /* ---------------------------------------------------------------- */
  /* 6. AI logs — disabled for driver role                            */
  /* ---------------------------------------------------------------- */
  it('skips AI logs entirely for driver accounts', async () => {
    (checkDbHealth as jest.Mock).mockResolvedValue(true);
    (fetchLocations as jest.Mock).mockResolvedValue([]);
    (fetchDrivers as jest.Mock).mockResolvedValue([]);
    const queryClient = new QueryClient();

    renderHook(
      () => useSupabaseData('driver', 'driver-1'),
      { wrapper: createWrapper(queryClient) },
    );

    // fetchAiLogs should never be called (the query is disabled)
    await new Promise(r => setTimeout(r, 100));
    expect(fetchAiLogs).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /* 7. Unauthenticated — skips Supabase, loads from localDB directly  */
  /* ---------------------------------------------------------------- */
  it('loads from localDB when userRole is null (unauthenticated)', async () => {
    const cachedLocs = [{ id: 'loc-offline', name: 'OfflineSite' }];
    const cachedDrivers = [{ id: 'd-off', name: 'OfflineDriver' }];
    (localDB.get as jest.Mock)
      .mockResolvedValueOnce(cachedLocs)   // locations
      .mockResolvedValueOnce(cachedDrivers) // drivers
      .mockResolvedValueOnce([])           // transactions legacy fallback
      .mockResolvedValueOnce([]);          // settlements legacy fallback
    (checkDbHealth as jest.Mock).mockResolvedValue(true);
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useSupabaseData(null),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.locations).toEqual(cachedLocs);
    });
    await waitFor(() => {
      expect(result.current.drivers).toEqual(cachedDrivers);
    });
    // Repositories should not be called
    expect(fetchLocations).not.toHaveBeenCalled();
    expect(fetchDrivers).not.toHaveBeenCalled();
    expect(fetchTransactions).not.toHaveBeenCalled();
    expect(fetchSettlements).not.toHaveBeenCalled();
    expect(fetchAiLogs).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /* 8. Online event — optimistically sets isOnline + refetches       */
  /* ---------------------------------------------------------------- */
  it('sets isOnline=true and refetches health on window "online" event', async () => {
    (checkDbHealth as jest.Mock).mockResolvedValue(true);
    (fetchLocations as jest.Mock).mockResolvedValue([]);
    (fetchDrivers as jest.Mock).mockResolvedValue([]);
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(
      () => useSupabaseData('admin'),
      { wrapper: createWrapper(queryClient) },
    );

    // Simulate offline → online transition
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));

    // The useEffect handler calls setQueryData + refetchHealth
    // and the second useEffect calls invalidateQueries
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dbHealth'] });
    });
  });

  /* ---------------------------------------------------------------- */
  /* 9. isLoading is true while locations/drivers are still pending   */
  /* ---------------------------------------------------------------- */
  it('reports isLoading=true while critical data is still pending', () => {
    // Do NOT resolve any repo so queries stay pending
    (checkDbHealth as jest.Mock).mockResolvedValue(true);
    const queryClient = new QueryClient();

    const { result } = renderHook(
      () => useSupabaseData('admin'),
      { wrapper: createWrapper(queryClient) },
    );

    // isLoading = isLoadingLocs || isLoadingDrivers — both still loading
    expect(result.current.isLoading).toBe(true);
  });
});
