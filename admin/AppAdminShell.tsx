import React, { Suspense, lazy, useState, useMemo } from 'react';
import {
  LogOut, Globe,
  Crown, Settings,
} from 'lucide-react';
import { TRANSLATIONS } from '../types';
import { useSyncStatus } from '../hooks/useSyncStatus';
import SyncStatusPill from '../shared/SyncStatusPill';
import ShellLoadingFallback from '../shared/ShellLoadingFallback';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import {
  ADMIN_PAGE_TITLES,
  ADMIN_SECONDARY_NAV,
  buildAdminPrimaryNav,
  mapAdminViewToDashboardTab,
  type AdminView,
} from './adminShellConfig';
import { calculateAdminApprovalBadge, isDashboardBackedAdminView } from './adminShellViewState';

const Dashboard = lazy(() => import('../components/Dashboard'));
const CollectionForm = lazy(() => import('../components/CollectionForm'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const FinancialReports = lazy(() => import('../components/FinancialReports'));
const AIHub = lazy(() => import('../components/ai-hub'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const BillingReconciliation = lazy(() => import('../components/BillingReconciliation'));
const DriverManagement = lazy(() => import('../components/driver-management'));
const AccountSettings = lazy(() => import('../components/AccountSettings'));
const PwaInstallPrompt = lazy(() => import('../components/PwaInstallPrompt'));
const LocationChangeReview = lazy(() => import('./pages/LocationChangeReview'));
const QueueDiagnostics = lazy(() => import('./components/QueueDiagnostics'));
const FleetDiagnostics = lazy(() => import('./components/FleetDiagnostics'));
const HealthAlerts = lazy(() => import('./components/HealthAlerts'));
const AuditTrail = lazy(() => import('./components/AuditTrail'));
const SupportCases = lazy(() => import('./components/SupportCases'));
const CaseDetail = lazy(() => import('./components/CaseDetail'));

const AppAdminShell: React.FC = () => {
  const { currentUser, lang, setLang, handleLogout, activeDriverId } = useAuth();
  const {
    isOnline,
    locations, drivers, transactions, dailySettlements, aiLogs,
    filteredLocations, filteredDrivers, filteredTransactions, filteredSettlements,
    unsyncedCount,
  } = useAppData();
  const {
    syncOfflineData, updateDrivers, updateLocations, deleteLocations, deleteDrivers,
    updateTransaction, saveSettlement, logAI,
  } = useMutations();
  const t = TRANSLATIONS[lang];
  const [view, setView] = useState<AdminView>('dashboard');
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [aiContextId, setAiContextId] = useState<string>('');
  const [auditCaseFilter, setAuditCaseFilter] = useState<string>('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');

  const syncStatus = useSyncStatus({ syncMutation: syncOfflineData, isOnline, unsyncedCount, userId: currentUser.id });

  const totalApprovalBadge = calculateAdminApprovalBadge(transactions, dailySettlements);

  const adminNavItems = useMemo(() => buildAdminPrimaryNav(totalApprovalBadge), [totalApprovalBadge]);

  const showDashboard = isDashboardBackedAdminView(view);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f3f5f8]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-[180px] lg:w-[200px] bg-[#f3f5f8] border-r border-slate-200 flex-shrink-0 h-full z-40">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-[10px] flex-shrink-0 shadow-field">
              <Crown size={16} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black text-slate-800 leading-tight">BAHATI JACKPOTS</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Admin Console</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
          {adminNavItems.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-subcard text-left transition-colors relative group ${
                  active
                    ? 'bg-white text-indigo-600 shadow-silicone-sm border border-white/80'
                    : 'text-slate-500 hover:bg-white/60 hover:text-indigo-600'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="text-[10px] font-black uppercase leading-tight truncate">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span className={`ml-auto flex-shrink-0 w-5 h-5 rounded-full text-[8px] font-black flex items-center justify-center ${active ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-500 text-white'}`}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}
          <div className="h-px bg-slate-200 my-2" />
          {ADMIN_SECONDARY_NAV.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-subcard text-left transition-colors ${
                  active
                    ? 'bg-white text-indigo-600 shadow-silicone-sm border border-white/80'
                    : 'text-slate-400 hover:bg-white/60 hover:text-slate-600'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="text-[10px] font-black uppercase leading-tight truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-2">
          <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" fullWidth />
          <Suspense fallback={null}>
            <PwaInstallPrompt variant="light" lang={lang} />
          </Suspense>
          <div className="flex items-center gap-2 px-2">
            <div className="w-7 h-7 rounded-subcard bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs flex-shrink-0 shadow-silicone-sm">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black text-slate-800 truncate">{currentUser.name}</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase">Admin User</p>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-1 bg-white rounded-lg shadow-silicone-sm text-slate-500 hover:text-indigo-600 transition-colors"><Globe size={12}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="p-1 bg-white rounded-lg shadow-silicone-sm text-slate-500 hover:text-indigo-600 transition-colors"><Settings size={12}/></button>
              <button onClick={handleLogout} className="p-1 bg-rose-50 rounded-lg border border-rose-100 text-rose-500 hover:text-rose-700 transition-colors"><LogOut size={12}/></button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="border-b flex-shrink-0 z-30 bg-[#f3f5f8] border-slate-200">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="md:hidden flex items-center gap-2">
                <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-[10px] shadow-field">
                  <Crown size={14} fill="currentColor" />
                </div>
                <span className="text-xs font-black text-slate-800">BAHATI</span>
              </div>
              <div className="hidden md:block">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{ADMIN_PAGE_TITLES[view] || 'ADMIN'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex">
                <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" />
              </div>
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 rounded-subcard bg-white text-slate-600 hover:text-indigo-600 shadow-silicone-sm"><Globe size={15}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="p-2 rounded-subcard bg-white text-slate-600 hover:text-indigo-600 shadow-silicone-sm"><Settings size={15}/></button>
              <button onClick={handleLogout} className="p-2 rounded-subcard bg-rose-50 border border-rose-100 text-rose-500 hover:text-rose-700"><LogOut size={15}/></button>
            </div>
          </div>
          {/* Mobile nav */}
          <div className="md:hidden flex border-t border-slate-200 overflow-x-auto scrollbar-hide">
            {adminNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id as any)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[7px] font-black uppercase whitespace-nowrap transition-all flex-shrink-0 relative ${
                  view === item.id ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'
                }`}
              >
                {item.icon}
                <span>{item.labelEn}</span>
                {item.badge && item.badge > 0 && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-[6px] font-black flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#f3f5f8]">
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Suspense fallback={<ShellLoadingFallback />}>
              {showDashboard && (
                <Dashboard
                  transactions={filteredTransactions}
                  drivers={filteredDrivers}
                  locations={filteredLocations}
                  dailySettlements={filteredSettlements}
                  aiLogs={aiLogs}
                  currentUser={currentUser}
                  onUpdateDrivers={(d) => updateDrivers.mutateAsync(d).then(() => {})}
                  onUpdateLocations={(l) => updateLocations.mutate(l)}
                  onDeleteLocations={(ids) => deleteLocations.mutate(ids)}
                  onUpdateTransaction={(id, updates) => updateTransaction.mutate({txId: id, updates})}
                  onNewTransaction={() => {}}
                  onSaveSettlement={(s) => saveSettlement.mutate(s)}
                  onSync={async () => syncOfflineData.mutate()}
                  isSyncing={syncOfflineData.isPending}
                  offlineCount={unsyncedCount}
                  lang={lang}
                  onNavigate={(v) => setView(v as any)}
                  initialTab={mapAdminViewToDashboardTab(view)}
                  hideTabs={true}
                />
              )}
              {view === 'team' && (
                <DriverManagement
                  drivers={filteredDrivers}
                  locations={locations}
                  transactions={filteredTransactions}
                  dailySettlements={filteredSettlements}
                  onUpdateDrivers={(d) => updateDrivers.mutateAsync(d).then(() => {})}
                  onUpdateLocations={(l) => updateLocations.mutate(l)}
                  onDeleteDrivers={(ids) => deleteDrivers.mutate(ids)}
                />
              )}
              {view === 'billing' && (
                <BillingReconciliation
                  drivers={filteredDrivers}
                  transactions={filteredTransactions}
                  dailySettlements={filteredSettlements}
                />
              )}
              {view === 'collect' && (
                <CollectionForm
                  locations={filteredLocations}
                  currentDriver={drivers.find(d => d.id === activeDriverId) || drivers[0]}
                  onSubmit={() => syncOfflineData.mutate()}
                  lang={lang}
                  onLogAI={(l) => logAI.mutate(l)}
                  isOnline={isOnline}
                  allTransactions={filteredTransactions}
                  onRegisterMachine={async (loc) => {
                    const newLoc = { ...loc, isSynced: false, assignedDriverId: activeDriverId };
                    updateLocations.mutate([...locations, newLoc]);
                  }}
                />
              )}
              {view === 'history' && (
                <TransactionHistory transactions={filteredTransactions} locations={locations} onAnalyze={() => {}} />
              )}
              {view === 'reports' && (
                <FinancialReports transactions={filteredTransactions} drivers={filteredDrivers} locations={filteredLocations} dailySettlements={filteredSettlements} lang={lang} />
              )}
              {view === 'debt' && (
                <DebtManager drivers={filteredDrivers} locations={filteredLocations} currentUser={currentUser} onUpdateLocations={(l) => updateLocations.mutate(l)} onUpdateDrivers={(d) => updateDrivers.mutateAsync(d).then(() => {})} lang={lang} />
              )}
              {view === 'ai' && !showDashboard && (
                <AIHub
                  drivers={filteredDrivers}
                  locations={filteredLocations}
                  transactions={filteredTransactions}
                  onLogAI={(l) => logAI.mutate(l)}
                  currentUser={currentUser}
                  initialContextId={aiContextId}
                  onClearContext={() => setAiContextId('')}
                />
              )}
              {view === 'change-review' && (
                <LocationChangeReview
                  locations={locations}
                  lang={lang}
                />
              )}
              {view === 'diagnostics' && (
                <QueueDiagnostics />
              )}
              {view === 'fleet-diagnostics' && (
                <FleetDiagnostics />
              )}
              {view === 'health-alerts' && (
                <HealthAlerts />
              )}
              {view === 'support-cases' && (
                <SupportCases
                  onNavigateToAudit={(caseId) => {
                    setAuditCaseFilter(caseId);
                    setView('audit-trail');
                  }}
                  onNavigateToCaseDetail={(caseId) => {
                    setSelectedCaseId(caseId);
                    setView('case-detail');
                  }}
                />
              )}
              {view === 'case-detail' && selectedCaseId && (
                <CaseDetail
                  caseId={selectedCaseId}
                  onBack={() => setView('support-cases')}
                  onNavigateToAudit={(caseId) => {
                    setAuditCaseFilter(caseId);
                    setView('audit-trail');
                  }}
                  currentOperator={currentUser.id}
                />
              )}
              {view === 'audit-trail' && (
                <AuditTrail
                  initialCaseFilter={auditCaseFilter}
                  onCaseFilterConsumed={() => setAuditCaseFilter('')}
                  onNavigateToCases={() => setView('support-cases')}
                />
              )}
            </Suspense>
          </div>
        </main>
      </div>

      {showAccountSettings && currentUser && (
        <AccountSettings
          currentUser={currentUser}
          lang={lang}
          isOnline={isOnline}
          onClose={() => setShowAccountSettings(false)}
          onPhoneUpdated={(driverId, phone) => {
            const updated = drivers.map(d => d.id === driverId ? { ...d, phone } : d);
            updateDrivers.mutate(updated);
          }}
        />
      )}
    </div>
  );
};

export default AppAdminShell;
