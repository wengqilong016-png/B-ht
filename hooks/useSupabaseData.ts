import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase, checkDbHealth } from '../supabaseClient';
import { localDB } from '../services/localDB';
import { CONSTANTS, Location, Driver, Transaction, DailySettlement, AILog } from '../types';

// Helper to sanitize drivers
const sanitizeDrivers = (driverList: any[]): Driver[] => {
  return driverList.map(driver => {
    const safeDriver = { ...driver };
    delete safeDriver.password;
    return safeDriver;
  });
};

export function useSupabaseData() {
  const queryClient = useQueryClient();

  // 1. Health check - High priority
  const { data: isOnline = false } = useQuery({
    queryKey: ['dbHealth'],
    queryFn: async () => await checkDbHealth(),
    refetchInterval: 30000, // 30 s — health-check interval (was 20 s)
  });

  // 2. Core Data: Locations & Drivers - Critical for first paint
  const { data: locations = [], isLoading: isLoadingLocs } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      if (isOnline && supabase) {
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
      if (isOnline && supabase) {
        const { data, error } = await supabase.from('drivers').select('id, name, username, phone, initialDebt, remainingDebt, dailyFloatingCoins, vehicleInfo, currentGps, lastActive, status, baseSalary, commissionRate');
        if (!error && data) {
          const sanitized = sanitizeDrivers(data);
          await localDB.set(CONSTANTS.STORAGE_DRIVERS_KEY, sanitized);
          return sanitized;
        }
      }
      return (await localDB.get<Driver[]>(CONSTANTS.STORAGE_DRIVERS_KEY)) || [];
    },
    staleTime: 1000 * 60 * 10,
  });

  // 3. Heavy Data: Transactions, Settlements, Logs - Deferred loading
  // These only load if critical data is ready, or on demand.
  const { data: transactions = [], isLoading: isLoadingTxs } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      if (isOnline && supabase) {
        const { data, error } = await supabase.from('transactions').select('id, timestamp, uploadTimestamp, locationId, locationName, driverId, driverName, previousScore, currentScore, revenue, commission, ownerRetention, debtDeduction, startupDebtDeduction, expenses, coinExchange, extraIncome, netPayable, gps, gpsDeviation, dataUsageKB, aiScore, isAnomaly, notes, isClearance, reportedStatus, paymentStatus, type, approvalStatus, expenseType, expenseCategory, expenseStatus, expenseDescription, payoutAmount').order('timestamp', { ascending: false }).limit(2000); // 提升至2000条支持大规模回溯
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
  });

  const { data: dailySettlements = [], isLoading: isLoadingSettlements } = useQuery({
    queryKey: ['dailySettlements'],
    queryFn: async () => {
      if (isOnline && supabase) {
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

  const { data: aiLogs = [] } = useQuery({
    queryKey: ['aiLogs'],
    queryFn: async () => {
      if (isOnline && supabase) {
         const { data, error } = await supabase.from('ai_logs').select('id, timestamp, driverId, driverName, query, response, modelUsed, relatedLocationId, relatedTransactionId').order('timestamp', { ascending: false }).limit(500);
         if (!error && data) {
           const mapped = data.map(l => ({...l, isSynced: true})) as AILog[];
           await localDB.set(CONSTANTS.STORAGE_AI_LOGS_KEY, mapped);
           return mapped;
         }
      }
      return (await localDB.get<AILog[]>(CONSTANTS.STORAGE_AI_LOGS_KEY)) || [];
    },
    enabled: !!transactions.length, // Defer even further
    staleTime: 1000 * 60 * 10,
  });

  // When we come online, force-refresh all data from Supabase.
  // This fixes the race condition where data queries see isOnline=false on
  // initial render (before the health check returns) and cache localDB data
  // with a long staleTime, so they never re-fetch from Supabase.
  useEffect(() => {
    if (!isOnline) return;
    queryClient.invalidateQueries({ queryKey: ['locations'] });
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dailySettlements'] });
    queryClient.invalidateQueries({ queryKey: ['aiLogs'] });
  }, [isOnline, queryClient]);

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
