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
  /** ISO timestamp of the most recent successful full sync, or null if never synced this session */
  lastSyncedAt: Date | null;
  trigger: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Enriches the raw sync mutation state with last-sync tracking and failure
 * visibility. Designed to be called inside admin/driver shells so each
 * independently tracks their own sync history.
 */
export function useSyncStatus({
  syncMutation,
  isOnline,
  unsyncedCount,
}: {
  syncMutation: SyncMutationHandle;
  isOnline: boolean;
  unsyncedCount: number;
}): SyncStatus {
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Record the timestamp each time a sync completes successfully.
  useEffect(() => {
    if (syncMutation.isSuccess) {
      setLastSyncedAt(new Date());
    }
  }, [syncMutation.isSuccess]);

  return {
    isOnline,
    isSyncing: syncMutation.isPending,
    syncFailed: syncMutation.isError,
    unsyncedCount,
    lastSyncedAt,
    trigger: syncMutation.mutate,
  };
}
