import React, { useRef, useEffect } from 'react';
import { Camera, CheckCircle2, ArrowRight, RotateCcw, AlertTriangle, Satellite, ChevronRight, WifiOff } from 'lucide-react';
import { useGpsCapture } from '../hooks/useGpsCapture';
import WizardStepBar from './WizardStepBar';
import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import { Location, Driver, TRANSLATIONS, AILog } from '../../types';
import type { AIReviewData } from '../hooks/useCollectionDraft';

interface ReadingCaptureProps {
  selectedLocation: Location;
  currentDriver: Driver;
  lang: 'zh' | 'sw';
  currentScore: string;
  photoData: string | null;
  aiReviewData: AIReviewData | null;
  gpsCoords: { lat: number; lng: number } | null;
  gpsPermission: 'prompt' | 'granted' | 'denied';
  draftTxId: string;
  onLogAI: (log: AILog) => void;
  onUpdateScore: (score: string) => void;
  onUpdatePhoto: (photo: string | null) => void;
  onUpdateAiReview: (data: AIReviewData | null) => void;
  onUpdateGps: (coords: { lat: number; lng: number }) => void;
  onUpdateGpsPermission: (perm: 'prompt' | 'granted' | 'denied') => void;
  onNext: () => void;
  onBack: () => void;
  onSwitchMachine?: () => void;
  revenue: number;
  diff: number;
  nextMachine?: Location | null;
  pendingCount?: number;
}

