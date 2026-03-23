/**
 * AuditTrail
 * ──────────────────────────────────────────────────────────────────────────────
 * Operator-visible audit trail for support and recovery actions (stage 9).
 *
 * Reads from the `support_audit_log` Supabase table and renders a filterable
 * timeline of events.  Operators can optionally filter by a support case ID.
 *
 * This panel is intentionally read-only — it records no new events itself.
 * Events are written by the service layer (`recordAuditEvent` in
 * `services/supportCaseService.ts`) at the time each action is performed.
 *
 * Event types surfaced:
 *   • diagnostic_export       – export downloaded for support handoff
 *   • health_alert_linked     – alert associated with a case
 *   • manual_replay_attempted – dead-letter replay started
 *   • manual_replay_succeeded – replay completed successfully
 *   • manual_replay_failed    – replay failed (error in payload)
 *   • recovery_action         – generic operator recovery step
 *
 * Auto-refreshes every 60 seconds; a manual Refresh button is provided.
 * Case-ID filter resets pagination automatically.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen, CheckCircle2, Clock, Download, FileSearch,
  Link2, Loader2, RefreshCw, Search, ShieldAlert, XCircle, Zap,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../supabaseClient';
import {
  fetchAuditLog,
  type AuditEvent,
  type AuditEventType,
} from '../../services/supportCaseService';

const POLL_INTERVAL_MS = 60_000;
const DEFAULT_LIMIT = 200;
const MAX_ACTOR_ID_DISPLAY_LEN = 16;
const TRUNCATE_ACTOR_ID_AT = 14;
const MAX_PAYLOAD_VALUE_LEN = 40;
const TRUNCATE_PAYLOAD_VALUE_AT = 38;

// ── Event-type display config ─────────────────────────────────────────────────

const EVENT_CONFIG: Record<AuditEventType, {
  label: string;
  icon: React.ReactElement;
  badgeClass: string;
  rowClass: string;
}> = {
  diagnostic_export: {
    label: 'Export',
    icon: <Download size={14} className="text-indigo-500 flex-shrink-0" />,
    badgeClass: 'bg-indigo-100 text-indigo-700',
    rowClass: 'bg-white border-slate-200',
  },
  health_alert_linked: {
    label: 'Alert linked',
    icon: <Link2 size={14} className="text-amber-500 flex-shrink-0" />,
    badgeClass: 'bg-amber-100 text-amber-700',
    rowClass: 'bg-amber-50 border-amber-200',
  },
  manual_replay_attempted: {
    label: 'Replay attempt',
    icon: <Zap size={14} className="text-slate-500 flex-shrink-0" />,
    badgeClass: 'bg-slate-100 text-slate-600',
    rowClass: 'bg-white border-slate-200',
  },
  manual_replay_succeeded: {
    label: 'Replay OK',
    icon: <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />,
    badgeClass: 'bg-emerald-100 text-emerald-700',
    rowClass: 'bg-emerald-50 border-emerald-200',
  },
  manual_replay_failed: {
    label: 'Replay failed',
    icon: <XCircle size={14} className="text-rose-500 flex-shrink-0" />,
    badgeClass: 'bg-rose-100 text-rose-700',
    rowClass: 'bg-rose-50 border-rose-200',
  },
  recovery_action: {
    label: 'Recovery',
    icon: <ShieldAlert size={14} className="text-violet-500 flex-shrink-0" />,
    badgeClass: 'bg-violet-100 text-violet-700',
    rowClass: 'bg-white border-slate-200',
  },
};

const FALLBACK_CONFIG = {
  label: 'Action',
  icon: <FileSearch size={14} className="text-slate-400 flex-shrink-0" />,
  badgeClass: 'bg-slate-100 text-slate-500',
  rowClass: 'bg-white border-slate-200',
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface AuditEventRowProps {
  event: AuditEvent;
  onCaseClick?: () => void;
}

const AuditEventRow: React.FC<AuditEventRowProps> = ({ event, onCaseClick }) => {
  const cfg = EVENT_CONFIG[event.eventType] ?? FALLBACK_CONFIG;

  const payloadLines: Array<{ label: string; value: string }> = [];
  if (event.payload) {
    const p = event.payload;
    if (p.txId)            payloadLines.push({ label: 'tx', value: p.txId });
    if (p.deviceId)        payloadLines.push({ label: 'device', value: p.deviceId });
    if (p.driverId)        payloadLines.push({ label: 'driver', value: p.driverId });
    if (p.exportScope)     payloadLines.push({ label: 'scope', value: p.exportScope });
    if (p.exportFilename)  payloadLines.push({ label: 'file', value: p.exportFilename });
    if (p.alertType)       payloadLines.push({ label: 'alert', value: p.alertType });
    if (p.alertSeverity)   payloadLines.push({ label: 'severity', value: p.alertSeverity });
    if (p.errorCategory)   payloadLines.push({ label: 'error cat.', value: p.errorCategory });
    if (p.errorSummary)    payloadLines.push({ label: 'error', value: p.errorSummary });
    if (p.note)            payloadLines.push({ label: 'note', value: p.note });
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.rowClass}`}>
      <div className="mt-0.5">{cfg.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.badgeClass}`}>
            {cfg.label}
          </span>
          {event.caseId && (
            <button
              onClick={onCaseClick}
              className="text-[9px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full hover:bg-indigo-100 transition-colors cursor-pointer"
              title={`View case ${event.caseId}`}
            >
              case: {event.caseId}
            </button>
          )}
          {event.actorId && (
            <span className="text-[9px] font-mono text-slate-400">
              by: {event.actorId.length > MAX_ACTOR_ID_DISPLAY_LEN ? `${event.actorId.slice(0, TRUNCATE_ACTOR_ID_AT)}…` : event.actorId}
            </span>
          )}
        </div>
        {payloadLines.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {payloadLines.map(({ label, value }) => (
              <span key={label} className="text-[10px] text-slate-500">
                <span className="font-bold text-slate-600">{label}:</span>{' '}
                <span className="font-mono">{value.length > MAX_PAYLOAD_VALUE_LEN ? `${value.slice(0, TRUNCATE_PAYLOAD_VALUE_AT)}…` : value}</span>
              </span>
            ))}
          </div>
        )}
        <p className="mt-1 text-[10px] text-slate-400 font-mono">
          {new Date(event.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export interface AuditTrailProps {
  /** Optionally injected for testing; defaults to the singleton Supabase client. */
  supabaseClient?: typeof supabase;
  /** If set, pre-populates and applies the case ID filter on mount. */
  initialCaseFilter?: string;
  /** Called after the initial case filter has been consumed (so the parent can clear it). */
  onCaseFilterConsumed?: () => void;
  /** Callback to navigate to the SupportCases panel (e.g. clicking a case ID badge). */
  onNavigateToCases?: () => void;
}

