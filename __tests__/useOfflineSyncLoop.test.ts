/**
 * __tests__/useOfflineSyncLoop.test.ts
 *
 * Tests for hooks/useOfflineSyncLoop.ts — offline sync loop with
 * auto-sync, IDB queue polling, SW messages, and GPS heartbeat.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';

import { useOfflineSyncLoop } from '../hooks/useOfflineSyncLoop';

// ── Mocks ────────────────────────────────────────────────────────────

const mockGetQueueHealthSummary = jest.fn<() => Promise<{ pending: number; retryWaiting: number }>>();
const mockPruneOldSynced = jest.fn<() => Promise<void>>();

jest.mock('../offlineQueue', () => ({
  getQueueHealthSummary: (...args: any[]) => mockGetQueueHealthSummary(...args),
  pruneOldSynced: (...args: any[]) => mockPruneOldSynced(...args),
}));

jest.mock('../supabaseClient', () => ({
  __esModule: true,
  default: jest.fn(),
  supabase: { from: jest.fn() },
}));

// Capture references to the mocked functions after jest.mock hoisting
const mockSupabaseDefault = jest.requireMock('../supabaseClient').default as jest.Mock;
const mockSupabaseObj = jest.requireMock('../supabaseClient').supabase as { from: jest.Mock };

// ── navigator.serviceWorker helpers ──────────────────────────────────

const originalServiceWorker = navigator.serviceWorker;

function setupServiceWorker(opts?: { ready?: any }) {
  const swListeners = new Map<string, EventListener[]>();

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    writable: true,
    value: {
      ready: opts?.ready ?? Promise.resolve({ sync: undefined }),
      addEventListener: (type: string, listener: EventListener) => {
        const list = swListeners.get(type) ?? [];
        list.push(listener);
        swListeners.set(type, list);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        const list = swListeners.get(type) ?? [];
        swListeners.set(type, list.filter((l) => l !== listener));
      },
    } as any,
  });

  return {
    dispatchSwMessage: (data: any) => {
      const list = swListeners.get('message') ?? [];
      list.forEach((l) => l(new MessageEvent('message', { data })));
    },
    restore: () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        writable: true,
        value: originalServiceWorker,
      });
    },
  };
}

// ── navigator.geolocation helpers ────────────────────────────────────

const originalGeolocation = navigator.geolocation;

function mockGeolocation(getCurrentPosition: jest.Mock) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: { getCurrentPosition },
  });
}

function restoreGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: originalGeolocation,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

interface SyncOfflineData {
  mutate: () => void;
  isPending: boolean;
}

interface TestUser {
  id: string;
  role: string;
}

function makeOptions(overrides: Partial<{
  isOnline: boolean;
  unsyncedCount: number;
  currentUser: TestUser | null;
  activeDriverId: string | undefined;
  syncOfflineData: SyncOfflineData;
}> = {}) {
  return {
    isOnline: true,
    unsyncedCount: 0,
    currentUser: null,
    activeDriverId: undefined,
    syncOfflineData: {
      mutate: jest.fn(),
      isPending: false,
    },
    ...overrides,
  };
}

async function flushMicrotasks() {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('useOfflineSyncLoop', () => {
  let restoreSw: () => void;
  let dispatchSwMessage: (data: any) => void;
  let mockSupabaseFrom: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetQueueHealthSummary.mockResolvedValue({ pending: 0, retryWaiting: 0 });
    mockPruneOldSynced.mockResolvedValue(undefined);

    // Re-configure the supabase mocks for each test
    // Both default and named exports need to support .from('drivers').update(...).eq(...).abortSignal(...)
    const mockSupabaseFromChain = {
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          abortSignal: jest.fn().mockReturnValue({
            then: jest.fn().mockImplementation((onFulfilled: any) => {
              // Simulate successful Supabase update so GPS lock is released
              onFulfilled?.({ error: null });
              return { catch: jest.fn() };
            }),
          }),
        }),
      }),
    };
    mockSupabaseDefault.mockImplementation(() => mockSupabaseFromChain);
    mockSupabaseObj.from.mockReturnValue(mockSupabaseFromChain);
    mockSupabaseFrom = mockSupabaseDefault;

    const sw = setupServiceWorker();
    restoreSw = sw.restore;
    dispatchSwMessage = sw.dispatchSwMessage;
  });

  afterEach(() => {
    jest.useRealTimers();
    restoreSw();
    restoreGeolocation();
  });

  // ── 1. IDB queue poll & prune on mount ─────────────────────────────

  it('polls IDB queue health and prunes old synced entries on mount', () => {
    mockGetQueueHealthSummary.mockResolvedValue({ pending: 3, retryWaiting: 1 });

    renderHook(() => useOfflineSyncLoop(makeOptions()));

    expect(mockGetQueueHealthSummary).toHaveBeenCalledTimes(1);
    expect(mockPruneOldSynced).toHaveBeenCalledTimes(1);
  });

  // ── 2. Offline → online triggers sync with pending work ────────────

  it('triggers sync on offline-to-online transition when unsyncedCount > 0', async () => {
    const triggerSync = jest.fn();
    mockGetQueueHealthSummary.mockResolvedValue({ pending: 0, retryWaiting: 0 });

    const { rerender } = renderHook(
      ({ isOnline, unsyncedCount }: { isOnline: boolean; unsyncedCount: number }) =>
        useOfflineSyncLoop(
          makeOptions({
            isOnline,
            unsyncedCount,
            syncOfflineData: { mutate: triggerSync, isPending: false },
          }),
        ),
      { initialProps: { isOnline: false, unsyncedCount: 5 } },
    );

    expect(triggerSync).not.toHaveBeenCalled();

    rerender({ isOnline: true, unsyncedCount: 5 });
    await flushMicrotasks();

    expect(triggerSync).toHaveBeenCalled();
  });

  // ── 3. Offline → online with IDB pending ───────────────────────────

  it('triggers sync on offline-to-online when IDB has pending items despite unsyncedCount=0', async () => {
    const triggerSync = jest.fn();
    mockGetQueueHealthSummary.mockResolvedValue({ pending: 1, retryWaiting: 2 });

    const { rerender } = renderHook(
      ({ isOnline }: { isOnline: boolean }) =>
        useOfflineSyncLoop(
          makeOptions({
            isOnline,
            unsyncedCount: 0,
            syncOfflineData: { mutate: triggerSync, isPending: false },
          }),
        ),
      { initialProps: { isOnline: false } },
    );

    expect(triggerSync).not.toHaveBeenCalled();

    rerender({ isOnline: true });
    await flushMicrotasks();

    expect(triggerSync).toHaveBeenCalled();
  });

  // ── 4. Offline → online skips when already syncing ─────────────────

  it('skips offline-to-online sync when isPending is true', async () => {
    const triggerSync = jest.fn();

    const { rerender } = renderHook(
      ({ isOnline, isPending }: { isOnline: boolean; isPending: boolean }) =>
        useOfflineSyncLoop(
          makeOptions({
            isOnline,
            unsyncedCount: 5,
            syncOfflineData: { mutate: triggerSync, isPending },
          }),
        ),
      { initialProps: { isOnline: false, isPending: true } },
    );

    rerender({ isOnline: true, isPending: true });
    await flushMicrotasks();

    expect(triggerSync).not.toHaveBeenCalled();
  });

  // ── 5. Auto-sync interval calls triggerSync ────────────────────────

  it('auto-sync interval calls triggerSync when online with pending work', async () => {
    const triggerSync = jest.fn();
    mockGetQueueHealthSummary.mockResolvedValue({ pending: 1, retryWaiting: 0 });

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          isOnline: true,
          unsyncedCount: 0,
          syncOfflineData: { mutate: triggerSync, isPending: false },
        }),
      ),
    );

    // 30s IDB poll → setIdbPendingCount(1) → hasPendingWork=true → 60s interval starts
    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });

    // 60s sync interval tick
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(triggerSync).toHaveBeenCalled();
  });

  // ── 6. Auto-sync interval skips when isSyncingRef is true ─────────

  it('skips interval sync when isPending is true', async () => {
    const triggerSync = jest.fn();

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          isOnline: true,
          unsyncedCount: 5,
          syncOfflineData: { mutate: triggerSync, isPending: true },
        }),
      ),
    );

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(triggerSync).not.toHaveBeenCalled();
  });

  // ── 7. No retry interval when offline ─────────────────────────────

  it('does not trigger sync when offline', async () => {
    const triggerSync = jest.fn();

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          isOnline: false,
          unsyncedCount: 5,
          syncOfflineData: { mutate: triggerSync, isPending: false },
        }),
      ),
    );

    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });

    expect(triggerSync).not.toHaveBeenCalled();
  });

  // ── 8. SW FLUSH_OFFLINE_QUEUE message triggers sync ────────────────

  it('triggers sync on SW FLUSH_OFFLINE_QUEUE message', () => {
    const triggerSync = jest.fn();

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          syncOfflineData: { mutate: triggerSync, isPending: false },
        }),
      ),
    );

    dispatchSwMessage({ type: 'FLUSH_OFFLINE_QUEUE' });

    expect(triggerSync).toHaveBeenCalledTimes(1);
  });

  // ── 9. SW background-sync tag registration ─────────────────────────

  it('registers background-sync tag when sync API is available', async () => {
    const syncRegister = jest.fn().mockResolvedValue(undefined);

    restoreSw();
    const sw2 = setupServiceWorker({
      ready: Promise.resolve({ sync: { register: syncRegister } }),
    });
    restoreSw = sw2.restore;
    dispatchSwMessage = sw2.dispatchSwMessage;

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          syncOfflineData: { mutate: jest.fn(), isPending: false },
        }),
      ),
    );

    await flushMicrotasks();

    expect(syncRegister).toHaveBeenCalledWith('bahati-flush-queue');
  });

  // ── 10. GPS heartbeat skips when not driver ────────────────────────

  it('does not start GPS heartbeat when user role is not driver', () => {
    const geoMock = jest.fn();
    mockGeolocation(geoMock);

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          isOnline: true,
          currentUser: { id: 'u-1', role: 'admin' },
          activeDriverId: 'd-1',
        }),
      ),
    );

    expect(geoMock).not.toHaveBeenCalled();
  });

  // ── 11. GPS heartbeat skips when offline ───────────────────────────

  it('does not start GPS heartbeat when offline for drivers', () => {
    const geoMock = jest.fn();
    mockGeolocation(geoMock);

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          isOnline: false,
          currentUser: { id: 'u-1', role: 'driver' },
          activeDriverId: 'd-1',
        }),
      ),
    );

    expect(geoMock).not.toHaveBeenCalled();
  });

  // ── 12. GPS heartbeat fires on mount for drivers ───────────────────

  it('fires GPS heartbeat on mount for driver users', () => {
    const geoMock = jest.fn().mockImplementation(
      (success: PositionCallback) => {
        success({ coords: { latitude: -6.8, longitude: 39.3, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
      },
    );
    mockGeolocation(geoMock);

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          isOnline: true,
          currentUser: { id: 'u-1', role: 'driver' },
          activeDriverId: 'd-1',
        }),
      ),
    );

    expect(geoMock).toHaveBeenCalledTimes(1);
  });

  // ── 13. GPS interval stops on unmount ─────────────────────────────

  it('stops GPS interval on unmount', async () => {
    const geoMock = jest.fn();
    mockGeolocation(geoMock);

    const { unmount } = renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          isOnline: true,
          currentUser: { id: 'u-1', role: 'driver' },
          activeDriverId: 'd-1',
        }),
      ),
    );

    expect(geoMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(geoMock).toHaveBeenCalledTimes(1);
  });

  // ── 14. No sync transition when already online on mount ────────────

  it('does not trigger sync on first mount when already online (no transition)', async () => {
    const triggerSync = jest.fn();

    renderHook(() =>
      useOfflineSyncLoop(
        makeOptions({
          isOnline: true,
          unsyncedCount: 5,
          syncOfflineData: { mutate: triggerSync, isPending: false },
        }),
      ),
    );

    // Advance past the initial mount effects without pending timers
    // (no offline→online transition, so triggerSync should not fire)
    await act(async () => {});

    expect(triggerSync).not.toHaveBeenCalled();
  });

  // ── 15. IDB failure falls back to unsyncedCount check ──────────────

  it('triggers sync on transition when IDB fails but unsyncedCount > 0', async () => {
    const triggerSync = jest.fn();
    mockGetQueueHealthSummary.mockRejectedValue(new Error('IDB unavailable'));

    const { rerender } = renderHook(
      ({ isOnline }: { isOnline: boolean }) =>
        useOfflineSyncLoop(
          makeOptions({
            isOnline,
            unsyncedCount: 3,
            syncOfflineData: { mutate: triggerSync, isPending: false },
          }),
        ),
      { initialProps: { isOnline: false } },
    );

    rerender({ isOnline: true });
    await flushMicrotasks();

    expect(triggerSync).toHaveBeenCalled();
  });
});
