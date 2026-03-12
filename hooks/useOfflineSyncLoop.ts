import { useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../supabaseClient';

interface UseOfflineSyncLoopOptions {
  isOnline: boolean;
  currentUser: User | null;
  activeDriverId: string | undefined;
  syncOfflineData: { mutate: () => void };
}

type SyncRegistration = ServiceWorkerRegistration & {
  sync: { register: (tag: string) => Promise<void> };
};

/**
 * Manages the offline sync lifecycle:
 *   - Listens for Service Worker `FLUSH_OFFLINE_QUEUE` messages and flushes the offline queue.
 *   - Registers a background sync tag so the browser can trigger a flush when connectivity returns.
 *   - Runs a 60-second GPS heartbeat for driver users while online.
 *
 * Extracted from App.tsx to keep side-effect registrations self-contained and cleanable.
 */
export function useOfflineSyncLoop({
  isOnline,
  currentUser,
  activeDriverId,
  syncOfflineData,
}: UseOfflineSyncLoopOptions) {
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
  }, [syncOfflineData]);

  // ─── GPS heartbeat for driver users ──────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !supabase || currentUser?.role !== 'driver' || !activeDriverId) return;

    const timer = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            supabase!
              .from('drivers')
              .update({
                lastActive: new Date().toISOString(),
                currentGps: { lat: latitude, lng: longitude },
              })
              .eq('id', activeDriverId);
          },
          () => {},
          { enableHighAccuracy: false, timeout: 5000 }
        );
      }
    }, 60000);

    return () => clearInterval(timer);
  }, [isOnline, currentUser, activeDriverId]);
}
