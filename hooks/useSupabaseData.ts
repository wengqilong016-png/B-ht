import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { fetchAiLogs } from '../repositories/aiLogRepository';
import { fetchDrivers } from '../repositories/driverRepository';
import { fetchLocations } from '../repositories/locationRepository';
import { fetchSettlements } from '../repositories/settlementRepository';
import { fetchTransactions } from '../repositories/transactionRepository';
import { localDB } from '../services/localDB';
import { getSettlementQueryScope, getTransactionQueryScope, SupabaseDataUserRole } from '../services/supabaseRoleScope';
import { checkDbHealth } from '../supabaseClient';
import { CONSTANTS, Location, Driver, Transaction, DailySettlement, AILog } from '../types';

// Helper to sanitize drivers
const sanitizeDrivers = (driverList: Driver[]): Driver[] => {
  return driverList.map(driver => {
    const safeDriver = { ...driver } as Record<string, unknown>;
    delete safeDriver.password;
    return safeDriver as unknown as Driver;
  });
};

/**
 * One-time migration helper: reads from the scoped localDB key, falling back to
 * the legacy unscoped key (filtered by driverId when applicable) so users don't
 * see empty lists after upgrading to the scoped storage-key scheme.
 */
async function readWithLegacyFallback<T extends { driverId?: string }>(
  scopedKey: string,
  legacyKey: string,
  driverIdFilter?: string,
): Promise<T[]> {
  const scoped = await localDB.get<T[]>(scopedKey);
  if (scoped) return scoped;
  const legacy = await localDB.get<T[]>(legacyKey);
  if (!legacy) return [];
  return driverIdFilter ? legacy.filter(item => item.driverId === driverIdFilter) : legacy;
}

/**
 * Central data-fetching hook backed by React Query + Supabase.
 *
 * Pass `userRole` so the hook can skip admin-only data (AI logs) for
 * driver accounts, reducing their initial data load significantly.
 * When `userRole` is `null | undefined` (before auth resolves) the hook
 * falls back to the fully-deferred chain, which is the existing behaviour.
 */
