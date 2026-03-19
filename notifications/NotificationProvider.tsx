/**
 * NotificationProvider.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Global notification context + floating bell icon for admin users.
 *
 * Responsibilities:
 *   - Persist notifications to localStorage (offline viewable).
 *   - Expose addNotification() / markAllRead() / clearAll() via context.
 *   - Render a floating bell icon (bottom-right) with an unread badge count.
 *   - Support types: driver_online/offline, anomaly_detected, pending_approval,
 *     settlement_changed, machine_stale, machine_high_risk, driver_idle.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Bell, X, CheckCheck, Trash2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { CONSTANTS, safeRandomUUID } from '../types';
import type { NotificationItem, NotificationEventType } from '../shared/types/notifications';

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
}

export function NotificationProvider({ children }: NotificationProviderProps) {
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
    setNotifications(prev =>
      prev.map(n => n.isRead ? n : { ...n, isRead: true, readAt: new Date().toISOString() })
    );
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAllRead, clearAll }}>
      {children}

      {/* Floating bell button */}
      <div
        ref={panelRef}
        className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Notification panel */}
        {panelOpen && (
          <div className="w-80 max-h-[420px] bg-[#1e2235] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
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
          className="w-12 h-12 rounded-full bg-[#1e2235] border border-white/10 shadow-xl flex items-center justify-center text-white hover:bg-indigo-600 transition-colors relative"
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

export type { NotificationEventType };
