/**
 * __tests__/useSyncStatus.test.ts
 *
 * Tests for hooks/useSyncStatus.ts
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useSyncStatus } from '../hooks/useSyncStatus';
import type { SyncMutationHandle } from '../hooks/useSyncStatus';
import { getQueueHealthSummary } from '../offlineQueue';

jest.mock('../offlineQueue', () => ({
  getQueueHealthSummary: jest.fn(async () => ({ pending: 0, retryWaiting: 0, deadLetter: 0 })),
}));

const LS_KEY_PREFIX = 'bahati:lastSyncedAt';
const EXPIRY_MS = 24 * 60 * 60 * 1000;

function makeMutation(overrides: Partial<SyncMutationHandle> = {}): SyncMutationHandle {
  return {
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  (getQueueHealthSummary as jest.Mock).mockResolvedValue({ pending: 0, retryWaiting: 0, deadLetter: 0 });
});

describe('useSyncStatus()', () => {
  it('does not show queued state when local unsynced count exists but queue health is empty', () => {
    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 3, userId: 'u1' })
    );
    expect(result.current.isOnline).toBe(true);
    expect(result.current.unsyncedCount).toBe(3);
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncFailed).toBe(false);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.state).toBe('synced');
  });

  it('isSyncing is true when mutation is pending', () => {
    const { result } = renderHook(() =>
      useSyncStatus({
        syncMutation: makeMutation({ isPending: true }),
        isOnline: true,
        unsyncedCount: 1,
        userId: 'u1',
      })
    );
    expect(result.current.isSyncing).toBe(true);
  });

  it('syncFailed is true when mutation has errored', () => {
    const { result } = renderHook(() =>
      useSyncStatus({
        syncMutation: makeMutation({ isError: true }),
        isOnline: true,
        unsyncedCount: 1,
        userId: 'u1',
      })
    );
    expect(result.current.syncFailed).toBe(true);
  });

  it('lastSyncedAt is null when no previous sync in localStorage', () => {
    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 0, userId: 'u2' })
    );
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('restores lastSyncedAt from localStorage if stored within 24h', () => {
    const now = Date.now();
    localStorage.setItem(`${LS_KEY_PREFIX}:u3`, JSON.stringify({ ts: now }));
    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 0, userId: 'u3' })
    );
    expect(result.current.lastSyncedAt).not.toBeNull();
    expect(result.current.lastSyncedAt!.getTime()).toBeCloseTo(now, -2);
  });

  it('ignores lastSyncedAt from localStorage if older than 24h', () => {
    const old = Date.now() - EXPIRY_MS - 1000;
    localStorage.setItem(`${LS_KEY_PREFIX}:u4`, JSON.stringify({ ts: old }));
    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 0, userId: 'u4' })
    );
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('lastSyncedAt is null when userId is undefined', () => {
    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: false, unsyncedCount: 0 })
    );
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('trigger() calls syncMutation.mutate()', () => {
    const mutate = jest.fn();
    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation({ mutate }), isOnline: true, unsyncedCount: 0, userId: 'u5' })
    );
    act(() => result.current.trigger());
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('derives retry_waiting from queue health summary', async () => {
    (getQueueHealthSummary as jest.Mock).mockResolvedValue({
      pending: 0,
      retryWaiting: 2,
      deadLetter: 0,
    });

    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 2, userId: 'u6' })
    );

    await act(async () => {});

    expect(result.current.retryWaitingCount).toBe(2);
    expect(result.current.state).toBe('retry_waiting');
  });

  it('derives dead_letter from queue health summary', async () => {
    (getQueueHealthSummary as jest.Mock).mockResolvedValue({
      pending: 0,
      retryWaiting: 0,
      deadLetter: 1,
    });

    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 1, userId: 'u7' })
    );

    await act(async () => {});

    expect(result.current.deadLetterCount).toBe(1);
    expect(result.current.state).toBe('dead_letter');
  });

  it('writes lastSyncedAt to localStorage when isSuccess transitions to true', async () => {
    const { rerender } = renderHook(
      ({ mut }: { mut: SyncMutationHandle }) =>
        useSyncStatus({ syncMutation: mut, isOnline: true, unsyncedCount: 0, userId: 'u8' }),
      { initialProps: { mut: makeMutation({ isSuccess: false }) } },
    );

    const before = Date.now();
    rerender({ mut: makeMutation({ isSuccess: true }) });
    await act(async () => {});
    const after = Date.now();

    const raw = localStorage.getItem('bahati:lastSyncedAt:u8');
    expect(raw).not.toBeNull();
    const { ts } = JSON.parse(raw!) as { ts: number };
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('does NOT write to localStorage when isSuccess=true but userId is undefined', async () => {
    const { rerender } = renderHook(
      ({ mut }: { mut: SyncMutationHandle }) =>
        useSyncStatus({ syncMutation: mut, isOnline: true, unsyncedCount: 0 }),
      { initialProps: { mut: makeMutation({ isSuccess: false }) } },
    );

    rerender({ mut: makeMutation({ isSuccess: true }) });
    await act(async () => {});

    // No key should be written without a userId
    const keys = Object.keys(localStorage).filter(k => k.startsWith('bahati:lastSyncedAt'));
    expect(keys).toHaveLength(0);
  });

  it('falls back to zero counts when getQueueHealthSummary rejects', async () => {
    (getQueueHealthSummary as jest.Mock).mockRejectedValue(new Error('IDB error'));

    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 1, userId: 'u9' })
    );

    await act(async () => {});

    expect(result.current.pendingCount).toBe(0);
    expect(result.current.retryWaitingCount).toBe(0);
    expect(result.current.deadLetterCount).toBe(0);
  });

  it('reloads lastSyncedAt from localStorage when userId changes', async () => {
    const ts1 = Date.now() - 5000;
    const ts2 = Date.now() - 1000;
    localStorage.setItem('bahati:lastSyncedAt:u10', JSON.stringify({ ts: ts1 }));
    localStorage.setItem('bahati:lastSyncedAt:u11', JSON.stringify({ ts: ts2 }));

    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) =>
        useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 0, userId: uid }),
      { initialProps: { uid: 'u10' } },
    );

    expect(result.current.lastSyncedAt?.getTime()).toBeCloseTo(ts1, -2);

    rerender({ uid: 'u11' });
    await act(async () => {});

    expect(result.current.lastSyncedAt?.getTime()).toBeCloseTo(ts2, -2);
  });

  it('readLastSyncedAt returns null when localStorage contains corrupt JSON', () => {
    localStorage.setItem('bahati:lastSyncedAt:u12', 'NOT_JSON{{{');
    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: true, unsyncedCount: 0, userId: 'u12' })
    );
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('state is offline when isOnline=false regardless of pending items', async () => {
    (getQueueHealthSummary as jest.Mock).mockResolvedValue({
      pending: 5, retryWaiting: 2, deadLetter: 1,
    });

    const { result } = renderHook(() =>
      useSyncStatus({ syncMutation: makeMutation(), isOnline: false, unsyncedCount: 5, userId: 'u13' })
    );

    await act(async () => {});
    expect(result.current.state).toBe('offline');
  });

  it('state is failed when mutation.isError=true and online with no queue items', async () => {
    const { result } = renderHook(() =>
      useSyncStatus({
        syncMutation: makeMutation({ isError: true }),
        isOnline: true,
        unsyncedCount: 0,
        userId: 'u14',
      })
    );
    await act(async () => {});
    expect(result.current.state).toBe('failed');
  });
});
