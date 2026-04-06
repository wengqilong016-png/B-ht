import React, { Suspense, lazy, useMemo, useState } from 'react';
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
  ADMIN_SECONDARY_NAV,
  buildAdminPrimaryNav,
  type AdminView,
} from './adminShellConfig';
import { calculateAdminApprovalBadge } from './adminShellViewState';
import AdminShellViewRenderer from './renderAdminShellView';
import AdminAIAssistant from './components/AdminAIAssistant';

const AccountSettings = lazy(() => import('../components/AccountSettings'));

const AppAdminShell: React.FC = () => {
  const { currentUser, lang, setLang, handleLogout, activeDriverId } = useAuth();
  const {
    isOnline,
    locations,
    drivers,
    transactions,
    dailySettlements,
    aiLogs,
    filteredLocations,
    filteredDrivers,
    filteredTransactions,
    filteredSettlements,
    unsyncedCount,
  } = useAppData();
  const {
    syncOfflineData,
    updateDrivers,
    updateLocations,
    deleteLocations,
    deleteDrivers,
    updateTransaction,
    logAI,
  } = useMutations();
  const [view, setView] = useState<AdminView>('dashboard');
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  const syncStatus = useSyncStatus({ syncMutation: syncOfflineData, isOnline, unsyncedCount, userId: currentUser.id });
  const t = TRANSLATIONS[lang];
  const totalApprovalBadge = calculateAdminApprovalBadge(transactions, dailySettlements);
  const adminNavItems = useMemo(() => buildAdminPrimaryNav(totalApprovalBadge), [totalApprovalBadge]);
  const pageTitle = useMemo(() => {
    const titles: Record<AdminView, string> = {
      dashboard: t.actionCenter,
      settlement: t.approvalCenter,
      map: t.mapRoutes,
      sites: t.siteManagement,
      team: t.teamManagement,
      collect: t.collectEntry,
      debt: t.financeManagement,
      history: t.historyLog,
      monthly: '月度报表',
    };
    return titles[view];
  }, [t, view]);
  const navStatByView: Partial<Record<AdminView, { value: number; label: string }>> = {
    settlement: { value: totalApprovalBadge, label: t.pendingApproval },
    map: { value: locations.filter(location => location.coords).length, label: t.mappedSites },
    sites: { value: filteredLocations.length || locations.length, label: t.totalSites },
    team: { value: filteredDrivers.length || drivers.length, label: t.totalDrivers },
    history: { value: unsyncedCount, label: t.unsyncedLabel },
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <aside className="hidden md:flex flex-col w-[220px] lg:w-[240px] bg-slate-950 border-r border-slate-800 flex-shrink-0 h-full z-40">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-400 text-slate-950 p-2 rounded-xl flex-shrink-0 shadow-lg shadow-amber-500/20">
              <Crown size={16} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black text-white leading-tight">BAHATI JACKPOTS</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider leading-tight">{t.adminConsole}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {adminNavItems.map((item) => {
            const active = view === item.id;
            const itemLabel = lang === 'zh' ? item.label : item.labelEn || item.label;
            const stat = navStatByView[item.id];
            const statVisible = !(item.id === 'settlement' && item.badge && item.badge > 0);
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as AdminView)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-colors relative group ${
                  active
                    ? 'bg-white text-slate-950'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase leading-tight truncate">{itemLabel}</span>
                  {stat && statVisible && (
                    <span className={`mt-1 block text-[8px] font-bold uppercase truncate ${active ? 'text-slate-500' : 'text-slate-600 group-hover:text-slate-300'}`}>
                      {stat.value} {stat.label}
                    </span>
                  )}
                </div>
                {item.badge && item.badge > 0 && (
                  <span className={`ml-auto flex-shrink-0 w-5 h-5 rounded-full text-[8px] font-black flex items-center justify-center ${active ? 'bg-slate-950 text-white' : 'bg-amber-500 text-white'}`}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}
          <div className="h-px bg-slate-800 my-2" />
          {ADMIN_SECONDARY_NAV.map((item) => {
            const active = view === item.id;
            const itemLabel = lang === 'zh' ? item.label : item.labelEn || item.label;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as AdminView)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors ${
                  active
                    ? 'bg-white text-slate-950'
                    : 'text-slate-500 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="text-[10px] font-black uppercase leading-tight truncate">{itemLabel}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-2">
          <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" fullWidth />
          <div className="flex items-center gap-2 px-2">
            <div className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center font-black text-xs flex-shrink-0">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black text-white truncate">{currentUser.name}</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase">{t.adminUser}</p>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-1 bg-white/5 rounded-lg text-slate-300 hover:text-white transition-colors"><Globe size={12}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="p-1 bg-white/5 rounded-lg text-slate-300 hover:text-white transition-colors"><Settings size={12}/></button>
              <button onClick={handleLogout} className="p-1 bg-rose-500/10 rounded-lg border border-rose-500/20 text-rose-300 hover:text-rose-200 transition-colors"><LogOut size={12}/></button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="border-b flex-shrink-0 z-30 bg-white/95 backdrop-blur border-slate-200 pt-[max(env(safe-area-inset-top),0px)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="md:hidden flex items-center gap-2">
                <div className="bg-slate-900 text-amber-400 p-1.5 rounded-xl">
                  <Crown size={14} fill="currentColor" />
                </div>
                <span className="text-xs font-black text-slate-800">BAHATI</span>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">{t.operationsConsole}</p>
                <p className="text-sm font-black text-slate-900 uppercase">{pageTitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex">
                <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" />
              </div>
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900"><Globe size={15}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900"><Settings size={15}/></button>
              <button onClick={handleLogout} className="p-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 hover:text-rose-700"><LogOut size={15}/></button>
            </div>
          </div>
          <div className="md:hidden grid grid-cols-5 gap-1 border-t border-slate-200 px-2 py-2">
            {adminNavItems.map((item) => (
              (() => {
                const stat = navStatByView[item.id];
                const statVisible = !(item.id === 'settlement' && item.badge && item.badge > 0);
                return (
              <button
                key={item.id}
                onClick={() => setView(item.id as AdminView)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[7px] font-black uppercase whitespace-nowrap transition-all relative ${
                  view === item.id ? 'bg-slate-900 text-white' : 'text-slate-400'
                }`}
              >
                {item.icon}
                <span>{lang === 'zh' ? item.label : item.labelEn || item.label}</span>
                {stat && statVisible && (
                  <span className={`text-[6px] font-bold normal-case ${view === item.id ? 'text-slate-300' : 'text-slate-500'}`}>
                    {stat.value}
                  </span>
                )}
                {item.badge && item.badge > 0 && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-[6px] font-black flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
                );
              })()
            ))}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#f3f5f8]">
          <div className="p-3 pb-[max(7rem,calc(7rem+env(safe-area-inset-bottom)))] md:p-5 lg:p-6 max-w-7xl mx-auto">
            <Suspense fallback={<ShellLoadingFallback />}>
              <AdminShellViewRenderer
                view={view}
                onSetView={setView}
              />
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
          onPhoneUpdated={async (driverId, phone) => {
            const updated = drivers.map((d) => d.id === driverId ? { ...d, phone } : d);
            await updateDrivers.mutateAsync(updated);
          }}
        />
      )}

      {/* Admin AI Assistant — floating panel */}
      <AdminAIAssistant lang={lang} />
    </div>
  );
};

export default AppAdminShell;
