import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

  const { data: isOnline = false } = useQuery({
    queryKey: ['dbHealth'],
    queryFn: async () => {
      const online = await checkDbHealth();
      return online;
    },
    refetchInterval: 20000, // Check every 20s
  });

  const { data: locations = [], isLoading: isLoadingLocs } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      if (isOnline && supabase) {
        const { data, error } = await supabase.from('locations').select('id, name, machineId, lastScore, area, assignedDriverId, ownerName, shopOwnerPhone, initialStartupDebt, remainingStartupDebt, isNewOffice, coords, status, lastRevenueDate, commissionRate, resetLocked, dividendBalance');
        if (!error && data) {
          await localDB.set(CONSTANTS.STORAGE_LOCATIONS_KEY, data);
          return data as Location[];
        }
      }
      return (await localDB.get<Location[]>(CONSTANTS.STORAGE_LOCATIONS_KEY)) || [];
    },
    staleTime: 1000 * 60 * 5,
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
    staleTime: 1000 * 60 * 5,
  });

  const { data: transactions = [], isLoading: isLoadingTxs } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      if (isOnline && supabase) {
        const { data, error } = await supabase.from('transactions').select('id, timestamp, uploadTimestamp, locationId, locationName, driverId, driverName, previousScore, currentScore, revenue, commission, ownerRetention, debtDeduction, startupDebtDeduction, expenses, coinExchange, extraIncome, netPayable, gps, gpsDeviation, dataUsageKB, aiScore, isAnomaly, notes, isClearance, reportedStatus, paymentStatus, type, approvalStatus, expenseType, expenseCategory, expenseStatus, expenseDescription, payoutAmount').order('timestamp', { ascending: false }).limit(200);
        if (!error && data) {
          const mapped = data.map(t => ({...t, isSynced: true})) as Transaction[];
          await localDB.set(CONSTANTS.STORAGE_TRANSACTIONS_KEY, mapped);
          return mapped;
        }
      }
      return (await localDB.get<Transaction[]>(CONSTANTS.STORAGE_TRANSACTIONS_KEY)) || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const { data: dailySettlements = [], isLoading: isLoadingSettlements } = useQuery({
    queryKey: ['dailySettlements'],
    queryFn: async () => {
      if (isOnline && supabase) {
        const { data, error } = await supabase.from('daily_settlements').select('id, date, adminId, adminName, driverId, driverName, totalRevenue, totalNetPayable, totalExpenses, driverFloat, expectedTotal, actualCash, actualCoins, shortage, note, timestamp, status').order('timestamp', { ascending: false }).limit(30);
        if (!error && data) {
          const mapped = data.map(s => ({...s, isSynced: true})) as DailySettlement[];
          await localDB.set(CONSTANTS.STORAGE_SETTLEMENTS_KEY, mapped);
          return mapped;
        }
      }
      return (await localDB.get<DailySettlement[]>(CONSTANTS.STORAGE_SETTLEMENTS_KEY)) || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const { data: aiLogs = [] } = useQuery({
    queryKey: ['aiLogs'],
    queryFn: async () => {
      if (isOnline && supabase) {
         const { data, error } = await supabase.from('ai_logs').select('id, timestamp, driverId, driverName, query, response, modelUsed, relatedLocationId, relatedTransactionId').order('timestamp', { ascending: false }).limit(50);
         if (!error && data) {
           const mapped = data.map(l => ({...l, isSynced: true})) as AILog[];
           await localDB.set(CONSTANTS.STORAGE_AI_LOGS_KEY, mapped);
           return mapped;
         }
      }
      return (await localDB.get<AILog[]>(CONSTANTS.STORAGE_AI_LOGS_KEY)) || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = isLoadingLocs || isLoadingDrivers || isLoadingTxs || isLoadingSettlements;

  return {
    isOnline,
    locations,
    drivers,
    transactions,
    dailySettlements,
    aiLogs,
    isLoading
  };
}
