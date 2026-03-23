/**
 * SupportCases
 * ──────────────────────────────────────────────────────────────────────────────
 * Admin panel for managing support cases (stage 9).
 *
 * Provides:
 *   • List of support cases (newest-first) with open/closed status
 *   • Create new case with operator-assigned ID and title
 *   • Close an open case
 *   • Navigate to Audit Trail filtered by case ID for linked event history
 *
 * Data source: `support_cases` Supabase table (admin-read/write, RLS-enforced).
 * Auto-refreshes every 60 seconds; a manual Refresh button is provided.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen, Briefcase, CheckCircle2, Clock, FolderOpen, Loader2,
  Plus, RefreshCw, X, XCircle,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../supabaseClient';
import {
  createSupportCase,
  fetchSupportCases,
  closeSupportCase,
  recordAuditEvent,
  fetchAuditEventCountsByCaseIds,
  type SupportCase,
  type SupportCaseStatus,
} from '../../services/supportCaseService';

const POLL_INTERVAL_MS = 60_000;

// ── Sub-components ────────────────────────────────────────────────────────────

interface CaseRowProps {
  supportCase: SupportCase;
  onClose: (id: string) => void;
  closing: boolean;
  onViewAudit: (caseId: string) => void;
  onViewDetail?: (caseId: string) => void;
  linkedEventCount?: number;
}

const CaseRow: React.FC<CaseRowProps> = ({ supportCase, onClose, closing, onViewAudit, onViewDetail, linkedEventCount }) => {
  const isOpen = supportCase.status === 'open';
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${isOpen ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-75'}`}>
      <div className="mt-0.5">
        {isOpen
          ? <FolderOpen size={16} className="text-indigo-500 flex-shrink-0" />
          : <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {onViewDetail ? (
            <button
              onClick={() => onViewDetail(supportCase.id)}
              className="font-mono text-[11px] font-bold text-indigo-700 bg-slate-100 px-1.5 py-0.5 rounded hover:bg-indigo-100 hover:text-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors cursor-pointer"
              title="View case detail"
            >
              {supportCase.id}
            </button>
          ) : (
            <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
              {supportCase.id}
            </span>
          )}
          <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
            isOpen ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {supportCase.status}
          </span>
          {supportCase.resolutionOutcome && (
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase">
              {supportCase.resolutionOutcome}
            </span>
          )}
          {linkedEventCount != null && linkedEventCount > 0 && (
            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <BookOpen size={9} />
              {linkedEventCount} event{linkedEventCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {supportCase.title && (
          <p className="mt-1 text-xs text-slate-600">{supportCase.title}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
          <span>Created: {new Date(supportCase.createdAt).toLocaleString()}</span>
          {supportCase.createdBy && <span>by: {supportCase.createdBy}</span>}
          {supportCase.closedAt && <span>Closed: {new Date(supportCase.closedAt).toLocaleString()}</span>}
          {supportCase.resolvedBy && <span>Resolved by: {supportCase.resolvedBy}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onViewDetail && (
          <button
            onClick={() => onViewDetail(supportCase.id)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
            title="View case detail"
          >
            Detail
          </button>
        )}
        <button
          onClick={() => onViewAudit(supportCase.id)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
          title="View linked audit events"
        >
          History
        </button>
        {isOpen && (
          <button
            onClick={() => onClose(supportCase.id)}
            disabled={closing}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-500 hover:text-rose-600 hover:border-rose-200 disabled:opacity-50 transition-colors"
            title="Close this case"
          >
            {closing ? <Loader2 size={10} className="animate-spin" /> : 'Close'}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export interface SupportCasesProps {
  /** Optionally injected for testing; defaults to the singleton Supabase client. */
  supabaseClient?: typeof supabase;
  /** Callback to navigate to the audit trail filtered by a case ID. */
  onNavigateToAudit?: (caseId: string) => void;
  /** Callback to navigate to the case detail view. */
  onNavigateToCaseDetail?: (caseId: string) => void;
}

