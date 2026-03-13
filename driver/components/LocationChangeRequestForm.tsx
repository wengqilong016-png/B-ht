/**
 * LocationChangeRequestForm – Allows a driver to submit a data correction
 * request for one of their assigned locations.
 *
 * The driver selects a location, picks which fields to update, fills in
 * new values, and writes the request to public.location_change_requests.
 * An admin then reviews and applies (or rejects) the change via the
 * admin/pages/LocationChangeReview page.
 *
 * Also renders a list of the driver's past requests.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Send, Clock, CheckCircle, XCircle, ChevronDown, Loader2,
  AlertCircle, RefreshCw, MapPin,
} from 'lucide-react';
import {
  Location, LocationChangePatch, LocationChangeRequest, TRANSLATIONS, User,
} from '../../types';
import { supabase } from '../../supabaseClient';

interface Props {
  locations: Location[];
  currentUser: User;
  lang: 'zh' | 'sw';
  isOnline: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Fields the driver is allowed to propose changes for */
const EDITABLE_FIELDS: Array<{
  key: keyof LocationChangePatch;
  labelZh: string;
  labelSw: string;
  type: 'text' | 'number' | 'boolean' | 'coords';
}> = [
  { key: 'name',                 labelZh: '点位名称',   labelSw: 'Jina la eneo',          type: 'text' },
  { key: 'area',                 labelZh: '区域',       labelSw: 'Eneo',                  type: 'text' },
  { key: 'machineId',            labelZh: '机器编号',   labelSw: 'Nambari ya mashine',    type: 'text' },
  { key: 'ownerName',            labelZh: '联系人',     labelSw: 'Jina la mmiliki',       type: 'text' },
  { key: 'shopOwnerPhone',       labelZh: '联系电话',   labelSw: 'Simu ya mmiliki',       type: 'text' },
  { key: 'ownerPhotoUrl',        labelZh: '联系人照片 URL', labelSw: 'URL ya picha ya mmiliki', type: 'text' },
  { key: 'machinePhotoUrl',      labelZh: '机器照片 URL',  labelSw: 'URL ya picha ya mashine', type: 'text' },
  { key: 'commissionRate',       labelZh: '佣金比率',   labelSw: 'Kiwango cha kamisheni', type: 'number' },
  { key: 'initialStartupDebt',   labelZh: '启动押金',   labelSw: 'Deni la awali',         type: 'number' },
  { key: 'remainingStartupDebt', labelZh: '剩余押金',   labelSw: 'Deni linalobaki',       type: 'number' },
  { key: 'isNewOffice',          labelZh: '新点位',     labelSw: 'Ofisi mpya',            type: 'boolean' },
  { key: 'lastRevenueDate',      labelZh: '最近营收日', labelSw: 'Tarehe ya mapato',      type: 'text' },
  { key: 'coords',               labelZh: 'GPS 坐标',  labelSw: 'Kuratibu za GPS',       type: 'coords' },
];

