import { Camera, CheckCircle2, RotateCcw, Satellite, ChevronRight, WifiOff } from 'lucide-react';
import React, { useRef } from 'react';
import { useAriaButton } from '../../src/hooks/useAriaButton'

import { Location, TRANSLATIONS } from '../../types';

import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import WizardStepBar from './WizardStepBar';

import type { DriverFlowEventInput } from '../../services/driverFlowTelemetry';
import type { AIReviewData } from '../hooks/useCollectionDraft';
import type { GpsStatus } from '../hooks/useGpsCapture';

interface ReadingCaptureProps {
  selectedLocation: Location;
  lang: 'zh' | 'sw';
  currentScore: string;
  photoData: string | null;
  gpsCoords: { lat: number; lng: number } | null;
  /** Live GPS acquisition status from the parent hook — used to distinguish timeout/error from requesting. */
  gpsStatus: GpsStatus;
  onUpdateScore: (score: string) => void;
  onUpdatePhoto: (photo: string | null) => void;
  onUpdateAiReview: (data: AIReviewData | null) => void;
  /** Trigger a fresh GPS acquisition via the parent's hook (avoids duplicate requests). */
  onRequestGps: () => void;
  onNext: () => void;
  onBack: () => void;
  onSwitchMachine?: () => void;
  revenue: number;
  diff: number;
  nextMachine?: Location | null;
  pendingCount?: number;
  onTelemetryEvent?: (
    eventName: DriverFlowEventInput['eventName'],
    options?: Partial<Omit<DriverFlowEventInput, 'driverId' | 'flowId' | 'eventName' | 'onlineStatus'>>,
  ) => void;
}

