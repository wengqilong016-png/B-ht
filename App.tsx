import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';

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
import LocalDriverPicker from './components/LocalDriverPicker';
import ForcePasswordChange from './components/ForcePasswordChange';
import { isAuthDisabled } from './utils/authMode';
import type { Location, Driver, Transaction, DailySettlement } from './types';

// ─── Local backup shape ────────────────────────────────────────────
interface LocalBackupData {
  locations: Location[];
  drivers: Driver[];
  transactions: Transaction[];
  dailySettlements: DailySettlement[];
}

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
  const { currentUser, userRole, lang, isInitializing, handleLogin, handleLogout, setLang } = useAuthBootstrap();

  // Detect device performance tier and apply CSS degradation class to <html>.
  useDevicePerformance();

  // ─── Supabase Realtime (enhancement over 20-second polling fallback) ─────
  useRealtimeSubscription();

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

  const [localBackup, setLocalBackup] = useState<LocalBackupData | null>(null);

  useEffect(() => {
    fetch('/api/backup-data')
      .then(res => res.json())
      .then(data => setLocalBackup(data))
      .catch(() => console.warn('Local backup API not available'));
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
    deleteDrivers,
    updateTransaction,
    saveSettlement,
    logAI
  } = useSupabaseMutations(isOnline);

  const unsyncedCount = useMemo(
    () =>
      transactions.filter(t => !t.isSynced).length +
      dailySettlements.filter(s => !s.isSynced).length +
      aiLogs.filter(l => !l.isSynced).length,
    [transactions, dailySettlements, aiLogs]
  );

  // ─── Offline sync + GPS heartbeat ────────────────────────────────
  useOfflineSyncLoop({ isOnline, unsyncedCount, currentUser, activeDriverId, syncOfflineData });

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
    if (isAuthDisabled()) {
      return <LocalDriverPicker onConfirm={handleLogin} lang="sw" />;
    }
    return <Login onLogin={handleLogin} lang={lang} onSetLang={setLang} />;
  }

  // ─── Force password change gate ──────────────────────────────────
  if (currentUser.mustChangePassword) {
    return (
      <ForcePasswordChange
        lang={lang}
        onSuccess={() => handleLogin({ ...currentUser, mustChangePassword: false })}
      />
    );
  }

  // ─── Role routing via AppRouterShell ─────────────────────────────
  return (
    <NotificationProvider>
      <AuthProvider value={{ currentUser, userRole: currentUser.role, lang, setLang, handleLogout, activeDriverId }}>
        <DataProvider value={{
          isOnline,
          locations, drivers, transactions, dailySettlements, aiLogs,
          filteredLocations: filteredData.locations,
          filteredDrivers: filteredData.drivers,
          filteredTransactions: filteredData.transactions,
          filteredSettlements: filteredData.dailySettlements,
          unsyncedCount,
        }}>
          <MutationProvider value={{ syncOfflineData, updateDrivers, updateLocations, deleteLocations, deleteDrivers, updateTransaction, saveSettlement, logAI }}>
            <AppRouterShell />
          </MutationProvider>
        </DataProvider>
      </AuthProvider>
      <Analytics />
    </NotificationProvider>
  );
};

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
