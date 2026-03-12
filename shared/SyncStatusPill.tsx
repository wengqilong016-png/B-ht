import React, { useState, useEffect } from 'react';
import {
  CloudOff, AlertTriangle, ShieldCheck, Loader2, RefreshCw,
} from 'lucide-react';
import { SyncStatus } from '../hooks/useSyncStatus';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncStatusPillProps {
  syncStatus: SyncStatus;
  lang: 'zh' | 'sw';
  /** 'light' for admin (white background), 'dark' for driver (dark header) */
  variant?: 'light' | 'dark';
  /** Expand to full container width — used in the admin sidebar */
  fullWidth?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Compact, reusable sync status indicator.
 * Covers: offline, pending, syncing, sync-failed, and synced states.
 * Clicking triggers a manual sync (unless already syncing or offline).
 */
const SyncStatusPill: React.FC<SyncStatusPillProps> = ({
  syncStatus,
  lang,
  variant = 'light',
  fullWidth = false,
}) => {
  const { isOnline, isSyncing, syncFailed, unsyncedCount, lastSyncedAt, trigger } = syncStatus;
  const isZh = lang === 'zh';

  // ─── Tick state for keeping the elapsed-time label fresh ─────────────────
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  // ─── Derive display state ──────────────────────────────────────────────────
  type State = 'syncing' | 'offline' | 'failed' | 'pending' | 'synced';
  const state: State = !isOnline
    ? 'offline'
    : isSyncing
    ? 'syncing'
    : syncFailed
    ? 'failed'
    : unsyncedCount > 0
    ? 'pending'
    : 'synced';

  // ─── Styling ───────────────────────────────────────────────────────────────
  const colorMap: Record<'light' | 'dark', Record<State, string>> = {
    light: {
      syncing: 'bg-white border-slate-200 text-slate-400 shadow-silicone-sm',
      offline:  'bg-rose-50 border-rose-200 text-rose-500',
      failed:   'bg-rose-50 border-rose-200 text-rose-600',
      pending:  'bg-amber-50 border-amber-200 text-amber-700 animate-pulse',
      synced:   'bg-emerald-50 border-emerald-200 text-emerald-600',
    },
    dark: {
      syncing: 'bg-white/10 text-white/60',
      offline:  'bg-rose-500/10 text-rose-400',
      failed:   'bg-rose-500/20 text-rose-400',
      pending:  'bg-amber-500/20 text-amber-400 animate-pulse',
      synced:   'bg-emerald-500/10 text-emerald-400',
    },
  };

  const iconMap: Record<State, React.ReactNode> = {
    syncing: <Loader2 size={11} className="animate-spin flex-shrink-0" />,
    offline:  <CloudOff size={11} className="flex-shrink-0" />,
    failed:   <RefreshCw size={11} className="flex-shrink-0" />,
    pending:  <AlertTriangle size={11} className="flex-shrink-0" />,
    synced:   <ShieldCheck size={11} className="flex-shrink-0" />,
  };

  const relTime = lastSyncedAt ? formatRelativeTime(lastSyncedAt) : null;
  const labelMap: Record<'zh' | 'sw', Record<State, string>> = {
    zh: {
      syncing: '同步中...',
      offline:  '离线',
      failed:   '同步失败·将自动重试',
      pending:  `${unsyncedCount} 条待同步`,
      synced:   relTime === 'just now' ? '刚同步' : relTime ? `${relTime}前同步` : '已同步',
    },
    sw: {
      syncing: 'Syncing...',
      offline:  'Offline',
      failed:   'Failed · Will Retry',
      pending:  `${unsyncedCount} Pending`,
      synced:   relTime === 'just now' ? 'Synced just now' : relTime ? `Synced ${relTime} ago` : 'Synced',
    },
  };

  const label = labelMap[isZh ? 'zh' : 'sw'][state];

  const borderClass = variant === 'light' ? 'border' : '';

  return (
    <button
      type="button"
      onClick={state === 'syncing' || !isOnline ? undefined : trigger}
      disabled={isSyncing || !isOnline}
      title={syncFailed
        ? (isZh ? '同步失败，60秒后自动重试；或点击立即重试' : 'Sync failed – will retry automatically in ~60s, or tap to retry now')
        : lastSyncedAt
        ? (isZh ? `上次同步：${lastSyncedAt.toLocaleString()}` : `Last synced: ${lastSyncedAt.toLocaleString()}`)
        : undefined}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-subcard',
        'text-[9px] font-black uppercase transition-all',
        borderClass,
        colorMap[variant][state],
        fullWidth ? 'w-full' : '',
        'disabled:cursor-not-allowed',
      ].join(' ').trim()}
    >
      {iconMap[state]}
      <span>{label}</span>
    </button>
  );
};

export default SyncStatusPill;
