import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { getQueueHealthSummary } from '../../offlineQueue';
import { localDB } from '../../services/localDB';
import { CONSTANTS } from '../../types';

import type { Location, Transaction } from '../../types';
import type { CompletionResult } from '../components/SubmitReview';

interface TransactionMutation {
  mutateAsync: (transaction: Transaction) => Promise<unknown>;
}

interface SyncMutation {
  mutate: () => void;
}

interface UseDriverSubmissionCompletionInput {
  activeDriverId: string | null | undefined;
  allTransactions: Transaction[];
  isOnline: boolean;
  locations: Location[];
  submitTransaction: TransactionMutation;
  syncOfflineData: SyncMutation;
}

export function useDriverSubmissionCompletion({
  activeDriverId,
  allTransactions,
  isOnline,
  locations,
  submitTransaction,
  syncOfflineData,
}: UseDriverSubmissionCompletionInput) {
  const queryClient = useQueryClient();
  const transactionQueryKey = useMemo(() => ['transactions', `driver:${activeDriverId}`] as const, [activeDriverId]);
  const transactionStorageKey = useMemo(
    () => `${CONSTANTS.STORAGE_TRANSACTIONS_KEY}:driver:${activeDriverId}`,
    [activeDriverId],
  );

  return useCallback(async ({ source, transaction: tx }: CompletionResult) => {
    if (tx.type === 'reset_request' || tx.type === 'payout_request') {
      if (tx.type === 'reset_request') {
        await submitTransaction.mutateAsync(tx);

        const currentLocations =
          queryClient.getQueryData<Location[]>(['locations']) ?? locations;
        const updatedLocations = currentLocations.map(loc =>
          loc.id === tx.locationId ? { ...loc, resetLocked: true } : loc
        );
        queryClient.setQueryData<Location[]>(['locations'], updatedLocations);

        try {
          localStorage.setItem(
            CONSTANTS.STORAGE_LOCATIONS_KEY,
            JSON.stringify(updatedLocations)
          );
        } catch (error) {
          console.warn('Failed to persist reset lock update locally.', error);
        }
        return;
      }

      await submitTransaction.mutateAsync(tx);
      return;
    }

    const currentLocations =
      queryClient.getQueryData<Location[]>(['locations']) ?? locations;
    const updatedLocations = currentLocations.map(loc =>
      loc.id === tx.locationId ? { ...loc, lastScore: tx.currentScore } : loc
    );

    queryClient.setQueryData<Location[]>(['locations'], updatedLocations);

    if (isOnline && source === 'server') {
      try {
        localStorage.setItem(
          CONSTANTS.STORAGE_LOCATIONS_KEY,
          JSON.stringify(updatedLocations)
        );
      } catch (error) {
        console.warn('Failed to persist optimistic locations update locally.', error);
      }
    }

    queryClient.setQueryData<Transaction[]>(transactionQueryKey, (old: Transaction[] = []) => {
      const withoutExisting = old.filter(existing => existing.id !== tx.id);
      return [{ ...tx }, ...withoutExisting];
    });

    const cachedTransactions =
      (queryClient.getQueryData<Transaction[]>(transactionQueryKey) ?? [{ ...tx }, ...allTransactions.filter(existing => existing.id !== tx.id)]);
    localDB.set(transactionStorageKey, cachedTransactions).catch((error) => {
      console.warn('Failed to persist submitted transaction locally.', error);
    });

    if (isOnline && source === 'server') {
      void getQueueHealthSummary()
        .then((queueHealth) => {
          if (queueHealth.pending > 0 || queueHealth.retryWaiting > 0 || queueHealth.deadLetter > 0) {
            syncOfflineData.mutate();
          }
        })
        .catch((error) => {
          console.warn('Failed to inspect queue health after submission.', error);
        });
    }
  }, [
    allTransactions,
    isOnline,
    locations,
    queryClient,
    submitTransaction,
    syncOfflineData,
    transactionQueryKey,
    transactionStorageKey,
  ]);
}