const AuditTrail: React.FC<AuditTrailProps> = ({ supabaseClient: injectedClient, initialCaseFilter, onCaseFilterConsumed, onNavigateToCases }) => {
  const client = injectedClient ?? supabase;

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [caseIdFilter, setCaseIdFilter] = useState('');
  const [appliedFilter, setAppliedFilter] = useState(initialCaseFilter || '');

  const missingConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;

  // Consume initial case filter from parent navigation (run once per distinct value)
  const consumedFilterRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (initialCaseFilter && initialCaseFilter !== consumedFilterRef.current) {
      consumedFilterRef.current = initialCaseFilter;
      setCaseIdFilter(initialCaseFilter);
      setAppliedFilter(initialCaseFilter);
      onCaseFilterConsumed?.();
    }
  }, [initialCaseFilter, onCaseFilterConsumed]);

  const fetchEvents = useCallback(async (caseId?: string) => {
    if (missingConfig) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetchAuditLog(client, {
        caseId: caseId || undefined,
        limit: DEFAULT_LIMIT,
      });
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
    fetchEvents(appliedFilter);
    const interval = setInterval(() => fetchEvents(appliedFilter), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchEvents, appliedFilter]);

  const handleApplyFilter = () => {
    setLoading(true);
    setAppliedFilter(caseIdFilter.trim());
  };

  const handleClearFilter = () => {
    setCaseIdFilter('');
    setLoading(true);
    setAppliedFilter('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (missingConfig) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <ShieldAlert size={20} className="inline mr-2 text-amber-600" />
        Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> to enable the audit trail.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-indigo-600" />
            <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
              Support Audit Trail
            </h2>
            {!loading && events.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700 uppercase">
                {events.length} event{events.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 max-w-xl leading-relaxed">
            Operator-visible history of support and recovery actions.
            Events are written when diagnostics are exported, alerts are linked to cases,
            or dead-letter items are manually replayed.
            {appliedFilter && (
              <span className="ml-1 font-bold text-indigo-600">
                Filtered to case: {appliedFilter}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchEvents(appliedFilter); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* ── Case ID filter ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={caseIdFilter}
            onChange={(e) => setCaseIdFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleApplyFilter(); }}
            placeholder="Filter by case ID…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 shadow-sm"
          />
        </div>
        <button
          onClick={handleApplyFilter}
          className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors"
        >
          Apply
        </button>
        {appliedFilter && (
          <button
            onClick={handleClearFilter}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-rose-600 hover:border-rose-200 shadow-sm transition-colors"
          >
            Clear filter
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

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!loading && !fetchError && events.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 rounded-2xl border border-slate-200 bg-white text-slate-400">
          <BookOpen size={32} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">
            {appliedFilter ? `No events found for case "${appliedFilter}"` : 'No audit events recorded yet'}
          </p>
          <p className="text-xs text-center max-w-xs">
            {appliedFilter
              ? 'Try a different case ID or clear the filter to view all events.'
              : 'Events appear here when operators export diagnostics, link alerts to cases, or replay dead-letter items.'}
          </p>
        </div>
      )}

      {/* ── Event list ─────────────────────────────────────────────────────── */}
      {!loading && !fetchError && events.length > 0 && (
        <div className="space-y-2">
          {events.map((event) => (
            <AuditEventRow key={event.id} event={event} onCaseClick={onNavigateToCases} />
          ))}
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {lastFetchedAt && (
        <p className="text-[11px] text-slate-400">
          <Clock size={11} className="inline mr-1" />
          Last read:{' '}
          <span className="font-mono">{new Date(lastFetchedAt).toLocaleTimeString()}</span>
          {' '}· auto-refreshes every {POLL_INTERVAL_MS / 1000}s ·{' '}
          showing up to {DEFAULT_LIMIT} most-recent events
          {appliedFilter && ` · case: ${appliedFilter}`}.
        </p>
      )}
    </div>
  );
};

export default AuditTrail;