const StatusBadge: React.FC<{ status: LocationChangeRequest['status']; lang: 'zh' | 'sw' }> = ({ status, lang }) => {
  const t = TRANSLATIONS[lang];
  const cfg = {
    pending:  { icon: <Clock size={10} />,       cls: 'bg-amber-100  text-amber-700',    label: t.changeRequestStatus_pending },
    approved: { icon: <CheckCircle size={10} />, cls: 'bg-emerald-100 text-emerald-700', label: t.changeRequestStatus_approved },
    rejected: { icon: <XCircle size={10} />,     cls: 'bg-rose-100   text-rose-700',     label: t.changeRequestStatus_rejected },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const LocationChangeRequestForm: React.FC<Props> = ({ locations, currentUser, lang, isOnline }) => {
  const t = TRANSLATIONS[lang];

  // Form state
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<keyof LocationChangePatch>>(new Set());
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // History state
  const [myRequests, setMyRequests] = useState<LocationChangeRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const selectedLocation = locations.find(l => l.id === selectedLocationId);

  // Fetch driver's own requests
  const fetchMyRequests = useCallback(async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('location_change_requests')
      .select('*')
      .eq('requested_by_auth_user_id', currentUser.id)
      .order('created_at', { ascending: false });

    setMyRequests((data ?? []).map(mapRow));
    setHistoryLoading(false);
  }, [currentUser.id]);

  useEffect(() => { fetchMyRequests(); }, [fetchMyRequests]);

  const toggleField = (key: keyof LocationChangePatch) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) { setSubmitMsg({ type: 'error', text: t.offlineWarning }); return; }
    if (!selectedLocationId || selectedFields.size === 0) return;

    // Build the patch object from selected fields
    const patch: Record<string, unknown> = {};
    for (const key of selectedFields) {
      const raw = fieldValues[key] ?? '';
      const fieldDef = EDITABLE_FIELDS.find(f => f.key === key)!;
      if (fieldDef.type === 'number') {
        const num = parseFloat(raw);
        if (!isNaN(num)) patch[key] = num;
      } else if (fieldDef.type === 'boolean') {
        patch[key] = raw === 'true';
      } else if (fieldDef.type === 'coords') {
        // Expect "lat,lng"
        const [latStr, lngStr] = raw.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng)) patch[key] = { lat, lng };
      } else {
        if (raw.trim()) patch[key] = raw.trim();
      }
    }

    if (Object.keys(patch).length === 0) {
      setSubmitMsg({ type: 'error', text: lang === 'zh' ? '请填写有效的变更内容' : 'Please fill in valid values' });
      return;
    }

    setSubmitting(true);
    setSubmitMsg(null);

    const { error } = await supabase
      .from('location_change_requests')
      .insert({
        location_id: selectedLocationId,
        requested_by_auth_user_id: currentUser.id,
        requested_by_driver_id: currentUser.driverId ?? null,
        reason: reason.trim() || null,
        patch,
      });

    if (error) {
      setSubmitMsg({ type: 'error', text: error.message || t.changeRequestSubmitError });
    } else {
      setSubmitMsg({ type: 'ok', text: t.changeRequestSubmitted });
      // Reset form
      setSelectedLocationId('');
      setReason('');
      setSelectedFields(new Set());
      setFieldValues({});
      fetchMyRequests();
    }
    setSubmitting(false);
  };

  const inputCls = "w-full bg-[#f0f2f5] rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 border border-transparent focus:border-indigo-300 disabled:opacity-50";

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* ── Submission form ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-800">{t.submitChangeRequest}</h2>
          <p className="text-[10px] text-slate-400 font-bold mt-0.5">{t.locationChangeRequest}</p>
        </div>

        {!isOnline && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs font-bold">
            <AlertCircle size={13} className="flex-shrink-0" />
            {t.offlineWarning}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Location selector */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
              {lang === 'zh' ? '选择点位' : 'Select Location'}
            </label>
            <div className="relative">
              <select
                value={selectedLocationId}
                onChange={e => { setSelectedLocationId(e.target.value); setSelectedFields(new Set()); setFieldValues({}); }}
                className={inputCls + ' appearance-none pr-8'}
                required
                disabled={submitting}
              >
                <option value="">{lang === 'zh' ? '请选择...' : 'Select...'}</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name} ({loc.machineId})</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Field picker */}
          {selectedLocationId && (
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                {t.selectFieldsToUpdate}
              </label>
              <div className="space-y-3">
                {EDITABLE_FIELDS.map(field => {
                  const label = lang === 'zh' ? field.labelZh : field.labelSw;
                  const checked = selectedFields.has(field.key);
                  const currentVal = selectedLocation
                    ? (selectedLocation as unknown as Record<string, unknown>)[field.key]
                    : undefined;

                  return (
                    <div key={field.key} className="border border-slate-100 rounded-xl overflow-hidden">
                      <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleField(field.key)}
                          className="w-4 h-4 accent-indigo-500 flex-shrink-0"
                          disabled={submitting}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-700">{label}</p>
                          {currentVal !== undefined && currentVal !== null && (
                            <p className="text-[10px] text-slate-400 font-bold truncate">
                              {t.currentValue}: {field.type === 'coords'
                                ? `${(currentVal as {lat:number;lng:number})?.lat?.toFixed(5)}, ${(currentVal as {lat:number;lng:number})?.lng?.toFixed(5)}`
                                : String(currentVal)}
                            </p>
                          )}
                        </div>
                      </label>

                      {checked && (
                        <div className="px-3 pb-3 bg-indigo-50 border-t border-indigo-100">
                          <label className="text-[9px] font-black text-indigo-400 uppercase block mb-1 mt-2">
                            {t.proposedValue}
                          </label>
                          {field.type === 'boolean' ? (
                            <div className="relative">
                              <select
                                value={fieldValues[field.key] ?? ''}
                                onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                className={inputCls + ' bg-white appearance-none pr-8'}
                                disabled={submitting}
                              >
                                <option value="">{lang === 'zh' ? '请选择' : 'Select'}</option>
                                <option value="true">{lang === 'zh' ? '是' : 'Yes'}</option>
                                <option value="false">{lang === 'zh' ? '否' : 'No'}</option>
                              </select>
                              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                          ) : (
                            <input
                              type={field.type === 'number' ? 'number' : 'text'}
                              value={fieldValues[field.key] ?? ''}
                              onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                              placeholder={field.type === 'coords' ? 'lat, lng  (e.g. -6.1234, 35.5678)' : ''}
                              className={inputCls + ' bg-white'}
                              step={field.type === 'number' ? 'any' : undefined}
                              disabled={submitting}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reason */}
          {selectedFields.size > 0 && (
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                {t.changeRequestReason}
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t.changeRequestReasonPlaceholder}
                className="w-full bg-[#f0f2f5] rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 resize-none outline-none focus:border focus:border-indigo-300 transition-all placeholder:text-slate-400 disabled:opacity-50"
                disabled={submitting}
              />
            </div>
          )}

          {/* Feedback */}
          {submitMsg && (
            <div className={`flex items-center gap-2 text-xs font-bold ${submitMsg.type === 'ok' ? 'text-emerald-600' : 'text-rose-500'}`}>
              {submitMsg.type === 'ok' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
              {submitMsg.text}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting || !isOnline || !selectedLocationId || selectedFields.size === 0}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {t.submitChangeRequest}
          </button>
        </form>
      </div>

      {/* ── Request history ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
          onClick={() => setShowHistory(v => !v)}
        >
          <div>
            <h2 className="text-sm font-black text-slate-800">{t.myChangeRequests}</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{myRequests.length} {lang === 'zh' ? '条记录' : 'record(s)'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); fetchMyRequests(); }}
              className="p-1.5 bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <RefreshCw size={12} />
            </button>
            {showHistory ? <ChevronDown size={15} className="text-slate-400 rotate-180" /> : <ChevronDown size={15} className="text-slate-400" />}
          </div>
        </button>

        {showHistory && (
          <div className="border-t border-slate-100">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-indigo-400" />
              </div>
            ) : myRequests.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <MapPin size={24} className="mx-auto mb-2 text-slate-200" />
                <p className="text-xs font-bold">{t.noChangeRequests}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {myRequests.map(req => {
                  const loc = locations.find(l => l.id === req.locationId);
                  const patchKeys = Object.keys(req.patch);
                  return (
                    <div key={req.id} className="p-4 flex items-start gap-3">
                      <MapPin size={14} className="text-indigo-300 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-700 truncate">{loc?.name ?? req.locationId}</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                          {new Date(req.createdAt).toLocaleDateString()}
                          {' · '}
                          {patchKeys.length} {lang === 'zh' ? '字段' : 'field(s)'}
                        </p>
                        {req.reviewNote && (
                          <p className="text-[10px] text-slate-500 italic mt-1">"{req.reviewNote}"</p>
                        )}
                      </div>
                      <StatusBadge status={req.status} lang={lang} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationChangeRequestForm;
