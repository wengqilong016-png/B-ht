import React, { useState } from 'react';
import { Calculator, CheckCircle2, Banknote, Receipt, ThumbsUp, AlertTriangle, ShieldAlert, RefreshCw, Wallet } from 'lucide-react';
import { Transaction, Driver, Location, DailySettlement, User as UserType, TRANSLATIONS } from '../../types';
import { getOptimizedImageUrl } from '../../utils/imageUtils';

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
  lang: 'zh' | 'sw';
}

const SettlementTab: React.FC<SettlementTabProps> = ({
  isAdmin,
  pendingSettlements,
  pendingExpenses,
  anomalyTransactions,
  pendingResetRequests,
  pendingPayoutRequests,
  payrollStats,
  driverMap,
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
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  const cashAmount = parseInt(actualCash) || 0;
  const coinAmount = parseInt(actualCoins) || 0;
  const hasSettlementInput = actualCash.trim() !== '' || actualCoins.trim() !== '';

  const runApprovalAction = async (actionKey: string, action: () => Promise<void>) => {
    setPendingActionKey(actionKey);
    try {
      await action();
    } catch (error) {
      console.error('Approval action failed.', error);
      alert(lang === 'zh' ? '❌ 审批失败，请重试。' : '❌ Approval failed. Please retry.');
    } finally {
      setPendingActionKey(current => (current === actionKey ? null : current));
    }
  };

  return (
    <div className="space-y-4 animate-in slide-in-from-right-4">
      {isAdmin ? (
        <div className="space-y-4">
          {/* Part 1: Settlement Approvals */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase">{t.approvalCenter}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {lang === 'zh' ? '结算' : 'Settlements'} ({pendingSettlements.length}) • {t.anomalyReview} ({anomalyTransactions.length}) • {t.resetApproval} ({pendingResetRequests.length}) • {t.payoutApproval} ({pendingPayoutRequests.length})
              </p>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Calculator size={20} /></div>
          </div>

          {pendingSettlements.length === 0 ? (
            <div className="py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200">
              <CheckCircle2 size={40} className="mx-auto text-emerald-200 mb-3" />
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">All settlements processed</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {pendingSettlements.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-2xl border border-amber-200 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-black text-slate-900 uppercase">{s.driverName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(s.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[8px] font-black uppercase">PENDING</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Expected Total</p>
                      <p className="text-xs font-black text-slate-900">TZS {s.expectedTotal.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Actual Submitted</p>
                      <p className="text-xs font-black text-indigo-600">TZS {(s.actualCash + s.actualCoins).toLocaleString()}</p>
                    </div>
                  </div>
                  {s.shortage !== 0 && (
                    <div className={`p-3 rounded-xl mb-4 flex items-center justify-between ${s.shortage < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      <span className="text-[9px] font-black uppercase">{s.shortage < 0 ? 'Shortage' : 'Surplus'}</span>
                      <span className="text-xs font-black">TZS {Math.abs(s.shortage).toLocaleString()}</span>
                    </div>
                  )}
                  {(s as any).transferProofUrl && (
                    <div className="mb-3">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Settlement Proof</p>
                      <img src={(s as any).transferProofUrl} alt="Proof" className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                    </div>
                  )}
                  <div className="flex gap-2">
                        <button
                          disabled={pendingActionKey === `settlement:${s.id}`}
                          onClick={() => runApprovalAction(`settlement:${s.id}`, () => onReviewSettlement(s.id, 'confirmed'))}
                          className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-100 disabled:opacity-50"
                        >
                          ✓ Approve
                        </button>
                        <button
                          disabled={pendingActionKey === `settlement:${s.id}`}
                          onClick={() => runApprovalAction(`settlement:${s.id}`, () => onReviewSettlement(s.id, 'rejected'))}
                          className="flex-1 py-3 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase disabled:opacity-50"
                        >
                          ✗ Reject
                        </button>
                      </div>
                </div>
              ))}
            </div>
          )}

          {/* Part 2: Expense Approval Requests */}
          {pendingExpenses.length > 0 && (
            <div className="space-y-4">
              <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-rose-800 uppercase">Expense Requests</h3>
                  <p className="text-[9px] font-bold text-rose-500 uppercase">Loans / Repairs / Fuel — Pending Approval ({pendingExpenses.length})</p>
                </div>
                <div className="bg-rose-200 text-rose-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingExpenses.length} Pending</div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {pendingExpenses.map(tx => {
                  const driver = driverMap.get(tx.driverId);
                  const categoryLabel = {
                    fuel: '⛽ Fuel',
                    repair: '🔧 Repair',
                    fine: '🚨 Fine',
                    allowance: '🍽 Allowance',
                    salary_advance: '💰 Salary Advance',
                    other: '📋 Other',
                  }[tx.expenseCategory || 'other'] || '📋 Other';
                  return (
                    <div key={tx.id} className="bg-white p-4 rounded-2xl border border-rose-100">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-rose-100 text-rose-700 rounded-xl flex items-center justify-center font-black text-xs">{driver?.name?.charAt(0) || '?'}</div>
                          <div>
                            <p className="text-[10px] font-black text-slate-900">{tx.driverName}</p>
                            <p className="text-[8px] font-bold text-slate-400">{new Date(tx.timestamp).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${tx.expenseType === 'private' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                          {tx.expenseType === 'private' ? 'Loan' : 'Company'}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[9px] font-bold text-slate-500">{categoryLabel}</p>
                          <p className="text-xs font-black text-slate-900">TZS {tx.expenses.toLocaleString()}</p>
                        </div>
                        <div className="text-[8px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-xl">{tx.locationName}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={pendingActionKey === `expense:${tx.id}`}
                          onClick={() => runApprovalAction(`expense:${tx.id}`, () => onApproveExpenseRequest(tx.id, true))}
                          className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase disabled:opacity-50"
                        >
                          ✓ Approve
                        </button>
                        <button
                          disabled={pendingActionKey === `expense:${tx.id}`}
                          onClick={() => runApprovalAction(`expense:${tx.id}`, () => onApproveExpenseRequest(tx.id, false))}
                          className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase disabled:opacity-50"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Part 3: AI Anomaly Review */}
          {anomalyTransactions.length > 0 && (
            <div className="space-y-4">
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-amber-800 uppercase flex items-center gap-2"><ShieldAlert size={16} /> {t.anomalyReview}</h3>
                  <p className="text-[9px] font-bold text-amber-500 uppercase">AI flagged discrepancies ({anomalyTransactions.length})</p>
                </div>
                <div className="bg-amber-200 text-amber-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{anomalyTransactions.length}</div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {anomalyTransactions.map(tx => {
                  const driver = driverMap.get(tx.driverId);
                  return (
                    <div key={tx.id} className="bg-white p-4 rounded-2xl border border-amber-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center font-black text-xs">{driver?.name?.charAt(0) || '?'}</div>
                          <div>
                            <p className="text-[10px] font-black text-slate-900">{tx.driverName}</p>
                            <p className="text-[8px] font-bold text-slate-400">{tx.locationName} — {new Date(tx.timestamp).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[8px] font-black uppercase">⚠️ Anomaly</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-slate-50 p-2 rounded-xl">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Driver Input</p>
                          <p className="text-xs font-black text-slate-900">{tx.currentScore}</p>
                        </div>
                        <div className="bg-amber-50 p-2 rounded-xl">
                          <p className="text-[8px] font-black text-amber-400 uppercase">AI Detected</p>
                          <p className="text-xs font-black text-amber-700">{tx.aiScore ?? 'N/A'}</p>
                        </div>
                      </div>
                      {tx.photoUrl && (
                        <div className="mb-3">
                          <img src={getOptimizedImageUrl(tx.photoUrl, 400, 300)} alt="Evidence" className="w-full h-24 object-cover rounded-xl border border-slate-200" />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          disabled={pendingActionKey === `anomaly:${tx.id}`}
                          onClick={() => runApprovalAction(`anomaly:${tx.id}`, () => onReviewAnomalyTransaction(tx.id, true))}
                          className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase disabled:opacity-50"
                        >
                          ✓ {t.approveBtn}
                        </button>
                        <button
                          disabled={pendingActionKey === `anomaly:${tx.id}`}
                          onClick={() => runApprovalAction(`anomaly:${tx.id}`, () => onReviewAnomalyTransaction(tx.id, false))}
                          className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-[9px] font-black uppercase disabled:opacity-50"
                        >
                          ✗ {t.rejectBtn}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Part 4: Reset Approval */}
          {pendingResetRequests.length > 0 && (
            <div className="space-y-4">
              <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-purple-800 uppercase flex items-center gap-2"><RefreshCw size={16} /> {t.resetApproval}</h3>
                  <p className="text-[9px] font-bold text-purple-500 uppercase">9999 Overflow Reset Requests ({pendingResetRequests.length})</p>
                </div>
                <div className="bg-purple-200 text-purple-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingResetRequests.length}</div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {pendingResetRequests.map(tx => {
                  const loc = locationMap.get(tx.locationId);
                  return (
                    <div key={tx.id} className="bg-white p-4 rounded-2xl border border-purple-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center font-black text-xs"><RefreshCw size={14} /></div>
                          <div>
                            <p className="text-[10px] font-black text-slate-900">{tx.driverName}</p>
                            <p className="text-[8px] font-bold text-slate-400">{tx.locationName} — {loc?.machineId}</p>
                          </div>
                        </div>
                        <div className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[8px] font-black uppercase">RESET</div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl mb-3">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Current Score (Before Reset)</p>
                        <p className="text-lg font-black text-purple-700">{tx.currentScore}</p>
                      </div>
                      {tx.photoUrl && (
                        <div className="mb-3">
                          <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Reset Evidence Photo</p>
                          <img src={getOptimizedImageUrl(tx.photoUrl, 400, 300)} alt="Reset proof" className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          disabled={pendingActionKey === `reset:${tx.id}`}
                          onClick={() => runApprovalAction(`reset:${tx.id}`, () => onApproveResetRequest(tx.id, true))}
                          className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase disabled:opacity-50"
                        >
                          ✓ {t.approveBtn} & Reset to 0
                        </button>
                        <button
                          disabled={pendingActionKey === `reset:${tx.id}`}
                          onClick={() => runApprovalAction(`reset:${tx.id}`, () => onApproveResetRequest(tx.id, false))}
                          className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase disabled:opacity-50"
                        >
                          ✗ {t.rejectBtn}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Part 5: Payout Approval */}
          {pendingPayoutRequests.length > 0 && (
            <div className="space-y-4">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-emerald-800 uppercase flex items-center gap-2"><Wallet size={16} /> {t.payoutApproval}</h3>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase">Owner Dividend Withdrawal ({pendingPayoutRequests.length})</p>
                </div>
                <div className="bg-emerald-200 text-emerald-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingPayoutRequests.length}</div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {pendingPayoutRequests.map(tx => {
                  const loc = locationMap.get(tx.locationId);
                  return (
                    <div key={tx.id} className="bg-white p-4 rounded-2xl border border-emerald-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-black text-xs"><Wallet size={14} /></div>
                          <div>
                            <p className="text-[10px] font-black text-slate-900">{tx.locationName}</p>
                            <p className="text-[8px] font-bold text-slate-400">{lang === 'zh' ? '店主' : 'Owner'}: {loc?.ownerName || 'N/A'} — {lang === 'zh' ? '提交人' : 'By'}: {tx.driverName}</p>
                          </div>
                        </div>
                        <div className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-black uppercase">PAYOUT</div>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-xl mb-3 text-center">
                        <p className="text-[8px] font-black text-emerald-400 uppercase">{t.payoutAmount}</p>
                        <p className="text-2xl font-black text-emerald-700">TZS {(tx.payoutAmount || 0).toLocaleString()}</p>
                        <p className="text-[8px] font-bold text-slate-400 mt-1">
                          {lang === 'zh' ? '可用余额' : 'Available'}: TZS {(loc?.dividendBalance || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={pendingActionKey === `payout:${tx.id}`}
                          onClick={() => runApprovalAction(`payout:${tx.id}`, () => onApprovePayoutRequest(tx.id, true))}
                          className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase disabled:opacity-50"
                        >
                          ✓ {t.approveBtn}
                        </button>
                        <button
                          disabled={pendingActionKey === `payout:${tx.id}`}
                          onClick={() => runApprovalAction(`payout:${tx.id}`, () => onApprovePayoutRequest(tx.id, false))}
                          className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase disabled:opacity-50"
                        >
                          ✗ {t.rejectBtn}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Driver view: Today's Settlement
        <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 space-y-4 animate-in zoom-in-95">
          <div className="text-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-4 border border-indigo-100">
              <Banknote size={40} />
            </div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t.dailySettlement}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">{todayStr} • {todayDriverTxs.length} Collections</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">{t.revenue}</p>
              <p className="text-xl font-black text-slate-800">TZS {todayDriverTxs.reduce((sum, tx) => sum + tx.revenue, 0).toLocaleString()}</p>
            </div>
            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
              <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 tracking-widest">{t.cashInHand}</p>
              <p className="text-xl font-black text-indigo-600">TZS {todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0).toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-3 tracking-widest text-center">{t.inputCash} (TZS Notes)</label>
              <input
                type="number"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                className="w-full text-4xl font-black bg-transparent text-center outline-none text-slate-800 placeholder:text-slate-300"
                placeholder="0"
              />
            </div>
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-3 tracking-widest text-center">{t.inputCoins} (TZS Coins)</label>
              <input
                type="number"
                value={actualCoins}
                onChange={e => setActualCoins(e.target.value)}
                className="w-full text-4xl font-black bg-transparent text-center outline-none text-slate-800 placeholder:text-slate-300"
                placeholder="0"
              />
            </div>
          </div>

          {hasSettlementInput && (
            <div className={`p-4 rounded-2xl flex justify-between items-center animate-in slide-in-from-top-4 border ${cashAmount + coinAmount === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
              <div>
                <p className={`text-[10px] font-black uppercase ${cashAmount + coinAmount === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'text-emerald-400' : 'text-rose-400'}`}>Variance</p>
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
                alert('✅ Settlement submitted! Waiting for approval.');
                setActualCash('');
                setActualCoins('');
              } catch (error) {
                console.error('Settlement submission failed.', error);
                alert(lang === 'zh' ? '❌ 结算提交失败，请重试。' : '❌ Settlement submission failed. Please retry.');
              } finally {
                setPendingActionKey(current => (current === 'driver:settlement-submit' ? null : current));
              }
            }}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm transition-all disabled:opacity-30"
          >
            ✓ Submit Settlement
          </button>
        </div>
      )}
    </div>
  );
};

export default SettlementTab;