export function useSupabaseData(
  userRole?: SupabaseDataUserRole,
  activeDriverId?: string,
) {
  const queryClient = useQueryClient();
  const isDriver = userRole === 'driver';
  const transactionScope = getTransactionQueryScope(userRole, activeDriverId);
  const settlementScope = getSettlementQueryScope(userRole, activeDriverId);
  const transactionStorageKey = `${CONSTANTS.STORAGE_TRANSACTIONS_KEY}:${transactionScope.cacheScope}`;
  const settlementStorageKey = `${CONSTANTS.STORAGE_SETTLEMENTS_KEY}:${settlementScope.cacheScope}`;

  // Only make authenticated Supabase requests when the user is logged in via
  // Supabase Auth. In auth-disabled mode (VITE_DISABLE_AUTH=true) the app uses
  // a local driver identity with no Supabase session, so Supabase requests
  // would get 401/403 errors. Excluding that mode prevents the noise.
  // When userRole is null/undefined (pre-auth or after logout) the queries
  // fall through to localDB so the 401 flood caused by expired tokens is avoided.
  const isAuthenticated = !!userRole;

  // 1. Health check - High priority
  const { data: isOnline = false, refetch: refetchHealth } = useQuery({
    queryKey: ['dbHealth'],
    queryFn: async () => await checkDbHealth(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Re-check connectivity immediately when the browser regains network access.
  // navigator.onLine / window: online can be faster than the 15-second poll.
  useEffect(() => {
    const handleOnline = () => { void refetchHealth(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [refetchHealth]);

  // 2. Core Data: Locations & Drivers - Critical for first paint
  const { data: locations = [], isLoading: isLoadingLocs } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      if (isOnline && isAuthenticated) {
        try {
          const signal = AbortSignal.timeout(12_000);
          const data = await fetchLocations(signal);
          await localDB.set(CONSTANTS.STORAGE_LOCATIONS_KEY, data);
          return data;
        } catch {
          // timeout or network error — fall through to localDB
        }
      }
      return (await localDB.get<Location[]>(CONSTANTS.STORAGE_LOCATIONS_KEY)) || [];
    },
    staleTime: 1000 * 60 * 10,
  });

  const { data: drivers = [], isLoading: isLoadingDrivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      if (isOnline && isAuthenticated) {
        try {
          const signal = AbortSignal.timeout(12_000);
          const data = await fetchDrivers(signal);
          const sanitized = sanitizeDrivers(data);
          await localDB.set(CONSTANTS.STORAGE_DRIVERS_KEY, sanitized);
          return sanitized;
        } catch {
          // timeout or network error — fall through to localDB
        }
      }
      return (await localDB.get<Driver[]>(CONSTANTS.STORAGE_DRIVERS_KEY)) || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  // 3. Heavy Data: Transactions, Settlements, Logs - Deferred loading
  const { data: transactions = [], isLoading: isLoadingTxs } = useQuery({
    queryKey: ['transactions', transactionScope.cacheScope],
    queryFn: async () => {
      if (isOnline && isAuthenticated && transactionScope.enabled) {
        try {
          const data = await fetchTransactions({
            isDriver,
            driverIdFilter: transactionScope.driverIdFilter,
            limit: transactionScope.txLimit,
            signal: AbortSignal.timeout(12_000),
          });
          const mapped = data.map(t => ({ ...t, isSynced: true })) as Transaction[];
          await localDB.set(transactionStorageKey, mapped);
          return mapped;
        } catch {
          // timeout or network error — fall through to localDB
        }
      }
      return readWithLegacyFallback<Transaction>(
        transactionStorageKey,
        CONSTANTS.STORAGE_TRANSACTIONS_KEY,
        transactionScope.driverIdFilter,
      );
    },
    enabled: !!locations.length && transactionScope.enabled,
    staleTime: 1000 * 60 * 2,
    refetchInterval: !isDriver ? 1000 * 60 * 2 : false,
  });

  const { data: dailySettlements = [], isLoading: isLoadingSettlements } = useQuery({
    queryKey: ['dailySettlements', settlementScope.cacheScope],
    queryFn: async () => {
      if (isOnline && isAuthenticated && settlementScope.enabled) {
        try {
          const data = await fetchSettlements({
            driverIdFilter: settlementScope.driverIdFilter,
            limit: settlementScope.settlementLimit,
            signal: AbortSignal.timeout(12_000),
          });
          const mapped = data.map(s => ({ ...s, isSynced: true })) as DailySettlement[];
          await localDB.set(settlementStorageKey, mapped);
          return mapped;
        } catch {
          // timeout or network error — fall through to localDB
        }
      }
      return readWithLegacyFallback<DailySettlement>(
        settlementStorageKey,
        CONSTANTS.STORAGE_SETTLEMENTS_KEY,
        settlementScope.driverIdFilter,
      );
    },
    enabled: !!drivers.length && settlementScope.enabled,
    staleTime: 1000 * 60 * 5,
  });

  // AI Logs: admin-only data — skipped entirely for driver accounts.
  const { data: aiLogs = [] } = useQuery({
    queryKey: ['aiLogs', userRole ?? 'none'],
    queryFn: async () => {
      if (isOnline && isAuthenticated) {
        try {
          const data = await fetchAiLogs(AbortSignal.timeout(12_000));
          const mapped = data.map(l => ({ ...l, isSynced: true })) as AILog[];
          await localDB.set(CONSTANTS.STORAGE_AI_LOGS_KEY, mapped);
          return mapped;
        } catch {
          // timeout or network error — fall through to localDB
        }
      }
      return (await localDB.get<AILog[]>(CONSTANTS.STORAGE_AI_LOGS_KEY)) || [];
    },
    enabled: !isDriver && !!transactions.length,
    staleTime: 1000 * 60 * 10,
  });

  const isDriverRef = useRef(isDriver);
  const userRoleRef = useRef(userRole);
  useEffect(() => { isDriverRef.current = isDriver; }, [isDriver]);
  useEffect(() => { userRoleRef.current = userRole; }, [userRole]);

  useEffect(() => {
    if (!isOnline || !isAuthenticated) return;
    // Force an immediate refetch (not just cache invalidation) so stale local
    // data is replaced as soon as connectivity is restored.  invalidateQueries
    // only marks entries stale and waits for the next consumer render, which can
    // leave the UI showing old data for seconds after reconnect.
    void queryClient.refetchQueries({ queryKey: ['locations'] });
    void queryClient.refetchQueries({ queryKey: ['drivers'] });
    void queryClient.refetchQueries({ queryKey: ['transactions'] });
    void queryClient.refetchQueries({ queryKey: ['dailySettlements'] });
    if (!isDriverRef.current) {
      void queryClient.refetchQueries({ queryKey: ['aiLogs', userRoleRef.current ?? 'none'] });
    }
  }, [isOnline, isAuthenticated, queryClient]);

  useEffect(() => {
    const handleOnline = () => {
      queryClient.invalidateQueries({ queryKey: ['dbHealth'] });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [queryClient]);

  const isLoading = isLoadingLocs || isLoadingDrivers;

  return {
    isOnline,
    locations,
    drivers,
    transactions,
    dailySettlements,
    aiLogs,
    isLoading,
    isBackgroundLoading: isLoadingTxs || isLoadingSettlements,
  };
}
