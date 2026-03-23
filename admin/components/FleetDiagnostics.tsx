/**
 * FleetDiagnostics
 * ──────────────────────────────────────────────────────────────────────────────
 * Fleet-wide (server-aggregated) queue diagnostics panel.
 *
 * Shows queue health across ALL reporting driver devices, not just this browser:
 *   • Aggregate summary: total pending / retry-waiting / dead-letter counts.
 *   • Per-device snapshot list with per-driver breakdown.
 *   • Dead-letter item details per device (key metadata only, no raw user data).
 *
 * Data source: `queue_health_reports` Supabase table (admin-read, RLS-enforced).
 * Devices report their local queue state after each successful sync via
 * `reportQueueHealthToServer()` in offlineQueue.ts.
 *
 * Auto-refreshes every 60 seconds; a manual Refresh button is also provided.
 *
 * This component is deliberately read-only — no replay or mutation controls.
 * For local-device replay, use the "Local Queue" panel.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Download, Loader2,
  RefreshCw, Server, Wifi, XCircle,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../supabaseClient';
import {
  getFleetDiagnostics,
  STALE_THRESHOLD_MS,
  type FleetDiagnosticsSummary,
  type DeviceQueueSnapshot,
  type DeadLetterSummaryItem,
} from '../../services/fleetDiagnosticsService';
import {
  buildFleetExportPayload,
  triggerJSONDownload,
  buildExportFilename,
  type ExportFilters,
} from '../../services/diagnosticsExportService';
import {
  recordAuditEvent,
  addCaseIdToExportPayload,
} from '../../services/supportCaseService';
import CasePicker from './CasePicker';

const POLL_INTERVAL_MS = 60_000;
// STALE_THRESHOLD_MS is imported from the service to stay in sync.

// ── Small helpers ─────────────────────────────────────────────────────────────

function formatRelativeAge(iso: string): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatISOShort(iso: string): string {
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

interface DeadLetterItemRowProps {
  item: DeadLetterSummaryItem;
}
const DeadLetterItemRow: React.FC<DeadLetterItemRowProps> = ({ item }) => (
  <div className="px-4 py-3 space-y-1.5 bg-rose-50/40 border-t border-rose-100 text-xs">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="font-mono text-[11px] text-slate-500 bg-white rounded px-1.5 py-0.5 border border-slate-200">
        tx: {item.txId}
      </span>
      {item.operationId && (
        <span className="font-mono text-[11px] text-slate-400">op: {item.operationId}</span>
      )}
      {item.queuedAt && (
        <span className="text-[11px] text-slate-400">Queued: {formatISOShort(item.queuedAt)}</span>
      )}
    </div>
    <div className="flex flex-wrap items-center gap-3 text-slate-500">
      <span>Category: <ErrorCategoryBadge category={item.lastErrorCategory} /></span>
      <span>Retries: <strong>{item.retryCount}</strong></span>
      <span>
        Location: <strong>{item.locationName ?? item.locationId}</strong>
      </span>
    </div>
    {item.lastError && (
      <p className="text-[11px] text-rose-600 break-all leading-snug">
        Error: {item.lastError}
      </p>
    )}
  </div>
);

interface SnapshotCardProps {
  snapshot: DeviceQueueSnapshot;
}
const SnapshotCard: React.FC<SnapshotCardProps> = ({ snapshot }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDeadLetter = snapshot.deadLetterCount > 0;
  const { isStale } = snapshot;

  return (
    <div className={`rounded-2xl border overflow-hidden ${
      hasDeadLetter ? 'border-rose-200' : 'border-slate-200'
    } bg-white`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-3.5">
        <Wifi size={16} className={hasDeadLetter ? 'text-rose-500' : 'text-emerald-500'} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{snapshot.driverName}</p>
          <p className="text-[10px] text-slate-400 font-mono truncate">{snapshot.deviceId.slice(0, 12)}…</p>
        </div>
        {isStale && (
          <span className="shrink-0 text-[9px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            Stale
          </span>
        )}
        <span className="shrink-0 text-[10px] text-slate-400">{formatRelativeAge(snapshot.reportedAt)}</span>
      </div>

      {/* Counts row */}
      <div className="flex divide-x divide-slate-100 border-t border-slate-100">
        <div className="flex-1 px-4 py-2 text-center">
          <p className="text-lg font-black text-indigo-600">{snapshot.pendingCount}</p>
          <p className="text-[9px] font-semibold uppercase text-slate-400 tracking-wide">Pending</p>
        </div>
        <div className="flex-1 px-4 py-2 text-center">
          <p className="text-lg font-black text-amber-600">{snapshot.retryWaitingCount}</p>
          <p className="text-[9px] font-semibold uppercase text-slate-400 tracking-wide">Retrying</p>
        </div>
        <div className="flex-1 px-4 py-2 text-center">
          <p className={`text-lg font-black ${hasDeadLetter ? 'text-rose-600' : 'text-slate-400'}`}>
            {snapshot.deadLetterCount}
          </p>
          <p className="text-[9px] font-semibold uppercase text-slate-400 tracking-wide">Dead Letter</p>
        </div>
      </div>

      {/* Dead-letter expand toggle */}
      {hasDeadLetter && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-2 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors border-t border-rose-100"
          >
            <span>{snapshot.deadLetterItems.length} dead-letter item{snapshot.deadLetterItems.length !== 1 ? 's' : ''}</span>
            <span>{expanded ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {expanded && snapshot.deadLetterItems.map((item, i) => (
            <DeadLetterItemRow key={item.txId ?? i} item={item} />
          ))}
        </>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

const FleetDiagnostics: React.FC = () => {
  const [summary, setSummary] = useState<FleetDiagnosticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const [caseId, setCaseId] = useState('');
  /** Export filter controls */
  const [filterDriverId, setFilterDriverId] = useState('');
  const [filterDeviceId, setFilterDeviceId] = useState('');
  const [filterErrorState, setFilterErrorState] = useState<ExportFilters['errorState'] | ''>('');

  const refresh = useCallback(async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError('Supabase is not configured on this device.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getFleetDiagnostics(supabase);
      setSummary(result);
      setLastRefreshed(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[FleetDiagnostics] refresh error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleClearFilters = useCallback(() => {
    setFilterDriverId('');
    setFilterDeviceId('');
    setFilterErrorState('');
  }, []);

  const handleExport = useCallback(() => {
    if (!summary) return;
    setExporting(true);
    try {
      const filters: ExportFilters = {};
      if (filterDriverId.trim()) filters.driverId = filterDriverId.trim();
      if (filterDeviceId.trim()) filters.deviceId = filterDeviceId.trim();
      if (filterErrorState) filters.errorState = filterErrorState;
      const hasFilters = Object.keys(filters).length > 0;
      const rawPayload = buildFleetExportPayload(summary, hasFilters ? filters : undefined);
      const payload = addCaseIdToExportPayload(rawPayload, caseId.trim() || undefined);
      const filename = buildExportFilename('fleet', payload.exportedAt);
      triggerJSONDownload(payload, filename);
      // Record audit event: diagnostic export
      if (supabase) {
        recordAuditEvent(supabase, {
          caseId: caseId.trim() || undefined,
          eventType: 'diagnostic_export',
          payload: { exportScope: 'fleet', exportFilename: filename },
        });
      }
    } finally {
      setExporting(false);
    }
  }, [summary, filterDriverId, filterDeviceId, filterErrorState, caseId]);

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading && !summary) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-6 w-64 bg-slate-200 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl" />)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">Fleet-Wide Queue Diagnostics</h2>
          {lastRefreshed && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              Last updated: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!summary || exporting}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:opacity-50 transition-colors"
            aria-label="Export fleet diagnostics as JSON"
          >
            {exporting
              ? <Loader2 size={13} className="animate-spin" />
              : <Download size={13} />}
            Export
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
            aria-label="Refresh fleet diagnostics"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </div>

      {/* ── Export filter controls ───────────────────────────────────────── */}
      {summary && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Export Filters &amp; Case Linking (optional)</p>
          <div className="space-y-2">
            <CasePicker value={caseId} onChange={setCaseId} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 min-w-[140px]">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Driver ID</span>
                <input
                  type="text"
                  value={filterDriverId}
                  onChange={(e) => setFilterDriverId(e.target.value)}
                  placeholder="e.g. drv-123"
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </label>
            <label className="flex flex-col gap-1 min-w-[140px]">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Device ID</span>
              <input
                type="text"
                value={filterDeviceId}
                onChange={(e) => setFilterDeviceId(e.target.value)}
                placeholder="e.g. dev-abc"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="flex flex-col gap-1 min-w-[140px]">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Error State</span>
              <select
                value={filterErrorState}
                onChange={(e) => setFilterErrorState(e.target.value as ExportFilters['errorState'] | '')}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">All</option>
                <option value="dead-letter">Dead-letter only</option>
                <option value="transient">Transient errors</option>
                <option value="permanent">Permanent errors</option>
                <option value="any-error">Any error</option>
              </select>
            </label>
            {(filterDriverId || filterDeviceId || filterErrorState) && (
              <button
                onClick={handleClearFilters}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Clear
              </button>
            )}
            </div>
          </div>
          <p className="text-[10px] text-slate-400">
            Filters are applied to the export only — they do not affect the display above.
            When a case ID is set, the export file and audit trail will reference it.
          </p>
        </div>
      )}

      {/* ── Scope notice ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-start gap-3">
        <Server size={16} className="text-indigo-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-indigo-900 leading-snug">
            Fleet-Wide Scope (Server-Reported)
          </p>
          <p className="text-[11px] text-indigo-700 leading-relaxed mt-1">
            This page shows aggregated queue health from <strong>all reporting driver devices</strong>.
            Each device reports its local queue state to the server after every sync.
            Devices that have not yet synced will not appear here.
            For local-device replay controls, use the <strong>Local Queue</strong> panel.
          </p>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-3">
          <XCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-rose-800">Failed to load fleet diagnostics</p>
            <p className="text-[11px] text-rose-600 mt-0.5 break-all">{error}</p>
          </div>
        </div>
      )}

      {/* ── Aggregate summary cards ──────────────────────────────────────── */}
      {summary && (() => {
        const staleCount = summary.totalDevicesReporting - summary.currentDevicesReporting;
        const hasStale = staleCount > 0;
        return (
          <div className="space-y-2">
            {/* Current (non-stale) totals — primary row */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700">
                Current
              </span>
              <span className="text-[10px] text-slate-400">(snapshots &lt; 2 h old)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard
                label="Devices Reporting"
                count={summary.currentDevicesReporting}
                icon={<Activity size={20} className="text-slate-500" />}
                colorClass="bg-slate-50 border-slate-200 text-slate-700"
              />
              <SummaryCard
                label="Total Pending"
                count={summary.currentPending}
                icon={<Clock size={20} className="text-indigo-500" />}
                colorClass="bg-indigo-50 border-indigo-200 text-indigo-800"
              />
              <SummaryCard
                label="Retry Waiting"
                count={summary.currentRetryWaiting}
                icon={<AlertTriangle size={20} className="text-amber-500" />}
                colorClass="bg-amber-50 border-amber-200 text-amber-800"
              />
              <SummaryCard
                label="Dead Letter"
                count={summary.currentDeadLetter}
                icon={<XCircle size={20} className="text-rose-500" />}
                colorClass="bg-rose-50 border-rose-200 text-rose-800"
              />
            </div>

            {/* Including-stale totals — secondary row, only shown when stale snapshots exist */}
            {hasStale && (
              <>
                <div className="flex items-center gap-2 mt-4 mb-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-amber-600">
                    Including Stale
                  </span>
                  <span className="text-[10px] text-slate-400">
                    (+{staleCount} stale snapshot{staleCount !== 1 ? 's' : ''} &gt; 2 h old — may not reflect current state)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SummaryCard
                    label="Devices Reporting"
                    count={summary.totalDevicesReporting}
                    icon={<Activity size={20} className="text-slate-400" />}
                    colorClass="bg-amber-50/60 border-amber-200 text-amber-700 opacity-75"
                  />
                  <SummaryCard
                    label="Total Pending"
                    count={summary.totalPending}
                    icon={<Clock size={20} className="text-amber-400" />}
                    colorClass="bg-amber-50/60 border-amber-200 text-amber-700 opacity-75"
                  />
                  <SummaryCard
                    label="Retry Waiting"
                    count={summary.totalRetryWaiting}
                    icon={<AlertTriangle size={20} className="text-amber-400" />}
                    colorClass="bg-amber-50/60 border-amber-200 text-amber-700 opacity-75"
                  />
                  <SummaryCard
                    label="Dead Letter"
                    count={summary.totalDeadLetter}
                    icon={<XCircle size={20} className="text-amber-500" />}
                    colorClass="bg-amber-50/60 border-amber-200 text-amber-700 opacity-75"
                  />
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Per-device snapshot grid ─────────────────────────────────────── */}
      {summary && summary.snapshots.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <CheckCircle2 size={28} className="text-emerald-400" />
          <p className="text-sm font-semibold">No device reports yet</p>
          <p className="text-xs opacity-70 text-center max-w-sm">
            Queue health will appear here once driver devices sync while online.
            An empty state means no device has reported — not that the fleet is healthy.
          </p>
        </div>
      ) : summary && (
        <div>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
            Per-Device Snapshots ({summary.snapshots.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.snapshots.map(snapshot => (
              <SnapshotCard key={snapshot.id} snapshot={snapshot} />
            ))}
          </div>
        </div>
      )}

      {/* ── Guidance note ────────────────────────────────────────────────── */}
      <p className="text-[11px] text-slate-400 leading-relaxed">
        <strong className="text-slate-500">Data freshness:</strong> each device upserts its snapshot after
        every successful sync. Snapshots older than 2 hours are marked{' '}
        <span className="text-amber-600 font-semibold">Stale</span>.
        {' '}<strong className="text-slate-500">Dead-letter</strong> items shown here are informational —
        use the <strong className="text-slate-500">Local Queue</strong> panel on the affected device to replay them.
      </p>
    </div>
  );
};

export default FleetDiagnostics;
