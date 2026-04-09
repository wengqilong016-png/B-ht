import { useState, useEffect, useCallback } from 'react';

import { getQueueHealthSummary, resetDeadLetterItems, resetRetryBackoff } from '../offlineQueue';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The raw mutation handle passed from useSupabaseMutations */
export interface SyncMutationHandle {
  mutate: () => void;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
}

/** Enriched sync status returned by useSyncStatus */
export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  syncFailed: boolean;
  unsyncedCount: number;
  pendingCount: number;
  retryWaitingCount: number;
  deadLetterCount: number;
  state: 'synced' | 'queued' | 'retry_waiting' | 'syncing' | 'failed' | 'dead_letter' | 'offline';
  /** Date of the most recent successful full sync, or null if never synced */
  lastSyncedAt: Date | null;
  trigger: () => void;
  /**
   * Reset all dead-letter items and immediately trigger a sync.
   * Use when the underlying issue has been resolved (e.g. re-login after
   * an expired session). Only relevant when state === 'dead_letter'.
   */
  forceRetry: () => Promise<void>;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_KEY_PREFIX = 'bahati:lastSyncedAt';
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function readLastSyncedAt(userId: string): Date | null {
  try {
    const raw = localStorage.getItem(`${LS_KEY_PREFIX}:${userId}`);
    if (!raw) return null;
    const { ts } = JSON.parse(raw) as { ts: number };
    if (Date.now() - ts > EXPIRY_MS) return null;
    return new Date(ts);
  } catch {
    return null;
  }
}

function writeLastSyncedAt(userId: string, date: Date): void {
  try {
    localStorage.setItem(
      `${LS_KEY_PREFIX}:${userId}`,
      JSON.stringify({ ts: date.getTime() })
    );
  } catch {
    // localStorage may be unavailable in some private-browsing contexts
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Enriches the raw sync mutation state with last-sync tracking and failure
 * visibility. Designed to be called inside admin/driver shells so each
 * independently tracks their own sync history.
 *
 * `lastSyncedAt` is persisted in localStorage (scoped by userId, 24 h expiry)
 * so it survives page reloads and does not bleed across users.
 */
export function useSyncStatus({
  syncMutation,
  isOnline,
  unsyncedCount,
  userId,
}: {
  syncMutation: SyncMutationHandle;
  isOnline: boolean;
  unsyncedCount: number;
  /** Auth user ID used to scope the localStorage key (prevents cross-user bleed). */
  userId?: string;
}): SyncStatus {
  const [queueHealth, setQueueHealth] = useState({
    pending: 0,
    retryWaiting: 0,
    deadLetter: 0,
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    () => (userId ? readLastSyncedAt(userId) : null)
  );

  const refreshQueueHealth = useCallback(async () => {
    try {
      const summary = await getQueueHealthSummary();
      setQueueHealth(summary);
    } catch {
      setQueueHealth({ pending: 0, retryWaiting: 0, deadLetter: 0 });
    }
  }, []);

  // If the userId changes (e.g. a different user session without a full unmount),
  // reload lastSyncedAt from localStorage for the new user.
  useEffect(() => {
    setLastSyncedAt(userId ? readLastSyncedAt(userId) : null);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const summary = await getQueueHealthSummary();
        if (!cancelled) setQueueHealth(summary);
      } catch {
        if (!cancelled) {
          setQueueHealth({ pending: 0, retryWaiting: 0, deadLetter: 0 });
        }
      }
    };

    load();

    if (unsyncedCount === 0 && !syncMutation.isPending && !syncMutation.isError) {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [syncMutation.isError, syncMutation.isPending, unsyncedCount]);

  // Record the timestamp each time a sync completes successfully.
  useEffect(() => {
    if (syncMutation.isSuccess) {
      const now = new Date();
      setLastSyncedAt(now);
      if (userId) writeLastSyncedAt(userId, now);
      refreshQueueHealth();
    }
  }, [refreshQueueHealth, syncMutation.isSuccess, userId]);

  const pendingCount = queueHealth.pending;
  const hasQueuedEntries =
    queueHealth.pending > 0 || queueHealth.retryWaiting > 0 || queueHealth.deadLetter > 0;

  const state: SyncStatus['state'] = !isOnline
    ? 'offline'
    : syncMutation.isPending
    ? 'syncing'
    : queueHealth.deadLetter > 0
    ? 'dead_letter'
    : queueHealth.retryWaiting > 0
    ? 'retry_waiting'
    : syncMutation.isError
    ? 'failed'
    : hasQueuedEntries
    ? 'queued'
    : 'synced';

  const forceRetry = useCallback(async () => {
    // Reset dead-letter AND backoff-waiting items so everything is eligible
    await resetDeadLetterItems();
    await resetRetryBackoff();
    await refreshQueueHealth();
    syncMutation.mutate();
  }, [refreshQueueHealth, syncMutation]);

  return {
    isOnline,
    isSyncing: syncMutation.isPending,
    syncFailed: syncMutation.isError,
    unsyncedCount,
    pendingCount,
    retryWaitingCount: queueHealth.retryWaiting,
    deadLetterCount: queueHealth.deadLetter,
    state,
    lastSyncedAt,
    trigger: syncMutation.mutate,
    forceRetry,
  };
}
