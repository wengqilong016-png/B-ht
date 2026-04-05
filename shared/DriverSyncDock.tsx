import React, { useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { SyncStatus } from '../hooks/useSyncStatus';

interface DriverSyncDockProps {
  syncStatus: SyncStatus;
  lang: 'zh' | 'sw';
}

function formatRelativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

const DriverSyncDock: React.FC<DriverSyncDockProps> = ({ syncStatus, lang }) => {
  const { isOnline, isSyncing, syncFailed, unsyncedCount, lastSyncedAt, trigger } = syncStatus;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => setTick(value => value + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  const state = !isOnline
    ? 'offline'
    : isSyncing
    ? 'syncing'
    : syncFailed
    ? 'failed'
    : unsyncedCount > 0
    ? 'pending'
    : 'synced';

  const relTime = lastSyncedAt ? formatRelativeTime(lastSyncedAt) : null;
  const isZh = lang === 'zh';

  const content = {
    zh: {
      offline: {
        title: '离线队列已开启',
        subtitle: '已保存到本机，恢复网络后会自动同步',
        cta: null,
      },
      syncing: {
        title: '正在同步记录',
        subtitle: unsyncedCount > 0 ? `还有 ${unsyncedCount} 条记录等待上传` : '请稍候，不要关闭页面',
        cta: null,
      },
      failed: {
        title: '同步失败',
        subtitle: '点击立即重试，或等待系统自动重试',
        cta: '立即重试',
      },
      pending: {
        title: `${unsyncedCount} 条记录待同步`,
        subtitle: '本地已保存，可点击立即同步到云端',
        cta: '立即同步',
      },
      synced: {
        title: '云端已同步',
        subtitle: relTime === 'just now' ? '刚刚完成同步' : relTime ? `${relTime} 前完成同步` : '当前没有待同步记录',
        cta: null,
      },
    },
    sw: {
      offline: {
        title: 'Offline queue active',
        subtitle: 'Saved on this device and will sync when connection returns',
        cta: null,
      },
      syncing: {
        title: 'Syncing records',
        subtitle: unsyncedCount > 0 ? `${unsyncedCount} record(s) still uploading` : 'Please wait and keep the app open',
        cta: null,
      },
      failed: {
        title: 'Sync failed',
        subtitle: 'Tap to retry now, or wait for automatic retry',
        cta: 'Retry now',
      },
      pending: {
        title: `${unsyncedCount} record(s) pending sync`,
        subtitle: 'Saved locally and ready to push to the cloud',
        cta: 'Sync now',
      },
      synced: {
        title: 'Synced to cloud',
        subtitle: relTime === 'just now' ? 'Synced just now' : relTime ? `Synced ${relTime} ago` : 'No pending records',
        cta: null,
      },
    },
  }[isZh ? 'zh' : 'sw'][state];

  const icon = {
    offline: <CloudOff size={16} className="text-rose-500" />,
    syncing: <Loader2 size={16} className="animate-spin text-indigo-500" />,
    failed: <RefreshCw size={16} className="text-rose-500" />,
    pending: <AlertTriangle size={16} className="text-amber-500" />,
    synced: <ShieldCheck size={16} className="text-emerald-500" />,
  }[state];

  const shellColor = {
    offline: 'border-rose-200/80 bg-white/92',
    syncing: 'border-indigo-200/80 bg-white/92',
    failed: 'border-rose-200/80 bg-white/92',
    pending: 'border-amber-200/80 bg-white/92',
    synced: 'border-emerald-200/80 bg-white/88',
  }[state];

  const accentColor = {
    offline: 'bg-rose-50 text-rose-600',
    syncing: 'bg-indigo-50 text-indigo-600',
    failed: 'bg-rose-50 text-rose-600',
    pending: 'bg-amber-50 text-amber-600',
    synced: 'bg-emerald-50 text-emerald-600',
  }[state];

  const isActionable = Boolean(content.cta);
  const isQuiet = state === 'synced';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+max(env(safe-area-inset-bottom),0px))] z-40 px-3 lg:hidden">
      <div
        className={`pointer-events-auto mx-auto rounded-2xl border shadow-[0_12px_28px_rgba(15,23,42,0.10)] backdrop-blur ${shellColor} ${
          isQuiet ? 'max-w-[260px]' : 'max-w-sm'
        }`}
      >
        <div className={`flex items-center gap-2.5 px-3 ${isQuiet ? 'py-2.5' : 'py-2.5'}`}>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${accentColor}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[9px] font-black uppercase tracking-wide text-slate-900">
              {content.title}
            </p>
            {!isQuiet && (
              <p className="truncate text-[8px] font-bold text-slate-500">
                {content.subtitle}
              </p>
            )}
          </div>
          {isActionable ? (
            <button
              type="button"
              onClick={trigger}
              disabled={!isOnline || isSyncing}
              className="shrink-0 rounded-xl bg-slate-900 px-2.5 py-2 text-[8px] font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {content.cta}
            </button>
          ) : (
            <div className="rounded-xl bg-slate-100 px-2 py-1 text-[7px] font-black uppercase text-slate-500">
              {state === 'synced' ? (isZh ? '稳定' : 'OK') : (isZh ? '状态' : 'Status')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverSyncDock;
