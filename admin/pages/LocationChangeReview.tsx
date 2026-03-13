/**
 * LocationChangeReview – Admin page for reviewing driver-submitted
 * location data change requests.
 *
 * Data flow:
 *  1. Fetch all requests from public.location_change_requests (+ join location name).
 *  2. Admin views diff between current location data and the proposed patch.
 *  3. Approve  → calls RPC apply_location_change_request(id, true,  note)
 *     Reject   → calls RPC apply_location_change_request(id, false, note)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  Loader2, AlertCircle, RefreshCw, MapPin,
} from 'lucide-react';
import { Location, LocationChangeRequest, TRANSLATIONS, getLocationField } from '../../types';
import { supabase } from '../../supabaseClient';

interface Props {
  locations: Location[];
  lang: 'zh' | 'sw';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map DB snake_case row to our camelCase domain type */
function mapRow(row: Record<string, unknown>): LocationChangeRequest {
  return {
    id: row.id as string,
    locationId: row.location_id as string,
    requestedByAuthUserId: row.requested_by_auth_user_id as string,
    requestedByDriverId: (row.requested_by_driver_id as string) ?? undefined,
    status: row.status as LocationChangeRequest['status'],
    reason: (row.reason as string) ?? undefined,
    patch: (row.patch as LocationChangeRequest['patch']) ?? {},
    createdAt: row.created_at as string,
    reviewedAt: (row.reviewed_at as string) ?? undefined,
    reviewedByAuthUserId: (row.reviewed_by_auth_user_id as string) ?? undefined,
    reviewNote: (row.review_note as string) ?? undefined,
  };
}

/** Human-readable field labels for the diff view */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name', area: 'Area', machineId: 'Machine ID',
  coords: 'GPS Coords', ownerName: 'Owner Name',
  shopOwnerPhone: 'Owner Phone', ownerPhotoUrl: 'Owner Photo URL',
  machinePhotoUrl: 'Machine Photo URL', assignedDriverId: 'Assigned Driver',
  commissionRate: 'Commission Rate', initialStartupDebt: 'Initial Startup Debt',
  remainingStartupDebt: 'Remaining Startup Debt', isNewOffice: 'New Office?',
  lastRevenueDate: 'Last Revenue Date', status: 'Status',
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (key === 'coords' && typeof value === 'object') {
    const c = value as { lat?: number; lng?: number };
    return `${c.lat?.toFixed(6)}, ${c.lng?.toFixed(6)}`;
  }
  if (key === 'commissionRate' && typeof value === 'number') {
    return `${(value * 100).toFixed(1)}%`;
  }
  return String(value);
}

function getLocationValue(loc: Location | undefined, key: string): unknown {
  if (!loc) return undefined;
  return getLocationField(loc, key);
}

// ── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: LocationChangeRequest['status']; lang: 'zh' | 'sw' }> = ({ status, lang }) => {
  const t = TRANSLATIONS[lang];
  const cfg = {
    pending:  { icon: <Clock size={11} />,        cls: 'bg-amber-100  text-amber-700',   label: t.changeRequestStatus_pending },
    approved: { icon: <CheckCircle size={11} />,  cls: 'bg-emerald-100 text-emerald-700', label: t.changeRequestStatus_approved },
    rejected: { icon: <XCircle size={11} />,      cls: 'bg-rose-100   text-rose-700',    label: t.changeRequestStatus_rejected },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const LocationChangeReview: React.FC<Props> = ({ locations, lang }) => {
  const t = TRANSLATIONS[lang];

  const [requests, setRequests] = useState<LocationChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Review state per request
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('location_change_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setRequests((data ?? []).map(mapRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleReview = async (req: LocationChangeRequest, approve: boolean) => {
    setSubmitting(prev => ({ ...prev, [req.id]: true }));
    setSubmitError(prev => ({ ...prev, [req.id]: '' }));

    const { error: rpcErr } = await supabase.rpc('apply_location_change_request', {
      request_id: req.id,
      approve,
      note: reviewNotes[req.id]?.trim() || null,
    });

    if (rpcErr) {
      setSubmitError(prev => ({ ...prev, [req.id]: rpcErr.message }));
    } else {
      // Optimistically update local state
      setRequests(prev =>
        prev.map(r =>
          r.id === req.id ? { ...r, status: approve ? 'approved' : 'rejected' } : r,
        ),
      );
      setExpandedId(null);
    }
    setSubmitting(prev => ({ ...prev, [req.id]: false }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-12 text-rose-500">
        <AlertCircle size={28} />
        <p className="text-sm font-bold">{error}</p>
        <button onClick={fetchRequests} className="text-xs text-indigo-500 underline font-bold">{lang === 'zh' ? '重试' : 'Retry'}</button>
      </div>
    );
  }

  const pending  = requests.filter(r => r.status === 'pending');
  const reviewed = requests.filter(r => r.status !== 'pending');

  const renderRequest = (req: LocationChangeRequest) => {
    const loc = locations.find(l => l.id === req.locationId);
    const isExpanded = expandedId === req.id;
    const isPending = req.status === 'pending';
    const isBusy = submitting[req.id];
    const patchKeys = Object.keys(req.patch);

    return (
      <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Summary row */}
        <button
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : req.id)}
        >
          <MapPin size={16} className="text-indigo-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-800 truncate">
              {loc?.name ?? req.locationId}
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              {req.requestedByDriverId ?? req.requestedByAuthUserId.slice(0, 8)}
              {' · '}
              {new Date(req.createdAt).toLocaleDateString()}
              {' · '}
              {patchKeys.length} {lang === 'zh' ? '字段' : 'field(s)'}
            </p>
          </div>
          <StatusBadge status={req.status} lang={lang} />
          {isExpanded ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />}
        </button>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-slate-100 p-4 space-y-4">
            {/* Reason */}
            {req.reason && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{t.changeRequestReason}</p>
                <p className="text-sm text-slate-700 font-medium">{req.reason}</p>
              </div>
            )}

            {/* Diff table */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">{t.changeRequestPatch}</p>
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-2 px-3 font-black text-slate-500 uppercase text-[9px]">{lang === 'zh' ? '字段' : 'Field'}</th>
                      <th className="text-left py-2 px-3 font-black text-slate-500 uppercase text-[9px]">{t.currentValue}</th>
                      <th className="text-left py-2 px-3 font-black text-slate-500 uppercase text-[9px]">{t.proposedValue}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patchKeys.map(key => (
                      <tr key={key} className="border-t border-slate-100">
                        <td className="py-2 px-3 font-bold text-slate-600">{FIELD_LABELS[key] ?? key}</td>
                        <td className="py-2 px-3 text-slate-500 break-all">{formatValue(key, getLocationValue(loc, key))}</td>
                        <td className="py-2 px-3 font-bold text-indigo-700 break-all">{formatValue(key, (req.patch as Record<string, unknown>)[key])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Review note + action buttons (pending only) */}
            {isPending && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">{t.changeReviewNote}</label>
                  <textarea
                    rows={2}
                    value={reviewNotes[req.id] ?? ''}
                    onChange={e => setReviewNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                    placeholder={t.changeReviewNotePlaceholder}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-700 font-medium resize-none outline-none focus:border-indigo-300 transition-colors"
                  />
                </div>
                {submitError[req.id] && (
                  <p className="text-xs text-rose-500 font-bold flex items-center gap-1">
                    <AlertCircle size={12} /> {submitError[req.id]}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReview(req, true)}
                    disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black transition-colors disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                    {t.changeReviewApprove}
                  </button>
                  <button
                    onClick={() => handleReview(req, false)}
                    disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-black transition-colors disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                    {t.changeReviewReject}
                  </button>
                </div>
              </div>
            )}

            {/* Review note (already reviewed) */}
            {!isPending && req.reviewNote && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{t.changeReviewNote}</p>
                <p className="text-sm text-slate-700 font-medium">{req.reviewNote}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800">{t.changeReview}</h1>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {pending.length} {t.changeReviewPending}
          </p>
        </div>
        <button
          onClick={fetchRequests}
          className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Pending section */}
      {pending.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <CheckCircle size={32} className="mx-auto mb-3 text-emerald-300" />
          <p className="text-sm font-bold">{t.noPendingRequests}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(renderRequest)}
        </div>
      )}

      {/* Reviewed history */}
      {reviewed.length > 0 && (
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
            {lang === 'zh' ? '已处理' : 'Reviewed'}
          </p>
          <div className="space-y-2">
            {reviewed.map(renderRequest)}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationChangeReview;
