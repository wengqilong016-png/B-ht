I've reviewed the App.tsx code and identified several areas for optimization. Here are the suggested changes:

1. Remove duplicate registration of the GPS heartbeat timer and Service Worker message listener.
2. Use `useCallback` to memoize the `handleLogout` and `onSetLang` callback functions.
3. Use `useMemo` to memoize the `filteredData` and `unsyncedCount` calculations.

Here's the optimized App.tsx code:
```jsx
import React, { useEffect, useMemo, useCallback, useReducer } from 'react';
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

const App: React.FC = () => {
  const [state, dispatch] = useReducer(authReducer, {
    currentUser: null,
    userRole: null,
    lang: 'zh',
    isInitializing: true,
  });

  const { currentUser, userRole, lang, isInitializing } = state;

  // ...

  const handleLogout = useCallback(async () => {
    await signOutCurrentUser();
    dispatch({ type: 'LOGOUT' });
  }, [dispatch]);

  const onSetLang = useCallback((l) => {
    dispatch({ type: 'SET_LANG', lang: l });
  }, [dispatch]);

  // ...

  useEffect(() => {
    if (!isOnline || !supabase || currentUser?.role !== 'driver') return;
    const timer = setInterval(() => {
      // ...
    }, 60000);
    return () => clearInterval(timer);
  }, [isOnline, supabase, currentUser]);

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

  // ...

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

  // ...
};

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
};
```
Note that I've wrapped the `App` component with the `ErrorBoundary` component, as per your original code.

