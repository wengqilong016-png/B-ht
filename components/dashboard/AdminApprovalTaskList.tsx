import { Calculator, CheckCircle2, AlertTriangle, ShieldAlert, RefreshCw, Wallet, ChevronDown, ChevronUp, ScanEye, Loader2 } from 'lucide-react';
import React from 'react';

import { DailySettlement, Location, Transaction, TRANSLATIONS } from '../../types';
import { getOptimizedImageUrl } from '../../utils/imageUtils';

import { ScanResult } from './hooks/useAnomalyScanResults';
import {
  ApprovalTask,
  ApprovalTaskType,
  getExpenseCategoryLabel,
} from './settlementApprovalTasks';

const taskCard = 'bg-white rounded-2xl border p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]';
const pill = 'inline-flex items-center rounded-full px-2 py-1 text-caption font-black uppercase tracking-wide';

interface AdminApprovalTaskListProps {
  approvalTasks: ApprovalTask[];
  pendingSettlementsCount: number;
  anomalyTransactionsCount: number;
  pendingResetRequestsCount: number;
  pendingExpensesCount: number;
  pendingPayoutRequestsCount: number;
  collectionCountByDriverDate: Map<string, number>;
  scanResults: Map<string, ScanResult>;
  locationMap: Map<string, Location>;
  expandedKey: string | null;
  pendingActionKey: string | null;
  isOnline: boolean;
  lang: 'zh' | 'sw';
  onToggleTask: (taskKey: string) => void;
  runApprovalAction: (actionKey: string, action: () => Promise<void>) => Promise<void>;
  onReviewSettlement: (settlementId: string, status: 'confirmed' | 'rejected') => Promise<void>;
  onApproveExpenseRequest: (txId: string, approve: boolean) => Promise<void>;
  onReviewAnomalyTransaction: (txId: string, approve: boolean) => Promise<void>;
  onApproveResetRequest: (txId: string, approve: boolean) => Promise<void>;
  onApprovePayoutRequest: (txId: string, approve: boolean) => Promise<void>;
}

