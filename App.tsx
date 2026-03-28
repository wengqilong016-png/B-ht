import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';

import { useSupabaseData } from './hooks/useSupabaseData';
import { useSupabaseMutations } from './hooks/useSupabaseMutations';
import { useDevicePerformance } from './hooks/useDevicePerformance';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { useOfflineSyncLoop } from './hooks/useOfflineSyncLoop';
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription';
import { NotificationProvider } from './notifications/NotificationProvider';
import AppRouterShell from './shared/AppRouterShell';
import { AuthProvider, DataProvider, MutationProvider } from './contexts';
import Login from './components/Login';
import type { User } from './types';

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

// ─── AuthenticatedApp ─────────────────────────────────────────────────────────
// All hooks that require an authenticated session (data loading, realtime,
// offline sync) live here so they only run after the user has logged in.
// This prevents unauthenticated WebSocket connections and redundant Supabase
// queries while the auth state is being resolved.

interface AuthenticatedAppProps {
  currentUser: User;
  userRole: 'admin' | 'driver' | null;
  lang: 'zh' | 'sw';
  setLang: (lang: 'zh' | 'sw') => void;
  handleLogout: () => void;
}

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({
  currentUser,
  userRole,
  lang,
  setLang,
  handleLogout,
}) => {
  // Start realtime subscriptions only now that a session exists.
  useRealtimeSubscription();

  const activeDriverId = currentUser.driverId ?? currentUser.id;

  const {
    isOnline,
    locations: cloudLocations,
    drivers: cloudDrivers,
    transactions: cloudTransactions,
    dailySettlements: cloudDailySettlements,
    aiLogs,
  } = useSupabaseData(userRole, activeDriverId);

  const locations = cloudLocations;
  const drivers = cloudDrivers;
  const transactions = cloudTransactions;
  const dailySettlements = cloudDailySettlements;

  const {
    syncOfflineData,
    updateDrivers,
    updateLocations,
    deleteLocations,
    deleteDrivers,
    updateTransaction,
    saveSettlement,
    logAI,
  } = useSupabaseMutations(isOnline, currentUser);

  const unsyncedCount = useMemo(
    () =>
      transactions.filter(t => !t.isSynced).length +
      dailySettlements.filter(s => !s.isSynced).length +
      aiLogs.filter(l => !l.isSynced).length,
    [transactions, dailySettlements, aiLogs]
  );

  useOfflineSyncLoop({ isOnline, unsyncedCount, currentUser, activeDriverId, syncOfflineData });

  const filteredData = useMemo(() => ({
    locations: currentUser.role === 'admin'
      ? locations
      : locations.filter(l => l.assignedDriverId === activeDriverId),
    transactions: currentUser.role === 'admin'
      ? transactions
      : transactions.filter(t => t.driverId === activeDriverId),
    dailySettlements: currentUser.role === 'admin'
      ? dailySettlements
      : dailySettlements.filter(s => s.driverId === activeDriverId),
    drivers: currentUser.role === 'admin'
      ? drivers
      : drivers.filter(d => d.id === activeDriverId),
  }), [activeDriverId, currentUser, locations, transactions, dailySettlements, drivers]);

  const authValue = useMemo(
    () => ({ currentUser, userRole: currentUser.role ?? 'driver', lang, setLang, handleLogout, activeDriverId }),
    [currentUser, lang, setLang, handleLogout, activeDriverId]
  );

  const dataValue = useMemo(
    () => ({
      isOnline,
      locations, drivers, transactions, dailySettlements, aiLogs,
      filteredLocations: filteredData.locations,
      filteredDrivers: filteredData.drivers,
      filteredTransactions: filteredData.transactions,
      filteredSettlements: filteredData.dailySettlements,
      unsyncedCount,
    }),
    [isOnline, locations, drivers, transactions, dailySettlements, aiLogs, filteredData, unsyncedCount]
  );

  const mutationValue = useMemo(
    () => ({ syncOfflineData, updateDrivers, updateLocations, deleteLocations, deleteDrivers, updateTransaction, saveSettlement, logAI }),
    [syncOfflineData, updateDrivers, updateLocations, deleteLocations, deleteDrivers, updateTransaction, saveSettlement, logAI]
  );

  return (
    <NotificationProvider>
      <AuthProvider value={authValue}>
        <DataProvider value={dataValue}>
          <MutationProvider value={mutationValue}>
            <AppRouterShell />
          </MutationProvider>
        </DataProvider>
      </AuthProvider>
    </NotificationProvider>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const { currentUser, userRole, lang, isInitializing, handleLogin, handleLogout, setLang } = useAuthBootstrap();

  useDevicePerformance();

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f3f5f8]">
        <Loader2 size={48} className="text-indigo-500 animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bahati Engine Initializing...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} lang={lang} onSetLang={setLang} />;
  }

  return (
    <AuthenticatedApp
      currentUser={currentUser}
      userRole={userRole}
      lang={lang}
      setLang={setLang}
      handleLogout={handleLogout}
    />
  );
};

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
