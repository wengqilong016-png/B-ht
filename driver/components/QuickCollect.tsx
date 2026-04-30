import {
  CheckCircle2, Loader2, Camera, ChevronRight, WifiOff, MapPin,
  Banknote, AlertTriangle, Calendar, Coins,
} from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { orchestrateCollectionSubmission } from '../../services/collectionSubmissionOrchestrator';
import { recordDriverFlowEvent } from '../../services/driverFlowTelemetry';
import {
  calculateCollectionFinanceLocal,
  type FinanceCalculationResult,
} from '../../services/financeCalculator';
import { TRANSLATIONS, Location, safeRandomUUID } from '../../types';
import { getTodayLocalDate } from '../../utils/dateUtils';
import { haversineM, formatDistance } from '../../utils/haversine';

import type { Driver } from '../../types';

/**
 * QuickCollect — Full-featured fast-collection flow.
 *
 * GPS-sorted machine list → tap to expand → enter score → see full finance
 * preview → tweak coin exchange / tip / retention → submit.
 *
 * Target: 2–4 taps per machine.
 */

/* ── Props & local state ───────────────────────────────────────────── */

interface QuickCollectProps {
  gpsCoords: { lat: number; lng: number } | null;
  currentDriver: Driver | undefined;
}

interface MachineEntry {
  location: Location;
  score: string;
  photo: string | null;
  submitting: boolean;
  submitted: boolean;
  /** Expense / adjustment fields the driver can tweak inline. */
  coinExchange: string;
  tip: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  expenses: string;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  maintenance: 'bg-amber-100 text-amber-700',
  broken: 'bg-rose-100 text-rose-700',
  inactive: 'bg-slate-200 text-slate-600',
};
const STATUS_LABEL: Record<string, Record<string, string>> = {
  zh: { active: '正常', maintenance: '维护', broken: '故障', inactive: '停用' },
  sw: { active: 'Active', maintenance: 'Matengenezo', broken: 'Imvunjika', inactive: 'Simama' },
};
const STALE_DAYS = 7; // days since last revenue → show warning

function daysSinceDate(iso: string | undefined, today: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((new Date(today).getTime() - d.getTime()) / 86_400_000);
}

/* ── Component ──────────────────────────────────────────────────────── */

