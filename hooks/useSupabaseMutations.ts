import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { localDB } from '../services/localDB';
import { CONSTANTS, Location, Driver, Transaction, DailySettlement, AILog, User } from '../types';
import { flushQueue, reportQueueHealthToServer } from '../offlineQueue';
import { submitCollectionV2 } from '../services/collectionSubmissionService';
import { getTransactionQueryScope, getSettlementQueryScope } from './supabaseRoleScope';

export function useSupabaseMutations(isOnline: boolean, currentUser?: User | null) {
  const queryClient = useQueryClient();

  // Compute role-aware query keys so optimistic updates land on the same cache
  // entries that useSupabaseData reads from.
  const transactionQueryKey = [
    'transactions',
    getTransactionQueryScope(currentUser?.role, currentUser?.driverId).cacheScope,
  ] as const;
  const settlementQueryKey = [
    'dailySettlements',
    getSettlementQueryScope(currentUser?.role, currentUser?.driverId).cacheScope,
  ] as const;

  const syncOfflineData = useMutation({
    mutationFn: async () => {
      if (!isOnline || !supabase) return;

      // 1. Flush offline queue (IndexedDB)
      try {
        await flushQueue(supabase, { submitCollection: submitCollectionV2 });
        // Report queue health for fleet-wide diagnostics (driver devices only).
        if (currentUser?.role === 'driver' && currentUser.driverId) {
          reportQueueHealthToServer(supabase, currentUser.driverId, currentUser.name).catch(() => {});
        }
      } catch (e) {
        console.warn('[Sync] OfflineQueue flush error:', e);
      }

      // 2. Sync local fallback data (from queryClient cache or localDB)
      // This is a simplified approach. In a fully offline-first app,
      // you would use a robust sync engine (e.g., WatermelonDB or rxdb).
      // Here we trigger refetches to let React Query pull the latest truth.
      await queryClient.invalidateQueries();
    }
  });

  const updateDrivers = useMutation({
    mutationFn: async (updatedDrivers: Driver[]) => {
      queryClient.setQueryData(['drivers'], updatedDrivers);
      if (isOnline && supabase) {
        await Promise.all(updatedDrivers.map(d => {
           const { stats, ...driverToSave } = d as any;
           return supabase.from('drivers').upsert({...driverToSave, isSynced: true});
        }));
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['drivers'] });
    }
  });

  const updateLocations = useMutation({
    mutationFn: async (updatedLocations: Location[]) => {
      queryClient.setQueryData(['locations'], updatedLocations);
      if (isOnline && supabase) {
        await Promise.all(updatedLocations.map(l => {
          return supabase.from('locations').upsert({...l, isSynced: true});
        }));
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['locations'] });
    }
  });

  const deleteLocations = useMutation({
    mutationFn: async (ids: string[]) => {
      queryClient.setQueryData(['locations'], (old: Location[] = []) => old.filter(l => !ids.includes(l.id)));
      if (isOnline && supabase) {
        await supabase.from('locations').delete().in('id', ids);
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['locations'] });
    }
  });

  const deleteDrivers = useMutation({
    mutationFn: async (ids: string[]) => {
      queryClient.setQueryData(['drivers'], (old: Driver[] = []) => old.filter(d => !ids.includes(d.id)));
      if (isOnline && supabase) {
        await supabase.from('drivers').delete().in('id', ids);
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['drivers'] });
    }
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ txId, updates }: { txId: string; updates: Partial<Transaction> }) => {
      queryClient.setQueryData(transactionQueryKey, (old: Transaction[] = []) =>
        old.map(t => t.id === txId ? { ...t, ...updates, isSynced: false } : t)
      );
      if (isOnline && supabase) {
        const txs = queryClient.getQueryData<Transaction[]>(transactionQueryKey) || [];
        const tx = txs.find(t => t.id === txId);
        if (tx) {
           await supabase.from('transactions').upsert({...tx, ...updates, isSynced: true});
        }
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  });

  const saveSettlement = useMutation({
    mutationFn: async (settlement: DailySettlement) => {
      queryClient.setQueryData(settlementQueryKey, (old: DailySettlement[] = []) => {
        const exists = old.find(s => s.id === settlement.id);
        if (exists) return old.map(s => s.id === settlement.id ? { ...settlement, isSynced: false } : s);
        return [{ ...settlement, isSynced: false }, ...old];
      });

      const nextDayStartingCoins = settlement.actualCoins || 0;
      queryClient.setQueryData(['drivers'], (old: Driver[] = []) =>
        old.map(d => d.id === settlement.driverId ? { ...d, dailyFloatingCoins: nextDayStartingCoins, isSynced: false } : d)
      );

      if (isOnline && supabase) {
        await supabase.from('daily_settlements').upsert({...settlement, isSynced: true});
        await supabase.from('drivers').update({ dailyFloatingCoins: nextDayStartingCoins }).eq('id', settlement.driverId);
      }
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['dailySettlements'] });
        queryClient.invalidateQueries({ queryKey: ['drivers'] });
      }
    }
  });

  const logAI = useMutation({
    mutationFn: async (log: AILog) => {
      queryClient.setQueryData(['aiLogs'], (old: AILog[] = []) => [{...log, isSynced: false}, ...old]);
      if (isOnline && supabase) {
        await supabase.from('ai_logs').insert({ ...log, isSynced: true });
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['aiLogs'] });
    }
  });

  return {
    syncOfflineData,
    updateDrivers,
    updateLocations,
    deleteLocations,
    deleteDrivers,
    updateTransaction,
    saveSettlement,
    logAI
  };
}
