/**
 * HealthAlerts
 * ──────────────────────────────────────────────────────────────────────────────
 * Background health alert panel for admins.
 *
 * Alerts shown here are **generated in the background** by the
 * `generate_health_alerts()` SQL function, which runs every 15 minutes via
 * pg_cron (see migration 20260322200000_health_alerts.sql).  They are persisted
 * in the `health_alerts` Supabase table so they exist independently of whether
 * any admin has this page open.
 *
 * This panel reads from `health_alerts` and surfaces active (unresolved) alerts
 * in priority order (critical → warning → info).  Nothing in this panel writes
 * to the database — it is intentionally read-only.
 *
 * Alert conditions surfaced:
 *   • Dead-letter items: one or more queued items failed max retries (critical)
 *   • Stale snapshots: device hasn't reported for > 2 hours (warning)
 *   • High retry-waiting: too many items queued for retry (warning)
 *   • High pending: large un-synced backlog (info)
 *
 * Auto-refreshes every 60 seconds; a manual Refresh button is also provided.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Bell, CheckCircle2, Clock, Info,
  Loader2, RefreshCw, XCircle,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../supabaseClient';
import {
  STALE_THRESHOLD_MS,
} from '../../services/fleetDiagnosticsService';
import {
  fetchPersistedAlerts,
  DEAD_LETTER_ALERT_THRESHOLD,
  HIGH_RETRY_WAITING_THRESHOLD,
  HIGH_PENDING_THRESHOLD,
  type HealthAlert,
  type AlertSeverity,
} from '../../services/healthAlertService';

const POLL_INTERVAL_MS = 60_000;
const MS_PER_HOUR = 3_600_000;

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<AlertSeverity, {
  label: string;
  icon: React.ReactElement;
  rowClass: string;
  badgeClass: string;
  borderClass: string;
}> = {
  critical: {
    label: 'Critical',
    icon: <XCircle size={16} className="text-rose-600 flex-shrink-0" />,
    rowClass: 'bg-rose-50 border-rose-200',
    badgeClass: 'bg-rose-100 text-rose-700',
    borderClass: 'border-rose-300',
  },
  warning: {
    label: 'Warning',
    icon: <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />,
    rowClass: 'bg-amber-50 border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-700',
    borderClass: 'border-amber-300',
  },
  info: {
    label: 'Info',
    icon: <Info size={16} className="text-indigo-500 flex-shrink-0" />,
    rowClass: 'bg-indigo-50 border-indigo-200',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    borderClass: 'border-indigo-200',
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface AlertRowProps {
  alert: HealthAlert;
}

const AlertRow: React.FC<AlertRowProps> = ({ alert }) => {
  const cfg = SEVERITY_CONFIG[alert.severity];
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.rowClass}`}>
      <div className="mt-0.5">{cfg.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-slate-800 leading-snug">{alert.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.badgeClass}`}>
            {cfg.label}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            device: {alert.deviceId.slice(0, 12)}…
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export interface HealthAlertsProps {
  /** Optionally injected for testing; defaults to the singleton Supabase client. */
  supabaseClient?: typeof supabase;
}

const HealthAlerts: React.FC<HealthAlertsProps> = ({ supabaseClient: injectedClient }) => {
  const client = injectedClient ?? supabase;

  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const missingConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;

  const fetchAlerts = useCallback(async () => {
    if (missingConfig) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetchPersistedAlerts(client);
      setAlerts(result);
      setLastFetchedAt(new Date().toISOString());
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, missingConfig]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // ── Derived counts ──────────────────────────────────────────────────────────
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;
  const infoCount = alerts.filter((a) => a.severity === 'info').length;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (missingConfig) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <AlertTriangle size={20} className="inline mr-2 text-amber-600" />
        Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> to enable health alerts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-indigo-600" />
            <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
              Health Alerts
            </h2>
            {!loading && alerts.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 uppercase">
                {alerts.length} active
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 max-w-xl leading-relaxed">
            Alerts are generated <strong className="text-slate-700">in the background every 15 minutes</strong> by
            a server-side scheduled function and persisted in the database — they exist independently
            of this page. Alerts are <strong className="text-slate-700">informational only</strong> —
            no automatic remediation is performed.
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* ── Thresholds summary ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {([
          { label: 'Dead-Letter threshold', value: `≥ ${DEAD_LETTER_ALERT_THRESHOLD} item`, color: 'text-rose-600' },
          { label: 'Stale snapshot age', value: `> ${STALE_THRESHOLD_MS / MS_PER_HOUR}h old`, color: 'text-amber-600' },
          { label: 'Retry-waiting threshold', value: `> ${HIGH_RETRY_WAITING_THRESHOLD} items`, color: 'text-amber-600' },
          { label: 'High-pending threshold', value: `> ${HIGH_PENDING_THRESHOLD} items`, color: 'text-indigo-600' },
        ] as const).map(({ label, value, color }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className={`text-[11px] font-black uppercase tracking-wider ${color}`}>{value}</span>
            <span className="text-[9px] text-slate-400 leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Loading state ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-3 p-6 rounded-2xl border border-slate-200 bg-white text-slate-400">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
          <span className="text-sm">Reading persisted health alerts…</span>
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────────── */}
      {!loading && fetchError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
          <XCircle size={18} className="flex-shrink-0 mt-0.5 text-rose-600" />
          <div>
            <p className="text-sm font-bold">Failed to fetch health alerts</p>
            <p className="text-xs mt-0.5 font-mono">{fetchError}</p>
          </div>
        </div>
      )}

      {/* ── All-clear state ──────────────────────────────────────────────────── */}
      {!loading && !fetchError && alerts.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 rounded-2xl border border-slate-200 bg-white text-slate-400">
          <CheckCircle2 size={32} className="text-emerald-400" />
          <p className="text-sm font-semibold text-slate-600">No active alerts</p>
          <p className="text-xs text-center max-w-xs">
            All reporting devices are within healthy thresholds. The background
            scheduler runs every 15 minutes — new alerts will appear here automatically.
          </p>
        </div>
      )}

      {/* ── Alert list ─────────────────────────────────────────────────────── */}
      {!loading && !fetchError && alerts.length > 0 && (
        <div className="space-y-4">
          {/* Counts row */}
          <div className="flex items-center gap-3 flex-wrap">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-black text-rose-700">
                <XCircle size={13} />
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-black text-amber-700">
                <AlertTriangle size={13} />
                {warningCount} warning
              </span>
            )}
            {infoCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-black text-indigo-600">
                <Info size={13} />
                {infoCount} info
              </span>
            )}
          </div>

          {/* Alert rows */}
          <div className="space-y-2">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {lastFetchedAt && (
        <p className="text-[11px] text-slate-400">
          <Clock size={11} className="inline mr-1" />
          Last read:{' '}
          <span className="font-mono">{new Date(lastFetchedAt).toLocaleTimeString()}</span>
          {' '}· auto-refreshes every {POLL_INTERVAL_MS / 1000}s ·{' '}
          <strong className="text-slate-500">Background-generated</strong> — runs every 15 min via pg_cron.
        </p>
      )}
    </div>
  );
};

export default HealthAlerts;
