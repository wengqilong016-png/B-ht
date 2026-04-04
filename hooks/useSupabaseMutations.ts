import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Location, Driver, Transaction, DailySettlement, AILog, User } from '../types';
import { enqueueTransaction, flushQueue, reportQueueHealthToServer } from '../offlineQueue';
import { submitCollectionV2 } from '../services/collectionSubmissionService';
import { getTransactionQueryScope, getSettlementQueryScope } from './supabaseRoleScope';
import { stripClientFields } from '../utils/stripClientFields';
import { upsertDrivers, deleteDrivers as repoDeleteDrivers, updateDriverCoins } from '../repositories/driverRepository';
import { upsertLocations, deleteLocations as repoDeleteLocations } from '../repositories/locationRepository';
import { approvePayoutRequest as repoApprovePayoutRequest, approveResetRequest as repoApproveResetRequest } from '../repositories/approvalRepository';
import { createPayoutRequest, createResetRequest } from '../repositories/requestRepository';
import { upsertTransaction } from '../repositories/transactionRepository';
import { upsertSettlement } from '../repositories/settlementRepository';
import { insertAiLog } from '../repositories/aiLogRepository';
import { supabase } from '../supabaseClient';
import { shouldApplySettlementDriverCoinUpdate } from '../utils/settlementRules';

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
        await flushQueue(supabase, {
          submitCollection: submitCollectionV2,
          submitResetRequest: createResetRequest,
          submitPayoutRequest: createPayoutRequest,
        });
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
      if (isOnline) {
        await upsertDrivers(updatedDrivers.map(d => stripClientFields(d as unknown as Record<string, unknown>) as Partial<Driver>));
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
      if (isOnline) {
        await upsertLocations(updatedLocations.map(l => stripClientFields(l as unknown as Record<string, unknown>) as Partial<Location>));
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
      if (isOnline) {
        await repoDeleteLocations(ids);
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
      if (isOnline) {
        await repoDeleteDrivers(ids);
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
      if (isOnline) {
        const txs = queryClient.getQueryData<Transaction[]>(transactionQueryKey) || [];
        const tx = txs.find(t => t.id === txId);
        if (tx) {
          await upsertTransaction(
            stripClientFields({ ...tx, ...updates } as unknown as Record<string, unknown>) as Partial<Transaction>
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

  const submitTransaction = useMutation({
    onMutate: async (tx: Transaction) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(transactionQueryKey);
      const previousLocations = queryClient.getQueryData<Location[]>(['locations']);

      queryClient.setQueryData(transactionQueryKey, (old: Transaction[] = []) => {
        const withoutExisting = old.filter(existing => existing.id !== tx.id);
        return [{ ...tx, isSynced: false }, ...withoutExisting];
      });

      if (tx.type === 'reset_request') {
        queryClient.setQueryData(['locations'], (old: Location[] = []) =>
          old.map(location =>
            location.id === tx.locationId
              ? { ...location, resetLocked: true, isSynced: false }
              : location
          )
        );
      }

      return { previousTransactions, previousLocations };
    },
    mutationFn: async (tx: Transaction) => {
      if (isOnline) {
        if (tx.type === 'reset_request') {
          await createResetRequest(tx);
          return;
        }

        if (tx.type === 'payout_request') {
          await createPayoutRequest(tx);
          return;
        }

        await upsertTransaction(
          stripClientFields({ ...tx, isSynced: true } as unknown as Record<string, unknown>) as Partial<Transaction>
        );
        return;
      }

      await enqueueTransaction(tx);
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
      }
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['locations'] });
      }
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
      if (shouldApplySettlementDriverCoinUpdate(settlement.status)) {
        const nextDayStartingCoins = settlement.actualCoins || 0;
        queryClient.setQueryData(['drivers'], (old: Driver[] = []) =>
          old.map(d => d.id === settlement.driverId ? { ...d, dailyFloatingCoins: nextDayStartingCoins, isSynced: false } : d)
        );
      }
      return { previousSettlements, previousDrivers };
    },
    mutationFn: async (settlement: DailySettlement) => {
      if (isOnline) {
        await upsertSettlement(
          stripClientFields(settlement as unknown as Record<string, unknown>) as Partial<DailySettlement>
        );
        if (shouldApplySettlementDriverCoinUpdate(settlement.status)) {
          const nextDayStartingCoins = settlement.actualCoins || 0;
          await updateDriverCoins(settlement.driverId!, nextDayStartingCoins);
        }
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

  const approveResetRequest = useMutation({
    onMutate: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(transactionQueryKey);
      const previousLocations = queryClient.getQueryData<Location[]>(['locations']);
      const targetTx = previousTransactions?.find(tx => tx.id === txId);

      queryClient.setQueryData(transactionQueryKey, (old: Transaction[] = []) =>
        old.map(tx =>
          tx.id === txId
            ? { ...tx, approvalStatus: approve ? 'approved' : 'rejected', isSynced: false }
            : tx
        )
      );

      if (targetTx) {
        queryClient.setQueryData(['locations'], (old: Location[] = []) =>
          old.map(location => {
            if (location.id !== targetTx.locationId) return location;
            return {
              ...location,
              lastScore: approve ? 0 : location.lastScore,
              resetLocked: false,
              isSynced: false,
            };
          })
        );
      }

      return { previousTransactions, previousLocations };
    },
    mutationFn: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      if (!isOnline) throw new Error('Reset approval requires online mode');
      await repoApproveResetRequest(txId, approve);
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
      }
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['locations'] });
      }
    }
  });

  const approvePayoutRequest = useMutation({
    onMutate: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(transactionQueryKey);
      const previousLocations = queryClient.getQueryData<Location[]>(['locations']);
      const targetTx = previousTransactions?.find(tx => tx.id === txId);

      queryClient.setQueryData(transactionQueryKey, (old: Transaction[] = []) =>
        old.map(tx =>
          tx.id === txId
            ? { ...tx, approvalStatus: approve ? 'approved' : 'rejected', isSynced: false }
            : tx
        )
      );

      if (approve && targetTx?.payoutAmount) {
        queryClient.setQueryData(['locations'], (old: Location[] = []) =>
          old.map(location => {
            if (location.id !== targetTx.locationId) return location;
            return {
              ...location,
              dividendBalance: Math.max(0, (location.dividendBalance || 0) - targetTx.payoutAmount!),
              isSynced: false,
            };
          })
        );
      }

      return { previousTransactions, previousLocations };
    },
    mutationFn: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      if (!isOnline) throw new Error('Payout approval requires online mode');
      await repoApprovePayoutRequest(txId, approve);
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
      }
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['locations'] });
      }
    }
  });

  const logAI = useMutation({
    mutationFn: async (log: AILog) => {
      queryClient.setQueryData(['aiLogs'], (old: AILog[] = []) => [{...log, isSynced: false}, ...old]);
      if (isOnline) {
        await insertAiLog(log);
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
    submitTransaction,
    saveSettlement,
    approveResetRequest,
    approvePayoutRequest,
    logAI
  };
}
