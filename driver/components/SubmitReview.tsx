import { Send, Loader2, CheckCircle2, ArrowRight, AlertTriangle, Satellite, RotateCcw } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { useConfirm } from '../../contexts/ConfirmContext';
import { useToast } from '../../contexts/ToastContext';
import { useCollectionSubmission } from '../../hooks/useCollectionSubmission';
import { extractGpsFromExif, estimateLocationFromContext } from '../../offlineQueue';
import { Location, Driver, Transaction, TRANSLATIONS } from '../../types';

import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import WizardStepBar from './WizardStepBar';


import type { AIReviewData } from '../hooks/useCollectionDraft';


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
  onSubmit: (result: CompletionResult) => void | Promise<void>;
  onBack: () => void;
  onSwitchMachine?: () => void;
  onReset: () => void;
  onReturnHome?: () => void;
  onRequestGps: () => void;
  nextMachine?: Location | null;
  pendingCount?: number;
  allTransactions: Transaction[];
  todayStr: string;
}

export type CompletionResult = {
  source: 'server' | 'offline';
  transaction: Transaction;
};

const SubmitReview: React.FC<SubmitReviewProps> = ({
  selectedLocation, currentDriver, lang, isOnline, currentScore, photoData,
  aiReviewData, expenses, expenseType, expenseCategory, expenseDescription, coinExchange, tip, startupDebtDeduction, draftTxId,
  gpsCoords, gpsPermission, isOwnerRetaining, ownerRetention, calculations,
  onSubmit, onBack, onSwitchMachine, onReset, onReturnHome, onRequestGps, nextMachine, pendingCount,
  allTransactions, todayStr,
}) => {
  const t = TRANSLATIONS[lang];
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const expenseAmount = (parseInt(expenses, 10) || 0) + (parseInt(tip, 10) || 0);
  const settlementStatusHint = lang === 'zh'
    ? '提交后收款单会先保存；管理员确认今日日结后，这笔收款才会记为已结清，并把次日流动硬币更新为实收硬币。'
    : 'After submit, the collection is saved first. It becomes settled only after admin confirms the daily settlement, which also updates the next-day float to the actual coins submitted.';
  const parsedCurrentScore = parseInt(currentScore, 10);
  const hasNumericScore = !isNaN(parsedCurrentScore);
  const isScoreBelowLastReading = hasNumericScore && parsedCurrentScore < (selectedLocation?.lastScore ?? 0);
  // GPS-acquisition local state (distinct from the submission state machine)
  const [gpsResolving, setGpsResolving] = useState(false);
  const { state: submissionState, submit: submitCollection, reset: resetSubmissionState } = useCollectionSubmission();
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);
  const [completionPending, setCompletionPending] = useState(false);

  // Idempotency lock — prevents a second submission while the success/error
  // useEffect is pending (e.g. user taps Submit again while alert() is open).
  const submittedRef = React.useRef(false);
  const consumedSubmissionRef = React.useRef<string | null>(null);
  const mountedRef = React.useRef(true);
  const onSubmitRef = React.useRef(onSubmit);
  const showToastRef = React.useRef(showToast);

  React.useEffect(() => {
    onSubmitRef.current = onSubmit;
    showToastRef.current = showToast;
  }, [onSubmit, showToast]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset the idempotency lock whenever the draftTxId changes (new collection).
  React.useEffect(() => {
    submittedRef.current = false;
    consumedSubmissionRef.current = null;
    setCompletionResult(null);
    setCompletionPending(false);
  }, [draftTxId]);

  // Derived boolean used to disable the submit button and spinner gating
  const isProcessing = gpsResolving || completionPending || submissionState.status === 'submitting';

  const handleReturnHome = () => {
    setCompletionResult(null);
    submittedRef.current = false;
    resetSubmissionState();
    if (onReturnHome) {
      onReturnHome();
      return;
    }
    onReset();
  };

  // Consume success / error transitions and run UI side effects
  useEffect(() => {
    if (submissionState.status === 'success') {
      const { source, transaction } = submissionState;
      const submissionKey = `${source}:${transaction.id}`;
      if (consumedSubmissionRef.current === submissionKey) return;
      consumedSubmissionRef.current = submissionKey;

      const completion = { source, transaction };
      setCompletionPending(true);

      void (async () => {
        try {
          await onSubmitRef.current(completion);
          if (!mountedRef.current) return;
          setCompletionResult(completion);
          if (source === 'server') {
            showToastRef.current(lang === 'zh' ? '已提交到云端' : 'Imetumwa kwenye seva', 'success');
          } else {
            showToastRef.current(lang === 'zh' ? '已加入待同步队列' : 'Imeongezwa kwenye foleni', 'success');
          }
        } catch (error) {
          if (!mountedRef.current) return;
          console.error('Submission completion handler failed', error);
          submittedRef.current = false;
          setCompletionResult(null);
          showToastRef.current(lang === 'zh' ? '提交后处理失败，请重试' : 'Post-submit update failed, please retry', 'error');
        } finally {
          if (mountedRef.current) {
            setCompletionPending(false);
            resetSubmissionState();
          }
        }
      })();
    } else if (submissionState.status === 'error') {
      submittedRef.current = false;
      setCompletionResult(null);
      setCompletionPending(false);
      resetSubmissionState();
      showToastRef.current(lang === 'zh' ? '提交失败，请重试' : 'Imeshindwa, jaribu tena', 'error');
    }
  }, [submissionState, lang, resetSubmissionState]);

  if (completionResult) {
    const { source, transaction } = completionResult;
    const returnLabel = lang === 'zh' ? '返回收款首页' : 'Back to collection home';
    const completionTitle = lang === 'zh' ? '任务完成' : 'Task completed';
    const completionSubtitle = source === 'server'
      ? (lang === 'zh' ? '已成功提交到云端。' : 'Successfully saved to the cloud.')
      : (lang === 'zh' ? '已加入待同步队列。' : 'Added to the offline sync queue.');
    const sourceLabel = source === 'server'
      ? (lang === 'zh' ? '云端已保存' : 'Saved online')
      : (lang === 'zh' ? '待同步' : 'Pending sync');

    return (
      <div data-testid="driver-submit-complete" className="max-w-md mx-auto py-3 px-3 pb-24 animate-in fade-in space-y-3">
        <div className="rounded-card border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white px-4 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-200">
              <CheckCircle2 size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-caption font-black uppercase tracking-[0.18em] text-emerald-700">{completionTitle}</p>
              <h2 className="truncate text-base font-black text-slate-900">{transaction.locationName}</h2>
              <p className="text-caption font-black uppercase tracking-[0.15em] text-slate-500">
                {selectedLocation.machineId} · {sourceLabel}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-600">{completionSubtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{lang === 'zh' ? '机器读数' : 'Reading'}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{transaction.currentScore.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.net}</p>
            <p className="mt-1 text-sm font-black text-slate-900">TZS {transaction.netPayable.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{lang === 'zh' ? '提交状态' : 'Status'}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{sourceLabel}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{lang === 'zh' ? '网点' : 'Site'}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{selectedLocation.area || transaction.locationName}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReturnHome}
          data-testid="driver-return-home"
          className="w-full rounded-2xl bg-amber-600 px-4 py-4 text-sm font-black uppercase text-white shadow-lg shadow-amber-200/40 transition-all active:scale-95"
        >
          {returnLabel}
        </button>
      </div>
    );
  }

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
    else { onRequestGps(); }
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
          <p className="text-caption font-black uppercase opacity-60">{t.net}</p>
          <p className="text-caption font-bold opacity-40 uppercase mt-0.5">{t.cashToHandIn}</p>
        </div>
        <p className="text-4xl font-black">TZS {calculations.netPayable.toLocaleString()}</p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-caption font-black uppercase tracking-[0.18em] text-amber-700">
          {lang === 'zh' ? '提交后的账务状态' : 'What happens after submit'}
        </p>
        <p className="mt-1 text-caption font-bold leading-relaxed text-amber-800">
          {settlementStatusHint}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.score}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{currentScore || '0'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.exchange}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {(parseInt(coinExchange) || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.coinStock}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{calculations.remainingCoins.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {[
          { label: t.revenue, value: `TZS ${calculations.revenue.toLocaleString()}`, color: 'text-slate-900' },
          {
            label: isOwnerRetaining
              ? (lang === 'zh' ? '商家留存（入分红余额）' : 'Owner Share (to dividend balance)')
              : (lang === 'zh' ? '商家分红（本次直付）' : 'Owner Share (paid now)'),
            value: `− TZS ${calculations.finalRetention.toLocaleString()}`,
            color: 'text-amber-600',
          },
          {
            label: expenseAmount > 0
              ? `${t.expenses} · ${expenseType === 'public' ? t.companyLabel : t.loanLabel}`
              : t.expenses,
            value: `− TZS ${expenseAmount.toLocaleString()}`,
            color: expenseType === 'public' ? 'text-rose-500' : 'text-amber-700',
          },
          ...(calculations.startupDebtDeduction > 0 || parseInt(startupDebtDeduction) > 0
            ? [{ label: lang === 'zh' ? '商家欠款扣减' : 'Merchant Debt Deduction', value: `− TZS ${calculations.startupDebtDeduction.toLocaleString()}`, color: 'text-amber-600' }]
            : []),
          { label: t.exchange, value: `TZS ${(parseInt(coinExchange) || 0).toLocaleString()}`, color: 'text-emerald-600' },
          { label: t.coinStock, value: `${calculations.remainingCoins.toLocaleString()} ${t.coinUnit}`, color: calculations.isCoinStockNegative ? 'text-rose-600 font-black' : 'text-slate-500' },
        ].map((row) => (
          <div key={row.label} className="flex justify-between items-center px-4 py-2.5">
            <span className="text-caption font-black text-slate-400 uppercase">{row.label}</span>
            <span className={`text-[11px] font-black ${row.color}`}>{row.value}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-caption font-black uppercase tracking-[0.18em] text-slate-400">
          {lang === 'zh' ? '本次审批/记账提示' : 'Approval and ledger notes'}
        </p>
        <div className="mt-2 space-y-2 text-caption font-bold leading-relaxed text-slate-600">
          <p>
            {isOwnerRetaining
              ? (lang === 'zh'
                  ? `商家留存 TZS ${calculations.finalRetention.toLocaleString()} 会累加到当前点位分红余额，店主后续提现仍需管理员审批。`
                  : `Owner share TZS ${calculations.finalRetention.toLocaleString()} will be added to this location's dividend balance, and owner payout still requires admin approval later.`)
              : (lang === 'zh'
                  ? `商家分红 TZS ${calculations.finalRetention.toLocaleString()} 视为本次直接支付，不进入分红余额。`
                  : `Owner share TZS ${calculations.finalRetention.toLocaleString()} is treated as a direct payout this run and will not enter dividend balance.`)}
          </p>
          {expenseAmount > 0 && (
            <p>
              {expenseType === 'public'
                ? (lang === 'zh'
                    ? `费用 TZS ${expenseAmount.toLocaleString()} 将进入公司费用审批。`
                    : `Expense TZS ${expenseAmount.toLocaleString()} will go through company-expense approval.`)
                : (lang === 'zh'
                    ? `费用 TZS ${expenseAmount.toLocaleString()} 将作为司机借支/私账记录，并进入后续工资扣减口径。`
                    : `Expense TZS ${expenseAmount.toLocaleString()} will be recorded as a driver/private loan and flow into later payroll deductions.`)}
            </p>
          )}
          <p>
            {lang === 'zh'
              ? `当前点位分红余额：TZS ${(selectedLocation.dividendBalance || 0).toLocaleString()}。`
              : `Current location dividend balance: TZS ${(selectedLocation.dividendBalance || 0).toLocaleString()}.`}
          </p>
        </div>
      </div>

      {photoData && (
        <div className="h-20 rounded-2xl overflow-hidden border border-slate-200 relative">
          <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt={t.paymentProof} />
          <div className="absolute top-2 right-2 bg-emerald-500 text-white text-caption font-black uppercase px-2 py-0.5 rounded-tag flex items-center gap-1">
            <CheckCircle2 size={9} /> {t.photoReady}
          </div>
        </div>
      )}
      {!photoData && draftTxId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-caption font-black text-amber-700 leading-tight">
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
          <p className={`text-caption font-black uppercase ${
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
          <button onClick={onRequestGps} className="p-1.5 bg-white rounded-xl border border-slate-200 text-amber-600 flex-shrink-0">
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {calculations.isCoinStockNegative && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-2xl">
          <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
          <p className="text-caption font-black text-rose-700 uppercase">
            {lang === 'zh' ? '⚠ 硬币库存不足，请确认后提交' : '⚠ Coin stock insufficient — confirm before submit'}
          </p>
        </div>
      )}

      {isScoreBelowLastReading && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-subcard">
          <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
          <p className="text-caption font-black text-rose-700 uppercase">
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
            className="py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-xs hover:text-amber-600 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowRight size={15} className="rotate-180" />
            {lang === 'zh' ? '返回上一步' : 'Back'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isProcessing || !currentScore || isScoreBelowLastReading}
            data-testid="driver-submit-button"
            className="py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-sm disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-200/40"
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
