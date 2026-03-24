import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase, checkDbHealth } from '../supabaseClient';
import { localDB } from '../services/localDB';
import { CONSTANTS, Location, Driver, Transaction, DailySettlement, AILog } from '../types';
import { isAuthDisabled } from '../utils/authMode';

// Helper to sanitize drivers
const sanitizeDrivers = (driverList: any[]): Driver[] => {
  return driverList.map(driver => {
    const safeDriver = { ...driver };
    delete safeDriver.password;
    return safeDriver;
  });
};

/** Max transactions fetched for admin users (full audit view). */
const TX_LIMIT_ADMIN = 2000;
/** Max transactions fetched for driver users (recent activity only).
 * Kept lower to reduce memory/network load on older devices. */
const TX_LIMIT_DRIVER = 500;

/**
 * Central data-fetching hook backed by React Query + Supabase.
 *
 * Pass `userRole` so the hook can skip admin-only data (AI logs) for
 * driver accounts, reducing their initial data load significantly.
 * When `userRole` is `null | undefined` (before auth resolves) the hook
 * falls back to the fully-deferred chain, which is the existing behaviour.
 */
export function useSupabaseData(userRole?: 'admin' | 'driver' | null | undefined) {
  const queryClient = useQueryClient();
  const isDriver = userRole === 'driver';
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
    refetchInterval: 15000, // 15 s — faster reconnection detection (was 30 s)
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
    // Keep at 2 min: the realtime subscription below applies live GPS patches,
    // so full re-fetches only need to catch any missed events.
    staleTime: 1000 * 60 * 2,
  });

  // 3. Heavy Data: Transactions, Settlements, Logs - Deferred loading
  // These only load if critical data is ready, or on demand.
  // Driver accounts only load their own recent 500 transactions to reduce memory
  // and network load on older devices.
  const { data: transactions = [], isLoading: isLoadingTxs } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      if (isOnline && supabase && isAuthenticated) {
        const txLimit = isDriver ? TX_LIMIT_DRIVER : TX_LIMIT_ADMIN;
        const { data, error } = await supabase.from('transactions').select('id, timestamp, uploadTimestamp, locationId, locationName, driverId, driverName, previousScore, currentScore, revenue, commission, ownerRetention, debtDeduction, startupDebtDeduction, expenses, coinExchange, extraIncome, netPayable, gps, gpsDeviation, dataUsageKB, aiScore, isAnomaly, notes, isClearance, reportedStatus, paymentStatus, type, approvalStatus, expenseType, expenseCategory, expenseStatus, expenseDescription, payoutAmount').order('timestamp', { ascending: false }).limit(txLimit); // 提升至2000条支持大规模回溯
        if (!error && data) {
          const mapped = data.map(t => ({...t, isSynced: true})) as Transaction[];
          await localDB.set(CONSTANTS.STORAGE_TRANSACTIONS_KEY, mapped);
          return mapped;
        }
      }
      return (await localDB.get<Transaction[]>(CONSTANTS.STORAGE_TRANSACTIONS_KEY)) || [];
    },
    enabled: !!locations.length, // Defer until core data is here
    staleTime: 1000 * 60 * 2,
    // Admin: refresh every 2 min as a backstop for any missed Realtime events.
    // Drivers only see their own filtered data, so background polling is skipped.
    refetchInterval: !isDriver ? 1000 * 60 * 2 : false,
  });

  const { data: dailySettlements = [], isLoading: isLoadingSettlements } = useQuery({
    queryKey: ['dailySettlements'],
    queryFn: async () => {
      if (isOnline && supabase && isAuthenticated) {
        const { data, error } = await supabase.from('daily_settlements').select('id, date, adminId, adminName, driverId, driverName, totalRevenue, totalNetPayable, totalExpenses, driverFloat, expectedTotal, actualCash, actualCoins, shortage, note, timestamp, status').order('timestamp', { ascending: false }).limit(500);
        if (!error && data) {
          const mapped = data.map(s => ({...s, isSynced: true})) as DailySettlement[];
          await localDB.set(CONSTANTS.STORAGE_SETTLEMENTS_KEY, mapped);
          return mapped;
        }
      }
      return (await localDB.get<DailySettlement[]>(CONSTANTS.STORAGE_SETTLEMENTS_KEY)) || [];
    },
    enabled: !!drivers.length,
    staleTime: 1000 * 60 * 5,
  });

  // AI Logs: admin-only data — skipped entirely for driver accounts.
  // When userRole is unknown (null/undefined, pre-auth) the existing
  // transaction-chain gate still defers loading until transactions exist.
  const { data: aiLogs = [] } = useQuery({
    queryKey: ['aiLogs', userRole ?? 'none'],
    queryFn: async () => {
      if (isOnline && supabase && isAuthenticated) {
         const { data, error } = await supabase.from('ai_logs').select('id, timestamp, driverId, driverName, query, response, imageUrl, modelUsed, relatedLocationId, relatedTransactionId').order('timestamp', { ascending: false }).limit(500);
         if (!error && data) {
           const mapped = data.map(l => ({...l, isSynced: true})) as AILog[];
           await localDB.set(CONSTANTS.STORAGE_AI_LOGS_KEY, mapped);
           return mapped;
         }
      }
      return (await localDB.get<AILog[]>(CONSTANTS.STORAGE_AI_LOGS_KEY)) || [];
    },
    // Skip for drivers; defer for unknown role until transactions exist
    enabled: !isDriver && !!transactions.length,
    staleTime: 1000 * 60 * 10,
  });

  // When we come online, force-refresh all data from Supabase.
  // This fixes the race condition where data queries see isOnline=false on
  // initial render (before the health check returns) and cache localDB data
  // with a long staleTime, so they never re-fetch from Supabase.
  // Keep a stable ref to the current role so the online-refresh effect
  // can read the latest value without being listed as a dependency
  // (which would cause spurious refetches on every login).
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
  }, [isOnline, isAuthenticated, queryClient]); // Only re-run when connectivity or auth changes

  // Listen for browser online event to immediately trigger a health check
  // This speeds up reconnection after network outages (issue 2).
  useEffect(() => {
    const handleOnline = () => {
      queryClient.invalidateQueries({ queryKey: ['dbHealth'] });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [queryClient]);

  // Realtime subscriptions are centralized in `useRealtimeSubscription` (App.tsx)
  // so query invalidation has a single entrypoint.

  // Main loading state now only reflects CORE data needed for first paint
  const isLoading = isLoadingLocs || isLoadingDrivers;

  return {
    isOnline,
    locations,
    drivers,
    transactions,
    dailySettlements,
    aiLogs,
    isLoading,
    isBackgroundLoading: isLoadingTxs || isLoadingSettlements
  };
}
