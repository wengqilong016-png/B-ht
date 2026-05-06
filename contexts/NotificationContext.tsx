/**
 * NotificationContext.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Global notification context + floating bell icon for admin users.
 *
 * Moved from notifications/NotificationProvider.tsx; notification types
 * inlined from shared/types/notifications.ts.
 *
 * Responsibilities:
 *   - Persist notifications to localStorage (offline viewable).
 *   - Expose addNotification() / markAllRead() / clearAll() via context.
 *   - Render a floating bell icon (bottom-right) with an unread badge count.
 */

import { Bell, X, CheckCheck, Trash2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  fetchAdminNotifications,
  markAdminNotificationsRead,
} from '../services/adminNotifications';
import { buildSubmissionNotification } from '../services/adminSubmissionNotifications';
import { fetchDriverFlowEvents } from '../services/driverFlowTelemetry';
import { CONSTANTS, safeRandomUUID } from '../types';

import type { User } from '../types';

// ─── Types (inlined from shared/types/notifications.ts) ───────────────────────

export type NotificationEventType =
  | 'driver_online'
  | 'driver_offline'
  | 'driver_idle'
  | 'machine_stale'
  | 'machine_high_risk'
  | 'pending_approval'
  | 'anomaly_detected'
  | 'driver_collection_success'
  | 'driver_collection_offline'
  | 'driver_collection_failed'
  | 'driver_collection_zero_revenue'
  | 'anomaly'
  | 'overflow'
  | 'reset_locked'
  | 'offline'
  | 'failed'
  | 'zero_revenue'
  | 'admin_notification';

export interface NotificationItem {
  id: string;
  type: NotificationEventType;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'critical';
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
  driverId?: string | null;
  relatedTransactionId?: string | null;
  relatedLocationId?: string | null;
  driverFlowEventId?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (payload: Omit<NotificationItem, 'id' | 'isRead' | 'createdAt'>) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => undefined,
  markAllRead: () => undefined,
  clearAll: () => undefined,
});

