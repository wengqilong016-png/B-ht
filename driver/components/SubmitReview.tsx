import React, { useState } from 'react';
import { Send, Loader2, CheckCircle2, ArrowRight, AlertTriangle, Satellite, RotateCcw } from 'lucide-react';
import WizardStepBar from './WizardStepBar';
import { Location, Driver, Transaction, TRANSLATIONS } from '../../types';
import { extractGpsFromExif, estimateLocationFromContext } from '../../offlineQueue';
import type { AIReviewData } from '../hooks/useCollectionDraft';
import { orchestrateCollectionSubmission } from '../../services/collectionSubmissionOrchestrator';

type SubmissionStatus = 'idle' | 'gps' | 'uploading';

interface SubmitReviewProps {
  selectedLocation: Location;
  currentDriver: Driver;
  lang: 'zh' | 'sw';
  isOnline: boolean;
  currentScore: string;
  photoData: string | null;
  aiReviewData: AIReviewData | null;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: Transaction['expenseCategory'];
  coinExchange: string;
  tip: string;
  draftTxId: string;
  gpsCoords: { lat: number; lng: number } | null;
  gpsPermission: 'prompt' | 'granted' | 'denied';
  /** Raw owner-retention inputs — forwarded to the server write path as-is. */
  isOwnerRetaining: boolean;
  ownerRetention: string;
  calculations: {
    diff: number;
    revenue: number;
    commission: number;
    finalRetention: number;
    netPayable: number;
    remainingCoins: number;
    isCoinStockNegative: boolean;
  };
  onSubmit: (tx: Transaction) => void;
  onBack: () => void;
  onReset: () => void;
  onUpdateGps: (coords: { lat: number; lng: number }) => void;
  onUpdateGpsPermission: (perm: 'prompt' | 'granted' | 'denied') => void;
}

