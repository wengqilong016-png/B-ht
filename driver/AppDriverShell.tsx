import {
  LogOut, Globe, Type, Mail,
} from 'lucide-react';
import React, { Suspense, useMemo, useState, useEffect } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import { useToast } from '../contexts/ToastContext';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { updateUserEmail } from '../services/authService';
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
import { getTodayLocalDate } from '../utils/dateUtils';

import DriverAIAssistPanel from './components/DriverAIAssistPanel';
import { DRIVER_NAV_ITEMS, type DriverView } from './driverShellConfig';
import DriverShellViewRenderer from './renderDriverShellView';

const AppDriverShell: React.FC = () => {
  const { currentUser, lang, setLang, handleLogout, activeDriverId } = useAuth();
  const { showToast } = useToast();
  const t = TRANSLATIONS[lang];
  const {
    isOnline,
    filteredLocations, filteredTransactions, filteredSettlements,
    unsyncedCount,
  } = useAppData();
  const {
    syncOfflineData,
  } = useMutations();
  const [view, setView] = useState<DriverView>('quick');

  // Font-size toggle
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>(() => {
    return (localStorage.getItem('bahati-font-size') as 'normal' | 'large' | 'xlarge') || 'normal';
  });

  // Email bind reminder for auto-generated @bht.com emails — persisted dismissal + real bind flow
  const [showEmailBindReminder, setShowEmailBindReminder] = useState(
    () => {
      if (currentUser.role !== 'driver' || !currentUser.username?.endsWith('@bht.com')) return false;
      try { return localStorage.getItem('bht-email-reminder-dismissed') !== '1'; } catch { return true; }
    }
  );
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [isBindingEmail, setIsBindingEmail] = useState(false);

  const dismissEmailReminder = () => {
    setShowEmailBindReminder(false);
    try { localStorage.setItem('bht-email-reminder-dismissed', '1'); } catch { /* ignore */ }
  };

  const handleBindEmail = async () => {
    const email = newEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast(lang === 'zh' ? '请输入有效邮箱地址' : 'Please enter a valid email', 'warning');
      return;
    }
    setIsBindingEmail(true);
    try {
      const result = await updateUserEmail(email);
      if (result.success) {
        showToast(lang === 'zh' ? '邮箱已绑定，下次请用新邮箱登录' : 'Email bound — use new email to login next time', 'success');
        dismissEmailReminder();
        setShowEmailInput(false);
      } else {
        showToast(`${lang === 'zh' ? '绑定失败' : 'Bind failed'}: ${result.error}`, 'error');
      }
    } catch (_e) {
      showToast(lang === 'zh' ? '绑定失败，请重试' : 'Bind failed, retry', 'error');
    } finally {
      setIsBindingEmail(false);
    }
  };

  // Apply font-size to document root
  useEffect(() => {
    document.documentElement.style.fontSize =
      fontSize === 'normal' ? '16px' : fontSize === 'large' ? '20px' : '24px';
    localStorage.setItem('bahati-font-size', fontSize);
  }, [fontSize]);

  const cycleFontSize = () => {
    setFontSize(prev => prev === 'normal' ? 'large' : prev === 'large' ? 'xlarge' : 'normal');
  };

  const isDriverView = (candidate: string): candidate is DriverView =>
    DRIVER_NAV_ITEMS.some((item) => item.id === candidate);

  const syncStatus = useSyncStatus({ syncMutation: syncOfflineData, isOnline, unsyncedCount, userId: currentUser.id });
  const todayStr = getTodayLocalDate();
  const assignedMachineCount = filteredLocations.length;
  const todayCollectionCount = filteredTransactions.filter((tx) => tx.driverId === activeDriverId && tx.timestamp.startsWith(todayStr) && (tx.type === undefined || tx.type === 'collection')).length;
  const todayDriverRevenue = filteredTransactions
    .filter((tx) => tx.driverId === activeDriverId && tx.timestamp.startsWith(todayStr) && (tx.type === undefined || tx.type === 'collection'))
    .reduce((sum, tx) => sum + (tx.revenue || 0), 0);
  const todaySettlementSubmitted = filteredSettlements.some(
    (s) => s.driverId === activeDriverId && s.date === todayStr && (s.status === 'pending' || s.status === 'confirmed')
  );
  const navStatByView = useMemo<Partial<Record<DriverView, { value: number; label: string }>>>(
    () => ({
      collect: { value: todayCollectionCount, label: t.todaysCollections },
      settlement: todaySettlementSubmitted
        ? { value: 0, label: lang === 'zh' ? '已日结 ✓' : 'Settled ✓' }
        : todayCollectionCount === 0
          ? { value: 0, label: lang === 'zh' ? '今日未收' : 'No collections' }
          : { value: todayDriverRevenue, label: 'TZS' },
      history: { value: unsyncedCount, label: t.unsyncedLabel },
      status: { value: assignedMachineCount, label: t.assignedMachines },
    }),
    [assignedMachineCount, t, todayCollectionCount, todayDriverRevenue, todaySettlementSubmitted, unsyncedCount, lang]
  );

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

  const handleSetView = (id: string) => {
    if (isDriverView(id)) {
      setView(id);
    }
  };

  return (
    <AppShell data-testid="driver-app-shell">
      <ShellSidebar
        brandTitle="Bahati Ops"
        brandSubtitle={currentUser.name}
        primaryNav={sidebarNav}
        secondaryNav={undefined}
        activeView={view}
        onSelectView={handleSetView}
        syncStatus={syncStatus}
        lang={lang}
        bottomContent={
          <div className="flex items-center gap-3 p-3 border-t border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center font-black text-xs flex-shrink-0">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-black text-white truncate">{currentUser.name}</p>
              <p className="text-caption font-bold text-slate-500 uppercase">{t.driverUser}</p>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-1 bg-white/5 rounded-lg text-slate-300 hover:text-white transition-colors"><Globe size={12}/></button>
              <button onClick={handleLogout} className="p-1 bg-rose-500/10 rounded-lg border border-rose-500/20 text-rose-300 hover:text-rose-200 transition-colors"><LogOut size={12}/></button>
            </div>
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
              <button onClick={cycleFontSize} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900" title={fontSize}>
                <Type size={15} />
              </button>
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900"><Globe size={15}/></button>
              <button onClick={handleLogout} className="p-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 hover:text-rose-700"><LogOut size={15}/></button>
            </>
          }
        />

        {/* Email bind reminder for auto-generated @bht.com accounts */}
        {showEmailBindReminder && (
          <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-amber-700 flex-1">
                {lang === 'zh'
                  ? '您使用的是自动生成的登录邮箱，建议绑定真实邮箱以免账号丢失。'
                  : 'You are using an auto-generated email. Bind a real email to secure your account.'}
              </p>
              <button
                onClick={dismissEmailReminder}
                className="flex-shrink-0 text-amber-400 hover:text-amber-600 p-1"
                aria-label={lang === 'zh' ? '关闭' : 'Dismiss'}
              >✕</button>
            </div>
            {!showEmailInput ? (
              <button
                onClick={() => setShowEmailInput(true)}
                className="w-full flex items-center justify-center gap-2 py-2 bg-amber-600 text-white rounded-xl text-xs font-black uppercase hover:bg-amber-700 transition-colors"
              >
                <Mail size={12} />
                {lang === 'zh' ? '绑定真实邮箱' : 'Bind Real Email'}
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder={lang === 'zh' ? '输入真实邮箱' : 'Enter real email'}
                  className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-amber-400"
                  autoFocus
                />
                <button
                  onClick={handleBindEmail}
                  disabled={isBindingEmail || !newEmail.trim()}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase disabled:opacity-50 hover:bg-emerald-700 transition-colors"
                >
                  {isBindingEmail ? '...' : lang === 'zh' ? '确认' : 'OK'}
                </button>
              </div>
            )}
          </div>
        )}

        <ShellMainContent hasBottomNav>
          <Suspense fallback={<ShellLoadingFallback />}>
            <DriverShellViewRenderer
              view={view}
              onSetView={setView}
            />
          </Suspense>
        </ShellMainContent>
      </div>

      {view === 'collect' && (
        <DriverAIAssistPanel
          lang={lang}
          isOnline={isOnline}
          unsyncedCount={unsyncedCount}
          filteredLocations={filteredLocations}
          filteredTransactions={filteredTransactions}
          filteredSettlements={filteredSettlements}
          activeDriverId={activeDriverId ?? currentUser.id}
        />
      )}

      <ShellMobileNav
        items={mobileNav}
        activeView={view}
        onSelectView={handleSetView}
        position="bottom"
        lang={lang}
      />
    </AppShell>
  );
};

export default AppDriverShell;