const SupportCases: React.FC<SupportCasesProps> = ({ supabaseClient: injectedClient, onNavigateToAudit, onNavigateToCaseDetail }) => {
  const client = injectedClient ?? supabase;

  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SupportCaseStatus | ''>('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCaseId, setNewCaseId] = useState('');
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Close state
  const [closingId, setClosingId] = useState<string | null>(null);
  // Linked audit event counts per case
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});

  const missingConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;

  const fetchCases = useCallback(async () => {
    if (missingConfig) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetchSupportCases(client, {
        status: statusFilter || undefined,
      });
      setCases(result);
      setLastFetchedAt(new Date().toISOString());
      setFetchError(null);
      // Fetch linked event counts for each case (single count query per case)
      if (result.length > 0) {
        const counts = await fetchAuditEventCountsByCaseIds(
          client,
          result.map((c) => c.id),
        );
        setEventCounts(counts);
      } else {
        setEventCounts({});
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, missingConfig, statusFilter]);

  useEffect(() => {
    fetchCases();
    const interval = setInterval(fetchCases, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCases]);

  const handleCreate = useCallback(async () => {
    if (!newCaseId.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createSupportCase(client, {
        id: newCaseId.trim(),
        title: newCaseTitle.trim(),
      });
      // Record audit event for case creation (fire-and-forget, never throws)
      await recordAuditEvent(client, {
        caseId: newCaseId.trim(),
        eventType: 'recovery_action',
        payload: { note: `Case created: ${newCaseTitle.trim() || newCaseId.trim()}` },
      });
      setNewCaseId('');
      setNewCaseTitle('');
      setShowCreateForm(false);
      fetchCases();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [client, newCaseId, newCaseTitle, fetchCases]);

  const handleClose = useCallback(async (caseId: string) => {
    setClosingId(caseId);
    try {
      await closeSupportCase(client, caseId);
      // Record audit event for case closure (fire-and-forget, never throws)
      await recordAuditEvent(client, {
        caseId,
        eventType: 'recovery_action',
        payload: { note: `Case closed: ${caseId}` },
      });
      fetchCases();
    } catch (err) {
      console.error('[SupportCases] close error', err);
    } finally {
      setClosingId(null);
    }
  }, [client, fetchCases]);

  const handleViewAudit = useCallback((caseId: string) => {
    onNavigateToAudit?.(caseId);
  }, [onNavigateToAudit]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (missingConfig) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <Briefcase size={20} className="inline mr-2 text-amber-600" />
        Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> to enable support cases.
      </div>
    );
  }

  const openCount = cases.filter(c => c.status === 'open').length;
  const closedCount = cases.filter(c => c.status === 'closed').length;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase size={20} className="text-indigo-600" />
            <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
              Support Cases
            </h2>
            {!loading && cases.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700 uppercase">
                {openCount} open · {closedCount} closed
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 max-w-xl leading-relaxed">
            Manage support cases to group and trace operator actions.
            Each case links to audit trail events via its case ID.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors"
          >
            {showCreateForm ? <X size={14} /> : <Plus size={14} />}
            {showCreateForm ? 'Cancel' : 'New Case'}
          </button>
          <button
            onClick={() => { setLoading(true); fetchCases(); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      {showCreateForm && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Create Support Case</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 min-w-[160px]">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Case ID *</span>
              <input
                type="text"
                value={newCaseId}
                onChange={(e) => setNewCaseId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="e.g. CASE-2026-001"
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Title</span>
              <input
                type="text"
                value={newCaseTitle}
                onChange={(e) => setNewCaseTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="Short description of the issue"
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </label>
            <button
              onClick={handleCreate}
              disabled={creating || !newCaseId.trim()}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : 'Create'}
            </button>
          </div>
          {createError && (
            <p className="text-[11px] text-rose-600 font-mono">{createError}</p>
          )}
        </div>
      )}

      {/* ── Status filter ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {(['', 'open', 'closed'] as const).map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setLoading(true); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* ── Loading state ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-3 p-6 rounded-2xl border border-slate-200 bg-white text-slate-400">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
          <span className="text-sm">Loading support cases…</span>
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────────── */}
      {!loading && fetchError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
          <XCircle size={18} className="flex-shrink-0 mt-0.5 text-rose-600" />
          <div>
            <p className="text-sm font-bold">Failed to fetch support cases</p>
            <p className="text-xs mt-0.5 font-mono">{fetchError}</p>
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!loading && !fetchError && cases.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 rounded-2xl border border-slate-200 bg-white text-slate-400">
          <Briefcase size={32} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">
            {statusFilter ? `No ${statusFilter} cases found` : 'No support cases yet'}
          </p>
          <p className="text-xs text-center max-w-xs">
            Create a support case to start linking operator actions for traceability.
          </p>
        </div>
      )}

      {/* ── Case list ──────────────────────────────────────────────────────── */}
      {!loading && !fetchError && cases.length > 0 && (
        <div className="space-y-2">
          {cases.map((c) => (
            <CaseRow
              key={c.id}
              supportCase={c}
              onClose={handleClose}
              closing={closingId === c.id}
              onViewAudit={handleViewAudit}
              onViewDetail={onNavigateToCaseDetail}
              linkedEventCount={eventCounts[c.id]}
            />
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
          {statusFilter && ` · filter: ${statusFilter}`}
        </p>
      )}
    </div>
  );
};

export default SupportCases;
