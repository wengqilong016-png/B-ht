import {
  LogOut, Globe,
  Settings,
} from 'lucide-react';
import React, { Suspense, lazy, useMemo, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import { useSyncStatus } from '../hooks/useSyncStatus';
import {
  AppShell,
  ShellSidebar,
  ShellHeader,
  ShellMobileNav,
  ShellMainContent,
  type SidebarNavItem,
  type MobileNavItem,
} from '../shared/layout';
import ShellLoadingFallback from '../shared/ShellLoadingFallback';
import { TRANSLATIONS } from '../types';

import {
  ADMIN_SECONDARY_NAV,
  buildAdminPrimaryNav,
  type AdminView,
} from './adminShellConfig';
import { calculateAdminApprovalBadge } from './adminShellViewState';
import AdminAIAssistant from './components/AdminAIAssistant';
import AdminShellViewRenderer from './renderAdminShellView';

const AccountSettings = lazy(() => import('../components/AccountSettings'));

const AppAdminShell: React.FC = () => {
  const { currentUser, lang, setLang, handleLogout } = useAuth();
  const {
    isOnline,
    locations,
    drivers,
    transactions,
    dailySettlements,
    filteredLocations,
    filteredDrivers,
    unsyncedCount,
  } = useAppData();
  const {
    syncOfflineData,
    updateDrivers,
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
  const navStatByView = useMemo<Partial<Record<AdminView, { value: number; label: string }>>>(
    () => ({
      settlement: { value: totalApprovalBadge, label: t.pendingApproval },
      map: { value: locations.filter(location => location.coords).length, label: t.mappedSites },
      sites: { value: filteredLocations.length || locations.length, label: t.totalSites },
      team: { value: filteredDrivers.length || drivers.length, label: t.totalDrivers },
      history: { value: unsyncedCount, label: t.unsyncedLabel },
    }),
    [drivers.length, filteredDrivers.length, filteredLocations.length, locations, t, totalApprovalBadge, unsyncedCount]
  );

  // Build sidebar nav items with labels/stats resolved
  const primarySidebarNav: SidebarNavItem[] = useMemo(
    () =>
      adminNavItems.map((item) => ({
        id: item.id,
        icon: item.icon,
        label: lang === 'zh' ? item.label : item.labelEn || item.label,
        badge: item.badge,
        stat: navStatByView[item.id],
        hideStatOnBadge: item.id === 'settlement',
      })),
    [adminNavItems, lang, navStatByView]
  );

  const secondarySidebarNav: SidebarNavItem[] = useMemo(
    () =>
      ADMIN_SECONDARY_NAV.map((item) => ({
        id: item.id,
        icon: item.icon,
        label: lang === 'zh' ? item.label : item.labelEn || item.label,
      })),
    [lang]
  );

  // Mobile nav: primary items shown directly, secondary in overflow "More" menu
  const mobilePrimaryNav: MobileNavItem[] = useMemo(
    () =>
      adminNavItems.map((item) => ({
        id: item.id,
        icon: item.icon,
        label: lang === 'zh' ? item.label : item.labelEn || item.label,
        badge: item.badge,
        stat: navStatByView[item.id],
        hideStatOnBadge: item.id === 'settlement',
      })),
    [adminNavItems, lang, navStatByView]
  );

  const mobileOverflowNav: MobileNavItem[] = useMemo(
    () =>
      ADMIN_SECONDARY_NAV.map((item) => ({
        id: item.id,
        icon: item.icon,
        label: lang === 'zh' ? item.label : item.labelEn || item.label,
      })),
    [lang]
  );

  const handleSetView = (id: string) => setView(id as AdminView);

  return (
    <AppShell>
      <ShellSidebar
        brandTitle="BAHATI JACKPOTS"
        brandSubtitle={t.adminConsole}
        primaryNav={primarySidebarNav}
        secondaryNav={secondarySidebarNav}
        activeView={view}
        onSelectView={handleSetView}
        syncStatus={syncStatus}
        lang={lang}
        bottomContent={
          <div className="flex items-center gap-2 px-2">
            <div className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center font-black text-xs flex-shrink-0">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-black text-white truncate">{currentUser.name}</p>
              <p className="text-caption font-bold text-slate-500 uppercase">{t.adminUser}</p>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-1 bg-white/5 rounded-lg text-slate-300 hover:text-white transition-colors"><Globe size={12}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="p-1 bg-white/5 rounded-lg text-slate-300 hover:text-white transition-colors"><Settings size={12}/></button>
              <button onClick={handleLogout} className="p-1 bg-rose-500/10 rounded-lg border border-rose-500/20 text-rose-300 hover:text-rose-200 transition-colors"><LogOut size={12}/></button>
            </div>
          </div>
        }
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ShellHeader
          subtitle={t.operationsConsole}
          title={pageTitle}
          syncStatus={syncStatus}
          lang={lang}
          showMobileBrand
          actions={
            <>
              {/* Mobile user avatar indicator */}
              <div className="md:hidden w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-black text-xs flex-shrink-0">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900"><Globe size={15}/></button>
              <button onClick={() => setShowAccountSettings(true)} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900"><Settings size={15}/></button>
              <button onClick={handleLogout} className="p-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 hover:text-rose-700"><LogOut size={15}/></button>
            </>
          }
          belowHeader={
            <ShellMobileNav
              items={mobilePrimaryNav}
              overflowItems={mobileOverflowNav}
              activeView={view}
              onSelectView={handleSetView}
              position="top"
              lang={lang}
            />
          }
        />

        <ShellMainContent>
          <Suspense fallback={<ShellLoadingFallback />}>
            <AdminShellViewRenderer
              view={view}
              onSetView={setView}
            />
          </Suspense>
        </ShellMainContent>
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
    </AppShell>
  );
};

export default AppAdminShell;
