import React, { useState, useEffect } from 'react';
import { Send, Loader2, CheckCircle2, ArrowRight, AlertTriangle, Satellite, RotateCcw } from 'lucide-react';
import WizardStepBar from './WizardStepBar';
import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import { Location, Driver, Transaction, TRANSLATIONS } from '../../types';
import { extractGpsFromExif, estimateLocationFromContext } from '../../offlineQueue';
import type { AIReviewData } from '../hooks/useCollectionDraft';
import { useCollectionSubmission } from '../../hooks/useCollectionSubmission';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

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
  expenseDescription: string;
  coinExchange: string;
  tip: string;
  startupDebtDeduction: string;
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
    startupDebtDeduction: number;
    netPayable: number;
    remainingCoins: number;
    isCoinStockNegative: boolean;
  };
  onSubmit: (tx: Transaction) => void;
  onBack: () => void;
  onSwitchMachine?: () => void;
  onReset: () => void;
  onContinueNext?: (locId: string) => void;
  onUpdateGps: (coords: { lat: number; lng: number }) => void;
  onUpdateGpsPermission: (perm: 'prompt' | 'granted' | 'denied') => void;
  nextMachine?: Location | null;
  pendingCount?: number;
  allTransactions: Transaction[];
  todayStr: string;
}

const SubmitReview: React.FC<SubmitReviewProps> = ({
  selectedLocation, currentDriver, lang, isOnline, currentScore, photoData,
  aiReviewData, expenses, expenseType, expenseCategory, expenseDescription, coinExchange, tip, startupDebtDeduction, draftTxId,
  gpsCoords, gpsPermission, isOwnerRetaining, ownerRetention, calculations,
  onSubmit, onBack, onSwitchMachine, onReset, onContinueNext, onUpdateGps, onUpdateGpsPermission, nextMachine, pendingCount,
  allTransactions, todayStr,
}) => {
  const t = TRANSLATIONS[lang];
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const parsedCurrentScore = parseInt(currentScore, 10);
  const hasNumericScore = !isNaN(parsedCurrentScore);
  const isScoreBelowLastReading = hasNumericScore && parsedCurrentScore < (selectedLocation?.lastScore ?? 0);
  // GPS-acquisition local state (distinct from the submission state machine)
  const [gpsResolving, setGpsResolving] = useState(false);
  const { state: submissionState, submit: submitCollection, reset: resetSubmissionState } = useCollectionSubmission();

  // Idempotency lock — prevents a second submission while the success/error
  // useEffect is pending (e.g. user taps Submit again while alert() is open).
  const submittedRef = React.useRef(false);

  // Reset the idempotency lock whenever the draftTxId changes (new collection).
  React.useEffect(() => {
    submittedRef.current = false;
  }, [draftTxId]);

  // Derived boolean used to disable the submit button and spinner gating
  const isProcessing = gpsResolving || submissionState.status === 'submitting';

  // Consume success / error transitions and run UI side effects
  useEffect(() => {
    if (submissionState.status === 'success') {
      const { source, transaction } = submissionState;
      onSubmit(transaction);
      resetSubmissionState();
      if (source === 'server') {
        showToast(lang === 'zh' ? '已提交到云端' : 'Imetumwa kwenye seva', 'success');
      } else {
        showToast(lang === 'zh' ? '已加入待同步队列' : 'Imeongezwa kwenye foleni', 'success');
      }
      onReset();
    } else if (submissionState.status === 'error') {
      submittedRef.current = false;
      resetSubmissionState();
      showToast(lang === 'zh' ? '提交失败，请重试' : 'Imeshindwa, jaribu tena', 'error');
    }
  }, [submissionState, lang, onSubmit, onReset, resetSubmissionState, showToast]);

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
    if (submittedRef.current) return;
    submittedRef.current = true;
    await submitCollection({
      selectedLocation,
      currentDriver,
      isOnline,
      currentScore,
      photoData,
      aiReviewData,
      expenses,
      expenseType,
      expenseCategory,
      expenseDescription,
      coinExchange,
      tip,
      draftTxId,
      isOwnerRetaining,
      ownerRetention,
      calculations,
      resolvedGps,
      gpsSourceType,
    });
  };

  const handleSubmit = async () => {
    if (!selectedLocation || isProcessing || submittedRef.current) return;
    // Validate score is numeric before proceeding (orchestrator also validates,
    // but giving clear feedback here saves the user going through GPS flow first).
    const trimmedScore = currentScore.trim();
    if (!trimmedScore || isNaN(parseInt(trimmedScore, 10))) {
      showToast(
        lang === 'zh'
          ? '请输入有效的机器读数（纯数字）。'
          : 'Please enter a valid numeric machine score.',
        'error',
      );
      return;
    }
    if (isScoreBelowLastReading) {
      showToast(
        lang === 'zh'
          ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，请返回核对读数或提交重置申请。`
          : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}). Go back to verify the reading or submit a reset request.`,
        'error',
      );
      return;
    }
    if (!photoData) {
      const ok = await confirm({
        message: lang === 'zh'
          ? '未附加照片，照片可作为收款凭证。是否仍要提交？'
          : 'No photo attached. A photo serves as proof of collection. Continue anyway?',
        confirmLabel: lang === 'zh' ? '继续提交' : 'Submit anyway',
        cancelLabel: lang === 'zh' ? '返回添加' : 'Go back',
      });
      if (!ok) return;
    }
    if (calculations.isCoinStockNegative) {
      const ok = await confirm({
        message: lang === 'zh' ? '零钱库存不足，是否继续？' : 'Coin stock insufficient, continue?',
        confirmLabel: lang === 'zh' ? '继续' : 'Continue',
      });
      if (!ok) return;
    }

    const alreadyCollectedToday = allTransactions.some(
      tx => tx.locationId === selectedLocation.id && tx.type === 'collection' && tx.timestamp.startsWith(todayStr),
    );
    if (alreadyCollectedToday) {
      const ok = await confirm({
        message: lang === 'zh'
          ? `今天（${todayStr}）已对此机器提交过一次收款记录。是否确认再次提交？`
          : `A collection for this machine was already submitted today (${todayStr}). Are you sure you want to submit again?`,
        confirmLabel: lang === 'zh' ? '确认再次提交' : 'Submit again',
        destructive: true,
      });
      if (!ok) return;
    }

    if (gpsCoords) { processSubmission(gpsCoords, 'live'); return; }

    if (photoData) {
      setGpsResolving(true);
      const exifGps = await extractGpsFromExif(photoData);
      setGpsResolving(false);
      if (exifGps) { processSubmission(exifGps, 'exif'); return; }
    }

    const estimated = estimateLocationFromContext(gpsCoords, selectedLocation?.coords || null);
    if (estimated) {
      const confirmEst = await confirm({
        message: lang === 'zh' ? '无法获取GPS，将使用网点坐标估算位置。继续提交？' : 'No GPS available. Will use site coordinates as estimated location. Continue?',
        confirmLabel: lang === 'zh' ? '继续' : 'Continue',
      });
      if (confirmEst) { processSubmission(estimated, 'estimated'); return; }
      return;
    }

    const confirmNoGps = await confirm({
      message: lang === 'zh' ? '无GPS信号。是否仍要保存记录？（将标注为无位置）' : 'No GPS signal. Save record without location? (marked as offline)',
      confirmLabel: lang === 'zh' ? '仍要保存' : 'Save anyway',
    });
    if (confirmNoGps) { processSubmission({ lat: 0, lng: 0 }, 'none'); }
    else { requestGps(); }
  };

  return (
    <div className="max-w-md mx-auto py-2.5 px-3 pb-24 animate-in fade-in space-y-2.5">
      <WizardStepBar current="confirm" lang={lang} />

      <CollectionWorkbenchHeader
        selectedLocation={selectedLocation}
        lang={lang}
        onBack={onBack}
        onSwitchMachine={onSwitchMachine}
        nextMachine={nextMachine}
        pendingCount={pendingCount}
      />

      <div className="bg-slate-900 rounded-2xl px-4 py-3 text-white flex justify-between items-center">
        <div>
          <p className="text-[10px] font-black uppercase opacity-60">{t.net}</p>
          <p className="text-[8px] font-bold opacity-40 uppercase mt-0.5">{t.cashToHandIn}</p>
        </div>
        <p className="text-4xl font-black">TZS {calculations.netPayable.toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{t.score}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{currentScore || '0'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{t.exchange}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {(parseInt(coinExchange) || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{t.coinStock}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{calculations.remainingCoins.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {[
          { label: t.revenue, value: `TZS ${calculations.revenue.toLocaleString()}`, color: 'text-slate-900' },
          { label: t.retention, value: `− TZS ${calculations.finalRetention.toLocaleString()}`, color: 'text-amber-600' },
          { label: t.expenses, value: `− TZS ${((parseInt(expenses) || 0) + (parseInt(tip) || 0)).toLocaleString()}`, color: 'text-rose-500' },
          ...(calculations.startupDebtDeduction > 0 || parseInt(startupDebtDeduction) > 0
            ? [{ label: lang === 'zh' ? '商家欠款扣减' : 'Merchant Debt Deduction', value: `− TZS ${calculations.startupDebtDeduction.toLocaleString()}`, color: 'text-indigo-600' }]
            : []),
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
        <div className="h-20 rounded-2xl overflow-hidden border border-slate-200 relative">
          <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt={t.paymentProof} />
          <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-tag flex items-center gap-1">
            <CheckCircle2 size={9} /> {t.photoReady}
          </div>
        </div>
      )}
      {!photoData && draftTxId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-[10px] font-black text-amber-700 leading-tight">
            {lang === 'zh'
              ? '⚠️ 照片在刷新后丢失，请返回上一步重新拍照。'
              : '⚠️ Photo was lost after page refresh. Please go back and retake it.'}
          </p>
        </div>
      )}

      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border ${
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
            {gpsPermission === 'denied'
              ? t.gpsDenied
              : gpsCoords
                ? t.gpsLocked
                : t.gpsAcquiring}
          </p>
        </div>
        {!gpsCoords && gpsPermission !== 'denied' && (
          <button onClick={requestGps} className="p-1.5 bg-white rounded-xl border border-slate-200 text-indigo-600 flex-shrink-0">
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {calculations.isCoinStockNegative && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-2xl">
          <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
          <p className="text-[9px] font-black text-rose-700 uppercase">
            {lang === 'zh' ? '⚠ 硬币库存不足，请确认后提交' : '⚠ Coin stock insufficient — confirm before submit'}
          </p>
        </div>
      )}

      {isScoreBelowLastReading && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-subcard">
          <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
          <p className="text-[9px] font-black text-rose-700 uppercase">
            {lang === 'zh'
              ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，不能按普通收款提交。`
              : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}); normal collection submit is blocked.`}
          </p>
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-3 mt-4 border-t border-slate-200 bg-white/95 px-3 pb-2 pt-3 backdrop-blur">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onBack}
            className="py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-xs hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowRight size={15} className="rotate-180" />
            {lang === 'zh' ? '返回上一步' : 'Back'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isProcessing || !currentScore || isScoreBelowLastReading}
            className="py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200/40"
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submissionState.status === 'submitting' ? t.saving :
             !gpsCoords && gpsPermission !== 'denied' ? t.acquiringGps :
             t.confirmSubmit}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmitReview;
