import React, { Suspense, lazy, useState } from 'react';
import {
  LogOut, Globe,
  Crown, Settings
} from 'lucide-react';
import { TRANSLATIONS } from '../types';
import { useSyncStatus } from '../hooks/useSyncStatus';
import SyncStatusPill from '../shared/SyncStatusPill';
import ShellLoadingFallback from '../shared/ShellLoadingFallback';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import { DRIVER_NAV_ITEMS, type DriverView } from './driverShellConfig';
import DriverShellViewRenderer from './renderDriverShellView';

const AccountSettings = lazy(() => import('../components/AccountSettings'));

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
    updateTransaction, logAI,
  } = useMutations();
  const t = TRANSLATIONS[lang];
  const [view, setView] = useState<DriverView>('collect');
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  const syncStatus = useSyncStatus({ syncMutation: syncOfflineData, isOnline, unsyncedCount, userId: currentUser.id });
  const todayStr = new Date().toISOString().split('T')[0];
  const assignedMachineCount = filteredLocations.filter((location) => location.assignedDriverId === activeDriverId).length || filteredLocations.length;
  const todayCollectionCount = filteredTransactions.filter((tx) => tx.driverId === activeDriverId && tx.timestamp.startsWith(todayStr) && (tx.type === undefined || tx.type === 'collection')).length;
  const pendingSettlementCount = filteredSettlements.filter((settlement) => settlement.driverId === activeDriverId && settlement.status === 'pending').length;
  const navStatByView: Partial<Record<DriverView, { value: number; label: string }>> = {
    collect: { value: todayCollectionCount, label: t.todaysCollections },
    settlement: { value: pendingSettlementCount, label: t.pendingSettlementShort },
    history: { value: unsyncedCount, label: t.unsyncedLabel },
    status: { value: assignedMachineCount, label: t.assignedMachines },
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-800 bg-slate-950 text-white">
        <div className="border-b border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-400 p-2 text-slate-950 shadow-lg shadow-amber-500/20">
              <Crown size={16} fill="currentColor" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-white">Bahati Ops</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{currentUser.name}</p>
            </div>
          </div>
        </div>
        <div className="border-b border-slate-800 p-4">
          <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" fullWidth />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {DRIVER_NAV_ITEMS.map((item) => {
            const active = view === item.id;
            const stat = navStatByView[item.id];
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                  active
                    ? 'bg-white text-slate-950'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-black uppercase tracking-wide">{item.getLabel(lang, t)}</span>
                  {stat && (
                    <span className={`mt-1 block text-[8px] font-bold uppercase truncate ${active ? 'text-slate-500' : 'text-slate-600'}`}>
                      {stat.value} {stat.label}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-slate-800 p-3">
          <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-400 hover:bg-white/5 hover:text-white">
            <Globe size={15} />
            <span className="text-[10px] font-black uppercase">{t.language}</span>
          </button>
          <button onClick={() => setShowAccountSettings(true)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-400 hover:bg-white/5 hover:text-white">
            <Settings size={15} />
            <span className="text-[10px] font-black uppercase">{t.settings}</span>
          </button>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-rose-300 hover:bg-rose-500/10 hover:text-rose-200">
            <LogOut size={15} />
            <span className="text-[10px] font-black uppercase">{t.logout}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex min-w-0 flex-col overflow-hidden">
        <header className="z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-3 py-3 md:px-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{t.driverWorkspace}</p>
              <h1 className="truncate text-sm font-black uppercase text-slate-900">{DRIVER_NAV_ITEMS.find(item => item.id === view)?.getLabel(lang, t)}</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex">
                <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" />
              </div>
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 lg:hidden"><Globe size={15}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 lg:hidden"><Settings size={15}/></button>
            </div>
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto overflow-x-hidden bg-slate-100">
          <div className="mx-auto max-w-7xl p-3 pb-28 md:p-5 lg:p-6">
            <Suspense fallback={<ShellLoadingFallback />}>
              <DriverShellViewRenderer
                view={view}
                onSetView={setView}
              />
            </Suspense>
          </div>
        </main>

        <nav className="lg:hidden border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-5 gap-1">
            {DRIVER_NAV_ITEMS.map((item) => {
              const active = view === item.id;
              const stat = navStatByView[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[8px] font-black uppercase transition-colors ${
                    active ? 'bg-slate-900 text-white' : 'text-slate-500'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.getLabel(lang, t)}</span>
                  {stat && (
                    <span className={`text-[6px] font-bold normal-case ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      {stat.value}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
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
