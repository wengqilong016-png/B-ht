import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { User } from './types';
import { Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { Analytics } from '@vercel/analytics/react';
import { fetchCurrentUserProfile, restoreCurrentUserFromSession, signOutCurrentUser } from './services/authService';

import { useSupabaseData } from './hooks/useSupabaseData';
import { useSupabaseMutations } from './hooks/useSupabaseMutations';
import { useDevicePerformance } from './hooks/useDevicePerformance';
import AppRouterShell from './shared/AppRouterShell';
import Login from './components/Login';

// ─── Types & Reducer ──────────────────────────────────────────────
type AuthState = {
  currentUser: User | null;
  userRole: 'admin' | 'driver' | null;
  lang: 'zh' | 'sw';
  isInitializing: boolean;
};

type AuthAction =
  | { type: 'SET_USER'; user: User }
  | { type: 'LOGOUT' }
  | { type: 'SET_LANG'; lang: 'zh' | 'sw' }
  | { type: 'FINISH_INITIALIZING' };

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        currentUser: action.user,
        userRole: action.user.role as 'admin' | 'driver',
        lang: action.user.role === 'admin' ? 'zh' : 'sw',
        isInitializing: false,
      };
    case 'LOGOUT':
      return { ...state, currentUser: null, userRole: null, isInitializing: false };
    case 'SET_LANG':
      return { ...state, lang: action.lang };
    case 'FINISH_INITIALIZING':
      return { ...state, isInitializing: false };
    default:
      return state;
  }
};

// ─── Error Boundary ────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
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

// ─── Main App (auth + global init + role routing) ──────────────────
const App: React.FC = () => {
  const [state, dispatch] = useReducer(authReducer, {
    currentUser: null,
    userRole: null,
    lang: 'zh',
    isInitializing: true, // Safety Timeout Added
  });

  const { currentUser, userRole, lang, isInitializing } = state;

  // Detect device performance tier and apply CSS degradation class to <html>.
  useDevicePerformance();

  const activeDriverId = currentUser?.driverId ?? currentUser?.id;

  // -- Use React Query Custom Hooks --
  const { 
    isOnline, 
    locations: cloudLocations, 
    drivers: cloudDrivers, 
    transactions: cloudTransactions, 
    dailySettlements: cloudDailySettlements, 
    aiLogs, 
    isLoading: isDataLoading 
  } = useSupabaseData(userRole);

  const [localBackup, setLocalBackup] = useState<any>(null);

  useEffect(() => {
    fetch('/api/backup-data')
      .then(res => res.json())
      .then(data => setLocalBackup(data))
      .catch(() => console.log('Local backup API not available'));
  }, []);

  const locations = useMemo(() => cloudLocations.length > 0 ? cloudLocations : (localBackup?.locations || []), [cloudLocations, localBackup]);
  const drivers = useMemo(() => cloudDrivers.length > 0 ? cloudDrivers : (localBackup?.drivers || []), [cloudDrivers, localBackup]);
  const transactions = useMemo(() => cloudTransactions.length > 0 ? cloudTransactions : (localBackup?.transactions || []), [cloudTransactions, localBackup]);
  const dailySettlements = useMemo(() => cloudDailySettlements.length > 0 ? cloudDailySettlements : (localBackup?.dailySettlements || []), [cloudDailySettlements, localBackup]);

  const {
    syncOfflineData,
    updateDrivers,
    updateLocations,
    deleteLocations,
    updateTransaction,
    saveSettlement,
    logAI
  } = useSupabaseMutations(isOnline);

  // ─── Authentication ──────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) {
      dispatch({ type: 'FINISH_INITIALIZING' });
      return;
    }

    const loadUser = async () => {
      const result = await restoreCurrentUserFromSession();
      if (!result.success) {
        if ('error' in result && result.error !== 'No active session') {
           await signOutCurrentUser();
        }
        dispatch({ type: 'FINISH_INITIALIZING' });
        return;
      }
      dispatch({ type: 'SET_USER', user: result.user });
    };
    
    loadUser();

    const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        dispatch({ type: 'LOGOUT' });
        return;
      }
      const result = await fetchCurrentUserProfile(session.user.id, session.user.email || '');
      if (!result.success) {
        await signOutCurrentUser();
        dispatch({ type: 'LOGOUT' });
        return;
      }
      dispatch({ type: 'SET_USER', user: result.user });
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => subscription.unsubscribe();
  }, []);

  // ─── GPS Heartbeat ───────────────────────────────────────────────
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
    }, 60000);
    return () => clearInterval(timer);
  }, [isOnline, currentUser, activeDriverId]);

  // ─── Service Worker offline flush ────────────────────────────────
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

  // ─── Derived data ────────────────────────────────────────────────
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
    dispatch({ type: 'LOGOUT' });
  };

  // ─── Loading / Login screens ─────────────────────────────────────
  if (isInitializing || (isDataLoading && !currentUser)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f3f5f8]">
        <Loader2 size={48} className="text-indigo-500 animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bahati Engine Initializing...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={user => dispatch({ type: 'SET_USER', user })} lang={lang} onSetLang={l => dispatch({ type: 'SET_LANG', lang: l })} />;
  }

  // ─── Role routing via AppRouterShell ─────────────────────────────
  return (
    <>
      <AppRouterShell
        currentUser={currentUser}
        lang={lang}
        isOnline={isOnline}
        locations={locations}
        drivers={drivers}
        transactions={transactions}
        dailySettlements={dailySettlements}
        aiLogs={aiLogs}
        filteredLocations={filteredData.locations}
        filteredDrivers={filteredData.drivers}
        filteredTransactions={filteredData.transactions}
        filteredSettlements={filteredData.dailySettlements}
        unsyncedCount={unsyncedCount}
        activeDriverId={activeDriverId}
        syncOfflineData={syncOfflineData}
        updateDrivers={updateDrivers}
        updateLocations={updateLocations}
        deleteLocations={deleteLocations}
        updateTransaction={updateTransaction}
        saveSettlement={saveSettlement}
        logAI={logAI}
        onSetLang={l => dispatch({ type: 'SET_LANG', lang: l })}
        onLogout={handleLogout}
      />
      <Analytics />
    </>
  );
};

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
