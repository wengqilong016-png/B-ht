import React, { Suspense, lazy, useState } from 'react';
import {
  PlusCircle, CreditCard, LogOut, Globe, Loader2,
  Crown, History, Banknote, Settings, ClipboardList, UserCircle
} from 'lucide-react';
import { TRANSLATIONS } from '../types';
import { useSyncStatus } from '../hooks/useSyncStatus';
import SyncStatusPill from '../shared/SyncStatusPill';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';

const Dashboard = lazy(() => import('../components/Dashboard'));
const DriverCollectionFlow = lazy(() => import('../driver/pages/DriverCollectionFlow'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const AccountSettings = lazy(() => import('../components/AccountSettings'));
const PwaInstallPrompt = lazy(() => import('../components/PwaInstallPrompt'));
const LocationChangeRequestForm = lazy(() => import('../driver/components/LocationChangeRequestForm'));
const DriverStatusPanel = lazy(() => import('../driver/components/DriverStatusPanel'));

const LoadingFallback = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-12">
    <Loader2 size={32} className="text-indigo-600 animate-spin mb-4" />
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Module...</p>
  </div>
);

type DriverView = 'collect' | 'settlement' | 'debt' | 'history' | 'requests' | 'status';

const AppDriverShell: React.FC = () => {
  const { currentUser, lang, setLang, handleLogout, activeDriverId } = useAuth();
  const {
    isOnline,
    locations, drivers, transactions, dailySettlements, aiLogs,
    filteredLocations, filteredDrivers, filteredTransactions, filteredSettlements,
    unsyncedCount,
  } = useAppData();
  const {
    syncOfflineData, updateDrivers, updateLocations, deleteLocations,
    updateTransaction, saveSettlement, logAI,
  } = useMutations();
  const t = TRANSLATIONS[lang];
  const [view, setView] = useState<DriverView>('collect');
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  const syncStatus = useSyncStatus({ syncMutation: syncOfflineData, isOnline, unsyncedCount, userId: currentUser.id });

  return (
    <div className="flex h-screen overflow-hidden bg-[#f3f5f8]">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="border-b flex-shrink-0 z-30 bg-slate-900 border-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-[10px]">
                <Crown size={14} fill="currentColor" />
              </div>
              <div>
                <p className="text-[11px] font-black text-white leading-none">BAHATI</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">{currentUser.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="dark" />
              <Suspense fallback={null}>
                <PwaInstallPrompt variant="dark" lang={lang} />
              </Suspense>
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 rounded-subcard bg-white/10 text-white hover:bg-white/20"><Globe size={15}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="p-2 rounded-subcard bg-white/10 text-white hover:bg-white/20"><Settings size={15}/></button>
              <button onClick={handleLogout} className="p-2 rounded-subcard bg-rose-500/20 text-rose-400"><LogOut size={15}/></button>
            </div>
          </div>

          {/* Driver nav tabs */}
          <div className="flex border-t border-white/10 overflow-x-auto scrollbar-hide">
            {[
              { id: 'collect' as const, icon: <PlusCircle size={16}/>, label: t.collect },
              { id: 'settlement' as const, icon: <Banknote size={16}/>, label: t.dailySettlement },
              { id: 'debt' as const, icon: <CreditCard size={16}/>, label: t.debt },
              { id: 'history' as const, icon: <History size={16}/>, label: lang === 'sw' ? 'Historia' : '记录' },
              { id: 'requests' as const, icon: <ClipboardList size={16}/>, label: lang === 'sw' ? 'Maombi' : '申请' },
              { id: 'status' as const, icon: <UserCircle size={16}/>, label: t.driverStatus },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[9px] font-black uppercase transition-all flex-shrink-0 min-w-[3.5rem] ${
                  view === item.id ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-400'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#f3f5f8]">
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Suspense fallback={<LoadingFallback />}>
              {view === 'collect' && (
                <DriverCollectionFlow
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
              {view === 'settlement' && (
                <Dashboard
                  transactions={filteredTransactions}
                  drivers={filteredDrivers}
                  locations={filteredLocations}
                  dailySettlements={filteredSettlements}
                  aiLogs={aiLogs}
                  currentUser={currentUser}
                  onUpdateDrivers={(d) => updateDrivers.mutateAsync(d)}
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
                  initialTab="settlement"
                  hideTabs={true}
                />
              )}
              {view === 'debt' && (
                <DebtManager drivers={filteredDrivers} locations={filteredLocations} currentUser={currentUser} onUpdateLocations={(l) => updateLocations.mutate(l)} lang={lang} />
              )}
              {view === 'history' && (
                <TransactionHistory transactions={filteredTransactions} locations={locations} onAnalyze={() => {}} />
              )}
              {view === 'requests' && (
                <LocationChangeRequestForm
                  locations={filteredLocations}
                  currentUser={currentUser}
                  lang={lang}
                  isOnline={isOnline}
                />
              )}
              {view === 'status' && (
                <DriverStatusPanel
                  driver={drivers.find(d => d.id === activeDriverId)}
                  locations={locations}
                  transactions={filteredTransactions}
                  lang={lang}
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

export default AppDriverShell;
