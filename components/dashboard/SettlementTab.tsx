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
  locations: Location[];
  todayDriverTxs: Transaction[];
  myProfile: Driver | undefined;
  currentUser: UserType;
  activeDriverId: string;
  todayStr: string;
  onUpdateTransaction: (txId: string, updates: Partial<Transaction>) => void;
  onSaveSettlement: (settlement: DailySettlement) => void;
  onUpdateLocations: (locations: Location[]) => void;
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
  locations,
  todayDriverTxs,
  myProfile,
  currentUser,
  activeDriverId,
  todayStr,
  onUpdateTransaction,
  onSaveSettlement,
  onUpdateLocations,
  lang,
}) => {
  const t = TRANSLATIONS[lang];
  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4">
      {isAdmin ? (
        <div className="space-y-6">
          {/* Part 1: Settlement Approvals */}
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex justify-between items-center">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase">{t.approvalCenter}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {lang === 'zh' ? '结算' : 'Settlements'} ({pendingSettlements.length}) • {t.anomalyReview} ({anomalyTransactions.length}) • {t.resetApproval} ({pendingResetRequests.length}) • {t.payoutApproval} ({pendingPayoutRequests.length})
              </p>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Calculator size={20} /></div>
          </div>

          {pendingSettlements.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-[40px] border border-dashed border-slate-200">
              <CheckCircle2 size={40} className="mx-auto text-emerald-200 mb-3" />
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">All settlements processed</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingSettlements.map(s => (
                <div key={s.id} className="bg-white p-6 rounded-[32px] border-2 border-amber-100 shadow-xl relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-black text-slate-900 uppercase">{s.driverName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(s.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[8px] font-black uppercase">PENDING</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
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
                    <div className="mb-4">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Settlement Proof</p>
                      <img src={(s as any).transferProofUrl} alt="Proof" className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => onSaveSettlement({ ...s, status: 'confirmed' })} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-100">✓ Approve</button>
                    <button onClick={() => onSaveSettlement({ ...s, status: 'rejected' })} className="flex-1 py-3 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase">✗ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Part 2: Expense Approval Requests */}
          {pendingExpenses.length > 0 && (
            <div className="space-y-4">
              <div className="bg-rose-50 p-4 rounded-[24px] border border-rose-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-rose-800 uppercase">Expense Requests</h3>
                  <p className="text-[9px] font-bold text-rose-500 uppercase">Loans / Repairs / Fuel — Pending Approval ({pendingExpenses.length})</p>
                </div>
                <div className="bg-rose-200 text-rose-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingExpenses.length} Pending</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div key={tx.id} className="bg-white p-5 rounded-[24px] border border-rose-100 shadow-sm">
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
                        <button onClick={() => onUpdateTransaction(tx.id, { expenseStatus: 'approved' })} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase">✓ Approve</button>
                        <button onClick={() => onUpdateTransaction(tx.id, { expenseStatus: 'rejected' })} className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase">✗ Reject</button>
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
              <div className="bg-amber-50 p-4 rounded-[24px] border border-amber-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-amber-800 uppercase flex items-center gap-2"><ShieldAlert size={16} /> {t.anomalyReview}</h3>
                  <p className="text-[9px] font-bold text-amber-500 uppercase">AI flagged discrepancies ({anomalyTransactions.length})</p>
                </div>
                <div className="bg-amber-200 text-amber-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{anomalyTransactions.length}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {anomalyTransactions.map(tx => {
                  const driver = driverMap.get(tx.driverId);
                  return (
                    <div key={tx.id} className="bg-white p-5 rounded-[24px] border-2 border-amber-200 shadow-sm">
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
                        <button onClick={() => onUpdateTransaction(tx.id, { approvalStatus: 'approved', isAnomaly: false })} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase">✓ {t.approveBtn}</button>
                        <button onClick={() => onUpdateTransaction(tx.id, { approvalStatus: 'rejected' })} className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl text-[9px] font-black uppercase">✗ {t.rejectBtn}</button>
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
              <div className="bg-purple-50 p-4 rounded-[24px] border border-purple-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-purple-800 uppercase flex items-center gap-2"><RefreshCw size={16} /> {t.resetApproval}</h3>
                  <p className="text-[9px] font-bold text-purple-500 uppercase">9999 Overflow Reset Requests ({pendingResetRequests.length})</p>
                </div>
                <div className="bg-purple-200 text-purple-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingResetRequests.length}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingResetRequests.map(tx => {
                  const loc = locationMap.get(tx.locationId);
                  return (
                    <div key={tx.id} className="bg-white p-5 rounded-[24px] border-2 border-purple-200 shadow-sm">
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
                          onClick={() => {
                            onUpdateTransaction(tx.id, { approvalStatus: 'approved' });
                            if (loc) {
                              onUpdateLocations(locations.map(l => l.id === loc.id ? { ...l, lastScore: 0, resetLocked: false, isSynced: false } : l));
                            }
                          }}
                          className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase"
                        >
                          ✓ {t.approveBtn} & Reset to 0
                        </button>
                        <button
                          onClick={() => {
                            onUpdateTransaction(tx.id, { approvalStatus: 'rejected' });
                            if (loc) {
                              onUpdateLocations(locations.map(l => l.id === loc.id ? { ...l, resetLocked: false, isSynced: false } : l));
                            }
                          }}
                          className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase"
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
              <div className="bg-emerald-50 p-4 rounded-[24px] border border-emerald-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-emerald-800 uppercase flex items-center gap-2"><Wallet size={16} /> {t.payoutApproval}</h3>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase">Owner Dividend Withdrawal ({pendingPayoutRequests.length})</p>
                </div>
                <div className="bg-emerald-200 text-emerald-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{pendingPayoutRequests.length}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingPayoutRequests.map(tx => {
                  const loc = locationMap.get(tx.locationId);
                  return (
                    <div key={tx.id} className="bg-white p-5 rounded-[24px] border-2 border-emerald-200 shadow-sm">
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
                      <div className="bg-emerald-50 p-4 rounded-xl mb-3 text-center">
                        <p className="text-[8px] font-black text-emerald-400 uppercase">{t.payoutAmount}</p>
                        <p className="text-2xl font-black text-emerald-700">TZS {(tx.payoutAmount || 0).toLocaleString()}</p>
                        <p className="text-[8px] font-bold text-slate-400 mt-1">
                          {lang === 'zh' ? '可用余额' : 'Available'}: TZS {(loc?.dividendBalance || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            onUpdateTransaction(tx.id, { approvalStatus: 'approved' });
                            if (loc && tx.payoutAmount) {
                              const newBalance = Math.max(0, (loc.dividendBalance || 0) - tx.payoutAmount);
                              onUpdateLocations(locations.map(l => l.id === loc.id ? { ...l, dividendBalance: newBalance, isSynced: false } : l));
                            }
                          }}
                          className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase"
                        >
                          ✓ {t.approveBtn}
                        </button>
                        <button
                          onClick={() => onUpdateTransaction(tx.id, { approvalStatus: 'rejected' })}
                          className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[9px] font-black uppercase"
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
        <div className="bg-[#f5f7fa] p-8 md:p-12 rounded-[50px] shadow-silicone border border-white/80 space-y-10 animate-in zoom-in-95">
          <div className="text-center">
            <div className="w-20 h-20 bg-silicone-gradient rounded-[30px] flex items-center justify-center text-indigo-600 mx-auto mb-6 shadow-silicone border border-white/60">
              <Banknote size={40} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{t.dailySettlement}</h2>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">{todayStr} • {todayDriverTxs.length} Collections</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-[#f0f2f5] p-6 rounded-[35px] shadow-silicone-pressed">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">{t.revenue}</p>
              <p className="text-xl font-black text-slate-800">TZS {todayDriverTxs.reduce((sum, tx) => sum + tx.revenue, 0).toLocaleString()}</p>
            </div>
            <div className="bg-silicone-gradient p-6 rounded-[35px] shadow-silicone border border-white/60">
              <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 tracking-widest">{t.cashInHand}</p>
              <p className="text-xl font-black text-indigo-600">TZS {todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0).toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-[#f0f2f5] p-8 rounded-[40px] shadow-silicone-pressed border border-white/20">
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-4 tracking-widest text-center">{t.inputCash} (TZS Notes)</label>
              <input
                type="number"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                className="w-full text-5xl font-black bg-transparent text-center outline-none text-slate-800 placeholder:text-slate-300"
                placeholder="0"
              />
            </div>
            <div className="bg-[#f0f2f5] p-8 rounded-[40px] shadow-silicone-pressed border border-white/20">
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-4 tracking-widest text-center">{t.inputCoins} (TZS Coins)</label>
              <input
                type="number"
                value={actualCoins}
                onChange={e => setActualCoins(e.target.value)}
                className="w-full text-5xl font-black bg-transparent text-center outline-none text-slate-800 placeholder:text-slate-300"
                placeholder="0"
              />
            </div>
          </div>

          {actualCash && (
            <div className={`p-8 rounded-[40px] flex justify-between items-center animate-in slide-in-from-top-4 shadow-silicone border border-white/40 ${parseInt(actualCash) + (parseInt(actualCoins) || 0) === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <div>
                <p className={`text-[10px] font-black uppercase ${parseInt(actualCash) + (parseInt(actualCoins) || 0) === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'text-emerald-400' : 'text-rose-400'}`}>Variance</p>
                <p className={`text-2xl font-black ${parseInt(actualCash) + (parseInt(actualCoins) || 0) === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'text-emerald-600' : 'text-rose-600'}`}>TZS {(parseInt(actualCash) + (parseInt(actualCoins) || 0) - todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0)).toLocaleString()}</p>
              </div>
              <div className={`p-4 rounded-2xl shadow-silicone-sm ${parseInt(actualCash) + (parseInt(actualCoins) || 0) === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? 'bg-white text-emerald-500' : 'bg-white text-rose-500'}`}>
                {parseInt(actualCash) + (parseInt(actualCoins) || 0) === todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0) ? <ThumbsUp size={32} /> : <AlertTriangle size={32} />}
              </div>
            </div>
          )}

          <button
            disabled={!actualCash || !actualCoins}
            onClick={() => {
              const totalNet = todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0);
              const actual = (parseInt(actualCash) || 0) + (parseInt(actualCoins) || 0);
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
                actualCash: parseInt(actualCash) || 0,
                actualCoins: parseInt(actualCoins) || 0,
                shortage: actual - totalNet,
                status: 'pending',
                timestamp: new Date().toISOString(),
                isSynced: false,
              };
              onSaveSettlement(settlement);
              alert('✅ Settlement submitted! Waiting for approval.');
              setActualCash('');
              setActualCoins('');
            }}
            className="w-full py-7 bg-silicone-gradient text-indigo-600 rounded-[40px] font-black uppercase text-sm shadow-silicone hover:shadow-silicone-sm active:shadow-silicone-pressed border border-white/80 transition-all disabled:opacity-30"
          >
            ✓ Submit Settlement
          </button>
        </div>
      )}
    </div>
  );
};

export default SettlementTab;
