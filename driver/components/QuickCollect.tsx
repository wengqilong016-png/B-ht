import { CheckCircle2, Loader2, Camera, ChevronRight, WifiOff } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { orchestrateCollectionSubmission } from '../../services/collectionSubmissionOrchestrator';
import { calculateCollectionFinanceLocal } from '../../services/financeCalculator';
import { TRANSLATIONS, Location, CONSTANTS, safeRandomUUID } from '../../types';

import type { Driver } from '../../types';

/**
 * QuickCollect — Reduced-tap collection flow using the server-authoritative
 * orchestrator pipeline (same as DriverCollectionFlow).
 *
 * Shows assigned machines as a tappable list. Tapping a machine
 * expands an inline score-entry panel. Enter the meter reading,
 * optionally attach a photo, and submit through the orchestrator.
 *
 * Target: 2–3 taps per machine:
 *   1. Tap machine
 *   2. Enter score (+ optional photo)
 *   3. Submit
 */

interface QuickCollectProps {
  /** GPS coordinates captured silently by parent hook. */
  gpsCoords: { lat: number; lng: number } | null;
  /** Current driver record (required for orchestrator). */
  currentDriver: Driver | undefined;
}

interface MachineEntry {
  location: Location;
  score: string;
  photo: string | null;
  submitting: boolean;
  submitted: boolean;
}

const QuickCollect: React.FC<QuickCollectProps> = ({ gpsCoords, currentDriver }) => {
  const { lang, activeDriverId } = useAuth();
  const { filteredLocations, isOnline } = useAppData();
  const { showToast } = useToast();
  const t = TRANSLATIONS[lang];

  // Machine entries — one per assigned machine, keyed by location id
  const [entries, setEntries] = useState<Record<string, MachineEntry>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const assignedMachines = useMemo(
    () => filteredLocations.filter(l => l.assignedDriverId === activeDriverId),
    [filteredLocations, activeDriverId]
  );

  const getEntry = useCallback((id: string): MachineEntry => {
    const loc = assignedMachines.find(m => m.id === id);
    return entries[id] || { location: loc!, score: '', photo: null, submitting: false, submitted: false };
  }, [entries, assignedMachines]);

  const updateEntry = (id: string, patch: Partial<MachineEntry>) => {
    setEntries(prev => ({ ...prev, [id]: { ...getEntry(id), ...patch } }));
  };

  const handleSubmit = async (id: string) => {
    const entry = getEntry(id);
    if (!entry.score || entry.submitting || !currentDriver) return;

    updateEntry(id, { submitting: true });

    const parsedScore = parseInt(entry.score, 10);
    if (isNaN(parsedScore)) {
      showToast(t.invalidScore || 'Invalid score', 'error');
      updateEntry(id, { submitting: false });
      return;
    }

    const draftTxId = safeRandomUUID();

    // Pre-calculate locally for the orchestrator (server will be authority)
    const calculations = calculateCollectionFinanceLocal({
      selectedLocation: entry.location,
      currentScore: entry.score,
      expenses: '0',
      coinExchange: '0',
      ownerRetention: '',
      isOwnerRetaining: true,
      tip: '0',
      startupDebtDeduction: '0',
      initialFloat: currentDriver.dailyFloatingCoins || 0,
    });

    try {
      const result = await orchestrateCollectionSubmission({
        selectedLocation: entry.location,
        currentDriver,
        isOnline,
        currentScore: entry.score,
        photoData: entry.photo,
        aiReviewData: null,
        expenses: '0',
        expenseType: 'public',
        expenseCategory: undefined,
        coinExchange: '0',
        tip: '0',
        draftTxId,
        isOwnerRetaining: true,
        ownerRetention: '',
        calculations,
        resolvedGps: gpsCoords ?? { lat: 0, lng: 0 },
        gpsSourceType: gpsCoords ? 'live' : 'none',
      });

      const sourceLabel = result.source === 'server'
        ? (lang === 'zh' ? '已提交 ✓' : 'Done ✓')
        : (lang === 'zh' ? '已缓存 ✓' : 'Queued ✓');

      updateEntry(id, { submitted: true });
      showToast(sourceLabel, 'success');

      // Auto-collapse after 1.5s
      setTimeout(() => {
        setExpandedId(null);
        updateEntry(id, { score: '', photo: null, submitting: false, submitted: false });
      }, 1500);
    } catch (_err) {
      const msg = _err instanceof Error ? _err.message : String(_err);
      showToast(msg || t.submitError || 'Submit failed', 'error');
      updateEntry(id, { submitting: false });
    }
  };

  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handlePhotoPick = (id: string) => {
    photoInputRefs.current[id]?.click();
  };

  const handlePhotoSelected = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateEntry(id, { photo: reader.result });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const completedCount = assignedMachines.filter(m => entries[m.id]?.submitted).length;

  return (
    <div className="animate-in fade-in space-y-3">
      {/* Progress bar */}
      {assignedMachines.length > 0 && (
        <div className="px-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-caption font-black uppercase text-slate-400">
              {lang === 'zh' ? `已收 ${completedCount}/${assignedMachines.length}` : `Done ${completedCount}/${assignedMachines.length}`}
            </span>
            <span className="text-caption font-black uppercase text-amber-600">
              {completedCount === assignedMachines.length ? (lang === 'zh' ? '全部完成 ✓' : 'All done ✓') : ''}
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / assignedMachines.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Machine list */}
      {assignedMachines.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400 font-bold text-sm">
            {lang === 'zh' ? '未分配机器' : 'No assigned machines'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignedMachines.map(machine => {
            const entry = getEntry(machine.id);
            const isExpanded = expandedId === machine.id;
            const lastScore = machine.lastScore || 0;
            const parsedScore = parseInt(entry.score, 10);
            const diff = !isNaN(parsedScore) ? parsedScore - lastScore : 0;
            const revenue = diff * CONSTANTS.COIN_VALUE_TZS;

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
                {/* Machine row — tap to expand */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : machine.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  aria-expanded={isExpanded}
                  aria-label={machine.name}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-black text-slate-800 truncate">{machine.name}</p>
                    <p className="text-caption text-slate-400">
                      {lang === 'zh' ? `上次读数: ${lastScore.toLocaleString()}` : `Last: ${lastScore.toLocaleString()}`}
                      {entry.submitted && (
                        <span className="ml-2 text-emerald-500 inline-flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> {lang === 'zh' ? '已提交' : 'Done'}
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </button>

                {/* Expanded panel — score entry + submit */}
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

                    {/* Calculated preview */}
                    {parsedScore > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-subcard px-3 py-2">
                          <span className="text-caption text-slate-400">{t.diff}</span>
                          <span className={`ml-2 text-sm font-black ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {diff >= 0 ? '+' : ''}{diff.toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-amber-50 rounded-subcard px-3 py-2">
                          <span className="text-caption text-slate-400">{t.revenue}</span>
                          <span className="ml-2 text-sm font-black text-amber-700">TZS {revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    )}

                    {/* Action row: photo + submit */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handlePhotoPick(machine.id)}
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
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => handlePhotoSelected(machine.id, e)}
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmit(machine.id)}
                        disabled={!entry.score || entry.submitting || entry.submitted}
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

                    {/* Offline indicator */}
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
      )}
    </div>
  );
};

export default QuickCollect;
