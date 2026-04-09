import { useMutation, useQueryClient } from '@tanstack/react-query';

import { enqueueTransaction, flushQueue, reportQueueHealthToServer, resetRetryBackoff } from '../offlineQueue';
import { insertAiLog } from '../repositories/aiLogRepository';
import {
  approveExpenseRequest as repoApproveExpenseRequest,
  approvePayoutRequest as repoApprovePayoutRequest,
  approveResetRequest as repoApproveResetRequest,
  reviewAnomalyTransaction as repoReviewAnomalyTransaction,
} from '../repositories/approvalRepository';
import { upsertDrivers, updateDriverCoins } from '../repositories/driverRepository';
import { upsertLocationsWithSignal, deleteLocations as repoDeleteLocations } from '../repositories/locationRepository';
import { createPayoutRequest, createResetRequest } from '../repositories/requestRepository';
import { createSettlement as repoCreateSettlement, reviewSettlement as repoReviewSettlement } from '../repositories/settlementRepository';
import { upsertTransaction } from '../repositories/transactionRepository';
import { submitCollectionV2 } from '../services/collectionSubmissionService';
import { deleteDriverAccount } from '../services/driverManagementService';
import { localDB } from '../services/localDB';
import { getTransactionQueryScope, getSettlementQueryScope } from '../services/supabaseRoleScope';
import { supabase } from '../supabaseClient';
import { Location, Driver, Transaction, DailySettlement, AILog, User, CONSTANTS } from '../types';
import { shouldApplySettlementDriverCoinUpdate } from '../utils/settlementRules';
import { stripClientFields } from '../utils/stripClientFields';

