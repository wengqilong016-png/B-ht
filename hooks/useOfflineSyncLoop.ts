import { useEffect, useRef, useState, useCallback } from 'react';

import { getQueueHealthSummary, pruneOldSynced } from '../offlineQueue';
import { supabase } from '../supabaseClient';
import { User } from '../types';

/** Retry interval for background auto-sync while there are pending items. */
const AUTO_SYNC_INTERVAL_MS = 60_000;

/** GPS heartbeat interval for driver users (ms). */
const GPS_HEARTBEAT_INTERVAL_MS = 60_000;

/** Skip GPS update when the driver has moved less than this distance (metres). */
const GPS_MIN_MOVEMENT_METERS = 50;

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
 * Returns the great-circle distance between two GPS coordinates in metres
 * using the Haversine formula. No external dependencies required.
 */
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Global auto-sync loop (mode B – background, no user action required).
 *
 * Responsibilities:
 *   1. Triggers a sync immediately when the network transitions offline → online
 *      and there are unsynced records.
 *   2. Retries every 60 s while online with pending records and not already syncing.
 *   3. Listens for Service Worker `FLUSH_OFFLINE_QUEUE` messages.
 *   4. Registers a background-sync tag for browser-native flush on reconnect.
 *   5. Runs a 60-second GPS heartbeat for driver users while online, with an
 *      immediate ping on mount so the admin sees the driver online instantly.
 *      Skips the GPS position update when the driver has moved less than 50 m
 *      (still updates lastActive), and aborts the Supabase update after 5 s
 *      on weak networks to avoid hanging requests.
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
  const { mutate: triggerSync, isPending } = syncOfflineData;

  // Mirror isPending in a ref so interval callbacks always see the current value
  // without needing it in their dependency arrays.
  const isSyncingRef = useRef(isPending);
  isSyncingRef.current = isPending;

  // Track whether the previous render was offline to detect the transition.
  const prevOnlineRef = useRef(isOnline);

  // Last successfully uploaded GPS position for movement throttling.
  const lastGpsRef = useRef<{ lat: number; lng: number } | null>(null);

  // IDB queue health — tracks items that failed to flush and are waiting for
  // their backoff window.  When the React Query cache shows unsyncedCount === 0
  // (all Supabase-visible records are synced) but IDB still has pending or
  // retry-waiting items, the auto-sync interval must still fire.
  const [idbPendingCount, setIdbPendingCount] = useState(0);

  const refreshIdbPending = useCallback(async () => {
    try {
      const { pending, retryWaiting } = await getQueueHealthSummary();
      setIdbPendingCount(pending + retryWaiting);
    } catch {
      // IDB unavailable — treat as zero
    }
  }, []);

  // Poll IDB queue health every 30 s (cheap local read; no network).
  // Also prune old synced entries on mount to prevent unbounded IDB growth.
  useEffect(() => {
    void refreshIdbPending();
    pruneOldSynced().catch(() => {});
    const id = setInterval(() => void refreshIdbPending(), 30_000);
    return () => clearInterval(id);
  }, [refreshIdbPending]);

  // Combined: there is work to do if React Query cache has unsynced items OR
  // IDB has items that haven't been flushed yet.
  const hasPendingWork = unsyncedCount > 0 || idbPendingCount > 0;

  // ─── Auto-sync: trigger immediately on offline → online transition ────────
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    // isSyncingRef is intentionally omitted from deps – it is a ref whose
    // .current is always up-to-date and never needs to trigger a re-run.
    if (!isOnline || !wasOffline || isSyncingRef.current) return;

    void (async () => {
      try {
        const { pending, retryWaiting } = await getQueueHealthSummary();
        const freshPendingCount = pending + retryWaiting;
        setIdbPendingCount(freshPendingCount);

        if (unsyncedCount > 0 || freshPendingCount > 0) {
          triggerSync();
        }
      } catch {
        if (unsyncedCount > 0) {
          triggerSync();
        }
      }
    })();
  }, [isOnline, triggerSync, unsyncedCount]);

  // ✅ 问题 4 修复：删除重复的同步触发点
  // 原来有三个 effect 都可能调用 triggerSync()，导致离线恢复时重复触发：
  // 1. ✓ 保留：主 effect（line 109）— 监听 isOnline React state 变化
  // 2. ✗ 删除：window.online 事件监听（line 137-161）
  // 3. ✗ 删除：定时器 fallback（line 166-189）
  //
  // 理由：
  // - 第一个 effect 已经正确捕获 offline→online 状态转移
  // - window.online 事件会被 useSupabaseData.ts 中的事件处理器捕获，进而更新 React state
  // - 定时器 fallback 不必要，且会导致多次重复调用
  //
  // 新流程：
  // window.online 事件 → useSupabaseData refetchHealth() → React state 更新 → 第一个 effect 触发

  // ─── Auto-sync: retry every 60 s while online with pending records ────────
  useEffect(() => {
    if (!isOnline || !hasPendingWork) return;

    // isSyncingRef is intentionally omitted from deps – the interval callback
    // reads ref.current directly, which is always the latest value, so there
    // is no stale-closure risk.
    const id = setInterval(() => {
      if (!isSyncingRef.current) {
        triggerSync();
      }
    }, AUTO_SYNC_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isOnline, hasPendingWork, triggerSync]);

  // ─── Service Worker offline queue flush ──────────────────────────────────
  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_OFFLINE_QUEUE') {
        triggerSync();
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
  }, [triggerSync]);

  // ─── GPS heartbeat for driver users ──────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !supabase || currentUser?.role !== 'driver' || !activeDriverId) return;

    const pushHeartbeat = () => {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const newPos = { lat: latitude, lng: longitude };

          const lastPos = lastGpsRef.current;
          const hasMovedEnough = !lastPos || haversineMeters(lastPos, newPos) >= GPS_MIN_MOVEMENT_METERS;

          if (hasMovedEnough) {
            // Position changed significantly — update both GPS and lastActive.
            supabase!
              .from('drivers')
              .update({
                lastActive: new Date().toISOString(),
                currentGps: newPos,
              })
              .eq('id', activeDriverId)
              .abortSignal(AbortSignal.timeout(5000))
              .then(({ error }) => {
                if (error) {
                  console.warn('[GPS] Heartbeat update failed:', error.message);
                } else {
                  lastGpsRef.current = newPos;
                }
              });
          } else {
            // Driver hasn't moved — only update lastActive to keep the session alive.
            supabase!
              .from('drivers')
              .update({ lastActive: new Date().toISOString() })
              .eq('id', activeDriverId)
              .abortSignal(AbortSignal.timeout(5000))
              .then(({ error }) => {
                if (error) console.warn('[GPS] lastActive update failed:', error.message);
              });
          }
        },
        (err) => console.warn('[GPS] Heartbeat position error:', err.message),
        // maximumAge: allow browser-cached position up to 30 s old (half the heartbeat
        // interval) so the data is never more than one full cycle stale on the server.
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
      );
    };

    // Fire once immediately so the admin sees the driver online right away
    // without waiting for the first interval tick.
    pushHeartbeat();

    const timer = setInterval(pushHeartbeat, GPS_HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isOnline, currentUser, activeDriverId]);
}
