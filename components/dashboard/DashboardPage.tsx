import React, { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { Driver, Location, DailySettlement, MonthlyPayroll, Transaction, TRANSLATIONS } from '../../types';
import DriverManagement from '../driver-management';
import DashboardTabs from './DashboardTabs';
import OverviewTab from './OverviewTab';
import TrackingTab from './TrackingTab';
import SitesTab from './SitesTab';
import SettlementTab from './SettlementTab';
import AiLogsTab from './AiLogsTab';
import PayrollActionModal from './PayrollActionModal';
import { useDashboardData } from './hooks/useDashboardData';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/DataContext';
import { getTodayLocalDate } from '../../utils/dateUtils';
import { useMutations } from '../../contexts/MutationContext';
import {
  cancelMonthlyPayroll,
  createMonthlyPayroll,
  fetchMonthlyPayrolls,
  markMonthlyPayrollPaid,
} from '../../repositories/monthlyPayrollRepository';

export interface DashboardProps {
  onNavigate?: (view: any) => void;
  initialTab?: 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking';
  hideTabs?: boolean;
}

type TabKey = 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking';

type PayrollModalState = {
  mode: 'create' | 'pay' | 'cancel';
  driver: {
    id: string;
    name: string;
    baseSalary: number;
  };
  month: string;
  summary: {
    commission: number;
    loans: number;
    shortage: number;
    netPayable: number;
    collectionCount: number;
    totalRevenue: number;
  };
  record?: MonthlyPayroll | null;
};

const DashboardPage: React.FC<DashboardProps> = React.memo(({
  onNavigate,
  initialTab,
  hideTabs,
}) => {
  const { currentUser, lang } = useAuth();
  const t = TRANSLATIONS[lang];
  const queryClient = useQueryClient();
  const {
    filteredTransactions: transactions,
    filteredDrivers: drivers,
    filteredLocations: locations,
    filteredSettlements: dailySettlements,
    aiLogs,
    unsyncedCount,
    isOnline,
  } = useAppData();
  const {
    updateDrivers,
    updateLocations,
    deleteLocations,
    updateTransaction,
    createSettlement,
    reviewSettlement,
    approveExpenseRequest,
    reviewAnomalyTransaction,
    approveResetRequest,
    approvePayoutRequest,
    syncOfflineData,
  } = useMutations();

  const onUpdateDrivers = (driversToSave: Driver[]) => updateDrivers.mutateAsync(driversToSave).then(() => {});
  const onUpdateLocations = (locationsToSave: Location[]) => updateLocations.mutateAsync(locationsToSave).then(() => {});
  const onDeleteLocations = async (ids: string[]) => {
    await deleteLocations.mutateAsync(ids);
  };
  const onUpdateTransaction = (txId: string, updates: Partial<Transaction>) => updateTransaction.mutate({ txId, updates });
  const onCreateSettlement = async (settlement: DailySettlement) => {
    await createSettlement.mutateAsync(settlement);
  };
  const onReviewSettlement = async (settlementId: string, status: 'confirmed' | 'rejected') => {
    await reviewSettlement.mutateAsync({ settlementId, status });
  };
  const onApproveExpenseRequest = async (txId: string, approve: boolean) => {
    await approveExpenseRequest.mutateAsync({ txId, approve });
  };
  const onReviewAnomalyTransaction = async (txId: string, approve: boolean) => {
    await reviewAnomalyTransaction.mutateAsync({ txId, approve });
  };
  const onApproveResetRequest = async (txId: string, approve: boolean) => {
    await approveResetRequest.mutateAsync({ txId, approve });
  };
  const onApprovePayoutRequest = async (txId: string, approve: boolean) => {
    await approvePayoutRequest.mutateAsync({ txId, approve });
  };
  const onSync = async () => syncOfflineData.mutate();
  const isSyncing = syncOfflineData.isPending;
  const offlineCount = unsyncedCount;
  const isAdmin = currentUser.role === 'admin';
  const activeDriverId = currentUser.driverId ?? currentUser.id;
  const todayStr = getTodayLocalDate();
  const [pendingPayrollAction, setPendingPayrollAction] = useState<string | null>(null);
  const [payrollModalState, setPayrollModalState] = useState<PayrollModalState | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab || (isAdmin ? 'overview' : 'settlement'));

  // Local filter/sort state (kept here so useDashboardData can receive them)
  const [trackingSearch, setTrackingSearch] = useState('');
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<'all' | 'attention' | 'active' | 'stale'>('all');
  const [siteSearch, setSiteSearch] = useState('');
  const [siteFilterArea, setSiteFilterArea] = useState<string>('all');
  const [siteSort] = useState<{ key: 'name' | 'status' | 'lastScore' | 'commission'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [aiLogSearch, setAiLogSearch] = useState('');
  const [aiLogTypeFilter, setAiLogTypeFilter] = useState<'all' | 'image' | 'text'>('all');

  // Sync activeTab when initialTab prop changes
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isAdmin) setActiveTab('settlement');
  }, [isAdmin]);

  const {
    driverMap,
    locationMap,
    todayDriverTxs,
    myProfile,
    pendingExpenses,
    pendingSettlements,
    anomalyTransactions,
    pendingResetRequests,
    pendingPayoutRequests,
    todayDriverStats,
    payrollStats,
    allAreas,
    managedLocations,
    filteredAiLogs,
    bossStats,
    trackingDriverCards,
    trackingOverview,
    trackingVisibleLocations,
    trackingVisibleTransactions,
  } = useDashboardData({
    transactions,
    drivers,
    locations,
    dailySettlements,
    aiLogs,
    currentUser,
    todayStr,
    trackingSearch,
    trackingStatusFilter,
    siteSearch,
    siteFilterArea,
    siteSort,
    aiLogSearch,
    aiLogTypeFilter,
  });

  const { data: monthlyPayrolls = [] } = useQuery({
    queryKey: ['monthlyPayrolls'],
    queryFn: () => fetchMonthlyPayrolls(),
    enabled: isAdmin,
    staleTime: 1000 * 60,
  });

  const createPayrollMutation = useMutation({
    mutationFn: createMonthlyPayroll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthlyPayrolls'] });
    },
  });

  const markPayrollPaidMutation = useMutation({
    mutationFn: markMonthlyPayrollPaid,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthlyPayrolls'] });
    },
  });

  const cancelPayrollMutation = useMutation({
    mutationFn: ({ payrollId, note }: { payrollId: string; note?: string }) =>
      cancelMonthlyPayroll(payrollId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthlyPayrolls'] });
    },
  });

  const payrollRecordMap = useMemo(() => {
    const map = new Map<string, MonthlyPayroll>();
    for (const payroll of monthlyPayrolls) {
      map.set(`${payroll.driverId}:${payroll.month}`, payroll);
    }
    return map;
  }, [monthlyPayrolls]);

  const runPayrollAction = async (actionKey: string, action: () => Promise<unknown>) => {
    setPendingPayrollAction(actionKey);
    try {
      await action();
      return true;
    } catch (error) {
      console.error('Payroll action failed.', error);
      alert(lang === 'zh' ? '❌ 工资操作失败，请重试。' : '❌ Payroll action failed. Please retry.');
      return false;
    } finally {
      setPendingPayrollAction(current => (current === actionKey ? null : current));
    }
  };

  const submitPayrollModal = async (payload: {
    note?: string;
    paymentMethod?: MonthlyPayroll['paymentMethod'];
    paymentProofUrl?: string;
  }) => {
    if (!payrollModalState) return;

    const actionKey = `payroll:${payrollModalState.driver.id}:${payrollModalState.month}:${payrollModalState.mode}`;

    const succeeded = await runPayrollAction(actionKey, async () => {
      if (payrollModalState.mode === 'create') {
        await createPayrollMutation.mutateAsync({
          driverId: payrollModalState.driver.id,
          month: payrollModalState.month,
          baseSalary: payrollModalState.driver.baseSalary,
          commission: payrollModalState.summary.commission,
          privateLoanDeduction: payrollModalState.summary.loans,
          shortageDeduction: payrollModalState.summary.shortage,
          netPayable: payrollModalState.summary.netPayable,
          collectionCount: payrollModalState.summary.collectionCount,
          totalRevenue: payrollModalState.summary.totalRevenue,
          note: payload.note,
        });
        return;
      }

      if (!payrollModalState.record) {
        throw new Error('Payroll record unavailable');
      }

      if (payrollModalState.mode === 'pay') {
        await markPayrollPaidMutation.mutateAsync({
          payrollId: payrollModalState.record.id,
          paymentMethod: payload.paymentMethod || 'bank_transfer',
          note: payload.note,
          paymentProofUrl: payload.paymentProofUrl,
        });
        return;
      }

      await cancelPayrollMutation.mutateAsync({
        payrollId: payrollModalState.record.id,
        note: payload.note,
      });
    });

    if (succeeded) {
      setPayrollModalState(null);
    }
  };

  return (
    <div className="space-y-8">
      {payrollModalState && (
        <PayrollActionModal
          mode={payrollModalState.mode}
          driver={payrollModalState.driver}
          month={payrollModalState.month}
          summary={payrollModalState.summary}
          record={payrollModalState.record}
          isSubmitting={pendingPayrollAction === `payroll:${payrollModalState.driver.id}:${payrollModalState.month}:${payrollModalState.mode}`}
          lang={lang}
          onClose={() => setPayrollModalState(null)}
          onSubmit={submitPayrollModal}
        />
      )}

      <DashboardTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdmin={isAdmin}
        lang={lang}
        hideTabs={hideTabs}
      />

      {activeTab === 'overview' && isAdmin && (
        <OverviewTab
          bossStats={bossStats}
          todayDriverStats={todayDriverStats}
          locationMap={locationMap}
          transactions={transactions}
          locations={locations}
          drivers={drivers}
          dailySettlements={dailySettlements}
          monthlyPayrolls={monthlyPayrolls}
          unsyncedCount={unsyncedCount}
          lang={lang}
          onOpenTab={(tab) => setActiveTab(tab)}
        />
      )}

      {activeTab === 'tracking' && isAdmin && (
        <TrackingTab
          trackingDriverCards={trackingDriverCards}
          trackingOverview={trackingOverview}
          trackingVisibleLocations={trackingVisibleLocations}
          trackingVisibleTransactions={trackingVisibleTransactions}
          trackingSearch={trackingSearch}
          setTrackingSearch={setTrackingSearch}
          trackingStatusFilter={trackingStatusFilter}
          setTrackingStatusFilter={setTrackingStatusFilter}
          locations={locations}
          onUpdateLocations={onUpdateLocations}
          lang={lang}
        />
      )}

      {activeTab === 'locations' && isAdmin && (
                <SitesTab
                  managedLocations={managedLocations}
                  allAreas={allAreas}
                  siteSearch={siteSearch}
                  setSiteSearch={setSiteSearch}
          siteFilterArea={siteFilterArea}
          setSiteFilterArea={setSiteFilterArea}
          driverMap={driverMap}
                  drivers={drivers}
                  locations={locations}
                  onUpdateLocations={onUpdateLocations}
                  onDeleteLocations={onDeleteLocations}
                  transactions={transactions}
                  pendingResetRequests={pendingResetRequests}
                  pendingPayoutRequests={pendingPayoutRequests}
                  isOnline={isOnline}
                  lang={lang}
                />
      )}

      {activeTab === 'team' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          <DriverManagement />
          {/* Payroll section merged into fleet tab */}
          <div className="space-y-3 border-t border-slate-100 pt-5">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Receipt size={18} /></div>
                <div>
                  <h2 className="text-base font-black text-slate-900 uppercase">{t.payrollTitle}</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.payrollSubtitle}</p>
                </div>
              </div>
            <div className="grid grid-cols-1 gap-3">
              {payrollStats.map(({ driver, monthlyBreakdown }) => (
                <div key={driver.id} className="bg-white p-4 rounded-2xl border border-slate-200">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900 uppercase text-sm">{driver.name}</h3>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {monthlyBreakdown.length} {t.payrollMonths}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black uppercase text-slate-500">
                      {t.baseShort} {driver.baseSalary?.toLocaleString() || 0}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {monthlyBreakdown.map((m, i) => {
                      const record = payrollRecordMap.get(`${driver.id}:${m.month}`);
                      const summary = record
                        ? {
                            baseSalary: record.baseSalary,
                            commission: record.commission,
                            loans: record.privateLoanDeduction,
                            shortage: record.shortageDeduction,
                            netPayable: record.netPayable,
                            collectionCount: record.collectionCount,
                            totalRevenue: record.totalRevenue,
                          }
                        : {
                            baseSalary: driver.baseSalary || 0,
                            commission: m.commission,
                            loans: m.loans,
                            shortage: m.shortage,
                            netPayable: m.netPayout,
                            collectionCount: m.collectionCount,
                            totalRevenue: m.totalRevenue,
                          };

                      return (
                        <div key={i} className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                          <div className="flex justify-between items-start mb-2 gap-2">
                            <div>
                              <span className="text-[10px] font-black text-slate-400 uppercase">{m.month}</span>
                              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                {t.revenueShort} {summary.totalRevenue.toLocaleString()} · {summary.collectionCount} {t.collectionsShort}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs font-black text-indigo-600">TZS {summary.netPayable.toLocaleString()}</span>
                              {record && (
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                  record.status === 'paid'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : record.status === 'cancelled'
                                      ? 'bg-slate-200 text-slate-500'
                                      : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {record.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[8px] text-slate-400 mb-3">
                            <span>{t.baseShort}: {summary.baseSalary.toLocaleString()}</span>
                            <span>{t.commissionLabel}: {summary.commission.toLocaleString()}</span>
                            <span>{t.loansShort}: {summary.loans.toLocaleString()}</span>
                            <span>{t.shortageShort}: {summary.shortage.toLocaleString()}</span>
                          </div>
                          {record?.paidAt && (
                            <div className="mb-2 space-y-2">
                              <p className="text-[8px] font-bold text-emerald-600">
                                {t.paidAtLabel} {new Date(record.paidAt).toLocaleString()} · {record.paymentMethod || 'other'}
                              </p>
                              {record.paymentProofUrl && (
                                <img
                                  src={record.paymentProofUrl}
                                  alt="Payroll proof"
                                  className="w-full h-24 object-cover rounded-xl border border-slate-200"
                                />
                              )}
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => window.print()} className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase">PDF</button>
                            <button
                              onClick={() => {
                                const msg = `*PAYROLL ${m.month}*\nDriver: ${driver.name}\nBase: TZS ${summary.baseSalary.toLocaleString()}\nComm: TZS ${summary.commission.toLocaleString()}\nLoans: TZS ${summary.loans.toLocaleString()}\nShortage: TZS ${summary.shortage.toLocaleString()}\nNet: TZS ${summary.netPayable.toLocaleString()}`;
                                window.open(`https://wa.me/${driver.phone?.replace(/\+/g, '')}?text=${encodeURIComponent(msg)}`);
                              }}
                              className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-[9px] font-black uppercase"
                            >
                              WhatsApp
                            </button>
                            {(!record || record.status === 'cancelled') && (
                              <button
                                disabled={!!pendingPayrollAction}
                                onClick={() => setPayrollModalState({
                                  mode: 'create',
                                  driver: {
                                    id: driver.id,
                                    name: driver.name,
                                    baseSalary: summary.baseSalary,
                                  },
                                  month: m.month,
                                  summary,
                                  record: record || null,
                                })}
                                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase disabled:opacity-50"
                              >
                                {record?.status === 'cancelled' ? t.reopenPayroll : t.generatePayroll}
                              </button>
                            )}
                            {record?.status === 'pending' && (
                              <>
                                <button
                                  disabled={!!pendingPayrollAction}
                                  onClick={() => setPayrollModalState({
                                    mode: 'pay',
                                    driver: {
                                      id: driver.id,
                                      name: driver.name,
                                      baseSalary: summary.baseSalary,
                                    },
                                    month: m.month,
                                    summary,
                                    record,
                                  })}
                                  className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-[9px] font-black uppercase disabled:opacity-50"
                                >
                                  {t.markPaid}
                                </button>
                                <button
                                  disabled={!!pendingPayrollAction}
                                  onClick={() => setPayrollModalState({
                                    mode: 'cancel',
                                    driver: {
                                      id: driver.id,
                                      name: driver.name,
                                      baseSalary: summary.baseSalary,
                                    },
                                    month: m.month,
                                    summary,
                                    record,
                                  })}
                                  className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg text-[9px] font-black uppercase disabled:opacity-50"
                                >
                                  {t.cancelPayroll}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {monthlyBreakdown.length === 0 && <p className="col-span-2 text-center text-[10px] text-slate-300 font-black uppercase py-4">{t.noPayrollData}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settlement' && (
        <SettlementTab
          isAdmin={isAdmin}
          unsyncedCollectionsCount={unsyncedCount}
          pendingSettlements={pendingSettlements}
          pendingExpenses={pendingExpenses}
          anomalyTransactions={anomalyTransactions}
          pendingResetRequests={pendingResetRequests}
          pendingPayoutRequests={pendingPayoutRequests}
          payrollStats={payrollStats}
          driverMap={driverMap}
          locationMap={locationMap}
          todayDriverTxs={todayDriverTxs}
          myProfile={myProfile}
          currentUser={currentUser}
          activeDriverId={activeDriverId}
          todayStr={todayStr}
          onCreateSettlement={onCreateSettlement}
          onReviewSettlement={onReviewSettlement}
          onApproveExpenseRequest={onApproveExpenseRequest}
          onReviewAnomalyTransaction={onReviewAnomalyTransaction}
          onApproveResetRequest={onApproveResetRequest}
          onApprovePayoutRequest={onApprovePayoutRequest}
          isOnline={isOnline}
          lang={lang}
        />
      )}

      {activeTab === 'ai-logs' && isAdmin && (
        <AiLogsTab
          filteredAiLogs={filteredAiLogs}
          aiLogSearch={aiLogSearch}
          setAiLogSearch={setAiLogSearch}
          aiLogTypeFilter={aiLogTypeFilter}
          setAiLogTypeFilter={setAiLogTypeFilter}
          lang={lang}
        />
      )}
    </div>
  );
});

export default DashboardPage;
