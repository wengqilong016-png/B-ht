import React, { createContext, useContext } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { Location, Driver, Transaction, DailySettlement, AILog } from '../types';
import type { SyncMutationHandle } from '../hooks/useSyncStatus';

interface MutationContextValue {
  syncOfflineData: SyncMutationHandle;
  updateDrivers: UseMutationResult<unknown, unknown, Driver[], unknown>;
  updateLocations: UseMutationResult<unknown, unknown, Location[], unknown>;
  deleteLocations: UseMutationResult<unknown, unknown, string[], unknown>;
  deleteDrivers: UseMutationResult<unknown, unknown, string[], unknown>;
  updateTransaction: UseMutationResult<unknown, unknown, { txId: string; updates: Partial<Transaction> }, unknown>;
  submitTransaction: UseMutationResult<unknown, unknown, Transaction, unknown>;
  createSettlement: UseMutationResult<unknown, unknown, DailySettlement, unknown>;
  reviewSettlement: UseMutationResult<unknown, unknown, { settlementId: string; status: 'confirmed' | 'rejected'; note?: string }, unknown>;
  approveExpenseRequest: UseMutationResult<unknown, unknown, { txId: string; approve: boolean }, unknown>;
  reviewAnomalyTransaction: UseMutationResult<unknown, unknown, { txId: string; approve: boolean }, unknown>;
  approveResetRequest: UseMutationResult<unknown, unknown, { txId: string; approve: boolean }, unknown>;
  approvePayoutRequest: UseMutationResult<unknown, unknown, { txId: string; approve: boolean }, unknown>;
  logAI: UseMutationResult<unknown, unknown, AILog, unknown>;
}

const MutationContext = createContext<MutationContextValue | null>(null);

export function MutationProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: MutationContextValue;
}) {
  return <MutationContext.Provider value={value}>{children}</MutationContext.Provider>;
}

export function useMutations(): MutationContextValue {
  const ctx = useContext(MutationContext);
  if (!ctx) throw new Error('useMutations must be used inside MutationProvider');
  return ctx;
}
