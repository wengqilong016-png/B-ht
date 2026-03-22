/**
 * QueueDiagnostics
 * ──────────────────────────────────────────────────────────────────────────────
 * Admin/operator diagnostics panel for the offline transaction queue.
 *
 * Shows:
 *   • Health summary: pending / retry-waiting / dead-letter counts.
 *   • Dead-letter item list with actionable metadata per entry:
 *       – operationId, last error message, error category badge,
 *         retry count, and earliest next-retry timestamp.
 *
 * Auto-refreshes every 30 seconds; a manual Refresh button is also provided.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, RefreshCw,
  Inbox, XCircle, Loader2,
} from 'lucide-react';
import {
  getQueueHealthSummary,
  getDeadLetterItems,
  MAX_RETRIES,
  type QueueHealthSummary,
  type QueueMeta,
} from '../../offlineQueue';
import { Transaction } from '../../types';

type DeadLetterEntry = Transaction & Partial<QueueMeta>;

const POLL_INTERVAL_MS = 30_000;

// ── Small helpers ─────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m}m`;
  return `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatISOShort(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  colorClass: string;
}
const SummaryCard: React.FC<SummaryCardProps> = ({ label, count, icon, colorClass }) => (
  <div className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${colorClass}`}>
    <div className="shrink-0">{icon}</div>
    <div>
      <p className="text-2xl font-black leading-none">{count}</p>
      <p className="text-[11px] font-semibold uppercase tracking-widest mt-0.5 opacity-70">{label}</p>
    </div>
  </div>
);

interface ErrorCategoryBadgeProps {
  category: 'transient' | 'permanent' | undefined;
}
const ErrorCategoryBadge: React.FC<ErrorCategoryBadgeProps> = ({ category }) => {
  if (!category) return <span className="text-slate-400 text-xs">—</span>;
  const cfg = category === 'permanent'
    ? { cls: 'bg-rose-100 text-rose-700 border-rose-200', label: 'permanent' }
    : { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'transient' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const QueueDiagnostics: React.FC = () => {
  const [summary, setSummary] = useState<QueueHealthSummary | null>(null);
  const [deadItems, setDeadItems] = useState<DeadLetterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, dl] = await Promise.all([
        getQueueHealthSummary(),
        getDeadLetterItems(),
      ]);
      setSummary(s);
      setDeadItems(dl as DeadLetterEntry[]);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[QueueDiagnostics] refresh error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading && !summary) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-6 w-48 bg-slate-200 rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-20 bg-slate-100 rounded-2xl" />
          ))}
        </div>
        <div className="h-40 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  const hasDead = deadItems.length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">Queue Diagnostics</h2>
          {lastRefreshed && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              Last updated: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          aria-label="Refresh diagnostics"
        >
          {loading
            ? <Loader2 size={13} className="animate-spin" />
            : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {/* ── Health summary cards ─────────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard
            label="Pending"
            count={summary.pending}
            icon={<Clock size={20} className="text-indigo-500" />}
            colorClass="bg-indigo-50 border-indigo-200 text-indigo-800"
          />
          <SummaryCard
            label="Retry Waiting"
            count={summary.retryWaiting}
            icon={<AlertTriangle size={20} className="text-amber-500" />}
            colorClass="bg-amber-50 border-amber-200 text-amber-800"
          />
          <SummaryCard
            label="Dead Letter"
            count={summary.deadLetter}
            icon={<XCircle size={20} className="text-rose-500" />}
            colorClass="bg-rose-50 border-rose-200 text-rose-800"
          />
        </div>
      )}

      {/* ── Dead-letter item list ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
          <XCircle size={16} className="text-rose-500 shrink-0" />
          <h3 className="text-sm font-bold text-slate-700">Dead-Letter Items</h3>
          {hasDead && (
            <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">
              {deadItems.length}
            </span>
          )}
        </div>

        {!hasDead ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="text-sm font-semibold">No dead-letter items</p>
            <p className="text-xs opacity-70">All queue entries are within retry budget.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {deadItems.map(entry => (
              <div key={entry.id} className="px-5 py-4 space-y-2">
                {/* Row 1: IDs */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono text-[11px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5 border border-slate-200">
                    tx: {entry.id}
                  </span>
                  {entry.operationId && (
                    <span className="font-mono text-[11px] text-slate-400">
                      op: {entry.operationId}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">
                    Queued: {formatISOShort(entry._queuedAt)}
                  </span>
                </div>

                {/* Row 2: Error */}
                <div className="flex items-start gap-2">
                  <Inbox size={13} className="text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-600 leading-snug break-all">
                    {entry.lastError ?? '(no error message recorded)'}
                  </p>
                </div>

                {/* Row 3: Metadata badges */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    Category: <ErrorCategoryBadge category={entry.lastErrorCategory} />
                  </span>
                  <span>Retries: <strong>{entry.retryCount ?? 0}</strong></span>
                  {entry.nextRetryAt && (
                    <span>
                      Next retry: <strong>{formatRelativeTime(entry.nextRetryAt)}</strong>
                      {' '}
                      <span className="text-slate-400">({formatISOShort(entry.nextRetryAt)})</span>
                    </span>
                  )}
                  <span>
                    Location: <strong>{entry.locationName ?? entry.locationId}</strong>
                  </span>
                  <span>
                    Driver: <strong>{entry.driverName ?? entry.driverId}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Guidance note ────────────────────────────────────────────────── */}
      <p className="text-[11px] text-slate-400 leading-relaxed">
        <strong className="text-slate-500">Dead-letter</strong> entries have exceeded the maximum retry budget
        ({MAX_RETRIES} failures) and will not be replayed automatically.
        Review the error details above, resolve the underlying issue, then ask the
        driver to re-submit or contact support to purge the entry.
      </p>
    </div>
  );
};

export default QueueDiagnostics;