const ReadingCapture: React.FC<ReadingCaptureProps> = ({
  selectedLocation,
  lang,
  currentScore,
  photoData,
  gpsCoords,
  gpsStatus,
  onUpdateScore,
  onUpdatePhoto,
  onUpdateAiReview,
  onRequestGps,
  onNext,
  onBack,
  onSwitchMachine,
  revenue,
  diff,
  nextMachine,
  pendingCount,
  onTelemetryEvent,
}) => {
  const t = TRANSLATIONS[lang];
  const parsedCurrentScore = parseInt(currentScore, 10);
  const hasNumericScore = !isNaN(parsedCurrentScore);
  const isScoreBelowLastReading = hasNumericScore && parsedCurrentScore < (selectedLocation?.lastScore ?? 0);

  // Derive GPS display state from parent props (no duplicate hook instantiation here)
  const isGpsGranted = !!gpsCoords;
  const isGpsError = gpsStatus === 'denied' || gpsStatus === 'error';
  const isGpsTimeout = gpsStatus === 'timeout';
  const isGpsRequesting = gpsStatus === 'requesting';

  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePickPhoto = () => {
    onTelemetryEvent?.('photo_picker_opened');
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
    <div className="mx-auto max-w-md animate-in fade-in space-y-2.5">
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
      <div className="bg-white rounded-card border border-slate-200 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <label className="text-caption font-black text-slate-400 uppercase tracking-widest">{t.currentReading}</label>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase text-slate-500">
              {t.diff} {diff}
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-caption font-black uppercase text-amber-600">
              TZS {revenue.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(9.5rem,0.85fr)]">
          <input
            type="number"
            value={currentScore}
            onChange={e => onUpdateScore(e.target.value)}
            data-testid="driver-current-score-input"
            className="min-h-[4.25rem] w-full rounded-subcard border border-slate-100 bg-slate-50 px-3 text-[30px] font-black text-slate-900 outline-none placeholder:text-slate-300 focus:border-amber-300 focus:bg-white"
            placeholder="0000"
            inputMode="numeric"
            autoFocus
          />
          <button
            type="button"
            onClick={handlePickPhoto}
            data-testid="driver-photo-picker-button"
            aria-label={photoData ? (lang === 'zh' ? '重新拍摄凭证' : 'Retake proof') : (lang === 'zh' ? '拍摄凭证' : 'Capture proof')}
            className={`flex min-h-[4.25rem] w-full items-center justify-center gap-2 rounded-subcard border px-3 py-3 transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${photoData ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-900 border-slate-900 text-white'}`}

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
            data-testid="driver-photo-input"
            onChange={handlePhotoSelected}
          />
        </div>

        {/* Photo preview */}
        {photoData && (
          <div className="mt-3 h-16 w-full rounded-card overflow-hidden border border-slate-200 relative">
            <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt={t.paymentProof} />
            <div className="absolute top-2 right-2 bg-emerald-500 text-white text-caption font-black uppercase px-2 py-0.5 rounded-tag flex items-center gap-1">
              <CheckCircle2 size={9} /> {t.photoReady}
            </div>
          </div>
        )}

        {/* Revenue preview */}
        {currentScore && (
          <div className={`mt-3 p-3 rounded-card text-white flex justify-between items-center ${revenue > 50000 ? 'bg-amber-600' : 'bg-slate-800'}`}>
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
          <div className="mt-3 p-3 rounded-card border border-rose-200 bg-rose-50">
            <p className="text-caption font-black uppercase text-rose-600">
              {lang === 'zh'
                ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，请先确认是否应提交重置申请。`
                : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}). Confirm whether this should be a reset request instead.`}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
      {/* GPS status — derived from parent props, no duplicate hook */}
      {(() => {
        const containerCls = isGpsGranted
          ? 'bg-emerald-50 border-emerald-200'
          : isGpsError
          ? 'bg-rose-50 border-rose-200'
          : 'bg-slate-50 border-slate-200';
        const iconCls = isGpsGranted
          ? 'bg-emerald-500 text-white'
          : (isGpsError || isGpsTimeout)
          ? 'bg-rose-500 text-white'
          : 'bg-slate-400 text-white';
        const textCls = isGpsGranted
          ? 'text-emerald-700'
          : (isGpsError || isGpsTimeout)
          ? 'text-rose-600'
          : 'text-slate-500';
        const label = isGpsGranted
          ? `${t.gpsLocked} (${gpsCoords!.lat.toFixed(4)}, ${gpsCoords!.lng.toFixed(4)})`
          : isGpsTimeout
          ? t.gpsTimedOut
          : isGpsError
          ? (gpsStatus === 'error' ? t.gpsUnavailable : t.gpsDenied)
          : t.gpsAcquiring;
        return (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-card border ${containerCls}`}>
            <div className={`p-1.5 rounded-subcard flex-shrink-0 ${iconCls}`}>
              {isGpsRequesting
                ? <WifiOff size={13} className="animate-pulse" />
                : <Satellite size={13} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-caption font-black uppercase ${textCls}`}>{label}</p>
            </div>
            {!isGpsGranted && (
              <button type="button" onClick={onRequestGps} aria-label={t.gpsAcquiring} className="p-1.5 bg-white rounded-subcard border border-slate-200 text-amber-600 flex-shrink-0">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        );
      })()}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-card border ${photoData ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className={`p-1.5 rounded-subcard flex-shrink-0 ${photoData ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}`}>
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
        <div className="rounded-card border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.lastScore}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{(selectedLocation?.lastScore ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-card border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.diff}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{diff.toLocaleString()}</p>
        </div>
        <div className="rounded-card border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.revenue}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {revenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Next button */}
      <div className="sticky bottom-[calc(var(--mobile-nav-height,4.75rem)+env(safe-area-inset-bottom))] z-20 mt-4 rounded-card border border-slate-200 bg-white/95 p-2 backdrop-blur md:bottom-0">
          <button type="button" aria-label={t.nextFinancialStep}
            onClick={onNext}
            disabled={!currentScore || isScoreBelowLastReading}
            data-testid="driver-capture-next"
            className="w-full py-4 bg-amber-600 text-white rounded-card font-black uppercase text-sm disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-amber-200/40"
          >
          <ChevronRight size={18} />
          {t.nextFinancialStep}
        </button>
      </div>
    </div>
  );
};

export default ReadingCapture;
