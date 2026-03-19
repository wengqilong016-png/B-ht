import React, { useState, useEffect } from 'react';
import { Receipt } from 'lucide-react';
import { Transaction, Driver, Location, User as UserType, DailySettlement, AILog } from '../../types';
import DriverManagement from '../driver-management';
import DashboardTabs from './DashboardTabs';
import OverviewTab from './OverviewTab';
import TrackingTab from './TrackingTab';
import SitesTab from './SitesTab';
import SettlementTab from './SettlementTab';
import AiLogsTab from './AiLogsTab';
import { useDashboardData } from './hooks/useDashboardData';

export interface DashboardProps {
  transactions: Transaction[];
  drivers: Driver[];
  locations: Location[];
  dailySettlements: DailySettlement[];
  aiLogs: AILog[];
  currentUser: UserType;
  onUpdateDrivers: (drivers: Driver[]) => Promise<void>;
  onUpdateLocations: (locations: Location[]) => void;
  onDeleteLocations?: (ids: string[]) => void;
  onUpdateTransaction: (txId: string, updates: Partial<Transaction>) => void;
  onNewTransaction: (tx: Transaction) => void;
  onSaveSettlement: (settlement: DailySettlement) => void;
  onSync: () => Promise<void>;
  isSyncing: boolean;
  offlineCount: number;
  lang: 'zh' | 'sw';
  onNavigate?: (view: any) => void;
  initialTab?: 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking';
  hideTabs?: boolean;
}

type TabKey = 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking';

const DashboardPage: React.FC<DashboardProps> = React.memo(({
  transactions,
  drivers,
  locations,
  dailySettlements,
  aiLogs,
  currentUser,
  onUpdateDrivers,
  onUpdateLocations,
  onDeleteLocations,
  onUpdateTransaction,
  onNewTransaction,
  onSaveSettlement,
  onSync,
  isSyncing,
  offlineCount,
  lang,
  onNavigate,
  initialTab,
  hideTabs,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const activeDriverId = currentUser.driverId ?? currentUser.id;
  const todayStr = new Date().toISOString().split('T')[0];

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

  return (
    <div className="space-y-8">
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
          lang={lang}
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
          lang={lang}
        />
      )}

      {activeTab === 'team' && isAdmin && (
        <div className="space-y-8 animate-in fade-in">
          <DriverManagement drivers={drivers} transactions={transactions} onUpdateDrivers={onUpdateDrivers} />
          {/* Payroll section merged into fleet tab */}
          <div className="space-y-4 border-t border-slate-100 pt-6">
            <div className="bg-white p-5 rounded-[28px] border border-slate-200 flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Receipt size={18} /></div>
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase">Payroll</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Compensation Reports — Electronic Payslip</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {payrollStats.map(({ driver, monthlyBreakdown }) => (
                <div key={driver.id} className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
                  <h3 className="font-black text-slate-900 uppercase mb-3 text-sm">{driver.name}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {monthlyBreakdown.map((m, i) => (
                      <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex justify-between mb-1"><span className="text-[10px] font-black text-slate-400 uppercase">{m.month}</span><span className="text-xs font-black text-indigo-600">TZS {m.netPayout.toLocaleString()}</span></div>
                        <div className="grid grid-cols-3 gap-1 text-[8px] text-slate-400 mb-2">
                          <span>Base: {(driver.baseSalary || 0).toLocaleString()}</span>
                          <span>Comm: {m.commission.toLocaleString()}</span>
                          <span>Short: {m.shortage.toLocaleString()}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => window.print()} className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase">PDF</button>
                          <button onClick={() => {
                            const msg = `*PAYROLL ${m.month}*\nDriver: ${driver.name}\nBase: TZS ${(driver.baseSalary || 0).toLocaleString()}\nComm: TZS ${m.commission.toLocaleString()}\nNet: TZS ${m.netPayout.toLocaleString()}`;
                            window.open(`https://wa.me/${driver.phone?.replace(/\+/g, '')}?text=${encodeURIComponent(msg)}`);
                          }} className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-[9px] font-black uppercase">WhatsApp</button>
                        </div>
                      </div>
                    ))}
                    {monthlyBreakdown.length === 0 && <p className="col-span-2 text-center text-[10px] text-slate-300 font-black uppercase py-4">No payroll data</p>}
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
          pendingSettlements={pendingSettlements}
          pendingExpenses={pendingExpenses}
          anomalyTransactions={anomalyTransactions}
          pendingResetRequests={pendingResetRequests}
          pendingPayoutRequests={pendingPayoutRequests}
          payrollStats={payrollStats}
          driverMap={driverMap}
          locationMap={locationMap}
          locations={locations}
          todayDriverTxs={todayDriverTxs}
          myProfile={myProfile}
          currentUser={currentUser}
          activeDriverId={activeDriverId}
          todayStr={todayStr}
          onUpdateTransaction={onUpdateTransaction}
          onSaveSettlement={onSaveSettlement}
          onUpdateLocations={onUpdateLocations}
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
