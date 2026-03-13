import { useEffect, useRef } from 'react';
import { User } from '../types';
import { supabase } from '../supabaseClient';

/** Retry interval for background auto-sync while there are pending items. */
const AUTO_SYNC_INTERVAL_MS = 60_000;

/** GPS heartbeat interval for driver users (ms). */
const GPS_HEARTBEAT_INTERVAL_MS = 30_000;

interface UseOfflineSyncLoopOptions {
  isOnline: boolean;
  /** Number of local records not yet synced to Supabase. */
  unsyncedCount: number;
  currentUser: User | null;
  activeDriverId: string | undefined;
  syncOfflineData: { mutate: () => void; isPending: boolean };
}

type SyncRegistration = ServiceWorkerRegistration & {
  sync: { register: (tag: string) => Promise<void> };
};

/**
 * Global auto-sync loop (mode B – background, no user action required).
 *
 * Responsibilities:
 *   1. Triggers a sync immediately when the network transitions offline → online
 *      and there are unsynced records.
 *   2. Retries every 60 s while online with pending records and not already syncing.
 *   3. Listens for Service Worker `FLUSH_OFFLINE_QUEUE` messages.
 *   4. Registers a background-sync tag for browser-native flush on reconnect.
 *   5. Runs a 30-second GPS heartbeat for driver users while online, with an
 *      immediate ping on mount so the admin sees the driver online instantly.
 *
 * All intervals and listeners are cleaned up on unmount.
 */
export function useOfflineSyncLoop({
  isOnline,
  unsyncedCount,
  currentUser,
  activeDriverId,
  syncOfflineData,
}: UseOfflineSyncLoopOptions) {
  // Mirror isPending in a ref so interval callbacks always see the current value
  // without needing it in their dependency arrays.
  const isSyncingRef = useRef(syncOfflineData.isPending);
  isSyncingRef.current = syncOfflineData.isPending;

  // Track whether the previous render was offline to detect the transition.
  const prevOnlineRef = useRef(isOnline);

  // ─── Auto-sync: trigger immediately on offline → online transition ────────
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    // isSyncingRef is intentionally omitted from deps – it is a ref whose
    // .current is always up-to-date and never needs to trigger a re-run.
    if (isOnline && wasOffline && unsyncedCount > 0 && !isSyncingRef.current) {
      syncOfflineData.mutate();
    }
  }, [isOnline, unsyncedCount, syncOfflineData.mutate]);

  // ─── Auto-sync: retry every 60 s while online with pending records ────────
  useEffect(() => {
    if (!isOnline || unsyncedCount === 0) return;

    // isSyncingRef is intentionally omitted from deps – the interval callback
    // reads ref.current directly, which is always the latest value, so there
    // is no stale-closure risk.
    const id = setInterval(() => {
      if (!isSyncingRef.current) {
        syncOfflineData.mutate();
      }
    }, AUTO_SYNC_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isOnline, unsyncedCount, syncOfflineData.mutate]);

  // ─── Service Worker offline queue flush ──────────────────────────────────
  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_OFFLINE_QUEUE') {
        syncOfflineData.mutate();
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if ('sync' in reg) {
            (reg as SyncRegistration).sync.register('bahati-flush-queue').catch(() => {});
          }
        })
        .catch(() => {});
    }

    return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
  }, [syncOfflineData.mutate]);

  // ─── GPS heartbeat for driver users ──────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !supabase || currentUser?.role !== 'driver' || !activeDriverId) return;

    const pushHeartbeat = () => {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          supabase!
            .from('drivers')
            .update({
              lastActive: new Date().toISOString(),
              currentGps: { lat: latitude, lng: longitude },
            })
            .eq('id', activeDriverId)
            .then(({ error }) => {
              if (error) console.warn('[GPS] Heartbeat update failed:', error.message);
            });
        },
        (err) => console.warn('[GPS] Heartbeat position error:', err.message),
        // maximumAge: allow browser-cached position up to 15 s old (fast on old phones).
        // Keeping it at half the heartbeat interval (30 s) ensures the data never
        // exceeds one full interval old when it reaches the server.
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 15000 }
      );
    };

    // Fire once immediately so the admin sees the driver online right away
    // without waiting for the first interval tick.
    pushHeartbeat();

    const timer = setInterval(pushHeartbeat, GPS_HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isOnline, currentUser, activeDriverId]);
}
