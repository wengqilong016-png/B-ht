import React, { createContext, useContext } from 'react';
import type { Location, Driver, Transaction, DailySettlement, AILog } from '../types';
import type { SyncMutationHandle } from '../hooks/useSyncStatus';

interface MutationContextValue {
  syncOfflineData: SyncMutationHandle;
  updateDrivers: { mutateAsync: (d: Driver[]) => Promise<any>; mutate: (d: Driver[]) => void };
  updateLocations: { mutate: (l: Location[]) => void };
  deleteLocations: { mutate: (ids: string[]) => void };
  deleteDrivers: { mutate: (ids: string[]) => void };
  updateTransaction: { mutate: (args: { txId: string; updates: Partial<Transaction> }) => void };
  saveSettlement: { mutate: (s: DailySettlement) => void };
  logAI: { mutate: (l: AILog) => void };
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
