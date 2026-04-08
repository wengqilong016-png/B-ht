import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  LogOut, Globe,
  Crown, Settings
} from 'lucide-react';
import { TRANSLATIONS } from '../types';
import { useSyncStatus } from '../hooks/useSyncStatus';
import ShellLoadingFallback from '../shared/ShellLoadingFallback';
import {
  AppShell,
  ShellSidebar,
  ShellHeader,
  ShellMobileNav,
  ShellMainContent,
  type SidebarNavItem,
  type MobileNavItem,
} from '../shared/layout';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { getTodayLocalDate } from '../utils/dateUtils';
import { useMutations } from '../contexts/MutationContext';
import { DRIVER_NAV_ITEMS, type DriverView } from './driverShellConfig';
import DriverShellViewRenderer from './renderDriverShellView';
import DriverAIAssistPanel from './components/DriverAIAssistPanel';

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
  const todayStr = getTodayLocalDate();
  const assignedMachineCount = filteredLocations.length;
  const todayCollectionCount = filteredTransactions.filter((tx) => tx.driverId === activeDriverId && tx.timestamp.startsWith(todayStr) && (tx.type === undefined || tx.type === 'collection')).length;
  const pendingSettlementCount = filteredSettlements.filter((settlement) => settlement.driverId === activeDriverId && settlement.status === 'pending').length;
  const navStatByView: Partial<Record<DriverView, { value: number; label: string }>> = {
    collect: { value: todayCollectionCount, label: t.todaysCollections },
    settlement: { value: pendingSettlementCount, label: t.pendingSettlementShort },
    history: { value: unsyncedCount, label: t.unsyncedLabel },
    status: { value: assignedMachineCount, label: t.assignedMachines },
  };

  // Build sidebar nav items
  const sidebarNav: SidebarNavItem[] = useMemo(
    () =>
      DRIVER_NAV_ITEMS.map((item) => ({
        id: item.id,
        icon: item.icon,
        label: item.getLabel(lang, t),
        stat: navStatByView[item.id],
      })),
    [lang, t, navStatByView]
  );

  // Build mobile nav items
  const mobileNav: MobileNavItem[] = useMemo(
    () =>
      DRIVER_NAV_ITEMS.map((item) => ({
        id: item.id,
        icon: item.icon,
        label: item.getLabel(lang, t),
        stat: navStatByView[item.id],
      })),
    [lang, t, navStatByView]
  );

  const handleSetView = (id: string) => setView(id as DriverView);

  return (
    <AppShell>
      <ShellSidebar
        brandTitle="Bahati Ops"
        brandSubtitle={currentUser.name}
        primaryNav={sidebarNav}
        activeView={view}
        onSelectView={handleSetView}
        syncStatus={syncStatus}
        lang={lang}
        bottomContent={
          <div className="space-y-1">
            <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="flex w-full items-center gap-3 rounded-subcard px-3 py-2.5 text-left text-slate-400 hover:bg-white/5 hover:text-white">
              <Globe size={15} />
              <span className="text-caption uppercase">{t.language}</span>
            </button>
            <button onClick={() => setShowAccountSettings(true)} className="flex w-full items-center gap-3 rounded-subcard px-3 py-2.5 text-left text-slate-400 hover:bg-white/5 hover:text-white">
              <Settings size={15} />
              <span className="text-caption uppercase">{t.settings}</span>
            </button>
            <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-subcard px-3 py-2.5 text-left text-rose-300 hover:bg-rose-500/10 hover:text-rose-200">
              <LogOut size={15} />
              <span className="text-caption uppercase">{t.logout}</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 flex min-w-0 flex-col overflow-hidden">
        <ShellHeader
          subtitle={t.driverWorkspace}
          title={DRIVER_NAV_ITEMS.find(item => item.id === view)?.getLabel(lang, t) ?? ''}
          syncStatus={syncStatus}
          lang={lang}
          showMobileBrand={false}
          actions={
            <>
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900"><Globe size={15}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900"><Settings size={15}/></button>
              <button onClick={handleLogout} className="p-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 hover:text-rose-700"><LogOut size={15}/></button>
            </>
          }
        />

        <ShellMainContent hasBottomNav>
          <Suspense fallback={<ShellLoadingFallback />}>
            <DriverShellViewRenderer
              view={view}
              onSetView={setView}
            />
          </Suspense>
        </ShellMainContent>

        <ShellMobileNav
          items={mobileNav}
          activeView={view}
          onSelectView={handleSetView}
          position="bottom"
          lang={lang}
        />
      </div>

      {showAccountSettings && currentUser && (
        <AccountSettings
          currentUser={currentUser}
          lang={lang}
          isOnline={isOnline}
          onClose={() => setShowAccountSettings(false)}
          onPhoneUpdated={async (driverId, phone) => {
            const updated = drivers.map(d => d.id === driverId ? { ...d, phone } : d);
            await updateDrivers.mutateAsync(updated);
          }}
        />
      )}

      <DriverAIAssistPanel
        lang={lang}
        isOnline={isOnline}
        unsyncedCount={unsyncedCount}
        filteredLocations={filteredLocations}
        filteredTransactions={filteredTransactions}
        filteredSettlements={filteredSettlements}
        activeDriverId={activeDriverId ?? ''}
      />
    </AppShell>
  );
};

export default AppDriverShell;
