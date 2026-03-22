import React, { createContext, useContext } from 'react';
import type { Location, Driver, Transaction, DailySettlement, AILog } from '../types';

interface DataContextValue {
  isOnline: boolean;
  locations: Location[];
  drivers: Driver[];
  transactions: Transaction[];
  dailySettlements: DailySettlement[];
  aiLogs: AILog[];
  filteredLocations: Location[];
  filteredDrivers: Driver[];
  filteredTransactions: Transaction[];
  filteredSettlements: DailySettlement[];
  unsyncedCount: number;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: DataContextValue;
}) {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useAppData must be used inside DataProvider');
  return ctx;
}
