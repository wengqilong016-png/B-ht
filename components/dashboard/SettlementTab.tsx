import { Calculator, CheckCircle2, Banknote, ThumbsUp, AlertTriangle, ShieldAlert, RefreshCw, Wallet, ChevronDown, ChevronUp, ScanEye, Loader2 } from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback } from 'react';

import { useToast } from '../../contexts/ToastContext';
import { getScanMeterErrorMessage, scanMeterFromBase64 } from '../../services/scanMeterService';
import { Transaction, Driver, Location, DailySettlement, User as UserType, TRANSLATIONS } from '../../types';
import { getOptimizedImageUrl } from '../../utils/imageUtils';

const taskCard = 'bg-white rounded-2xl border p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]';
const pill = 'inline-flex items-center rounded-full px-2 py-1 text-caption font-black uppercase tracking-wide';

interface PayrollEntry {
  driver: Driver;
  monthlyBreakdown: {
    month: string;
    totalRevenue: number;
    commission: number;
    loans: number;
    shortage: number;
    netPayout: number;
  }[];
}

interface SettlementTabProps {
  isAdmin: boolean;
  unsyncedCollectionsCount: number;
  pendingSettlements: DailySettlement[];
  pendingExpenses: Transaction[];
  anomalyTransactions: Transaction[];
  pendingResetRequests: Transaction[];
  pendingPayoutRequests: Transaction[];
  payrollStats: PayrollEntry[];
  driverMap: Map<string, Driver>;
  locationMap: Map<string, Location>;
  todayDriverTxs: Transaction[];
  myProfile: Driver | undefined;
  currentUser: UserType;
  activeDriverId: string;
  todayStr: string;
  onCreateSettlement: (settlement: DailySettlement) => Promise<void>;
  onReviewSettlement: (settlementId: string, status: 'confirmed' | 'rejected') => Promise<void>;
  onApproveExpenseRequest: (txId: string, approve: boolean) => Promise<void>;
  onReviewAnomalyTransaction: (txId: string, approve: boolean) => Promise<void>;
  onApproveResetRequest: (txId: string, approve: boolean) => Promise<void>;
  onApprovePayoutRequest: (txId: string, approve: boolean) => Promise<void>;
  isOnline: boolean;
  lang: 'zh' | 'sw';
}

type ScanResult = { status: 'loading' | 'matched' | 'mismatch' | 'unclear' | 'error'; detectedScore?: string; notes?: string };
type ApprovalTaskType = 'settlement' | 'expense' | 'anomaly' | 'reset' | 'payout';

interface ApprovalTask {
  key: string;
  type: ApprovalTaskType;
  id: string;
  driverName: string;
  locationName: string;
  amount: number;
  timestamp: string;
  severity: number;
  extra: Record<string, unknown>;
}

const EXPENSE_SEVERITY = 2;
const RESET_SEVERITY = 3;
const SETTLEMENT_SEVERITY = 4;