const AdminApprovalTaskList: React.FC<AdminApprovalTaskListProps> = ({
  approvalTasks,
  pendingSettlementsCount,
  anomalyTransactionsCount,
  pendingResetRequestsCount,
  pendingExpensesCount,
  pendingPayoutRequestsCount,
  collectionCountByDriverDate,
  scanResults,
  locationMap,
  expandedKey,
  pendingActionKey,
  isOnline,
  lang,
  onToggleTask,
  runApprovalAction,
  onReviewSettlement,
  onApproveExpenseRequest,
  onReviewAnomalyTransaction,
  onApproveResetRequest,
  onApprovePayoutRequest,
}) => {
  const t = TRANSLATIONS[lang];
  const typeConfig: Record<ApprovalTaskType, { label: string; labelEn: string; pillClass: string; iconBg: string; icon: React.ReactNode }> = {
    settlement: { label: '日结', labelEn: 'Settlement', pillClass: 'bg-amber-100 text-amber-700', iconBg: 'bg-amber-100 text-amber-700', icon: <Calculator size={14} /> },
    anomaly: { label: '异常', labelEn: 'Anomaly', pillClass: 'bg-amber-50 text-amber-600', iconBg: 'bg-amber-100 text-amber-700', icon: <ShieldAlert size={14} /> },
    reset: { label: '重置', labelEn: 'Reset', pillClass: 'bg-amber-50 text-amber-700', iconBg: 'bg-amber-100 text-amber-700', icon: <RefreshCw size={14} /> },
    expense: { label: '费用', labelEn: 'Expense', pillClass: 'bg-rose-50 text-rose-600', iconBg: 'bg-rose-100 text-rose-700', icon: <AlertTriangle size={14} /> },
    payout: { label: '提现', labelEn: 'Payout', pillClass: 'bg-emerald-50 text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-700', icon: <Wallet size={14} /> },
  };

  return (
    <div className="space-y-3">
      {approvalTasks.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-caption font-black flex items-center justify-center flex-shrink-0">
            {approvalTasks.length > 9 ? '9+' : approvalTasks.length}
          </span>
          <p className="text-caption font-bold text-slate-400 uppercase tracking-widest truncate">
            {[
              pendingSettlementsCount > 0 && `${lang === 'zh' ? '结算' : 'Settlement'} ${pendingSettlementsCount}`,
              anomalyTransactionsCount > 0 && `${lang === 'zh' ? '异常' : 'Anomaly'} ${anomalyTransactionsCount}`,
              pendingResetRequestsCount > 0 && `${lang === 'zh' ? '重置' : 'Reset'} ${pendingResetRequestsCount}`,
              pendingExpensesCount > 0 && `${lang === 'zh' ? '费用' : 'Expense'} ${pendingExpensesCount}`,
              pendingPayoutRequestsCount > 0 && `${lang === 'zh' ? '提现' : 'Payout'} ${pendingPayoutRequestsCount}`,
            ].filter(Boolean).join(' • ')}
          </p>
        </div>
      )}

      {approvalTasks.length === 0 ? (
        <div className="py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200">
          <CheckCircle2 size={40} className="mx-auto text-emerald-200 mb-3" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.allSettlementsProcessed}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {approvalTasks.map(task => {
            const cfg = typeConfig[task.type];
            const typeLabel = lang === 'zh' ? cfg.label : cfg.labelEn;
            const isExpanded = expandedKey === task.key;
            const isPending = pendingActionKey === task.key;

            return (
              <div key={task.key} className={`${taskCard} overflow-hidden transition-all`}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 text-left"
                  onClick={() => onToggleTask(task.key)}
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

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    {task.type === 'settlement' && (() => {
                      const s = (task.extra as { settlement: DailySettlement }).settlement;
                      const collectionCount = collectionCountByDriverDate.get(`${s.driverId ?? ''}:${s.date}`) ?? 0;
                      return (
                        <>
                          <div className="space-y-2">
                            <p className="text-caption font-black text-slate-400 uppercase">
                              {t.dailySummaryLabel}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-caption font-black text-slate-400 uppercase">{t.expectedTotalLabel}</p>
                                <p className="text-xs font-black text-slate-900">TZS {s.expectedTotal.toLocaleString()}</p>
                              </div>
                              <div className="bg-amber-50 p-3 rounded-xl">
                                <p className="text-caption font-black text-amber-500 uppercase">{t.actualSubmittedLabel}</p>
                                <p className="text-xs font-black text-amber-700">TZS {(s.actualCash + s.actualCoins).toLocaleString()}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-caption font-black text-slate-400 uppercase">{t.inputCash}</p>
                                <p className="text-xs font-black text-slate-900">TZS {s.actualCash.toLocaleString()}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-caption font-black text-slate-400 uppercase">{t.inputCoins}</p>
                                <p className="text-xs font-black text-slate-900">TZS {s.actualCoins.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                          {(s.settlementExpenseAmount || 0) > 0 && (
                            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-caption font-black uppercase text-rose-400">
                                    {t.settlementExpenseLabel}
                                  </p>
                                  <p className="text-xs font-black text-rose-700">
                                    {getExpenseCategoryLabel(
                                      t,
                                      (s.settlementExpenseCategory ?? 'other') as Transaction['expenseCategory'],
                                    )}
                                  </p>
                                </div>
                                <p className="text-sm font-black text-rose-700">
                                  TZS {(s.settlementExpenseAmount || 0).toLocaleString()}
                                </p>
                              </div>
                              {s.settlementExpenseNote && (
                                <p className="mt-2 text-caption font-bold leading-relaxed text-rose-700">
                                  {s.settlementExpenseNote}
                                </p>
                              )}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-50 p-3 rounded-xl">
                              <p className="text-caption font-black text-slate-400 uppercase">{t.collectionsCount}</p>
                              <p className="text-xs font-black text-slate-900">{collectionCount.toLocaleString()}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl">
                              <p className="text-caption font-black text-slate-400 uppercase">{t.revenueLabel}</p>
                              <p className="text-xs font-black text-slate-900">TZS {s.totalRevenue.toLocaleString()}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl">
                              <p className="text-caption font-black text-slate-400 uppercase">{t.publicExp}</p>
                              <p className="text-xs font-black text-slate-900">TZS {s.totalExpenses.toLocaleString()}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl">
                              <p className="text-caption font-black text-slate-400 uppercase">{t.cashInHand}</p>
                              <p className="text-xs font-black text-slate-900">TZS {s.totalNetPayable.toLocaleString()}</p>
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
                            <button aria-label={t.approveBtn} type="button" disabled={isPending || !isOnline || (s.totalRevenue ?? 0) <= 0} onClick={() => runApprovalAction(task.key, () => onReviewSettlement(task.id, 'confirmed'))} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase shadow-lg shadow-emerald-100 disabled:opacity-50">✓ {t.approveBtn}</button>
                            <button aria-label={t.rejectBtn} type="button" disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onReviewSettlement(task.id, 'rejected'))} className="flex-1 py-3 bg-slate-100 text-slate-400 rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
                          </div>
                          <p className="text-caption font-bold leading-relaxed text-slate-500">
                            {lang === 'zh'
                              ? '确认后：当日普通收款会记为已结清，司机次日流动硬币将更新为本次实收硬币；短款/长款仅作为日结结果保留。'
                              : 'On approval: today’s normal collections become settled, the driver’s next-day floating coins are updated to the submitted coin amount, and shortage/surplus stays as the recorded settlement result.'}
                          </p>
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
                            <button aria-label={t.approveBtn} type="button" disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApproveExpenseRequest(task.id, true))} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✓ {t.approveBtn}</button>
                            <button aria-label={t.rejectBtn} type="button" disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApproveExpenseRequest(task.id, false))} className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
                          </div>
                          <p className="text-caption font-bold leading-relaxed text-slate-500">
                            {tx.expenseType === 'private'
                              ? (lang === 'zh'
                                  ? '借支/私账：批准后进入司机后续工资扣减口径，不应当作公司成本报销。'
                                  : 'Loan/private item: after approval it flows into later driver payroll deductions, not company reimbursement.')
                              : (lang === 'zh'
                                  ? '公账：批准后记为公司成本，不应回收至司机私账。'
                                  : 'Company item: after approval it is treated as a company cost, not a driver payroll deduction.')}
                          </p>
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
                            <button aria-label={t.approveBtn} type="button" disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onReviewAnomalyTransaction(task.id, true))} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✓ {t.approveBtn}</button>
                            <button aria-label={t.rejectBtn} type="button" disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onReviewAnomalyTransaction(task.id, false))} className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
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
                            <button aria-label={t.approveAndReset} type="button" disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApproveResetRequest(task.id, true))} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✓ {t.approveAndReset}</button>
                            <button aria-label={t.rejectBtn} type="button" disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApproveResetRequest(task.id, false))} className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-caption font-black uppercase disabled:opacity-50">✗ {t.rejectBtn}</button>
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
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-caption font-black uppercase text-slate-400">
                                {lang === 'zh' ? '当前点位余额' : 'Current location balance'}
                              </p>
                              <p className="text-xs font-black text-slate-900">TZS {(loc?.dividendBalance || 0).toLocaleString()}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 p-3">
                              <p className="text-caption font-black uppercase text-emerald-500">
                                {lang === 'zh' ? '批准后余额' : 'Balance after approval'}
                              </p>
                              <p className="text-xs font-black text-emerald-700">
                                TZS {Math.max(0, (loc?.dividendBalance || 0) - (tx.payoutAmount || 0)).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <p className="text-caption font-bold leading-relaxed text-slate-500">
                            {lang === 'zh'
                              ? '当前分红余额按点位保存；批准提现会从该点位余额扣减，驳回则余额不变。'
                              : 'Dividend balance is stored per location; approving payout deducts this location balance, while rejecting leaves it unchanged.'}
                          </p>
                          <div className="flex gap-2">
                            <button aria-label={t.approveBtn} type="button" disabled={isPending || !isOnline} onClick={() => runApprovalAction(task.key, () => onApprovePayoutRequest(task.id, true))} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-caption font-black uppercase disabled:opacity-50">✓ {t.approveBtn}</button>
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
  );
};

export default React.memo(AdminApprovalTaskList);