export function useNotifications() {
  return useContext(NotificationContext);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadFromStorage(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(CONSTANTS.STORAGE_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NotificationItem[];
    // Keep only the 200 most-recent notifications to avoid unbounded growth.
    return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: NotificationItem[]) {
  try {
    localStorage.setItem(
      CONSTANTS.STORAGE_NOTIFICATIONS_KEY,
      JSON.stringify(items.slice(0, 200))
    );
  } catch {
    // localStorage may be full; silently ignore.
  }
}

function stringifyMetadataValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function notificationEventId(item: NotificationItem): string | null {
  return item.driverFlowEventId
    ?? stringifyMetadataValue(item.metadata?.driverFlowEventId)
    ?? stringifyMetadataValue(item.metadata?.eventId);
}

function notificationEntityId(item: NotificationItem): string | null {
  return item.relatedTransactionId
    ?? item.relatedLocationId
    ?? item.entityId
    ?? item.driverId
    ?? null;
}

function notificationDedupeKey(item: NotificationItem): string {
  const eventId = notificationEventId(item);
  if (eventId) return `event:${eventId}`;

  const entityId = notificationEntityId(item);
  if (entityId) return `${item.type}:${entityId}`;

  return `id:${item.id}`;
}

function mergeDuplicateNotification(primary: NotificationItem, duplicate: NotificationItem): NotificationItem {
  const isRead = primary.isRead || duplicate.isRead;
  return {
    ...primary,
    isRead,
    readAt: primary.readAt ?? duplicate.readAt ?? (isRead ? new Date().toISOString() : null),
  };
}

function notificationTime(item: NotificationItem): number {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeNotifications(primary: NotificationItem[], fallback: NotificationItem[]): NotificationItem[] {
  const byKey = new Map<string, NotificationItem>();

  for (const item of [...primary, ...fallback]) {
    const key = notificationDedupeKey(item);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeDuplicateNotification(existing, item) : item);
  }

  return Array.from(byKey.values())
    .sort((a, b) => notificationTime(b) - notificationTime(a))
    .slice(0, 200);
}

function buildBridgeNotificationItems(events: Awaited<ReturnType<typeof fetchDriverFlowEvents>>): NotificationItem[] {
  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;

  return events
    .filter(event => new Date(event.createdAt).getTime() >= recentCutoff)
    .map((event): NotificationItem | null => {
      const payload = buildSubmissionNotification(event);
      if (!payload) return null;
      return {
        ...payload,
        id: safeRandomUUID(),
        isRead: false,
        createdAt: event.createdAt,
        driverId: event.driverId,
        relatedTransactionId: payload.relatedTransactionId ?? payload.entityId ?? event.draftTxId ?? event.id,
        relatedLocationId: event.locationId,
        driverFlowEventId: event.id,
        metadata: {
          ...payload.metadata,
          eventId: event.id,
          driverFlowEventId: event.id,
          driverId: event.driverId,
          locationId: event.locationId,
        },
      };
    })
    .filter((item): item is NotificationItem => item !== null);
}

async function fetchBridgeNotificationItems(limit = 80): Promise<NotificationItem[]> {
  try {
    return buildBridgeNotificationItems(await fetchDriverFlowEvents(limit));
  } catch (error) {
    console.warn('[NotificationContext] driver_flow_events notification fallback failed:', error);
    return [];
  }
}

function levelIcon(level: NotificationItem['level']) {
  switch (level) {
    case 'critical': return <AlertCircle size={14} className="text-red-400 shrink-0" />;
    case 'warning':  return <AlertTriangle size={14} className="text-yellow-400 shrink-0" />;
    default:         return <Info size={14} className="text-blue-400 shrink-0" />;
  }
}

function levelBg(level: NotificationItem['level']): string {
  switch (level) {
    case 'critical': return 'border-l-red-500 bg-red-950/40';
    case 'warning':  return 'border-l-yellow-500 bg-yellow-950/40';
    default:         return 'border-l-blue-500 bg-blue-950/40';
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface NotificationProviderProps {
  children: React.ReactNode;
  currentUser?: User | null;
}

export function NotificationProvider({ children, currentUser }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(loadFromStorage);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Persist on every change.
  useEffect(() => {
    saveToStorage(notifications);
  }, [notifications]);

  // Close panel when clicking outside.
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  const addNotification = useCallback(
    (payload: Omit<NotificationItem, 'id' | 'isRead' | 'createdAt'>) => {
      const item: NotificationItem = {
        ...payload,
        id: safeRandomUUID(),
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications(prev => [item, ...prev].slice(0, 200));
    },
    []
  );

  const markAllRead = useCallback(() => {
    const readAt = new Date().toISOString();
    const unreadNotificationIds = notifications
      .filter(n => !n.isRead)
      .map(n => n.id)
      .filter(Boolean);

    setNotifications(prev =>
      prev.map(n => n.isRead ? n : { ...n, isRead: true, readAt })
    );

    if (currentUser?.role === 'admin' && unreadNotificationIds.length > 0) {
      void markAdminNotificationsRead(unreadNotificationIds).catch((error) => {
        console.warn('[NotificationContext] mark read failed:', error);
      });
    }
  }, [currentUser?.role, notifications]);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    let cancelled = false;

    const pullAdminNotifications = async () => {
      const persistentNotifications = await fetchAdminNotifications();
      if (cancelled) return;

      const bridgeNotifications = await fetchBridgeNotificationItems(80);
      if (cancelled) return;

      if (persistentNotifications) {
        setNotifications(prev => mergeNotifications(
          mergeNotifications(persistentNotifications, bridgeNotifications),
          prev
        ));
        return;
      }

      if (bridgeNotifications.length > 0) {
        setNotifications(prev => mergeNotifications(bridgeNotifications, prev));
      }
    };

    void pullAdminNotifications();
    const intervalId = window.setInterval(() => { void pullAdminNotifications(); }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentUser?.role]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAllRead, clearAll }}>
      {children}

      {/* Floating bell button */}
      <div
        ref={panelRef}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] right-4 z-[9999] flex flex-col items-end gap-2 md:bottom-6 md:right-6"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Notification panel */}
        {panelOpen && (
          <div className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,55vh)] bg-slate-950/95 border border-cyan-400/15 rounded-2xl shadow-2xl shadow-slate-950/40 backdrop-blur flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-bold text-white">通知中心</span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                    title="全部标为已读"
                  >
                    <CheckCheck size={13} />
                    全部已读
                  </button>
                )}
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors"
                  title="清空通知"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-sm">
                  <Bell size={28} className="mb-2 opacity-30" />
                  暂无通知
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 border-l-2 ${levelBg(n.level)} ${!n.isRead ? 'opacity-100' : 'opacity-60'} border-b border-white/5 hover:opacity-100 transition-opacity`}
                  >
                    <div className="mt-0.5">{levelIcon(n.level)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{n.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-slate-600 mt-1">{formatTime(n.createdAt)}</p>
                    </div>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0 mt-1" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Bell icon button */}
        <button
          onClick={() => {
            const opening = !panelOpen;
            setPanelOpen(opening);
            if (opening && unreadCount > 0) markAllRead();
          }}
          className="w-11 h-11 rounded-2xl bg-cyan-500 border border-cyan-300/40 shadow-xl shadow-cyan-900/20 flex items-center justify-center text-slate-950 hover:bg-cyan-400 transition-colors relative md:w-12 md:h-12"
          aria-label="通知"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center px-1 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </NotificationContext.Provider>
  );
}
