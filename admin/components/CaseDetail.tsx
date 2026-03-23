/**
 * CaseDetail
 * ──────────────────────────────────────────────────────────────────────────────
 * Admin panel for reviewing and resolving a single support case (stage 10).
 *
 * Provides:
 *   • Case metadata summary (ID, title, status, created/closed timestamps)
 *   • Resolution form: operator notes, outcome selector, resolve action
 *   • Linked audit event history for this case (inline)
 *   • Back button to return to the case list
 *
 * Data source: `support_cases` and `support_audit_log` via service layer.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, BookOpen, CheckCircle2, Clock, FolderOpen, Loader2,
  RefreshCw, ShieldCheck, XCircle,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../supabaseClient';
import {
  fetchSupportCaseById,
  resolveSupportCase,
  fetchAuditLog,
  recordAuditEvent,
  type SupportCase,
  type AuditEvent,
} from '../../services/supportCaseService';

/** Pre-defined resolution outcome options. */
const RESOLUTION_OUTCOMES = ['fixed', 'wont-fix', 'duplicate', 'cannot-reproduce', 'other'] as const;

export interface CaseDetailProps {
  /** The case ID to display. */
  caseId: string;
  /** Callback to navigate back to the case list. */
  onBack: () => void;
  /** Callback to navigate to audit trail filtered by this case. */
  onNavigateToAudit?: (caseId: string) => void;
  /** Optionally injected for testing; defaults to the singleton Supabase client. */
  supabaseClient?: typeof supabase;
}

