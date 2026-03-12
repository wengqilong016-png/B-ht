import { useState, useEffect } from 'react';

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
  /** Date of the most recent successful full sync, or null if never synced */
  lastSyncedAt: Date | null;
  trigger: () => void;
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
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    () => (userId ? readLastSyncedAt(userId) : null)
  );

  // If the userId changes (e.g. a different user session without a full unmount),
  // reload lastSyncedAt from localStorage for the new user.
  useEffect(() => {
    setLastSyncedAt(userId ? readLastSyncedAt(userId) : null);
  }, [userId]);

  // Record the timestamp each time a sync completes successfully.
  useEffect(() => {
    if (syncMutation.isSuccess) {
      const now = new Date();
      setLastSyncedAt(now);
      if (userId) writeLastSyncedAt(userId, now);
    }
  }, [syncMutation.isSuccess, userId]);

  return {
    isOnline,
    isSyncing: syncMutation.isPending,
    syncFailed: syncMutation.isError,
    unsyncedCount,
    lastSyncedAt,
    trigger: syncMutation.mutate,
  };
}
