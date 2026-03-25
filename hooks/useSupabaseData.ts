import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase, checkDbHealth } from '../supabaseClient';
import { localDB } from '../services/localDB';
import { CONSTANTS, Location, Driver, Transaction, DailySettlement, AILog } from '../types';
import { isAuthDisabled } from '../utils/authMode';
import { getSettlementQueryScope, getTransactionQueryScope, SupabaseDataUserRole } from './supabaseRoleScope';

// Helper to sanitize drivers
const sanitizeDrivers = (driverList: any[]): Driver[] => {
  return driverList.map(driver => {
    const safeDriver = { ...driver };
    delete safeDriver.password;
    return safeDriver;
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
  const isAuthenticated = !isAuthDisabled() && !!userRole;

  // 1. Health check - High priority
  const { data: isOnline = false } = useQuery({
    queryKey: ['dbHealth'],
    queryFn: async () => await checkDbHealth(),
    refetchInterval: 15000,
  });

  // 2. Core Data: Locations & Drivers - Critical for first paint
  const { data: locations = [], isLoading: isLoadingLocs } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      if (isOnline && supabase && isAuthenticated) {
        const { data, error } = await supabase.from('locations').select('id, name, machineId, lastScore, area, assignedDriverId, ownerName, shopOwnerPhone, initialStartupDebt, remainingStartupDebt, isNewOffice, coords, status, lastRevenueDate, commissionRate');
        if (!error && data) {
          await localDB.set(CONSTANTS.STORAGE_LOCATIONS_KEY, data);
          return data as Location[];
        }
      }
      return (await localDB.get<Location[]>(CONSTANTS.STORAGE_LOCATIONS_KEY)) || [];
    },
    staleTime: 1000 * 60 * 10,
  });

  const { data: drivers = [], isLoading: isLoadingDrivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      if (isOnline && supabase && isAuthenticated) {
        const { data, error } = await supabase.from('drivers').select('id, name, username, phone, initialDebt, remainingDebt, dailyFloatingCoins, vehicleInfo, currentGps, lastActive, status, baseSalary, commissionRate');
        if (!error && data) {
          const sanitized = sanitizeDrivers(data);
          await localDB.set(CONSTANTS.STORAGE_DRIVERS_KEY, sanitized);
          return sanitized;
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
      if (isOnline && supabase && isAuthenticated && transactionScope.enabled) {
        let query = supabase
          .from('transactions')
          .select('id, timestamp, uploadTimestamp, locationId, locationName, driverId, driverName, previousScore, currentScore, revenue, commission, ownerRetention, debtDeduction, startupDebtDeduction, expenses, coinExchange, extraIncome, netPayable, gps, gpsDeviation, dataUsageKB, aiScore, isAnomaly, notes, isClearance, reportedStatus, paymentStatus, type, approvalStatus, expenseType, expenseCategory, expenseStatus, expenseDescription, payoutAmount')
          .order('timestamp', { ascending: false })
          .limit(transactionScope.txLimit);

        if (transactionScope.driverIdFilter) {
          query = query.eq('driverId', transactionScope.driverIdFilter);
        }

        const { data, error } = await query;
        if (!error && data) {
          const mapped = data.map(t => ({ ...t, isSynced: true })) as Transaction[];
          await localDB.set(transactionStorageKey, mapped);
          return mapped;
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
      if (isOnline && supabase && isAuthenticated && settlementScope.enabled) {
        let query = supabase
          .from('daily_settlements')
          .select('id, date, adminId, adminName, driverId, driverName, totalRevenue, totalNetPayable, totalExpenses, driverFloat, expectedTotal, actualCash, actualCoins, shortage, note, timestamp, status')
          .order('timestamp', { ascending: false })
          .limit(500);

        if (settlementScope.driverIdFilter) {
          query = query.eq('driverId', settlementScope.driverIdFilter);
        }

        const { data, error } = await query;
        if (!error && data) {
          const mapped = data.map(s => ({ ...s, isSynced: true })) as DailySettlement[];
          await localDB.set(settlementStorageKey, mapped);
          return mapped;
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
      if (isOnline && supabase && isAuthenticated) {
        const { data, error } = await supabase.from('ai_logs').select('id, timestamp, driverId, driverName, query, response, imageUrl, modelUsed, relatedLocationId, relatedTransactionId').order('timestamp', { ascending: false }).limit(500);
        if (!error && data) {
          const mapped = data.map(l => ({ ...l, isSynced: true })) as AILog[];
          await localDB.set(CONSTANTS.STORAGE_AI_LOGS_KEY, mapped);
          return mapped;
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
    queryClient.invalidateQueries({ queryKey: ['locations'] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dailySettlements'] });
    if (!isDriverRef.current) {
      queryClient.invalidateQueries({ queryKey: ['aiLogs', userRoleRef.current ?? 'none'] });
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
