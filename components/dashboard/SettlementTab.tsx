import { CheckCircle2, Banknote, ThumbsUp, AlertTriangle } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { useAriaButton } from '../../src/hooks/useAriaButton'

import { useToast } from '../../contexts/ToastContext';
import { Transaction, Driver, Location, DailySettlement, User as UserType, TRANSLATIONS } from '../../types';

import AdminApprovalTaskList from './AdminApprovalTaskList';
import { useAnomalyScanResults } from './hooks/useAnomalyScanResults';
import {
  ApprovalTask,
  buildApprovalTasks,
} from './settlementApprovalTasks';

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
  transactions: Transaction[];
  pendingSettlements: DailySettlement[];
  settlementsForSubmissionGuard: DailySettlement[];
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

const SettlementTab: React.FC<SettlementTabProps> = ({
  isAdmin,
  unsyncedCollectionsCount,
  transactions,
  pendingSettlements,
  settlementsForSubmissionGuard,
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
  const [settlementExpenseAmount, setSettlementExpenseAmount] = useState<string>('');
  const [settlementExpenseCategory, setSettlementExpenseCategory] = useState<NonNullable<DailySettlement['settlementExpenseCategory']>>('tip');
  const [settlementExpenseNote, setSettlementExpenseNote] = useState<string>('');
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const scanResults = useAnomalyScanResults(isAdmin, anomalyTransactions, lang);
  const myPendingSettlements = pendingSettlements
    .filter(settlement => settlement.driverId === activeDriverId && settlement.status === 'pending')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const overduePendingSettlements = myPendingSettlements.filter((settlement) => settlement.date < todayStr);
  const overduePendingAmount = overduePendingSettlements.reduce((sum, settlement) => sum + settlement.expectedTotal, 0);
  const collectionCountByDriverDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type !== 'collection' || !tx.driverId || !tx.timestamp) continue;
      const key = `${tx.driverId}:${tx.timestamp.slice(0, 10)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [transactions]);

  // Block duplicate submissions: if a settlement already exists for today
  // (pending or confirmed), the driver should not be able to submit another one.
  const hasSubmittedToday = settlementsForSubmissionGuard.some(
    (settlement) =>
      settlement.driverId === activeDriverId &&
      settlement.date === todayStr &&
      (settlement.status === 'pending' || settlement.status === 'confirmed'),
  );

  const cashAmount = parseInt(actualCash) || 0;
  const coinAmount = parseInt(actualCoins) || 0;
  const settlementExpenseValue = parseInt(settlementExpenseAmount) || 0;
  const totalRevenue = todayDriverTxs.reduce((sum, tx) => sum + tx.revenue, 0);
  const baseExpenses = todayDriverTxs.reduce((sum, tx) => sum + tx.expenses, 0);
  const totalNet = todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0);
  const expectedTotal = Math.max(0, totalNet - settlementExpenseValue);
  const submittedTotal = cashAmount + coinAmount;
  const varianceAmount = submittedTotal - expectedTotal;
  const hasSettlementInput = actualCash.trim() !== '' || actualCoins.trim() !== '';
  const requiresExpenseNote = settlementExpenseCategory === 'other' && settlementExpenseValue > 0;

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

  return (
    <div className="space-y-4 animate-in slide-in-from-right-4">
      {isAdmin ? (
        <AdminApprovalTaskList
          approvalTasks={approvalTasks}
          pendingSettlementsCount={pendingSettlements.length}
          anomalyTransactionsCount={anomalyTransactions.length}
          pendingResetRequestsCount={pendingResetRequests.length}
          pendingExpensesCount={pendingExpenses.length}
          pendingPayoutRequestsCount={pendingPayoutRequests.length}
          collectionCountByDriverDate={collectionCountByDriverDate}
          scanResults={scanResults}
          locationMap={locationMap}
          expandedKey={expandedKey}
          pendingActionKey={pendingActionKey}
          isOnline={isOnline}
          lang={lang}
          onToggleTask={(taskKey) => setExpandedKey(current => (current === taskKey ? null : taskKey))}
          runApprovalAction={runApprovalAction}
          onReviewSettlement={onReviewSettlement}
          onApproveExpenseRequest={onApproveExpenseRequest}
          onReviewAnomalyTransaction={onReviewAnomalyTransaction}
          onApproveResetRequest={onApproveResetRequest}
          onApprovePayoutRequest={onApprovePayoutRequest}
        />
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

          {overduePendingSettlements.length > 0 && (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 space-y-3">
              <div>
                <p className="text-sm font-black text-rose-900 uppercase tracking-tight">
                  {t.overdueSettlementAlert}
                </p>
                <p className="mt-1 text-[11px] font-bold text-rose-600 leading-relaxed">
                  {lang === 'zh'
                    ? '昨日及更早提交的结账还在等待管理员确认，今天提交前请一并核对。'
                    : 'Older settlement submissions are still waiting for admin approval. Review them before closing today.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/90 p-3 border border-rose-100">
                  <p className="text-caption font-black uppercase text-rose-400">
                    {t.overdueSettlementCountLabel}
                  </p>
                  <p className="text-sm font-black text-rose-700">
                    {overduePendingSettlements.length.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/90 p-3 border border-rose-100">
                  <p className="text-caption font-black uppercase text-rose-400">
                    {t.overdueSettlementAmountLabel}
                  </p>
                  <p className="text-sm font-black text-rose-700">
                    TZS {overduePendingAmount.toLocaleString()}
                  </p>
                </div>
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
                <p className="text-xl font-black text-slate-800">TZS {totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <p className="text-caption font-black text-amber-400 uppercase mb-1 tracking-widest">{t.cashInHand}</p>
                <p className="text-xl font-black text-amber-700">TZS {totalNet.toLocaleString()}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-caption font-black uppercase tracking-[0.18em] text-slate-500">
                {lang === 'zh' ? '日结提交后会发生什么' : 'What happens after settlement submit'}
              </p>
              <div className="mt-2 space-y-1.5 text-caption font-bold leading-relaxed text-slate-600">
                <p>
                  {lang === 'zh'
                    ? '1. 今日普通收款仍先保持“待结清”。'
                    : '1. Today’s normal collections stay pending first.'}
                </p>
                <p>
                  {lang === 'zh'
                    ? '2. 管理员确认后，今日收款才会更新为已结清。'
                    : '2. They become settled only after admin confirms the settlement.'}
                </p>
                <p>
                  {lang === 'zh'
                    ? '3. 实收硬币会变成司机次日流动硬币；短款/长款会保留在本次日结结果里。'
                    : '3. Submitted coins become the driver’s next-day float, while shortage/surplus stays recorded on this settlement.'}
                </p>
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

            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 space-y-3">
              <div>
                <p className="text-caption font-black uppercase tracking-[0.18em] text-rose-500">
                  {t.settlementExpenseLabel}
                </p>
                <p className="mt-1 text-caption font-bold leading-relaxed text-rose-700">
                  {t.settlementExpenseHint}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
                <label className="space-y-1">
                  <span className="text-caption font-black uppercase text-rose-500">
                    {t.settlementExpenseCategoryLabel}
                  </span>
                  <select
                    value={settlementExpenseCategory}
                    onChange={(event) =>
                      setSettlementExpenseCategory(
                        event.target.value as NonNullable<DailySettlement['settlementExpenseCategory']>,
                      )
                    }
                    className="w-full rounded-btn border border-rose-200 bg-white px-3 py-2 text-[11px] font-black uppercase text-rose-700 outline-none"
                  >
                    <option value="tip">{t.tipLabel}</option>
                    <option value="electricity">{t.electricityLabel}</option>
                    <option value="other">{t.otherLabel}</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-caption font-black uppercase text-rose-500">
                    {t.settlementExpenseAmountLabel}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={settlementExpenseAmount}
                    onChange={(event) => setSettlementExpenseAmount(event.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    className="w-full rounded-btn border border-rose-200 bg-white px-3 py-2 text-sm font-black text-rose-900 outline-none placeholder:text-rose-200"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="flex items-center justify-between gap-2 text-caption font-black uppercase text-rose-500">
                  <span>{t.settlementExpenseNoteLabel}</span>
                  <span className="text-rose-300">{t.settlementExpenseOptionalLabel}</span>
                </span>
                <textarea
                  value={settlementExpenseNote}
                  onChange={(event) => setSettlementExpenseNote(event.target.value)}
                  rows={2}
                  maxLength={120}
                  placeholder={lang === 'zh' ? '例如：电费补贴 / 其他说明' : 'Example: electricity / other explanation'}
                  className="w-full rounded-btn border border-rose-200 bg-white px-3 py-2 text-[11px] font-bold text-rose-900 outline-none placeholder:text-rose-200"
                />
              </label>
              {requiresExpenseNote && !settlementExpenseNote.trim() && (
                <p className="text-caption font-black uppercase text-rose-600">
                  {t.settlementExpenseRequiredNote}
                </p>
              )}
            </div>

            {hasSettlementInput && (
              <div className={`p-4 rounded-2xl flex justify-between items-center animate-in slide-in-from-top-4 border ${varianceAmount === 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                <div>
                  <p className={`text-caption font-black uppercase ${varianceAmount === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.varianceLabel}</p>
                  <p className={`text-2xl font-black ${varianceAmount === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>TZS {varianceAmount.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption font-black uppercase text-slate-400">
                    {t.expectedTotalLabel}
                  </p>
                  <p className="text-sm font-black text-slate-900">TZS {expectedTotal.toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-2xl bg-white ${varianceAmount === 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {varianceAmount === 0 ? <ThumbsUp size={32} /> : <AlertTriangle size={32} />}
                </div>
              </div>
            )}

            <button
              disabled={!hasSettlementInput || pendingActionKey === 'driver:settlement-submit'}
              onClick={async () => {
                if (requiresExpenseNote && !settlementExpenseNote.trim()) {
                  showToast(t.settlementExpenseRequiredNote, 'warning');
                  return;
                }
                setPendingActionKey('driver:settlement-submit');
                const actual = submittedTotal;
                const settlement: DailySettlement = {
                  id: `STL-${Date.now()}`,
                  date: todayStr,
                  driverId: activeDriverId,
                  driverName: currentUser.name,
                  totalRevenue,
                  totalNetPayable: totalNet,
                  totalExpenses: baseExpenses + settlementExpenseValue,
                  driverFloat: myProfile?.dailyFloatingCoins || 0,
                  expectedTotal,
                  settlementExpenseAmount: settlementExpenseValue || undefined,
                  settlementExpenseCategory: settlementExpenseValue > 0 ? settlementExpenseCategory : undefined,
                  settlementExpenseNote: settlementExpenseValue > 0 && settlementExpenseNote.trim()
                    ? settlementExpenseNote.trim()
                    : undefined,
                  actualCash: cashAmount,
                  actualCoins: coinAmount,
                  shortage: actual - expectedTotal,
                  status: 'pending',
                  timestamp: new Date().toISOString(),
                  isSynced: false,
                };
                try {
                  await onCreateSettlement(settlement);
                  showToast(lang === 'zh' ? '结算已提交，等待审批。' : 'Settlement submitted. Waiting for approval.', 'success');
                  setActualCash('');
                  setActualCoins('');
                  setSettlementExpenseAmount('');
                  setSettlementExpenseCategory('tip');
                  setSettlementExpenseNote('');
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
