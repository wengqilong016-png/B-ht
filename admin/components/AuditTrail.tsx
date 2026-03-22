/**
 * AuditTrail
 * ──────────────────────────────────────────────────────────────────────────────
 * Read-friendly admin panel that surfaces the support audit log.
 *
 * Stage-9: support case linking and audit trail.
 *
 * The audit log is an append-only record of key admin/support actions:
 *   • Linking a health alert to a support case
 *   • Triggering a diagnostics export
 *   • Linking an export to a support case
 *   • Triggering a manual dead-letter replay
 *   • Viewing fleet diagnostics or health alerts
 *
 * Filtering:
 *   Admins can narrow the log to a specific case ID using the search field.
 *   Filtering happens client-side on the already-fetched page.
 *
 * This panel is intentionally read-only: no audit rows can be edited or
 * deleted from this UI.
 *
 * Auto-refreshes every 60 seconds; a manual Refresh button is also provided.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList, RefreshCw, Loader2, Search, XCircle,
  AlertTriangle, Link2, Download, Play, Eye, Bell,
  Clock,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../supabaseClient';
import {
  fetchAuditLog,
  filterAuditEventsByCaseId,
  type AuditEvent,
  type AuditEventAction,
} from '../../services/supportCaseService';

const POLL_INTERVAL_MS = 60_000;
const DEFAULT_LIMIT = 100;

// ── Action display helpers ────────────────────────────────────────────────────

interface ActionConfig {
  label: string;
  icon: React.ReactElement;
  badgeClass: string;
}

const ACTION_CONFIG: Record<AuditEventAction, ActionConfig> = {
  alert_linked_to_case: {
    label: 'Alert linked to case',
    icon: <Link2 size={14} className="text-indigo-500 flex-shrink-0" />,
    badgeClass: 'bg-indigo-100 text-indigo-700',
  },
  export_triggered: {
    label: 'Export triggered',
    icon: <Download size={14} className="text-emerald-500 flex-shrink-0" />,
    badgeClass: 'bg-emerald-100 text-emerald-700',
  },
  export_linked_to_case: {
    label: 'Export linked to case',
    icon: <Link2 size={14} className="text-emerald-600 flex-shrink-0" />,
    badgeClass: 'bg-emerald-100 text-emerald-700',
  },
  manual_replay_triggered: {
    label: 'Manual replay triggered',
    icon: <Play size={14} className="text-amber-500 flex-shrink-0" />,
    badgeClass: 'bg-amber-100 text-amber-700',
  },
  fleet_diagnostics_viewed: {
    label: 'Fleet diagnostics viewed',
    icon: <Eye size={14} className="text-slate-400 flex-shrink-0" />,
    badgeClass: 'bg-slate-100 text-slate-600',
  },
  health_alerts_viewed: {
    label: 'Health alerts viewed',
    icon: <Bell size={14} className="text-slate-400 flex-shrink-0" />,
    badgeClass: 'bg-slate-100 text-slate-600',
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface AuditRowProps {
  event: AuditEvent;
}

const AuditRow: React.FC<AuditRowProps> = ({ event }) => {
  const cfg = ACTION_CONFIG[event.action] ?? {
    label: event.action,
    icon: <ClipboardList size={14} className="text-slate-400 flex-shrink-0" />,
    badgeClass: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-indigo-200 transition-colors">
      <div className="mt-0.5">{cfg.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.badgeClass}`}>
            {cfg.label}
          </span>
          {event.caseId && (
            <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
              <Link2 size={9} />
              {event.caseId}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-600 leading-snug">
          <span className="font-semibold text-slate-800">{event.actorName}</span>
          {' · '}
          <span className="font-mono text-[10px] text-slate-400">{event.resourceType}/{event.resourceId}</span>
        </p>
        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <p className="mt-0.5 text-[10px] text-slate-400 font-mono truncate">
            {JSON.stringify(event.metadata)}
          </p>
        )}
      </div>
      <time
        className="text-[10px] text-slate-400 font-mono flex-shrink-0 mt-0.5"
        dateTime={event.recordedAt}
        title={event.recordedAt}
      >
        {new Date(event.recordedAt).toLocaleString()}
      </time>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export interface AuditTrailProps {
  /** Optionally injected for testing; defaults to the singleton Supabase client. */
  supabaseClient?: typeof supabase;
}

const AuditTrail: React.FC<AuditTrailProps> = ({ supabaseClient: injectedClient }) => {
  const client = injectedClient ?? supabase;

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [caseFilter, setCaseFilter] = useState('');

  const missingConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;

  const fetchEvents = useCallback(async () => {
    if (missingConfig) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetchAuditLog(client, DEFAULT_LIMIT);
      setEvents(result);
      setLastFetchedAt(new Date().toISOString());
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, missingConfig]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Client-side case ID filter
  const visibleEvents = caseFilter.trim()
    ? filterAuditEventsByCaseId(events, caseFilter.trim())
    : events;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (missingConfig) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <AlertTriangle size={20} className="inline mr-2 text-amber-600" />
        Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> to enable audit trail.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList size={20} className="text-indigo-600" />
            <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
              Support Audit Trail
            </h2>
            {!loading && events.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 uppercase">
                {events.length} events
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 max-w-xl leading-relaxed">
            Append-only record of admin and support actions.
            Use the case ID filter to view all activity linked to a specific investigation.
            This log is <strong className="text-slate-700">read-only</strong> — no events can be edited or deleted.
          </p>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* ── Case ID filter ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Search size={14} className="text-slate-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Filter by case ID…"
          value={caseFilter}
          onChange={(e) => setCaseFilter(e.target.value)}
          className="flex-1 text-[12px] bg-transparent outline-none text-slate-700 placeholder-slate-400"
        />
        {caseFilter && (
          <button onClick={() => setCaseFilter('')} className="text-slate-400 hover:text-slate-600">
            <XCircle size={14} />
          </button>
        )}
      </div>

      {/* ── Loading state ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-3 p-6 rounded-2xl border border-slate-200 bg-white text-slate-400">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
          <span className="text-sm">Reading audit log…</span>
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────────── */}
      {!loading && fetchError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
          <XCircle size={18} className="flex-shrink-0 mt-0.5 text-rose-600" />
          <div>
            <p className="text-sm font-bold">Failed to fetch audit log</p>
            <p className="text-xs mt-0.5 font-mono">{fetchError}</p>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {!loading && !fetchError && visibleEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 rounded-2xl border border-slate-200 bg-white text-slate-400">
          <ClipboardList size={32} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">
            {caseFilter ? `No events for case "${caseFilter}"` : 'No audit events recorded yet'}
          </p>
          <p className="text-xs text-center max-w-xs">
            {caseFilter
              ? 'Try a different case ID, or clear the filter to see all events.'
              : 'Events will appear here as admins perform traceable actions.'}
          </p>
        </div>
      )}

      {/* ── Event list ─────────────────────────────────────────────────────── */}
      {!loading && !fetchError && visibleEvents.length > 0 && (
        <div className="space-y-2">
          {visibleEvents.map((event) => (
            <AuditRow key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {lastFetchedAt && (
        <p className="text-[11px] text-slate-400">
          <Clock size={11} className="inline mr-1" />
          Last read:{' '}
          <span className="font-mono">{new Date(lastFetchedAt).toLocaleTimeString()}</span>
          {' '}· auto-refreshes every {POLL_INTERVAL_MS / 1000}s
          {caseFilter && (
            <span> · showing events for case <span className="font-mono text-indigo-500">{caseFilter}</span></span>
          )}
        </p>
      )}
    </div>
  );
};

export default AuditTrail;
