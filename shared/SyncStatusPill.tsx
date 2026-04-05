import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CloudOff, AlertTriangle, ShieldCheck, Loader2, RefreshCw, ChevronDown, XCircle,
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
  const {
    isOnline,
    isSyncing,
    unsyncedCount,
    pendingCount,
    retryWaitingCount,
    deadLetterCount,
    state,
    lastSyncedAt,
    trigger,
  } = syncStatus;
  const isZh = lang === 'zh';
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // ─── Tick state for keeping the elapsed-time label fresh ─────────────────
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  type State = SyncStatus['state'];

  // ─── Styling ───────────────────────────────────────────────────────────────
  const colorMap: Record<'light' | 'dark', Record<State, string>> = {
    light: {
      syncing: 'bg-white border-slate-200 text-slate-400 shadow-silicone-sm',
      offline:  'bg-rose-50 border-rose-200 text-rose-500',
      failed:   'bg-rose-50 border-rose-200 text-rose-600',
      queued:   'bg-amber-50 border-amber-200 text-amber-700 animate-pulse',
      retry_waiting: 'bg-amber-50 border-amber-200 text-amber-700',
      dead_letter: 'bg-rose-50 border-rose-200 text-rose-700',
      synced:   'bg-emerald-50 border-emerald-200 text-emerald-600',
    },
    dark: {
      syncing: 'bg-white/10 text-white/60',
      offline:  'bg-rose-500/10 text-rose-400',
      failed:   'bg-rose-500/20 text-rose-400',
      queued:   'bg-amber-500/20 text-amber-400 animate-pulse',
      retry_waiting: 'bg-amber-500/20 text-amber-400',
      dead_letter: 'bg-rose-500/25 text-rose-300',
      synced:   'bg-emerald-500/10 text-emerald-400',
    },
  };

  const iconMap: Record<State, React.ReactNode> = {
    syncing: <Loader2 size={11} className="animate-spin flex-shrink-0" />,
    offline:  <CloudOff size={11} className="flex-shrink-0" />,
    failed:   <RefreshCw size={11} className="flex-shrink-0" />,
    queued:   <AlertTriangle size={11} className="flex-shrink-0" />,
    retry_waiting: <RefreshCw size={11} className="flex-shrink-0" />,
    dead_letter: <XCircle size={11} className="flex-shrink-0" />,
    synced:   <ShieldCheck size={11} className="flex-shrink-0" />,
  };

  const relTime = lastSyncedAt ? formatRelativeTime(lastSyncedAt) : null;
  const labelMap: Record<'zh' | 'sw', Record<State, string>> = {
    zh: {
      syncing: '同步中...',
      offline:  '离线',
      failed:   '同步失败·将自动重试',
      queued:   `${pendingCount} 条待同步`,
      retry_waiting: `${retryWaitingCount} 条等待重试`,
      dead_letter: `${deadLetterCount} 条需处理`,
      synced:   relTime === 'just now' ? '刚同步' : relTime ? `${relTime}前同步` : '已同步',
    },
    sw: {
      syncing: 'Syncing...',
      offline:  'Offline',
      failed:   'Failed · Will Retry',
      queued:   `${pendingCount} Pending`,
      retry_waiting: `${retryWaitingCount} Retry Waiting`,
      dead_letter: `${deadLetterCount} Needs Review`,
      synced:   relTime === 'just now' ? 'Synced just now' : relTime ? `Synced ${relTime} ago` : 'Synced',
    },
  };

  const hintMap: Record<'zh' | 'sw', Record<State, string>> = {
    zh: {
      syncing: '正在把本地记录同步到云端。',
      offline: '当前离线，新记录会先排队，联网后自动补传。',
      failed: '上次同步失败。你可以现在重试，系统也会继续自动重试。',
      queued: '这些记录已经保存在本机，等待下一次同步。',
      retry_waiting: '系统正在等待下一次自动重试。',
      dead_letter: '部分记录超过重试上限，需要你检查并重新处理。',
      synced: '当前没有待同步记录。',
    },
    sw: {
      syncing: 'Records are being synced to the cloud now.',
      offline: 'You are offline. New records are queued and will sync later.',
      failed: 'The last sync failed. You can retry now and the system will keep retrying.',
      queued: 'These records are stored locally and waiting for sync.',
      retry_waiting: 'The system is waiting for the next automatic retry window.',
      dead_letter: 'Some records exceeded retry limits and need attention.',
      synced: 'There are no pending records right now.',
    },
  };

  const queueBreakdown = useMemo(
    () => [
      {
        key: 'queued',
        label: isZh ? '待同步' : 'Queued',
        value: pendingCount,
      },
      {
        key: 'retry',
        label: isZh ? '等待重试' : 'Retry Waiting',
        value: retryWaitingCount,
      },
      {
        key: 'dead',
        label: isZh ? '需处理' : 'Needs Review',
        value: deadLetterCount,
      },
    ].filter(item => item.value > 0),
    [deadLetterCount, isZh, pendingCount, retryWaitingCount, unsyncedCount]
  );

  const label = labelMap[isZh ? 'zh' : 'sw'][state];
  const hint = hintMap[isZh ? 'zh' : 'sw'][state];
  const canRetry = isOnline && !isSyncing && state !== 'synced';

  const borderClass = variant === 'light' ? 'border' : '';

  return (
    <div ref={wrapperRef} className={`relative ${fullWidth ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className={[
          'flex items-center gap-1.5 px-3 py-1.5 rounded-subcard',
          'text-[9px] font-black uppercase transition-all',
          borderClass,
          colorMap[variant][state],
          fullWidth ? 'w-full justify-between' : '',
        ].join(' ').trim()}
      >
        <span className="flex items-center gap-1.5">
          {iconMap[state]}
          <span>{label}</span>
        </span>
        <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10 ${
            fullWidth ? 'left-0 right-0' : 'right-0 min-w-[240px] max-w-[280px]'
          }`}
        >
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-900">{label}</p>
              <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-500">{hint}</p>
            </div>

            {queueBreakdown.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {queueBreakdown.map(item => (
                  <div key={item.key} className="rounded-xl bg-slate-50 px-2 py-2 text-center">
                    <p className="text-[8px] font-black uppercase text-slate-400">{item.label}</p>
                    <p className="mt-1 text-[11px] font-black text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-medium text-slate-500">
              {lastSyncedAt
                ? (isZh ? `最近同步：${lastSyncedAt.toLocaleString()}` : `Last synced: ${lastSyncedAt.toLocaleString()}`)
                : (isZh ? '最近同步：尚无记录' : 'Last synced: not yet')}
            </div>

            {canRetry && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  trigger();
                  setIsOpen(false);
                }}
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase text-white transition hover:bg-slate-800"
              >
                {isZh ? '立即重试' : 'Retry Now'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncStatusPill;