const CaseDetail: React.FC<CaseDetailProps> = ({
  caseId,
  onBack,
  onNavigateToAudit,
  supabaseClient: injectedClient,
}) => {
  const client = injectedClient ?? supabase;

  const [supportCase, setSupportCase] = useState<SupportCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Linked audit events
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Resolution form state
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionOutcome, setResolutionOutcome] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const missingConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;

  const fetchCase = useCallback(async () => {
    if (missingConfig) { setLoading(false); return; }
    try {
      const result = await fetchSupportCaseById(client, caseId);
      setSupportCase(result);
      setFetchError(null);
      // Pre-fill resolution fields if case already has them
      if (result?.resolutionNotes) setResolutionNotes(result.resolutionNotes);
      if (result?.resolutionOutcome) setResolutionOutcome(result.resolutionOutcome);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, caseId, missingConfig]);

  const fetchLinkedEvents = useCallback(async () => {
    if (missingConfig) { setEventsLoading(false); return; }
    try {
      const result = await fetchAuditLog(client, { caseId, limit: 50 });
      setEvents(result);
    } catch {
      // Non-critical — events section shows empty
    } finally {
      setEventsLoading(false);
    }
  }, [client, caseId, missingConfig]);

  useEffect(() => {
    fetchCase();
    fetchLinkedEvents();
  }, [fetchCase, fetchLinkedEvents]);

  const handleResolve = useCallback(async () => {
    if (!supportCase || supportCase.status === 'closed') return;
    setResolving(true);
    setResolveError(null);
    try {
      await resolveSupportCase(client, {
        caseId,
        resolutionNotes: resolutionNotes.trim() || undefined,
        resolutionOutcome: resolutionOutcome || undefined,
      });
      // Record audit event (fire-and-forget)
      await recordAuditEvent(client, {
        caseId,
        eventType: 'case_resolved',
        payload: {
          note: resolutionNotes.trim() || undefined,
          resolutionOutcome: resolutionOutcome || undefined,
        },
      });
      // Refresh case + events
      await fetchCase();
      await fetchLinkedEvents();
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : String(err));
    } finally {
      setResolving(false);
    }
  }, [client, caseId, supportCase, resolutionNotes, resolutionOutcome, fetchCase, fetchLinkedEvents]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (missingConfig) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Supabase is not configured.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-6 rounded-2xl border border-slate-200 bg-white text-slate-400">
        <Loader2 size={20} className="animate-spin text-indigo-500" />
        <span className="text-sm">Loading case {caseId}…</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">
          <ArrowLeft size={14} /> Back to cases
        </button>
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
          <XCircle size={18} className="flex-shrink-0 mt-0.5 text-rose-600" />
          <div>
            <p className="text-sm font-bold">Failed to load case</p>
            <p className="text-xs mt-0.5 font-mono">{fetchError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!supportCase) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">
          <ArrowLeft size={14} /> Back to cases
        </button>
        <div className="p-6 rounded-2xl border border-slate-200 bg-white text-center text-slate-500 text-sm">
          Case <span className="font-mono font-bold">{caseId}</span> not found.
        </div>
      </div>
    );
  }

  const isOpen = supportCase.status === 'open';

  return (
    <div className="space-y-6">
      {/* ── Back + header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-2">
            <ArrowLeft size={14} /> Back to cases
          </button>
          <div className="flex items-center gap-2">
            {isOpen
              ? <FolderOpen size={20} className="text-indigo-600" />
              : <CheckCircle2 size={20} className="text-emerald-600" />}
            <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
              {supportCase.id}
            </h2>
            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
              isOpen ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {supportCase.status}
            </span>
          </div>
          {supportCase.title && (
            <p className="mt-1 text-xs text-slate-600">{supportCase.title}</p>
          )}
        </div>
        <button
          onClick={() => { setLoading(true); fetchCase(); setEventsLoading(true); fetchLinkedEvents(); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Case metadata ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Created</p>
          <p className="mt-0.5 text-xs font-mono text-slate-700">{new Date(supportCase.createdAt).toLocaleString()}</p>
          {supportCase.createdBy && (
            <p className="text-[10px] text-slate-500 mt-0.5">by: {supportCase.createdBy}</p>
          )}
        </div>
        {supportCase.closedAt && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Closed</p>
            <p className="mt-0.5 text-xs font-mono text-slate-700">{new Date(supportCase.closedAt).toLocaleString()}</p>
          </div>
        )}
        {supportCase.resolvedBy && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Resolved by</p>
            <p className="mt-0.5 text-xs font-mono text-slate-700">{supportCase.resolvedBy}</p>
          </div>
        )}
        {supportCase.resolutionOutcome && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Outcome</p>
            <p className="mt-0.5 text-xs font-bold text-emerald-700 uppercase">{supportCase.resolutionOutcome}</p>
          </div>
        )}
      </div>

      {/* ── Resolution notes (read-only when closed) ──────────────────────── */}
      {supportCase.resolutionNotes && !isOpen && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Resolution Notes</p>
          <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{supportCase.resolutionNotes}</p>
        </div>
      )}

      {/* ── Resolution form (only for open cases) ─────────────────────────── */}
      {isOpen && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-indigo-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Resolve Case</p>
          </div>
          <div className="space-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Outcome</span>
              <select
                value={resolutionOutcome}
                onChange={(e) => setResolutionOutcome(e.target.value)}
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 max-w-xs"
              >
                <option value="">Select outcome…</option>
                {RESOLUTION_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Resolution Notes</span>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Summarize the resolution or operator notes (max 500 chars)"
                maxLength={500}
                rows={3}
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y"
              />
              <span className="text-[9px] text-slate-400 self-end">{resolutionNotes.length}/500</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={handleResolve}
                disabled={resolving}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {resolving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Resolve Case
              </button>
            </div>
          </div>
          {resolveError && (
            <p className="text-[11px] text-rose-600 font-mono">{resolveError}</p>
          )}
        </div>
      )}

      {/* ── Linked audit events ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-indigo-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              Linked History
            </p>
            {!eventsLoading && events.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700">
                {events.length} event{events.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {onNavigateToAudit && (
            <button
              onClick={() => onNavigateToAudit(caseId)}
              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              View full audit trail →
            </button>
          )}
        </div>

        {eventsLoading && (
          <div className="flex items-center gap-2 p-4 text-slate-400 text-xs">
            <Loader2 size={14} className="animate-spin" /> Loading events…
          </div>
        )}

        {!eventsLoading && events.length === 0 && (
          <div className="p-4 rounded-xl border border-slate-200 bg-white text-center text-xs text-slate-400">
            No audit events linked to this case yet.
          </div>
        )}

        {!eventsLoading && events.length > 0 && (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {events.map((event) => (
              <div key={event.id} className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 bg-white text-xs">
                <Clock size={11} className="text-slate-300 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-600 uppercase text-[9px]">{event.eventType.replace(/_/g, ' ')}</span>
                    <span className="text-[9px] text-slate-400 font-mono">{new Date(event.createdAt).toLocaleString()}</span>
                    {event.actorId && <span className="text-[9px] text-slate-400">by: {event.actorId}</span>}
                  </div>
                  {event.payload?.note && (
                    <p className="mt-0.5 text-[10px] text-slate-500">{event.payload.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CaseDetail;
