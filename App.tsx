import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { User, TRANSLATIONS } from './types';
import { 
  LayoutDashboard, PlusCircle, CreditCard, PieChart, Brain, 
  LogOut, Globe, Loader2, CloudOff,
  CheckSquare, Crown, ShieldCheck, AlertTriangle,
  MapPin, Store, Users, FileSpreadsheet, History, Banknote, Settings
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { Analytics } from '@vercel/analytics/react';
import { fetchCurrentUserProfile, restoreCurrentUserFromSession, signOutCurrentUser } from './services/authService';

import { useSupabaseData } from './hooks/useSupabaseData';
import { useSupabaseMutations } from './hooks/useSupabaseMutations';

// Lazy load heavy components
const Dashboard = lazy(() => import('./components/Dashboard'));
const CollectionForm = lazy(() => import('./components/CollectionForm'));
const TransactionHistory = lazy(() => import('./components/TransactionHistory'));
const FinancialReports = lazy(() => import('./components/FinancialReports'));
const AIHub = lazy(() => import('./components/AIHub'));
const DebtManager = lazy(() => import('./components/DebtManager'));
const BillingReconciliation = lazy(() => import('./components/BillingReconciliation'));
const DriverManagement = lazy(() => import('./components/DriverManagement'));
const AccountSettings = lazy(() => import('./components/AccountSettings'));
const Login = lazy(() => import('./components/Login'));

const LoadingFallback = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-12">
    <Loader2 size={32} className="text-indigo-600 animate-spin mb-4" />
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Module...</p>
  </div>
);

interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: string;
}

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err?.message || String(err) };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#f8fafc', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontWeight: 900, fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', maxWidth: '320px', marginBottom: '1.5rem' }}>{this.state.error}</p>
          <button onClick={() => window.location.reload()} style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 900, padding: '0.75rem 2rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer' }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'settlement' | 'map' | 'sites' | 'team' | 'billing' | 'ai' | 'collect' | 'debt' | 'history' | 'reports'>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lang, setLang] = useState<'zh' | 'sw'>('zh');
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [aiContextId, setAiContextId] = useState<string>('');

  const t = TRANSLATIONS[lang];
  const activeDriverId = currentUser?.driverId ?? currentUser?.id;

  // -- Use React Query Custom Hooks --
  const { 
    isOnline, 
    locations, 
    drivers, 
    transactions, 
    dailySettlements, 
    aiLogs, 
    isLoading: isDataLoading 
  } = useSupabaseData();

  const {
    syncOfflineData,
    updateDrivers,
    updateLocations,
    deleteLocations,
    updateTransaction,
    saveSettlement,
    logAI
  } = useSupabaseMutations(isOnline);

  const [isInitializing, setIsInitializing] = useState(true);

  // Authentication Effect
  useEffect(() => {
    if (!supabase) {
      // Supabase is not configured – unblock the loading screen immediately.
      setIsInitializing(false);
      return;
    }

    const loadUser = async () => {
      const result = await restoreCurrentUserFromSession();
      if (!result.success) {
        if ('error' in result && result.error !== 'No active session') {
           await signOutCurrentUser();
        }
        setIsInitializing(false);
        return;
      }
      setCurrentUser(result.user);
      setLang(result.user.role === 'admin' ? 'zh' : 'sw');
      if (result.user.role === 'driver') setView('collect');
      setIsInitializing(false);
    };
    
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setCurrentUser(null);
        return;
      }
      const result = await fetchCurrentUserProfile(session.user.id, session.user.email || '');
      if (!result.success) {
        await signOutCurrentUser();
        setCurrentUser(null);
        return;
      }
      setCurrentUser(result.user);
      setLang(result.user.role === 'admin' ? 'zh' : 'sw');
      if (result.user.role === 'driver') setView('collect');
    });

    return () => subscription.unsubscribe();
  }, []);

  // GPS Heartbeat
  useEffect(() => {
    if (!isOnline || !supabase || currentUser?.role !== 'driver') return;
    const timer = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition((pos) => {
           const { latitude, longitude } = pos.coords;
           supabase.from('drivers').update({ 
             lastActive: new Date().toISOString(),
             currentGps: { lat: latitude, lng: longitude }
           }).eq('id', activeDriverId);
         }, () => {}, { enableHighAccuracy: false, timeout: 5000 });
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [isOnline, currentUser, activeDriverId]);

  // Service Worker offline flush
  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_OFFLINE_QUEUE') {
        syncOfflineData.mutate();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        if ('sync' in reg) {
          (reg as any).sync.register('bahati-flush-queue').catch(() => {});
        }
      }).catch(() => {});
    }
    return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
  }, [syncOfflineData]);

  // Derived filtered data
  const filteredData = useMemo(() => ({
    locations: !currentUser || currentUser.role === 'admin'
      ? locations
      : locations.filter(l => l.assignedDriverId === activeDriverId),
    transactions: !currentUser || currentUser.role === 'admin'
      ? transactions
      : transactions.filter(t => t.driverId === activeDriverId),
    dailySettlements: !currentUser || currentUser.role === 'admin'
      ? dailySettlements
      : dailySettlements.filter(s => s.driverId === activeDriverId),
    drivers: !currentUser || currentUser.role === 'admin'
      ? drivers
      : drivers.filter(d => d.id === activeDriverId),
  }), [activeDriverId, currentUser, locations, transactions, dailySettlements, drivers]);

  const unsyncedCount = useMemo(
    () =>
      transactions.filter(t => !t.isSynced).length +
      dailySettlements.filter(s => !s.isSynced).length +
      aiLogs.filter(l => !l.isSynced).length,
    [transactions, dailySettlements, aiLogs]
  );

  const handleLogout = async () => {
    await signOutCurrentUser();
    setCurrentUser(null);
  };

  if (isInitializing || (isDataLoading && !currentUser)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900">
        <Loader2 size={48} className="text-amber-400 animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/50">Bahati Engine Initializing...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={user => setCurrentUser(user)} lang={lang} onSetLang={setLang} />;
  }

  const isAdmin = currentUser.role === 'admin';

  // Badge counts
  const pendingSettlementCount = dailySettlements.filter(s => s.status === 'pending').length;
  const pendingExpenseCount = transactions.filter(t => t.expenses > 0 && t.expenseStatus === 'pending').length;
  const anomalyCount = transactions.filter(t => t.isAnomaly === true && t.approvalStatus !== 'approved' && t.approvalStatus !== 'rejected').length;
  const totalApprovalBadge = pendingSettlementCount + pendingExpenseCount + anomalyCount + 
    transactions.filter(t => t.type === 'reset_request' && t.approvalStatus === 'pending').length +
    transactions.filter(t => t.type === 'payout_request' && t.approvalStatus === 'pending').length;

  const pageTitles: Record<string, string> = {
    dashboard: 'Action Center',
    settlement: 'Settlement',
    map: 'Map & Routes',
    sites: 'Site Management',
    team: 'Team',
    billing: 'Billing',
    ai: 'AI Audit',
    collect: 'Collect',
    debt: 'Finance',
    history: 'History',
    reports: 'Reports',
  };

  const adminNavItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={18}/>, label: '工作台', labelEn: 'Overview' },
    { id: 'settlement', icon: <CheckSquare size={18}/>, label: '审批中心', labelEn: 'Approvals', badge: totalApprovalBadge },
    { id: 'map', icon: <MapPin size={18}/>, label: '地图与轨迹', labelEn: 'Map & Routes' },
    { id: 'sites', icon: <Store size={18}/>, label: '网点管理', labelEn: 'Sites' },
    { id: 'team', icon: <Users size={18}/>, label: '车队与薪资', labelEn: 'Fleet' },
    { id: 'billing', icon: <FileSpreadsheet size={18}/>, label: '月账单核对', labelEn: 'Billing' },
    { id: 'ai', icon: <Brain size={18}/>, label: 'AI 日志', labelEn: 'AI Logs' },
  ];

  const getDashboardTab = (v: string): 'overview' | 'locations' | 'settlement' | 'team' | 'arrears' | 'ai-logs' | 'tracking' => {
    if (v === 'settlement') return 'settlement';
    if (v === 'map') return 'tracking';
    if (v === 'sites') return 'locations';
    if (v === 'ai') return 'ai-logs';
    return 'overview';
  };

  const showDashboard = isAdmin ? ['dashboard', 'settlement', 'map', 'sites', 'ai'].includes(view) : view === 'settlement';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {isAdmin && (
        <aside className="hidden md:flex flex-col w-[180px] lg:w-[200px] bg-slate-900 flex-shrink-0 h-full z-40">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-xl flex-shrink-0">
                <Crown size={16} fill="currentColor" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black text-white leading-tight">BAHATI JACKPOTS</p>
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
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all relative group ${
                    active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="text-[10px] font-black uppercase leading-tight truncate">{item.label}</span>
                  {!active && item.badge > 0 && (
                    <span className="ml-auto flex-shrink-0 w-5 h-5 bg-amber-500 text-slate-900 rounded-full text-[8px] font-black flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                  {active && item.badge > 0 && (
                    <span className="ml-auto flex-shrink-0 w-5 h-5 bg-white/20 text-white rounded-full text-[8px] font-black flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="h-px bg-white/10 my-2" />
            {[
              { id: 'collect', icon: <PlusCircle size={18}/>, label: '采集录入' },
              { id: 'debt', icon: <CreditCard size={18}/>, label: '债务管理' },
              { id: 'reports', icon: <PieChart size={18}/>, label: '财务报表' },
              { id: 'history', icon: <History size={18}/>, label: '操作记录' },
            ].map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="text-[10px] font-black uppercase leading-tight truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-white/10 space-y-2">
            <button
              onClick={() => syncOfflineData.mutate()}
              disabled={syncOfflineData.isPending || !isOnline}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${
                syncOfflineData.isPending ? 'bg-slate-800 text-indigo-400' :
                !isOnline ? 'bg-rose-500/10 text-rose-400' :
                unsyncedCount > 0 ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {syncOfflineData.isPending ? <Loader2 size={12} className="animate-spin"/> :
               !isOnline ? <CloudOff size={12}/> :
               unsyncedCount > 0 ? <AlertTriangle size={12}/> :
               <ShieldCheck size={12}/>}
              <span>{syncOfflineData.isPending ? 'Syncing...' : !isOnline ? 'Offline' : unsyncedCount > 0 ? `${unsyncedCount} Pending` : 'Cloud Synced'}</span>
            </button>
            <div className="flex items-center gap-2 px-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs flex-shrink-0">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-white truncate">{currentUser.name}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase">Admin User</p>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className="p-1 bg-white/10 rounded-lg text-slate-400 hover:text-white"><Globe size={12}/></button>
                <button onClick={() => setShowAccountSettings(true)} className="p-1 bg-white/10 rounded-lg text-slate-400 hover:text-white"><Settings size={12}/></button>
                <button onClick={handleLogout} className="p-1 bg-rose-500/20 rounded-lg text-rose-400"><LogOut size={12}/></button>
              </div>
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className={`border-b flex-shrink-0 z-30 ${isAdmin ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'}`}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {isAdmin ? (
                <div className="md:hidden flex items-center gap-2">
                  <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-xl">
                    <Crown size={14} fill="currentColor" />
                  </div>
                  <span className="text-xs font-black text-slate-900">BAHATI</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="bg-gradient-to-br from-amber-300 to-amber-600 text-slate-900 p-1.5 rounded-xl">
                    <Crown size={14} fill="currentColor" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-white leading-none">BAHATI</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">{currentUser.name}</p>
                  </div>
                </div>
              )}
              {isAdmin && (
                <div className="hidden md:block">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{pageTitles[view] || 'ADMIN'}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => syncOfflineData.mutate()}
                  disabled={syncOfflineData.isPending || !isOnline}
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all border ${
                    syncOfflineData.isPending ? 'bg-slate-50 border-slate-200 text-slate-400' :
                    !isOnline ? 'bg-rose-50 border-rose-200 text-rose-500' :
                    unsyncedCount > 0 ? 'bg-amber-50 border-amber-300 text-amber-700 animate-pulse' :
                    'bg-emerald-50 border-emerald-200 text-emerald-600'
                  }`}
                >
                  {syncOfflineData.isPending ? <Loader2 size={11} className="animate-spin"/> :
                   !isOnline ? <CloudOff size={11}/> :
                   unsyncedCount > 0 ? <AlertTriangle size={11}/> :
                   <ShieldCheck size={11}/>}
                  {syncOfflineData.isPending ? 'Syncing' : !isOnline ? 'Offline' : unsyncedCount > 0 ? `${unsyncedCount} Pending` : 'Synced'}
                </button>
              )}
              {!isAdmin && (
                <button
                  onClick={() => syncOfflineData.mutate()}
                  disabled={syncOfflineData.isPending || !isOnline}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all ${
                    !isOnline ? 'bg-rose-500/10 text-rose-400' :
                    unsyncedCount > 0 ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                    'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {!isOnline ? <CloudOff size={11}/> : unsyncedCount > 0 ? <AlertTriangle size={11}/> : <ShieldCheck size={11}/>}
                  {!isOnline ? 'Offline' : unsyncedCount > 0 ? `${unsyncedCount}` : 'Synced'}
                </button>
              )}
              <button onClick={() => setLang(lang === 'zh' ? 'sw' : 'zh')} className={`p-2 rounded-xl ${isAdmin ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-white hover:bg-white/20'}`}><Globe size={15}/></button>
              <button onClick={() => setShowAccountSettings(true)} className={`p-2 rounded-xl ${isAdmin ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-white hover:bg-white/20'}`}><Settings size={15}/></button>
              <button onClick={handleLogout} className="p-2 bg-rose-500/20 rounded-xl text-rose-400"><LogOut size={15}/></button>
            </div>
          </div>

          {!isAdmin && (
            <div className="flex border-t border-white/10">
              {[
                { id: 'collect', icon: <PlusCircle size={16}/>, label: t.collect },
                { id: 'settlement', icon: <Banknote size={16}/>, label: t.dailySettlement },
                { id: 'debt', icon: <CreditCard size={16}/>, label: t.debt },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[9px] font-black uppercase transition-all ${
                    view === item.id ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-400'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="md:hidden flex border-t border-slate-100 overflow-x-auto scrollbar-hide">
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
                  {item.badge > 0 && (
                    <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-[6px] font-black flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
          {/* Overlay loading state during sync/fetch */}
          {isDataLoading && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
               <Loader2 size={32} className="text-indigo-600 animate-spin" />
            </div>
          )}
          
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Suspense fallback={<LoadingFallback />}>
              {isAdmin && showDashboard && (
                <Dashboard
                  transactions={filteredData.transactions}
                  drivers={filteredData.drivers}
                  locations={filteredData.locations}
                  dailySettlements={filteredData.dailySettlements}
                  aiLogs={aiLogs}
                  currentUser={currentUser}
                  onUpdateDrivers={(d) => updateDrivers.mutateAsync(d)}
                  onUpdateLocations={(l) => updateLocations.mutate(l)}
                  onDeleteLocations={(ids) => deleteLocations.mutate(ids)}
                  onUpdateTransaction={(id, updates) => updateTransaction.mutate({txId: id, updates})}
                  onNewTransaction={() => {}} // Not used in admin dashboard currently
                  onSaveSettlement={(s) => saveSettlement.mutate(s)}
                  onSync={async () => syncOfflineData.mutate()}
                  isSyncing={syncOfflineData.isPending}
                  offlineCount={unsyncedCount}
                  lang={lang}
                  onNavigate={(v) => setView(v as any)}
                  initialTab={getDashboardTab(view)}
                  hideTabs={true}
                />
              )}

              {!isAdmin && view === 'settlement' && (
                <Dashboard
                  transactions={filteredData.transactions}
                  drivers={filteredData.drivers}
                  locations={filteredData.locations}
                  dailySettlements={filteredData.dailySettlements}
                  aiLogs={aiLogs}
                  currentUser={currentUser}
                  onUpdateDrivers={(d) => updateDrivers.mutateAsync(d)}
                  onUpdateLocations={(l) => updateLocations.mutate(l)}
                  onDeleteLocations={(ids) => deleteLocations.mutate(ids)}
                  onUpdateTransaction={(id, updates) => updateTransaction.mutate({txId: id, updates})}
                  onNewTransaction={() => {}} // handled in CollectionForm
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

              {view === 'team' && isAdmin && (
                <DriverManagement
                  drivers={filteredData.drivers}
                  transactions={filteredData.transactions}
                  dailySettlements={filteredData.dailySettlements}
                  onUpdateDrivers={(d) => updateDrivers.mutateAsync(d)}
                />
              )}

              {view === 'billing' && isAdmin && (
                <BillingReconciliation
                  drivers={filteredData.drivers}
                  transactions={filteredData.transactions}
                  dailySettlements={filteredData.dailySettlements}
                />
              )}

              {view === 'collect' && (
                <CollectionForm
                  locations={filteredData.locations}
                  currentDriver={drivers.find(d => d.id === activeDriverId) || drivers[0]}
                  onSubmit={(tx) => {
                    syncOfflineData.mutate();
                  }}
                  lang={lang}
                  onLogAI={(l) => logAI.mutate(l)}
                  isOnline={isOnline}
                  allTransactions={filteredData.transactions}
                  onRegisterMachine={async (loc) => {
                    const newLoc = { ...loc, isSynced: false, assignedDriverId: activeDriverId };
                    updateLocations.mutate([...locations, newLoc]);
                  }}
                />
              )}

              {view === 'history' && (
                <TransactionHistory transactions={filteredData.transactions} locations={locations} onAnalyze={() => {}} />
              )}
              {view === 'reports' && (
                <FinancialReports transactions={filteredData.transactions} drivers={filteredData.drivers} locations={filteredData.locations} dailySettlements={filteredData.dailySettlements} lang={lang} />
              )}
              {view === 'debt' && (
                <DebtManager drivers={filteredData.drivers} locations={filteredData.locations} currentUser={currentUser} onUpdateLocations={(l) => updateLocations.mutate(l)} lang={lang} />
              )}
              {view === 'ai' && !showDashboard && isAdmin && (
                <AIHub
                  drivers={filteredData.drivers}
                  locations={filteredData.locations}
                  transactions={filteredData.transactions}
                  onLogAI={(l) => logAI.mutate(l)}
                  currentUser={currentUser}
                  initialContextId={aiContextId}
                  onClearContext={() => setAiContextId('')}
                />
              )}
            </Suspense>
          </div>
        </main>
      </div>

      <Analytics />

      {showAccountSettings && currentUser && (
        <AccountSettings
          currentUser={currentUser}
          lang={lang}
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

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}