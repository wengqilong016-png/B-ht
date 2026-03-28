import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { Location, Driver, Transaction, DailySettlement, AILog, User } from '../types';
import { flushQueue, reportQueueHealthToServer } from '../offlineQueue';
import { submitCollectionV2 } from '../services/collectionSubmissionService';
import { getTransactionQueryScope, getSettlementQueryScope } from './supabaseRoleScope';
import { stripClientFields } from '../utils/stripClientFields';

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
    onMutate: async (updatedDrivers: Driver[]) => {
      await queryClient.cancelQueries({ queryKey: ['drivers'] });
      const previousDrivers = queryClient.getQueryData<Driver[]>(['drivers']);
      queryClient.setQueryData(['drivers'], updatedDrivers);
      return { previousDrivers };
    },
    mutationFn: async (updatedDrivers: Driver[]) => {
      const client = supabase;
      if (isOnline && client) {
        await Promise.all(updatedDrivers.map(d =>
          client.from('drivers').upsert(stripClientFields(d as unknown as Record<string, unknown>))
        ));
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousDrivers !== undefined) {
        queryClient.setQueryData(['drivers'], context.previousDrivers);
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['drivers'] });
    }
  });

  const updateLocations = useMutation({
    onMutate: async (updatedLocations: Location[]) => {
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      const previousLocations = queryClient.getQueryData<Location[]>(['locations']);
      queryClient.setQueryData(['locations'], updatedLocations);
      return { previousLocations };
    },
    mutationFn: async (updatedLocations: Location[]) => {
      const client = supabase;
      if (isOnline && client) {
        await Promise.all(updatedLocations.map(l =>
          client.from('locations').upsert(stripClientFields(l as unknown as Record<string, unknown>))
        ));
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['locations'] });
    }
  });

  const deleteLocations = useMutation({
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      const previousLocations = queryClient.getQueryData<Location[]>(['locations']);
      queryClient.setQueryData(['locations'], (old: Location[] = []) => old.filter(l => !ids.includes(l.id)));
      return { previousLocations };
    },
    mutationFn: async (ids: string[]) => {
      if (isOnline && supabase) {
        await supabase.from('locations').delete().in('id', ids);
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['locations'] });
    }
  });

  const deleteDrivers = useMutation({
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['drivers'] });
      const previousDrivers = queryClient.getQueryData<Driver[]>(['drivers']);
      queryClient.setQueryData(['drivers'], (old: Driver[] = []) => old.filter(d => !ids.includes(d.id)));
      return { previousDrivers };
    },
    mutationFn: async (ids: string[]) => {
      if (isOnline && supabase) {
        await supabase.from('drivers').delete().in('id', ids);
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousDrivers !== undefined) {
        queryClient.setQueryData(['drivers'], context.previousDrivers);
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['drivers'] });
    }
  });

  const updateTransaction = useMutation({
    onMutate: async ({ txId, updates }: { txId: string; updates: Partial<Transaction> }) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(transactionQueryKey);
      queryClient.setQueryData(transactionQueryKey, (old: Transaction[] = []) =>
        old.map(t => t.id === txId ? { ...t, ...updates, isSynced: false } : t)
      );
      return { previousTransactions };
    },
    mutationFn: async ({ txId, updates }: { txId: string; updates: Partial<Transaction> }) => {
      if (isOnline && supabase) {
        const txs = queryClient.getQueryData<Transaction[]>(transactionQueryKey) || [];
        const tx = txs.find(t => t.id === txId);
        if (tx) {
          await supabase.from('transactions').upsert(
            stripClientFields({ ...tx, ...updates } as unknown as Record<string, unknown>)
          );
        }
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
      }
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  });

  const saveSettlement = useMutation({
    onMutate: async (settlement: DailySettlement) => {
      await queryClient.cancelQueries({ queryKey: ['dailySettlements'] });
      await queryClient.cancelQueries({ queryKey: ['drivers'] });
      const previousSettlements = queryClient.getQueryData<DailySettlement[]>(settlementQueryKey);
      const previousDrivers = queryClient.getQueryData<Driver[]>(['drivers']);
      queryClient.setQueryData(settlementQueryKey, (old: DailySettlement[] = []) => {
        const exists = old.find(s => s.id === settlement.id);
        if (exists) return old.map(s => s.id === settlement.id ? { ...settlement, isSynced: false } : s);
        return [{ ...settlement, isSynced: false }, ...old];
      });
      const nextDayStartingCoins = settlement.actualCoins || 0;
      queryClient.setQueryData(['drivers'], (old: Driver[] = []) =>
        old.map(d => d.id === settlement.driverId ? { ...d, dailyFloatingCoins: nextDayStartingCoins, isSynced: false } : d)
      );
      return { previousSettlements, previousDrivers };
    },
    mutationFn: async (settlement: DailySettlement) => {
      if (isOnline && supabase) {
        const nextDayStartingCoins = settlement.actualCoins || 0;
        await supabase.from('daily_settlements').upsert(
          stripClientFields(settlement as unknown as Record<string, unknown>)
        );
        await supabase.from('drivers').update({ dailyFloatingCoins: nextDayStartingCoins }).eq('id', settlement.driverId);
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousSettlements !== undefined) {
        queryClient.setQueryData(settlementQueryKey, context.previousSettlements);
      }
      if (context?.previousDrivers !== undefined) {
        queryClient.setQueryData(['drivers'], context.previousDrivers);
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