export function useSupabaseMutations(
  isOnline: boolean,
  currentUser?: User | null,
  onMutationError?: (error: unknown) => void,
) {
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
  const transactionStorageKey = `${CONSTANTS.STORAGE_TRANSACTIONS_KEY}:${transactionQueryKey[1]}`;
  const settlementStorageKey = `${CONSTANTS.STORAGE_SETTLEMENTS_KEY}:${settlementQueryKey[1]}`;

  const persistQuerySnapshot = <T,>(queryKey: readonly unknown[], storageKey: string) => {
    const snapshot = queryClient.getQueryData<T[]>(queryKey);
    if (!snapshot) return;
    localDB.set(storageKey, snapshot).catch((error) => {
      console.warn(`Failed to persist query snapshot for ${storageKey}.`, error);
    });
  };

  const syncOfflineData = useMutation({
    mutationFn: async () => {
      if (!isOnline || !supabase) return;

      // Proactively refresh the Supabase session so a stale JWT does not cause
      // every queued item to fail with "Authentication required" (which was
      // previously classified as permanent and dead-lettered items immediately).
      // getSession() triggers a silent token refresh when the access token is
      // near expiry, without requiring a full re-login.
      await supabase.auth.getSession().catch(() => {});

      // Clear exponential-backoff timestamps before every manual sync trigger.
      // Items stuck in a retry-waiting window would otherwise be silently skipped
      // by flushQueue, making "Retry Now" appear to do nothing.
      await resetRetryBackoff().catch(() => {});

      // 1. Flush offline queue (IndexedDB).
      // Re-throw on failure so syncMutation.isError becomes true and the
      // SyncStatusPill can show "Failed · Will Retry" instead of spinning forever.
      await flushQueue(supabase, {
        submitCollection: submitCollectionV2,
        submitResetRequest: createResetRequest,
        submitPayoutRequest: createPayoutRequest,
      });

      // Report queue health for fleet-wide diagnostics (driver devices only).
      // Intentionally fire-and-forget — a diagnostics failure must not fail the sync.
      if (currentUser?.role === 'driver' && currentUser.driverId) {
        reportQueueHealthToServer(supabase, currentUser.driverId, currentUser.name).catch(() => {});
      }

      // 2. Sync local fallback data (from queryClient cache or localDB)
      // This is a simplified approach. In a fully offline-first app,
      // you would use a robust sync engine (e.g., WatermelonDB or rxdb).
      // Here we trigger refetches to let React Query pull the latest truth.
      // Use refetchQueries (not invalidateQueries) so stale data is replaced
      // immediately rather than waiting for the next consumer render.
      // Wrap in a race with a 20-second ceiling so the mutation doesn't hang
      // indefinitely on weak networks.
      await Promise.race([
        Promise.all([
          queryClient.refetchQueries({ queryKey: ['transactions'] }),
          queryClient.refetchQueries({ queryKey: ['dailySettlements'] }),
          queryClient.refetchQueries({ queryKey: ['locations'] }),
          queryClient.refetchQueries({ queryKey: ['drivers'] }),
          queryClient.refetchQueries({ queryKey: ['aiLogs'] }),
        ]),
        new Promise((resolve) => setTimeout(resolve, 20_000)),
      ]);
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
      if (!isOnline) {
        throw new Error('当前处于离线状态，无法修改司机信息。请连接网络后重试。/ Offline — cannot update drivers. Please reconnect and try again.');
      }
      await upsertDrivers(updatedDrivers.map(d => stripClientFields(d as unknown as Record<string, unknown>) as Partial<Driver>));
    },
    onError: (error, _variables, context) => {
      if (context?.previousDrivers !== undefined) {
        queryClient.setQueryData(['drivers'], context.previousDrivers);
      }
      onMutationError?.(error);
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
      if (!isOnline) {
        throw new Error('当前处于离线状态，无法注册或修改机器。请连接网络后重试。/ Offline — cannot register or update machines. Please reconnect and try again.');
      }
      const controller = new AbortController();
      const timeoutMs = 20000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await upsertLocationsWithSignal(
          updatedLocations.map(l => stripClientFields(l as unknown as Record<string, unknown>) as Partial<Location>),
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('注册请求超时（20 秒）。请检查网络后重试。/ Registration timed out (20s). Please check your network and try again.');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    onError: (error, _variables, context) => {
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['locations'] });
    }
  });

  const registerLocation = useMutation({
    onMutate: async (newLocation: Location) => {
      await queryClient.cancelQueries({ queryKey: ['locations'] });
      const previousLocations = queryClient.getQueryData<Location[]>(['locations']);
      queryClient.setQueryData(['locations'], (old: Location[] = []) => {
        const withoutExisting = old.filter((loc) => loc.id !== newLocation.id);
        return [...withoutExisting, { ...newLocation, isSynced: false }];
      });
      return { previousLocations };
    },
    mutationFn: async (newLocation: Location) => {
      if (!isOnline) {
        throw new Error('当前处于离线状态，无法注册机器。请连接网络后重试。/ Offline — cannot register machine. Please reconnect and try again.');
      }

      const controller = new AbortController();
      const timeoutMs = 20_000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await upsertLocationsWithSignal(
          [stripClientFields(newLocation as unknown as Record<string, unknown>) as Partial<Location>],
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('注册请求超时（20 秒）。请检查网络后重试。/ Registration timed out (20s). Please check your network and try again.');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    onError: (error, _variables, context) => {
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
      onMutationError?.(error);
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
    onError: (error, _variables, context) => {
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
      onMutationError?.(error);
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
      if (!isOnline) throw new Error('Cannot delete driver while offline');
      // Call Edge Function for each id so auth.users + profiles are fully removed.
      const errors: string[] = [];
      for (const id of ids) {
        const result = await deleteDriverAccount(id);
        if (result.success === false) {
          errors.push(`${id}: ${result.message}`);
        }
      }
      if (errors.length > 0) throw new Error(errors.join('; '));
      // Keep localDB in sync.
      const cached = await localDB.get<Driver[]>(CONSTANTS.STORAGE_DRIVERS_KEY) ?? [];
      await localDB.set(CONSTANTS.STORAGE_DRIVERS_KEY, cached.filter(d => !ids.includes(d.id)));
    },
    onError: (error, _variables, context) => {
      if (context?.previousDrivers !== undefined) {
        queryClient.setQueryData(['drivers'], context.previousDrivers);
      }
      onMutationError?.(error);
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
      persistQuerySnapshot<Transaction>(transactionQueryKey, transactionStorageKey);
      return { previousTransactions };
    },
    mutationFn: async ({ txId, updates }: { txId: string; updates: Partial<Transaction> }) => {
      if (isOnline) {
        await upsertTransaction(
          stripClientFields({ id: txId, ...updates } as unknown as Record<string, unknown>) as Partial<Transaction>
        );
      }
    },
    onError: (error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
        persistQuerySnapshot<Transaction>(transactionQueryKey, transactionStorageKey);
      }
      onMutationError?.(error);
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
      persistQuerySnapshot<Transaction>(transactionQueryKey, transactionStorageKey);

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
    onError: (error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
        persistQuerySnapshot<Transaction>(transactionQueryKey, transactionStorageKey);
      }
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['locations'] });
      }
    }
  });

  const createSettlement = useMutation({
    onMutate: async (settlement: DailySettlement) => {
      await queryClient.cancelQueries({ queryKey: ['dailySettlements'] });
      const previousSettlements = queryClient.getQueryData<DailySettlement[]>(settlementQueryKey);
      queryClient.setQueryData(settlementQueryKey, (old: DailySettlement[] = []) => {
        const exists = old.find(s => s.id === settlement.id);
        if (exists) return old.map(s => s.id === settlement.id ? { ...settlement, isSynced: false } : s);
        return [{ ...settlement, isSynced: false }, ...old];
      });
      persistQuerySnapshot<DailySettlement>(settlementQueryKey, settlementStorageKey);
      return { previousSettlements };
    },
    mutationFn: async (settlement: DailySettlement) => {
      if (!isOnline) throw new Error('Settlement submission requires online mode');
      await repoCreateSettlement(settlement);
    },
    onError: (error, _variables, context) => {
      if (context?.previousSettlements !== undefined) {
        queryClient.setQueryData(settlementQueryKey, context.previousSettlements);
        persistQuerySnapshot<DailySettlement>(settlementQueryKey, settlementStorageKey);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['dailySettlements'] });
      }
    }
  });

  const reviewSettlement = useMutation({
    onMutate: async ({
      settlementId,
      status,
      note,
    }: {
      settlementId: string;
      status: 'confirmed' | 'rejected';
      note?: string;
    }) => {
      await queryClient.cancelQueries({ queryKey: ['dailySettlements'] });
      await queryClient.cancelQueries({ queryKey: ['drivers'] });
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      const previousSettlements = queryClient.getQueryData<DailySettlement[]>(settlementQueryKey);
      const previousDrivers = queryClient.getQueryData<Driver[]>(['drivers']);
      const previousTransactions = queryClient.getQueryData<Transaction[]>(transactionQueryKey);
      const targetSettlement = previousSettlements?.find(settlement => settlement.id === settlementId);

      queryClient.setQueryData(settlementQueryKey, (old: DailySettlement[] = []) =>
        old.map(settlement =>
          settlement.id === settlementId
            ? { ...settlement, status, note: note ?? settlement.note, isSynced: false }
            : settlement
        )
      );
      persistQuerySnapshot<DailySettlement>(settlementQueryKey, settlementStorageKey);

      if (targetSettlement?.driverId && targetSettlement.date) {
        const nextPaymentStatus: Transaction['paymentStatus'] = status === 'confirmed' ? 'paid' : 'rejected';
        queryClient.setQueryData(transactionQueryKey, (old: Transaction[] = []) =>
          old.map(tx => {
            const txDate = tx.timestamp?.slice(0, 10);
            if (tx.type !== 'collection') return tx;
            if (tx.driverId !== targetSettlement.driverId) return tx;
            if (txDate !== targetSettlement.date) return tx;
            return { ...tx, paymentStatus: nextPaymentStatus, isSynced: false };
          })
        );
        persistQuerySnapshot<Transaction>(transactionQueryKey, transactionStorageKey);
      }

      if (targetSettlement?.driverId && shouldApplySettlementDriverCoinUpdate(status)) {
        const nextDayStartingCoins = targetSettlement.actualCoins || 0;
        queryClient.setQueryData(['drivers'], (old: Driver[] = []) =>
          old.map(driver =>
            driver.id === targetSettlement.driverId
              ? { ...driver, dailyFloatingCoins: nextDayStartingCoins, isSynced: false }
              : driver
          )
        );
      }

      return { previousSettlements, previousDrivers, previousTransactions };
    },
    mutationFn: async ({
      settlementId,
      status,
      note,
    }: {
      settlementId: string;
      status: 'confirmed' | 'rejected';
      note?: string;
    }) => {
      if (!isOnline) throw new Error('Settlement review requires online mode');
      const reviewedSettlement = await repoReviewSettlement(settlementId, status, note);
      if (reviewedSettlement.driverId && shouldApplySettlementDriverCoinUpdate(reviewedSettlement.status)) {
        const nextDayStartingCoins = reviewedSettlement.actualCoins || 0;
        await updateDriverCoins(reviewedSettlement.driverId, nextDayStartingCoins);
      }
      return reviewedSettlement;
    },
    onSuccess: (reviewedSettlement) => {
      if (reviewedSettlement) {
        queryClient.setQueryData(settlementQueryKey, (old: DailySettlement[] = []) =>
          old.map(s => s.id === reviewedSettlement.id ? { ...reviewedSettlement, isSynced: true } : s)
        );
        persistQuerySnapshot<DailySettlement>(settlementQueryKey, settlementStorageKey);
        // Also persist transaction cache (paymentStatus was updated in onMutate)
        persistQuerySnapshot<Transaction>(transactionQueryKey, transactionStorageKey);
        // Persist driver cache (dailyFloatingCoins was updated in onMutate)
        localDB.set(CONSTANTS.STORAGE_DRIVERS_KEY, queryClient.getQueryData<Driver[]>(['drivers']) ?? []).catch(() => {});
      }
    },
    onError: (error, _variables, context) => {
      if (context?.previousSettlements !== undefined) {
        queryClient.setQueryData(settlementQueryKey, context.previousSettlements);
        persistQuerySnapshot<DailySettlement>(settlementQueryKey, settlementStorageKey);
      }
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
        persistQuerySnapshot<Transaction>(transactionQueryKey, transactionStorageKey);
      }
      if (context?.previousDrivers !== undefined) {
        queryClient.setQueryData(['drivers'], context.previousDrivers);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['dailySettlements'] });
        queryClient.invalidateQueries({ queryKey: ['drivers'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
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
    onError: (error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
      }
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['locations'] });
      }
    }
  });

  const approveExpenseRequest = useMutation({
    onMutate: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(transactionQueryKey);

      queryClient.setQueryData(transactionQueryKey, (old: Transaction[] = []) =>
        old.map(tx =>
          tx.id === txId
            ? { ...tx, expenseStatus: approve ? 'approved' : 'rejected', isSynced: false }
            : tx
        )
      );

      return { previousTransactions };
    },
    mutationFn: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      if (!isOnline) throw new Error('Expense approval requires online mode');
      await repoApproveExpenseRequest(txId, approve);
    },
    onError: (error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
      }
    }
  });

  const reviewAnomalyTransaction = useMutation({
    onMutate: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(transactionQueryKey);

      queryClient.setQueryData(transactionQueryKey, (old: Transaction[] = []) =>
        old.map(tx =>
          tx.id === txId
            ? {
                ...tx,
                approvalStatus: approve ? 'approved' : 'rejected',
                isAnomaly: approve ? false : tx.isAnomaly,
                isSynced: false,
              }
            : tx
        )
      );

      return { previousTransactions };
    },
    mutationFn: async ({ txId, approve }: { txId: string; approve: boolean }) => {
      if (!isOnline) throw new Error('Anomaly review requires online mode');
      await repoReviewAnomalyTransaction(txId, approve);
    },
    onError: (error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
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
    onError: (error, _variables, context) => {
      if (context?.previousTransactions !== undefined) {
        queryClient.setQueryData(transactionQueryKey, context.previousTransactions);
      }
      if (context?.previousLocations !== undefined) {
        queryClient.setQueryData(['locations'], context.previousLocations);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['locations'] });
      }
    }
  });

  const logAI = useMutation({
    onMutate: async (log: AILog) => {
      await queryClient.cancelQueries({ queryKey: ['aiLogs'] });
      const previousAiLogs = queryClient.getQueryData<AILog[]>(['aiLogs']);
      queryClient.setQueryData(['aiLogs'], (old: AILog[] = []) => [{...log, isSynced: false}, ...old]);
      return { previousAiLogs };
    },
    mutationFn: async (log: AILog) => {
      if (isOnline) {
        await insertAiLog(log);
      }
    },
    onError: (error, _variables, context) => {
      if (context?.previousAiLogs !== undefined) {
        queryClient.setQueryData(['aiLogs'], context.previousAiLogs);
      }
      onMutationError?.(error);
    },
    onSettled: () => {
      if (isOnline) queryClient.invalidateQueries({ queryKey: ['aiLogs'] });
    }
  });

  return {
    syncOfflineData,
    updateDrivers,
    updateLocations,
    registerLocation,
    deleteLocations,
    deleteDrivers,
    updateTransaction,
    submitTransaction,
    createSettlement,
    reviewSettlement,
    approveExpenseRequest,
    reviewAnomalyTransaction,
    approveResetRequest,
    approvePayoutRequest,
    logAI
  };
}