const ReadingCapture: React.FC<ReadingCaptureProps> = ({
  selectedLocation, currentDriver, lang, currentScore, photoData, aiReviewData,
  gpsCoords, gpsPermission, draftTxId, onLogAI,
  onUpdateScore, onUpdatePhoto, onUpdateAiReview, onUpdateGps, onUpdateGpsPermission,
  onNext, onBack, onSwitchMachine, revenue, diff, nextMachine, pendingCount,
}) => {
  const t = TRANSLATIONS[lang];
  const parsedCurrentScore = parseInt(currentScore, 10);
  const hasNumericScore = !isNaN(parsedCurrentScore);
  const isScoreBelowLastReading = hasNumericScore && parsedCurrentScore < (selectedLocation?.lastScore ?? 0);

  const { coords: gpsHookCoords, status: gpsHookStatus, request: requestGps } = useGpsCapture(gpsCoords);

  // Keep draft in sync whenever the hook resolves coords or status
  useEffect(() => {
    if (gpsHookCoords) onUpdateGps(gpsHookCoords);
  }, [gpsHookCoords]);

  useEffect(() => {
    if (gpsHookStatus === 'granted') onUpdateGpsPermission('granted');
    else if (gpsHookStatus === 'denied') onUpdateGpsPermission('denied');
  }, [gpsHookStatus]);

  // Auto-request GPS on mount
  useEffect(() => { requestGps(); }, []);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePickPhoto = () => {
    photoInputRef.current?.click();
  };

  const handlePhotoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (result) {
        onUpdatePhoto(result);
        onUpdateAiReview(null);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="max-w-md mx-auto py-2.5 px-3 pb-24 animate-in fade-in space-y-2.5">
      <WizardStepBar current="capture" lang={lang} />

      <CollectionWorkbenchHeader
        selectedLocation={selectedLocation}
        lang={lang}
        onBack={onBack}
        onSwitchMachine={onSwitchMachine}
        nextMachine={nextMachine}
        pendingCount={pendingCount}
      />

      {/* Score input */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <label className="text-caption font-black text-slate-400 uppercase tracking-widest">{t.currentReading}</label>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase text-slate-500">
              {t.diff} {diff}
            </span>
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-caption font-black uppercase text-indigo-600">
              TZS {revenue.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="number"
            value={currentScore}
            onChange={e => onUpdateScore(e.target.value)}
            className="w-1/2 text-[30px] font-black bg-transparent outline-none text-slate-900 placeholder:text-slate-200"
            placeholder="0000"
            inputMode="numeric"
            autoFocus
          />
          <button
            onClick={handlePickPhoto}
            className={`flex-1 py-3 rounded-2xl border flex items-center justify-center gap-2 transition-all active:scale-95 ${photoData ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-900 border-slate-900 text-white'}`}
          >
            {photoData ? <CheckCircle2 size={16} /> : <Camera size={16} />}
            <span className="text-caption font-black uppercase tracking-widest">
              {photoData ? (lang === 'zh' ? '重拍凭证' : 'Retake proof') : (lang === 'zh' ? '拍照凭证' : 'Capture proof')}
            </span>
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoSelected}
          />
        </div>

        {/* Photo preview */}
        {photoData && (
          <div className="mt-3 h-16 w-full rounded-2xl overflow-hidden border border-slate-200 relative">
            <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt={t.paymentProof} />
            <div className="absolute top-2 right-2 bg-emerald-500 text-white text-caption font-black uppercase px-2 py-0.5 rounded-tag flex items-center gap-1">
              <CheckCircle2 size={9} /> {t.photoReady}
            </div>
          </div>
        )}

        {/* Revenue preview */}
        {currentScore && (
          <div className={`mt-3 p-3 rounded-2xl text-white flex justify-between items-center ${revenue > 50000 ? 'bg-indigo-600' : 'bg-slate-800'}`}>
            <div>
              <p className="text-caption font-black uppercase opacity-60">{t.diff} {diff}</p>
              <p className="text-caption font-black uppercase opacity-60">{diff} × 200 TZS</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black">TZS {revenue.toLocaleString()}</p>
              <p className="text-caption opacity-60 uppercase">{t.revenue}</p>
            </div>
          </div>
        )}

        {isScoreBelowLastReading && (
          <div className="mt-3 p-3 rounded-2xl border border-rose-200 bg-rose-50">
            <p className="text-caption font-black uppercase text-rose-600">
              {lang === 'zh'
                ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，请先确认是否应提交重置申请。`
                : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}). Confirm whether this should be a reset request instead.`}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
      {/* GPS status — uses rich status from useGpsCapture */}
      {(() => {
        const isError = gpsHookStatus === 'denied' || gpsHookStatus === 'timeout' || gpsHookStatus === 'error';
        const isGranted = gpsHookStatus === 'granted' && !!gpsHookCoords;
        const isRequesting = gpsHookStatus === 'requesting' || gpsHookStatus === 'idle';
        const containerCls = isGranted
          ? 'bg-emerald-50 border-emerald-200'
          : isError
          ? 'bg-rose-50 border-rose-200'
          : 'bg-slate-50 border-slate-200';
        const iconCls = isGranted
          ? 'bg-emerald-500 text-white'
          : isError
          ? 'bg-rose-500 text-white'
          : 'bg-slate-400 text-white';
        const textCls = isGranted
          ? 'text-emerald-700'
          : isError
          ? 'text-rose-600'
          : 'text-slate-500';
        const label =
          gpsHookStatus === 'granted' && gpsHookCoords
            ? `${t.gpsLocked} (${gpsHookCoords.lat.toFixed(4)}, ${gpsHookCoords.lng.toFixed(4)})`
            : gpsHookStatus === 'denied'
            ? t.gpsDenied
            : gpsHookStatus === 'timeout'
            ? t.gpsTimedOut
            : gpsHookStatus === 'error'
            ? t.gpsUnavailable
            : t.gpsAcquiring;
        return (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl border ${containerCls}`}>
            <div className={`p-1.5 rounded-xl flex-shrink-0 ${iconCls}`}>
              {isRequesting
                ? <WifiOff size={13} className="animate-pulse" />
                : <Satellite size={13} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-caption font-black uppercase ${textCls}`}>{label}</p>
            </div>
            {!isGranted && (
              <button onClick={requestGps} className="p-1.5 bg-white rounded-xl border border-slate-200 text-indigo-600 flex-shrink-0">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        );
      })()}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl border ${photoData ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className={`p-1.5 rounded-xl flex-shrink-0 ${photoData ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}`}>
          {photoData ? <CheckCircle2 size={13} /> : <WifiOff size={13} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-caption font-black uppercase ${photoData ? 'text-emerald-700' : 'text-slate-500'}`}>
            {photoData ? t.photoReady : t.noPhotoYet}
          </p>
        </div>
      </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.lastScore}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{(selectedLocation?.lastScore ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.diff}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{diff.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.revenue}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {revenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Next button */}
      <div className="sticky bottom-0 z-20 -mx-3 mt-4 border-t border-slate-200 bg-white/95 px-3 pb-2 pt-3 backdrop-blur">
        <button
          onClick={onNext}
          disabled={!currentScore || isScoreBelowLastReading}
          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-200/40"
        >
          <ChevronRight size={18} />
          {t.nextFinancialStep}
        </button>
      </div>
    </div>
  );
};

export default ReadingCapture;