const SubmitReview: React.FC<SubmitReviewProps> = ({
  selectedLocation, currentDriver, lang, isOnline, currentScore, photoData,
  aiReviewData, expenses, expenseType, expenseCategory, coinExchange, tip, draftTxId,
  gpsCoords, gpsPermission, isOwnerRetaining, ownerRetention, calculations,
  onSubmit, onBack, onReset, onUpdateGps, onUpdateGpsPermission,
}) => {
  const t = TRANSLATIONS[lang];
  const [status, setStatus] = useState<SubmissionStatus>('idle');

  const requestGps = () => {
    if (!navigator.geolocation) return;
    onUpdateGpsPermission('prompt');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onUpdateGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        onUpdateGpsPermission('granted');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) onUpdateGpsPermission('denied');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const processSubmission = async (
    resolvedGps: { lat: number; lng: number },
    gpsSourceType: 'live' | 'exif' | 'estimated' | 'none' = 'live',
  ) => {
    setStatus('uploading');

    try {
      const result = await orchestrateCollectionSubmission({
        selectedLocation,
        currentDriver,
        isOnline,
        currentScore,
        photoData,
        aiReviewData,
        expenses,
        expenseType,
        expenseCategory,
        coinExchange,
        tip,
        draftTxId,
        isOwnerRetaining,
        ownerRetention,
        calculations,
        resolvedGps,
        gpsSourceType,
      });

      onSubmit(result.transaction);
      setStatus('idle');

      if (result.source === 'server') {
        alert(lang === 'zh' ? '✅ 采集记录已保存' : '✅ Collection report saved');
        onReset();
        return;
      }

      const savedMsg = lang === 'zh'
        ? '✅ 离线已保存！恢复网络后自动上传。'
        : '✅ Saved offline! Will auto-upload when connected.';
      alert(savedMsg);
      onReset();
    } catch (error) {
      console.error('[SubmitReview] submission failed:', error);
      setStatus('idle');
      alert(lang === 'zh' ? '❌ 提交失败，请重试' : '❌ Submission failed, please retry');
    }
  };

  const handleSubmit = async () => {
    if (!selectedLocation || status !== 'idle') return;
    if (calculations.isCoinStockNegative && !confirm(lang === 'zh' ? '⚠️ Coin stock insufficient, continue?' : '⚠️ Coin stock insufficient, continue?')) return;

    if (gpsCoords) { processSubmission(gpsCoords, 'live'); return; }

    if (photoData) {
      setStatus('gps');
      const exifGps = await extractGpsFromExif(photoData);
      if (exifGps) { processSubmission(exifGps, 'exif'); return; }
    }

    const estimated = estimateLocationFromContext(gpsCoords, selectedLocation?.coords || null);
    if (estimated) {
      const confirmEst = confirm(lang === 'zh' ? '⚠️ 无法获取GPS，将使用网点坐标估算位置。继续提交？' : '⚠️ No GPS available. Will use site coordinates as estimated location. Continue?');
      if (confirmEst) { processSubmission(estimated, 'estimated'); return; }
      setStatus('idle');
      return;
    }

    const confirmNoGps = confirm(lang === 'zh' ? '❌ 无GPS信号。是否仍要保存记录？（将标注为无位置）' : '❌ No GPS signal. Save record without location? (marked as offline)');
    if (confirmNoGps) { processSubmission({ lat: 0, lng: 0 }, 'none'); }
    else { setStatus('idle'); requestGps(); }
  };

  return (
    <div className="max-w-md mx-auto py-4 px-4 pb-20 animate-in fade-in space-y-4">
      <WizardStepBar current="confirm" lang={lang} />

      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2.5 bg-white border border-slate-200 rounded-subcard text-slate-500 hover:text-indigo-600 shadow-field transition-colors flex-shrink-0">
          <ArrowRight size={18} className="rotate-180" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-900 truncate leading-tight">{selectedLocation?.name}</h2>
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em]">
            {selectedLocation?.machineId} • {((selectedLocation?.commissionRate ?? 0) * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-subcard p-5 text-white flex justify-between items-center">
        <div>
          <p className="text-[10px] font-black uppercase opacity-60">{t.net}</p>
          <p className="text-[8px] font-bold opacity-40 uppercase mt-0.5">{t.cashToHandIn}</p>
        </div>
        <p className="text-4xl font-black">TZS {calculations.netPayable.toLocaleString()}</p>
      </div>

      <div className="bg-white rounded-subcard border border-slate-200 shadow-field divide-y divide-slate-100">
        {[
          { label: t.revenue, value: `TZS ${calculations.revenue.toLocaleString()}`, color: 'text-slate-900' },
          { label: t.retention, value: `− TZS ${calculations.finalRetention.toLocaleString()}`, color: 'text-amber-600' },
          { label: t.expenses, value: `− TZS ${(parseInt(expenses) || 0).toLocaleString()}`, color: 'text-rose-500' },
          ...(parseInt(tip) > 0 ? [{ label: lang === 'zh' ? '小费支出 Tip' : 'Tip / Gratuity', value: `− TZS ${(parseInt(tip) || 0).toLocaleString()}`, color: 'text-amber-500' }] : []),
          { label: t.exchange, value: `TZS ${(parseInt(coinExchange) || 0).toLocaleString()}`, color: 'text-emerald-600' },
          { label: t.coinStock, value: `${calculations.remainingCoins.toLocaleString()} ${t.coinUnit}`, color: calculations.isCoinStockNegative ? 'text-rose-600 font-black' : 'text-slate-500' },
        ].map((row) => (
          <div key={row.label} className="flex justify-between items-center px-4 py-2.5">
            <span className="text-[10px] font-black text-slate-400 uppercase">{row.label}</span>
            <span className={`text-[11px] font-black ${row.color}`}>{row.value}</span>
          </div>
        ))}
      </div>

      {photoData && (
        <div className="h-20 rounded-subcard overflow-hidden border border-slate-200 shadow-field relative">
          <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt="Proof" />
          <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-tag flex items-center gap-1">
            <CheckCircle2 size={9} /> Photo Attached
          </div>
        </div>
      )}

      <div className={`flex items-center gap-3 px-4 py-3 rounded-subcard border ${
        gpsPermission === 'denied' ? 'bg-rose-50 border-rose-200' :
        gpsCoords ? 'bg-emerald-50 border-emerald-200' :
        'bg-slate-50 border-slate-200'
      }`}>
        <div className={`p-1.5 rounded-btn flex-shrink-0 ${
          gpsPermission === 'denied' ? 'bg-rose-500 text-white animate-pulse' :
          gpsCoords ? 'bg-emerald-500 text-white' :
          'bg-slate-400 text-white'
        }`}>
          <Satellite size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[9px] font-black uppercase ${
            gpsPermission === 'denied' ? 'text-rose-600' :
            gpsCoords ? 'text-emerald-700' :
            'text-slate-500'
          }`}>
            {gpsPermission === 'denied' ? 'GPS denied — open browser settings → allow location' :
             gpsCoords ? 'GPS location confirmed' :
             'Acquiring GPS signal...'}
          </p>
        </div>
        {!gpsCoords && gpsPermission !== 'denied' && (
          <button onClick={requestGps} className="p-1.5 bg-white rounded-btn shadow-field text-indigo-600 flex-shrink-0">
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {calculations.isCoinStockNegative && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-subcard">
          <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
          <p className="text-[9px] font-black text-rose-700 uppercase">
            {lang === 'zh' ? '⚠ 硬币库存不足，请确认后提交' : '⚠ Coin stock insufficient — confirm before submit'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onBack}
          className="py-4 bg-white border border-slate-200 text-slate-500 rounded-btn font-black uppercase text-xs shadow-field hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
        >
          <ArrowRight size={15} className="rotate-180" />
          {lang === 'zh' ? '返回' : 'Back'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={status !== 'idle' || !currentScore || !photoData}
          className="py-4 bg-indigo-600 text-white rounded-btn font-black uppercase text-sm shadow-field-md disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {status !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {status === 'uploading' ? t.saving :
           !gpsCoords && gpsPermission !== 'denied' ? t.acquiringGps :
           t.confirmSubmit}
        </button>
      </div>
    </div>
  );
};

export default SubmitReview;