const QuickCollect: React.FC<QuickCollectProps> = ({ gpsCoords, currentDriver }) => {
  const { lang, activeDriverId } = useAuth();
  const { filteredLocations, isOnline } = useAppData();
  const { showToast } = useToast();
  const t = TRANSLATIONS[lang];
  const todayStr = useMemo(() => getTodayLocalDate(), []);

  const [entries, setEntries] = useState<Record<string, MachineEntry>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const assignedMachines = useMemo(
    () => filteredLocations.filter(l => l.assignedDriverId === activeDriverId),
    [filteredLocations, activeDriverId],
  );

  /* GPS sort (unchanged from Phase 1) */
  const lastSortRef = useRef<string[] | null>(null);
  const sortedMachines = useMemo(() => {
    if (!gpsCoords) {
      if (!lastSortRef.current) {
        const abc = [...assignedMachines].sort((a, b) => a.name.localeCompare(b.name));
        lastSortRef.current = abc.map(m => m.id);
        return abc;
      }
      const map = new Map(lastSortRef.current.map((id, i) => [id, i]));
      return [...assignedMachines].sort((a, b) => (map.get(a.id) ?? 99) - (map.get(b.id) ?? 99));
    }
    const sorted = [...assignedMachines].sort((a, b) => {
      const da = a.coords ? haversineM(gpsCoords, a.coords) : Infinity;
      const db = b.coords ? haversineM(gpsCoords, b.coords) : Infinity;
      return da - db;
    });
    lastSortRef.current = sorted.map(m => m.id);
    return sorted;
  }, [assignedMachines, gpsCoords]);

  /* Entry accessors */
  const getEntry = useCallback(
    (id: string): MachineEntry =>
      entries[id] ?? {
        location: assignedMachines.find(m => m.id === id)!,
        score: '', photo: null, submitting: false, submitted: false,
        coinExchange: '', tip: '', ownerRetention: '', isOwnerRetaining: false, expenses: '',
      },
    [entries, assignedMachines],
  );

  const updateEntry = (id: string, patch: Partial<MachineEntry>) =>
    setEntries(prev => ({ ...prev, [id]: { ...getEntry(id), ...patch } }));

  /* Finance preview for one machine */
  const financePreviews = useMemo(() => {
    const map: Record<string, FinanceCalculationResult | null> = {};
    for (const m of sortedMachines) {
      const e = getEntry(m.id);
      const score = parseInt(e.score, 10);
      if (isNaN(score) || score <= 0) { map[m.id] = null; continue; }
      map[m.id] = calculateCollectionFinanceLocal({
        selectedLocation: m,
        currentScore: e.score,
        expenses: e.expenses || '0',
        coinExchange: e.coinExchange || '0',
        ownerRetention: e.ownerRetention || '',
        isOwnerRetaining: e.isOwnerRetaining,
        tip: e.tip || '0',
        startupDebtDeduction: '0',
        initialFloat: currentDriver?.dailyFloatingCoins || 0,
      });
    }
    return map;
  }, [sortedMachines, getEntry, currentDriver]);

  /* ── Submit ─────────────────────────────────────────────────────── */
  const handleSubmit = async (id: string) => {
    const entry = getEntry(id);
    if (!entry.score || entry.submitting || !currentDriver) return;
    updateEntry(id, { submitting: true });

    const parsedScore = parseInt(entry.score, 10);
    if (isNaN(parsedScore)) {
      showToast(t.invalidScore || 'Invalid score', 'error');
      updateEntry(id, { submitting: false }); return;
    }

    const draftTxId = safeRandomUUID();
    const calc = calculateCollectionFinanceLocal({
      selectedLocation: entry.location,
      currentScore: entry.score,
      expenses: entry.expenses || '0',
      coinExchange: entry.coinExchange || '0',
      ownerRetention: entry.ownerRetention || '',
      isOwnerRetaining: entry.isOwnerRetaining,
      tip: entry.tip || '0',
      startupDebtDeduction: '0',
      initialFloat: currentDriver.dailyFloatingCoins || 0,
    });

    try {
      const result = await orchestrateCollectionSubmission({
        selectedLocation: entry.location,
        currentDriver, isOnline,
        currentScore: entry.score,
        photoData: entry.photo,
        aiReviewData: null,
        expenses: entry.expenses || '0',
        expenseType: 'public',
        expenseCategory: undefined,
        coinExchange: entry.coinExchange || '0',
        tip: entry.tip || '0',
        draftTxId,
        isOwnerRetaining: entry.isOwnerRetaining,
        ownerRetention: entry.ownerRetention || '',
        calculations: calc,
        resolvedGps: gpsCoords ?? { lat: 0, lng: 0 },
        gpsSourceType: gpsCoords ? 'live' : 'none',
      });

      updateEntry(id, { submitted: true });
      showToast(
        result.source === 'server'
          ? (lang === 'zh' ? '已提交 ✓' : 'Done ✓')
          : (lang === 'zh' ? '已缓存 ✓' : 'Queued ✓'),
        'success',
      );

      if (currentDriver) {
        recordDriverFlowEvent({
          driverId: currentDriver.id,
          flowId: `qc_${entry.location.id}_${Date.now()}`,
          locationId: entry.location.id,
          step: 'complete',
          eventName: 'quick_collect_submitted',
          onlineStatus: isOnline,
          hasPhoto: !!entry.photo,
        });
      }

      setTimeout(() => {
        setExpandedId(null);
        updateEntry(id, {
          score: '', photo: null, submitting: false, submitted: false,
          coinExchange: '', tip: '', ownerRetention: '', isOwnerRetaining: false, expenses: '',
        });
      }, 1500);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err) || t.submitError || 'Submit failed', 'error');
      updateEntry(id, { submitting: false });
    }
  };

  /* ── Photo ───────────────────────────────────────────────────────── */
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handlePhotoSelected = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') updateEntry(id, { photo: reader.result }); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /* ── Render ──────────────────────────────────────────────────────── */
  const completedCount = sortedMachines.filter(m => entries[m.id]?.submitted).length;

  return (
    <div className="animate-in fade-in space-y-3">
      {/* ── Progress bar ──────────────────────────────────────────── */}
      {sortedMachines.length > 0 && (
        <div className="px-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-caption font-black uppercase text-slate-400">
              {lang === 'zh'
                ? `已收 ${completedCount}/${sortedMachines.length}`
                : `Done ${completedCount}/${sortedMachines.length}`}
            </span>
            {completedCount === sortedMachines.length && (
              <span className="text-caption font-black uppercase text-amber-600">
                {lang === 'zh' ? '全部完成 ✓' : 'All done ✓'}
              </span>
            )}
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / sortedMachines.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {sortedMachines.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400 font-bold text-sm">
            {lang === 'zh' ? '未分配机器' : 'No assigned machines'}
          </p>
        </div>
      )}

      {/* ── Machine list ───────────────────────────────────────────── */}
      <div className="space-y-2">
        {sortedMachines.map(machine => {
          const entry = getEntry(machine.id);
          const isExpanded = expandedId === machine.id;
          const lastScore = machine.lastScore || 0;
          const parsedScore = parseInt(entry.score, 10);
          const dist = gpsCoords && machine.coords ? haversineM(gpsCoords, machine.coords) : null;
          const daysSince = daysSinceDate(machine.lastRevenueDate, todayStr);
          const isStale = daysSince !== null && daysSince >= STALE_DAYS;
          const isNear9999 = (machine.lastScore ?? 0) >= 9000;
          const fin = financePreviews[machine.id];

          const statusColor = STATUS_COLORS[machine.status] || 'bg-slate-200 text-slate-600';
          const statusText = (STATUS_LABEL[lang] || STATUS_LABEL.zh)[machine.status] || machine.status;

          return (
            <div
              key={machine.id}
              className={`bg-white rounded-card border transition-all ${
                entry.submitted
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : isExpanded
                    ? 'border-amber-300 shadow-field-md'
                    : 'border-slate-200 shadow-field'
              }`}
            >
              {/* ── Machine row ──────────────────────────────────────── */}
              <button
                type="button"
                onClick={() => {
                  const willExpand = !isExpanded;
                  setExpandedId(willExpand ? machine.id : null);
                  if (willExpand && currentDriver) {
                    recordDriverFlowEvent({
                      driverId: currentDriver.id,
                      flowId: `qc_${machine.id}_${Date.now()}`,
                      locationId: machine.id,
                      step: 'selection',
                      eventName: 'quick_collect_machine_selected',
                      onlineStatus: isOnline,
                    });
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                aria-expanded={isExpanded}
                aria-label={machine.name}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-body-sm font-black text-slate-800 truncate">{machine.name}</p>
                    {/* Status badge */}
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase ${statusColor}`}>
                      {statusText}
                    </span>
                    {/* 9999 warning */}
                    {isNear9999 && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-600">
                        <AlertTriangle size={9} /> 9999
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-slate-400">
                    {lang === 'zh' ? `上次: ${lastScore.toLocaleString()}` : `Last: ${lastScore.toLocaleString()}`}
                    {dist !== null && (
                      <span className="ml-2 text-emerald-600 inline-flex items-center gap-0.5">
                        <MapPin size={10} /> {formatDistance(dist)}
                      </span>
                    )}
                    {isStale && (
                      <span className="ml-2 text-amber-600 inline-flex items-center gap-0.5">
                        <Calendar size={10} /> {daysSince}{lang === 'zh' ? '天' : 'd'}
                      </span>
                    )}
                    {entry.submitted && (
                      <span className="ml-2 text-emerald-500 inline-flex items-center gap-0.5">
                        <CheckCircle2 size={10} /> {lang === 'zh' ? '已提交' : 'Done'}
                      </span>
                    )}
                    {/* Coin exchange hint on collapsed row */}
                    {entry.coinExchange && !entry.submitted && (
                      <span className="ml-2 text-amber-600 inline-flex items-center gap-0.5">
                        <Coins size={10} /> TZS {Number(entry.coinExchange).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight size={16} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              {/* ── Expanded panel ──────────────────────────────────── */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                  {/* Big score input */}
                  <div>
                    <input
                      type="number"
                      value={entry.score}
                      onChange={e => updateEntry(machine.id, { score: e.target.value })}
                      placeholder="0000"
                      inputMode="numeric"
                      autoFocus
                      disabled={entry.submitting || entry.submitted}
                      className="w-full rounded-subcard border border-slate-200 bg-slate-50 px-4 py-3 text-[28px] font-black text-slate-900 outline-none placeholder:text-slate-300 focus:border-amber-400 focus:bg-white transition-colors"
                    />
                  </div>

                  {/* ── Full finance preview ────────────────────────── */}
                  {fin && parsedScore > 0 && (
                    <div className="space-y-2">
                      {/* Primary: diff + revenue */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-subcard px-3 py-2">
                          <span className="text-caption text-slate-400">{t.diff}</span>
                          <span className={`ml-2 text-sm font-black ${fin.diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {fin.diff >= 0 ? '+' : ''}{fin.diff.toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-amber-50 rounded-subcard px-3 py-2">
                          <span className="text-caption text-slate-400">{t.revenue}</span>
                          <span className="ml-2 text-sm font-black text-amber-700">TZS {fin.revenue.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Secondary: commission + netPayable */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-50 rounded-subcard px-2 py-1.5 text-center">
                          <span className="text-caption text-slate-400 block">
                            {lang === 'zh' ? '佣金' : 'Comm'}
                          </span>
                          <span className="text-xs font-black text-slate-700">TZS {fin.commission.toLocaleString()}</span>
                        </div>
                        <div className="bg-slate-50 rounded-subcard px-2 py-1.5 text-center">
                          <span className="text-caption text-slate-400 block">
                            {lang === 'zh' ? '留存' : 'Retention'}
                          </span>
                          <span className="text-xs font-black text-slate-700">TZS {fin.finalRetention.toLocaleString()}</span>
                        </div>
                        <div
                          className={`rounded-subcard px-2 py-1.5 text-center ${
                            fin.netPayable >= 0 ? 'bg-amber-50' : 'bg-rose-50'
                          }`}
                        >
                          <span className="text-caption text-slate-400 block">
                            {lang === 'zh' ? '应付' : 'Net'}
                          </span>
                          <span className={`text-xs font-black ${fin.netPayable >= 0 ? 'text-amber-700' : 'text-rose-600'}`}>
                            TZS {fin.netPayable.toLocaleString()}
                          </span>
                          {fin.isCoinStockNegative && (
                            <span className="block text-[9px] text-rose-500 font-bold mt-0.5">
                              {lang === 'zh' ? '⚠️ 硬币库存不足' : '⚠️ Low coins'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Expense fields ───────────────────────────────── */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Coin exchange */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-0.5 block">
                        <Coins size={10} className="inline mr-0.5" />
                        {lang === 'zh' ? '换币 (TZS)' : 'Coin ex (TZS)'}
                      </label>
                      <input
                        type="number"
                        value={entry.coinExchange}
                        onChange={e => updateEntry(machine.id, { coinExchange: e.target.value })}
                        placeholder="0"
                        inputMode="numeric"
                        disabled={entry.submitting || entry.submitted}
                        className="w-full rounded-subcard border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 placeholder:text-slate-300 focus:border-amber-300 outline-none disabled:opacity-50"
                      />
                    </div>
                    {/* Tip */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-0.5 block">
                        <Banknote size={10} className="inline mr-0.5" />
                        {lang === 'zh' ? '小费 (TZS)' : 'Tip (TZS)'}
                      </label>
                      <input
                        type="number"
                        value={entry.tip}
                        onChange={e => updateEntry(machine.id, { tip: e.target.value })}
                        placeholder="0"
                        inputMode="numeric"
                        disabled={entry.submitting || entry.submitted}
                        className="w-full rounded-subcard border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 placeholder:text-slate-300 focus:border-amber-300 outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Owner retention toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateEntry(machine.id, { isOwnerRetaining: !entry.isOwnerRetaining, ownerRetention: '' })}
                      disabled={entry.submitting || entry.submitted}
                      className={`shrink-0 w-8 h-5 rounded-full transition-colors relative ${
                        entry.isOwnerRetaining ? 'bg-amber-500' : 'bg-slate-300'
                      } disabled:opacity-50`}
                      role="switch"
                      aria-checked={entry.isOwnerRetaining}
                    >
                      <span
                        className={`block w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                          entry.isOwnerRetaining ? 'left-[14px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                    <span className="text-[10px] font-black uppercase text-slate-400">
                      {lang === 'zh' ? '店主留存' : 'Owner retain'}
                    </span>
                    {entry.isOwnerRetaining && fin && (
                      <span className="text-xs font-black text-amber-600">
                        TZS {fin.finalRetention.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* ── Action row ──────────────────────────────────── */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => photoInputRefs.current[machine.id]?.click()}
                      disabled={entry.submitting || entry.submitted}
                      className={`flex items-center gap-1.5 px-4 py-3 rounded-subcard border font-bold text-caption uppercase transition-all ${
                        entry.photo
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-white border-slate-200 text-slate-500'
                      } disabled:opacity-50`}
                    >
                      <Camera size={14} />
                      {entry.photo ? (lang === 'zh' ? '已拍' : 'Photo ✓') : (lang === 'zh' ? '拍照' : 'Photo')}
                    </button>
                    <input
                      ref={el => { photoInputRefs.current[machine.id] = el; }}
                      type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => handlePhotoSelected(machine.id, e)}
                    />
                    <button
                      type="button"
                      onClick={() => handleSubmit(machine.id)}
                      disabled={!entry.score || entry.submitting || entry.submitted || !currentDriver}
                      aria-label={lang === 'zh' ? '提交' : 'Submit'}
                      className="flex-1 py-3 bg-amber-600 text-white rounded-subcard font-black uppercase text-sm disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      {entry.submitting ? (
                        <><Loader2 size={16} className="animate-spin" /> {lang === 'zh' ? '提交中…' : 'Sending…'}</>
                      ) : entry.submitted ? (
                        <><CheckCircle2 size={16} /> {lang === 'zh' ? '已提交' : 'Done'}</>
                      ) : (
                        <>{lang === 'zh' ? '提交收款' : 'Submit'}</>
                      )}
                    </button>
                  </div>

                  {/* Offline */}
                  {!isOnline && (
                    <div className="flex items-center gap-1.5 text-amber-600 text-caption">
                      <WifiOff size={10} />
                      <span>{lang === 'zh' ? '离线模式 — 数据已缓存' : 'Offline — queued for sync'}</span>
                    </div>
                  )}

                  {/* Photo preview */}
                  {entry.photo && (
                    <div className="h-16 rounded-subcard overflow-hidden border border-slate-200">
                      <img src={entry.photo} className="w-full h-full object-cover" alt="Proof" />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QuickCollect;