function buildApprovalTasks(
  lang: 'zh' | 'sw',
  pendingSettlements: DailySettlement[],
  anomalyTransactions: Transaction[],
  pendingResetRequests: Transaction[],
  pendingExpenses: Transaction[],
  pendingPayoutRequests: Transaction[],
): ApprovalTask[] {
  return [
    ...pendingSettlements.map((settlement): ApprovalTask => ({
      key: `settlement:${settlement.id}`,
      type: 'settlement',
      id: settlement.id,
      driverName: settlement.driverName ?? '',
      locationName: lang === 'zh' ? '日结汇总' : 'Daily summary',
      amount: settlement.expectedTotal,
      timestamp: settlement.timestamp,
      severity: SETTLEMENT_SEVERITY,
      extra: { settlement },
    })),
    ...anomalyTransactions.map((tx): ApprovalTask => ({
      key: `anomaly:${tx.id}`,
      type: 'anomaly',
      id: tx.id,
      driverName: tx.driverName ?? '',
      locationName: tx.locationName,
      amount: tx.revenue,
      timestamp: tx.timestamp,
      severity: RESET_SEVERITY,
      extra: { tx },
    })),
    ...pendingResetRequests.map((tx): ApprovalTask => ({
      key: `reset:${tx.id}`,
      type: 'reset',
      id: tx.id,
      driverName: tx.driverName ?? '',
      locationName: tx.locationName,
      amount: tx.currentScore,
      timestamp: tx.timestamp,
      severity: RESET_SEVERITY,
      extra: { tx },
    })),
    ...pendingExpenses.map((tx): ApprovalTask => ({
      key: `expense:${tx.id}`,
      type: 'expense',
      id: tx.id,
      driverName: tx.driverName ?? '',
      locationName: tx.locationName,
      amount: tx.expenses,
      timestamp: tx.timestamp,
      severity: EXPENSE_SEVERITY,
      extra: { tx },
    })),
    ...pendingPayoutRequests.map((tx): ApprovalTask => ({
      key: `payout:${tx.id}`,
      type: 'payout',
      id: tx.id,
      driverName: tx.driverName ?? '',
      locationName: tx.locationName,
      amount: tx.payoutAmount || 0,
      timestamp: tx.timestamp,
      severity: EXPENSE_SEVERITY,
      extra: { tx },
    })),
  ].sort((a, b) =>
    b.severity !== a.severity
      ? b.severity - a.severity
      : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

function getExpenseCategoryLabel(
  t: typeof TRANSLATIONS['zh'],
  category: Transaction['expenseCategory'],
): string {
  const labels = {
    tip: `💸 ${t.tipLabel}`,
    fuel: `⛽ ${t.fuelLabel}`,
    repair: `🔧 ${t.repairLabel}`,
    fine: `🚨 ${t.fineLabel}`,
    transport: `🛺 ${t.transportLabel}`,
    allowance: `🍽 ${t.allowanceLabel}`,
    salary_advance: `💰 ${t.salaryAdvanceLabel}`,
    other: `📋 ${t.otherLabel}`,
  } satisfies Record<NonNullable<Transaction['expenseCategory']>, string>;

  return labels[category || 'other'] || `📋 ${t.otherLabel}`;
}

async function convertImageUrlToBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Image fetch failed with status ${resp.status}`);
  }

  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
      if (!result) {
        reject(new Error('Image conversion produced empty base64 data'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Image conversion failed'));
    reader.readAsDataURL(blob);
  });
}

function deriveScanResult(
  tx: Transaction,
  result: Extract<Awaited<ReturnType<typeof scanMeterFromBase64>>, { success: true }>,
): ScanResult {
  const detectedScore = result.data.score ?? '';
  const submittedScore = String(tx.currentScore ?? '');
  const diff = Math.abs(parseInt(detectedScore || '0', 10) - parseInt(submittedScore || '0', 10));
  const status = detectedScore === '' || result.data.condition === 'Unclear'
    ? 'unclear'
    : diff <= 5 ? 'matched' : 'mismatch';

  return { status, detectedScore, notes: result.data.notes };
}

const SettlementTab: React.FC<SettlementTabProps> = ({
  isAdmin,
  unsyncedCollectionsCount,
  pendingSettlements,
  pendingExpenses,
  anomalyTransactions,
  pendingResetRequests,
  pendingPayoutRequests,
  payrollStats: _payrollStats,
  driverMap: _driverMap,
  locationMap,
  todayDriverTxs,
  myProfile,
  currentUser,
  activeDriverId,
  todayStr,
  onCreateSettlement,
  onReviewSettlement,
  onApproveExpenseRequest,
  onReviewAnomalyTransaction,
  onApproveResetRequest,
  onApprovePayoutRequest,
  isOnline,
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const { showToast } = useToast();
  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [scanResults, setScanResults] = useState<Map<string, ScanResult>>(new Map());

  const triggerAIScan = useCallback(async (tx: Transaction) => {
    if (!tx.photoUrl || scanResults.has(tx.id)) return;
    setScanResults(prev => new Map(prev).set(tx.id, { status: 'loading' }));
    try {
      const base64 = await convertImageUrlToBase64(tx.photoUrl);

      const result = await scanMeterFromBase64(base64);
      if (result.success) {
        setScanResults(prev => new Map(prev).set(tx.id, deriveScanResult(tx, result)));
        return;
      }

      const failure = result as Extract<Awaited<ReturnType<typeof scanMeterFromBase64>>, { success: false }>;
      setScanResults(prev => new Map(prev).set(tx.id, {
        status: 'error',
        notes: getScanMeterErrorMessage(failure.code, lang),
      }));
    } catch (error) {
      console.warn('AI scan failed for transaction', tx.id, error);
      setScanResults(prev => new Map(prev).set(tx.id, {
        status: 'error',
        notes: getScanMeterErrorMessage('NETWORK_ERROR', lang),
      }));
    }
  }, [lang, scanResults]);

  // Auto-trigger scan for anomaly transactions with photos when admin views
  useEffect(() => {
    if (!isAdmin) return;
    for (const tx of anomalyTransactions) {
      if (tx.photoUrl && !scanResults.has(tx.id)) {
        triggerAIScan(tx);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anomalyTransactions, isAdmin]);
  const myPendingSettlements = pendingSettlements
    .filter(settlement => settlement.driverId === activeDriverId && settlement.status === 'pending')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Block duplicate submissions: if a settlement already exists for today
  // (pending or confirmed), the driver should not be able to submit another one.
  const hasSubmittedToday = pendingSettlements.some(
    (settlement) =>
      settlement.driverId === activeDriverId &&
      settlement.date === todayStr,
  );

  const cashAmount = parseInt(actualCash) || 0;
  const coinAmount = parseInt(actualCoins) || 0;
  const hasSettlementInput = actualCash.trim() !== '' || actualCoins.trim() !== '';

  const runApprovalAction = async (actionKey: string, action: () => Promise<void>) => {
    if (!isOnline) {
      showToast(
        lang === 'zh'
          ? '当前处于离线状态，审批操作需要联网才能进行。'
          : 'You are offline. Approval actions require an internet connection.',
        'warning',
      );
      return;
    }
    setPendingActionKey(actionKey);
    try {
      await action();
    } catch (error) {
      console.error('Approval action failed.', error);
      showToast(lang === 'zh' ? '审批失败，请重试。' : 'Approval failed. Please retry.', 'error');
    } finally {
      setPendingActionKey(current => (current === actionKey ? null : current));
    }
  };

  const approvalTasks = useMemo<ApprovalTask[]>(() => {
    return buildApprovalTasks(
      lang,
      pendingSettlements,
      anomalyTransactions,
      pendingResetRequests,
      pendingExpenses,
      pendingPayoutRequests,
    );
  }, [lang, pendingSettlements, anomalyTransactions, pendingResetRequests, pendingExpenses, pendingPayoutRequests]);

  const TYPE_CONFIG: Record<ApprovalTaskType, { label: string; labelEn: string; pillClass: string; iconBg: string; icon: React.ReactNode }> = {
    settlement: { label: '日结', labelEn: 'Settlement', pillClass: 'bg-amber-100 text-amber-700', iconBg: 'bg-amber-100 text-amber-700', icon: <Calculator size={14} /> },
    anomaly:    { label: '异常', labelEn: 'Anomaly',    pillClass: 'bg-amber-50 text-amber-600',  iconBg: 'bg-amber-100 text-amber-700', icon: <ShieldAlert size={14} /> },
    reset:      { label: '重置', labelEn: 'Reset',      pillClass: 'bg-amber-50 text-amber-700', iconBg: 'bg-amber-100 text-amber-700', icon: <RefreshCw size={14} /> },
    expense:    { label: '费用', labelEn: 'Expense',    pillClass: 'bg-rose-50 text-rose-600',    iconBg: 'bg-rose-100 text-rose-700',  icon: <AlertTriangle size={14} /> },
    payout:     { label: '提现', labelEn: 'Payout',     pillClass: 'bg-emerald-50 text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-700', icon: <Wallet size={14} /> },
  };

  return (
    <div className="space-y-4 animate-in slide-in-from-right-4">
      {isAdmin ? (
        <div className="space-y-3">
          {/* Slim status line — nav badge already shows the count */}
          {approvalTasks.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-caption font-black flex items-center justify-center flex-shrink-0">
                {approvalTasks.length > 9 ? '9+' : approvalTasks.length}
              </span>
              <p className="text-caption font-bold text-slate-400 uppercase tracking-widest truncate">
                {[
                  pendingSettlements.length > 0 && `${lang === 'zh' ? '结算' : 'Settlement'} ${pendingSettlements.length}`,
                  anomalyTransactions.length > 0 && `${lang === 'zh' ? '异常' : 'Anomaly'} ${anomalyTransactions.length}`,
                  pendingResetRequests.length > 0 && `${lang === 'zh' ? '重置' : 'Reset'} ${pendingResetRequests.length}`,
                  pendingExpenses.length > 0 && `${lang === 'zh' ? '费用' : 'Expense'} ${pendingExpenses.length}`,
                  pendingPayoutRequests.length > 0 && `${lang === 'zh' ? '提现' : 'Payout'} ${pendingPayoutRequests.length}`,
                ].filter(Boolean).join(' • ')}
              </p>
            </div>
          )}

          {/* Unified task list */}
          {approvalTasks.length === 0 ? (
            <div className="py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200">
              <CheckCircle2 size={40} className="mx-auto text-emerald-200 mb-3" />
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.allSettlementsProcessed}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {approvalTasks.map(task => {
                const cfg = TYPE_CONFIG[task.type];
                const typeLabel = lang === 'zh' ? cfg.label : cfg.labelEn;
                const isExpanded = expandedKey === task.key;
                const isPending = pendingActionKey === task.key;

                return (
                  <div key={task.key} className={`${taskCard} overflow-hidden transition-all`}>
                    {/* Compact row — always visible */}
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 text-left"
                      onClick={() => setExpandedKey(isExpanded ? null : task.key)}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}>
                        {cfg.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`${pill} ${cfg.pillClass}`}>{typeLabel}</span>
                          <span className="text-caption font-black text-slate-900 truncate">{task.driverName}</span>
                        </div>
                        <p className="text-caption font-bold text-slate-400 truncate mt-0.5">{task.locationName} · {new Date(task.timestamp).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB')}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <span className="text-caption font-black text-slate-700">
                          {task.type === 'reset' ? task.amount.toLocaleString() : `TZS ${task.amount.toLocaleString()}`}
                        </span>
                        {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                        {task.type === 'settlement' && (() => {
                          const s = (task.extra as { settlement: DailySettlement }).settlement;
                          return (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-50 p-3 rounded-xl">
                                  <p className="text-caption font-black text-slate-400 uppercase">{t.expectedTotalLabel}</p>
                                  <p className="text-xs font-black text-slate-900">TZS {s.expectedTotal.toLocaleString()}</p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl">
                                  <p className="text-caption font-black text-slate-400 uppercase">{t.actualSubmittedLabel}</p>
                                  <p className="text-xs font-black text-amber-700">TZS {(s.actualCash + s.actualCoins).toLocaleString()}</p>
                                </div>
                              </div>
                              {s.shortage !== 0 && (
                                <div className={`p-3 rounded-xl flex items-center justify-between ${s.shortage < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                  <span className="text-caption font-black uppercase">{s.shortage < 0 ? t.shortage : t.surplus}</span>
                                  <span className="text-xs font-black">TZS {Math.abs(s.shortage).toLocaleString()}</span>
                                </div>
                              )}
                              {(s as unknown as { transferProofUrl?: string }).transferProofUrl && (
                                <img src={(s as unknown as { transferProofUrl: string }).transferProofUrl} alt={t.settlementProof} className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                              )}
                              <div className="flex gap-2">
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onReviewSettlement(task.id, 'confirmed'))} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase shadow-lg shadow-emerald-100 disabled:opacity-50">✓ {t.approveBtn}</button>
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onReviewSettlement(task.id, 'rejected'))} className="flex-1 py-3 bg-slate-100 text-slate-400 rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
                              </div>
                            </>
                          );
                        })()}

                        {task.type === 'expense' && (() => {
                          const tx = (task.extra as { tx: Transaction }).tx;
                          const categoryLabel = getExpenseCategoryLabel(t, tx.expenseCategory);
                          return (
                            <>
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-caption font-bold text-slate-500">{categoryLabel}</p>
                                  <p className="text-xs font-black text-slate-900">TZS {tx.expenses.toLocaleString()}</p>
                                </div>
                                <div className={`${pill} ${tx.expenseType === 'private' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'}`}>
                                  {tx.expenseType === 'private' ? t.loanLabel : t.companyLabel}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApproveExpenseRequest(task.id, true))} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✓ {t.approveBtn}</button>
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApproveExpenseRequest(task.id, false))} className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
                              </div>
                            </>
                          );
                        })()}

                        {task.type === 'anomaly' && (() => {
                          const tx = (task.extra as { tx: Transaction }).tx;
                          const scan = scanResults.get(tx.id);
                          const showThumbnail = scan?.status === 'matched';
                          return (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-50 p-2 rounded-xl">
                                  <p className="text-caption font-black text-slate-400 uppercase">{lang === 'zh' ? '司机输入' : 'Driver Input'}</p>
                                  <p className="text-xs font-black text-slate-900">{tx.currentScore}</p>
                                </div>
                                <div className="bg-amber-50 p-2 rounded-xl">
                                  <p className="text-caption font-black text-amber-400 uppercase">{lang === 'zh' ? 'AI 识别' : 'AI Detected'}</p>
                                  <p className="text-xs font-black text-amber-700">
                                    {scan?.status === 'loading' && <Loader2 size={12} className="inline animate-spin" />}
                                    {scan?.status === 'matched' && <span className="text-emerald-600">✓ {scan.detectedScore}</span>}
                                    {scan?.status === 'mismatch' && <span className="text-rose-600">⚠ {scan.detectedScore}</span>}
                                    {scan?.status === 'unclear' && <span className="text-slate-400">{lang === 'zh' ? '不清晰' : 'Unclear'}</span>}
                                    {scan?.status === 'error' && <span className="text-slate-400">{tx.aiScore ?? 'N/A'}</span>}
                                    {!scan && (tx.aiScore ?? 'N/A')}
                                  </p>
                                </div>
                              </div>
                              {/* AI scan status badge */}
                              {scan && scan.status !== 'loading' && (
                                <div className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-caption font-black ${
                                  scan.status === 'matched' ? 'bg-emerald-50 text-emerald-700' :
                                  scan.status === 'mismatch' ? 'bg-rose-50 text-rose-700' :
                                  'bg-slate-50 text-slate-500'
                                }`}>
                                  <ScanEye size={11} />
                                  {scan.status === 'matched' && (lang === 'zh' ? 'AI 已验证 — 数字吻合' : 'AI Verified — numbers match')}
                                  {scan.status === 'mismatch' && (lang === 'zh' ? `AI 警告 — 检测到 ${scan.detectedScore}，与提交不符` : `AI Warning — detected ${scan.detectedScore}, mismatch`)}
                                  {scan.status === 'unclear' && (lang === 'zh' ? 'AI 无法识别图像' : 'AI could not read image')}
                                  {scan.status === 'error' && (lang === 'zh' ? 'AI 扫描不可用' : 'AI scan unavailable')}
                                </div>
                              )}
                              {scan?.notes && (
                                <p className="text-caption font-bold text-slate-500 leading-relaxed">
                                  {scan.notes}
                                </p>
                              )}
                              {tx.photoUrl && (
                                showThumbnail
                                  ? <img src={getOptimizedImageUrl(tx.photoUrl, 80, 60)} alt={t.paymentProof} className="h-10 w-14 object-cover rounded-lg border-2 border-emerald-300 opacity-70" title={lang === 'zh' ? 'AI已验证，缩略预览' : 'AI verified'} />
                                  : <img src={getOptimizedImageUrl(tx.photoUrl, 400, 300)} alt={t.paymentProof} className="w-full h-24 object-cover rounded-xl border border-slate-200" />
                              )}
                              <div className="flex gap-2">
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onReviewAnomalyTransaction(task.id, true))} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✓ {t.approveBtn}</button>
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onReviewAnomalyTransaction(task.id, false))} className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
                              </div>
                            </>
                          );
                        })()}

                        {task.type === 'reset' && (() => {
                          const tx = (task.extra as { tx: Transaction }).tx;
                          const loc = locationMap.get(tx.locationId);
                          return (
                            <>
                              <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-caption font-black text-slate-400 uppercase">{lang === 'zh' ? '重置前当前分数' : 'Current Score (Before Reset)'}</p>
                                <p className="text-lg font-black text-amber-700">{tx.currentScore}</p>
                                {loc?.machineId && <p className="text-caption font-bold text-slate-400 mt-0.5">{loc.machineId}</p>}
                              </div>
                              {tx.photoUrl && (
                                <img src={getOptimizedImageUrl(tx.photoUrl, 400, 300)} alt={t.paymentProof} className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                              )}
                              <div className="flex gap-2">
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApproveResetRequest(task.id, true))} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✓ {t.approveAndReset}</button>
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApproveResetRequest(task.id, false))} className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
                              </div>
                            </>
                          );
                        })()}

                        {task.type === 'payout' && (() => {
                          const tx = (task.extra as { tx: Transaction }).tx;
                          const loc = locationMap.get(tx.locationId);
                          return (
                            <>
                              <div className="bg-emerald-50 p-3 rounded-xl text-center">
                                <p className="text-caption font-black text-emerald-400 uppercase">{t.payoutAmount}</p>
                                <p className="text-2xl font-black text-emerald-700">TZS {(tx.payoutAmount || 0).toLocaleString()}</p>
                                <p className="text-caption font-bold text-slate-400 mt-1">{t.availableBalance}: TZS {(loc?.dividendBalance || 0).toLocaleString()}</p>
                                {loc?.ownerName && <p className="text-caption font-bold text-slate-400">{t.ownerLabel}: {loc.ownerName}</p>}
                              </div>
                              <div className="flex gap-2">
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApprovePayoutRequest(task.id, true))} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✓ {t.approveBtn}</button>
                                <button disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApprovePayoutRequest(task.id, false))} className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Driver view: Today's Settlement
        <div className="space-y-4 animate-in zoom-in-95">
          {unsyncedCollectionsCount > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
              <p className="text-caption font-black uppercase tracking-[0.18em]">
                {lang === 'zh' ? '待同步提醒' : 'Sync Reminder'}
              </p>
              <p className="mt-1 text-[11px] font-bold leading-relaxed">
                {lang === 'zh'
                  ? `当前还有 ${unsyncedCollectionsCount} 条收款记录待同步，最新汇总可能还未完全计入。`
                  : `${unsyncedCollectionsCount} collection records are still waiting to sync, so the latest totals may not be final yet.`}
              </p>
            </div>
          )}

          {myPendingSettlements.length > 0 && (
            <div className="bg-amber-50 p-4 rounded-3xl border border-amber-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight">
                    {lang === 'zh' ? '待审批结算' : 'Pending Settlements'}
                  </h3>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.18em]">
                    {myPendingSettlements.length} {t.pendingApproval}
                  </p>
                </div>
                <div className={`${pill} bg-white text-amber-700 border border-amber-200`}>
                  {myPendingSettlements.length}
                </div>
              </div>
              <div className="space-y-2">
                {myPendingSettlements.map(settlement => {
                  const submittedTotal = settlement.actualCash + settlement.actualCoins;
                  const variance = settlement.shortage;
                  return (
                    <div key={settlement.id} className="rounded-2xl border border-amber-200 bg-white/90 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-black text-slate-900 uppercase">
                            {new Date(settlement.timestamp).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB')}
                          </p>
                          <p className="text-caption font-bold text-slate-400 uppercase">
                            {new Date(settlement.timestamp).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <div className={`${pill} bg-amber-100 text-amber-700`}>
                          {t.pendingApproval}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-slate-50 p-2">
                          <p className="text-caption font-black uppercase text-slate-400">{t.expectedTotalLabel}</p>
                          <p className="text-caption font-black text-slate-900">TZS {settlement.expectedTotal.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 p-2">
                          <p className="text-caption font-black uppercase text-amber-400">
                            {lang === 'zh' ? '已提交' : 'Submitted'}
                          </p>
                          <p className="text-caption font-black text-amber-700">TZS {submittedTotal.toLocaleString()}</p>
                        </div>
                        <div className={`rounded-xl p-2 ${variance === 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                          <p className={`text-caption font-black uppercase ${variance === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.varianceLabel}
                          </p>
                          <p className={`text-caption font-black ${variance === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            TZS {Math.abs(variance).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 space-y-4">
            {hasSubmittedToday ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mx-auto mb-4 border border-emerald-100">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                  {lang === 'zh' ? '今日已提交结算' : 'Settlement Submitted Today'}
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
                  {lang === 'zh' ? '等待主管审批，今日不可重复提交。' : 'Awaiting supervisor approval. No duplicate submission allowed today.'}
                </p>
              </div>
            ) : (
            <>
            <div className="text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mx-auto mb-4 border border-amber-100">
              <Banknote size={40} />
            </div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t.dailySettlement}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">{todayStr} • {todayDriverTxs.length} {t.collectionsCount}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-caption font-black text-slate-400 uppercase mb-1 tracking-widest">{t.revenue}</p>
                <p className="text-xl font-black text-slate-800">TZS {todayDriverTxs.reduce((sum, tx) => sum + tx.revenue, 0).toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <p className="text-caption font-black text-amber-400 uppercase mb-1 tracking-widest">{t.cashInHand}</p>
                <p className="text-xl font-black text-amber-700">TZS {todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <label className="text-caption font-black text-slate-500 uppercase block mb-3 tracking-widest text-center">{t.inputCash} (TZS {t.notesUnit})</label>
                <input
                  type="number"
                  min={0}
                  value={actualCash}
                  onChange={e => setActualCash(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full text-4xl font-black bg-transparent text-center outline-none text-slate-800 placeholder:text-slate-300"
                  placeholder="0"
                />
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <label className="text-caption font-black text-slate-500 uppercase block mb-3 tracking-widest text-center">{t.inputCoins} (TZS {t.coinsUnitLabel})</label>
                <input
                  type="number"
                  min={0}
                  value={actualCoins}
                  onChange={e => setActualCoins(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full text-4xl font-black bg-transparent text-center outline-none text-slate-800 placeholder:text-slate-300"
                  placeholder="0"
                />
              </div>
            </div>

            {hasSettlementInput && (
              <div className={`p-4 rounded-2xl flex justify-between items-center animate-in slide-in-from-top-4 border ${cashAmount + coinAmount === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                <div>
                  <p className={`text-caption font-black uppercase ${cashAmount + coinAmount === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'text-emerald-400' : 'text-rose-400'}`}>{t.varianceLabel}</p>
                  <p className={`text-2xl font-black ${cashAmount + coinAmount === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'text-emerald-600' : 'text-rose-600'}`}>TZS {(cashAmount + coinAmount - todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0)).toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-2xl bg-white ${cashAmount + coinAmount === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {cashAmount + coinAmount === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? <ThumbsUp size={32} /> : <AlertTriangle size={32} />}
                </div>
              </div>
            )}

            <button
              disabled={!hasSettlementInput || pendingActionKey === 'driver:settlement-submit'}
              onClick={async () => {
                setPendingActionKey('driver:settlement-submit');
                const totalNet = todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0);
                const actual = cashAmount + coinAmount;
                const settlement: DailySettlement = {
                  id: `STL-${Date.now()}`,
                  date: todayStr,
                  driverId: activeDriverId,
                  driverName: currentUser.name,
                  totalRevenue: todayDriverTxs.reduce((sum, tx) => sum + tx.revenue, 0),
                  totalNetPayable: totalNet,
                  totalExpenses: todayDriverTxs.reduce((sum, tx) => sum + tx.expenses, 0),
                  driverFloat: myProfile?.dailyFloatingCoins || 0,
                  expectedTotal: totalNet,
                  actualCash: cashAmount,
                  actualCoins: coinAmount,
                  shortage: actual - totalNet,
                  status: 'pending',
                  timestamp: new Date().toISOString(),
                  isSynced: false,
                };
                try {
                  await onCreateSettlement(settlement);
                  showToast(lang === 'zh' ? '结算已提交，等待审批。' : 'Settlement submitted. Waiting for approval.', 'success');
                  setActualCash('');
                  setActualCoins('');
                } catch (error) {
                  console.error('Settlement submission failed.', error);
                  showToast(lang === 'zh' ? '结算提交失败，请重试。' : 'Settlement submission failed. Please retry.', 'error');
                } finally {
                  setPendingActionKey(current => (current === 'driver:settlement-submit' ? null : current));
                }
              }}
              className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-sm transition-all disabled:opacity-30"
            >
              ✓ {t.settlementSubmitCta}
            </button>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(SettlementTab);
