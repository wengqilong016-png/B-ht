import React from 'react';
import { User, Location, Driver, Transaction, DailySettlement, AILog } from '../types';
import { SyncMutationHandle } from '../hooks/useSyncStatus';
import AppAdminShell from '../admin/AppAdminShell';
import AppDriverShell from '../driver/AppDriverShell';

interface AppRouterShellProps {
  currentUser: User;
  lang: 'zh' | 'sw';
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
  activeDriverId: string | undefined;
  syncOfflineData: SyncMutationHandle;
  updateDrivers: { mutateAsync: (d: Driver[]) => Promise<any>; mutate: (d: Driver[]) => void };
  updateLocations: { mutate: (l: Location[]) => void };
  deleteLocations: { mutate: (ids: string[]) => void };
  deleteDrivers: { mutate: (ids: string[]) => void };
  updateTransaction: { mutate: (args: { txId: string; updates: Partial<Transaction> }) => void };
  saveSettlement: { mutate: (s: DailySettlement) => void };
  logAI: { mutate: (l: AILog) => void };
  onSetLang: (lang: 'zh' | 'sw') => void;
  onLogout: () => void;
}

const AppRouterShell: React.FC<AppRouterShellProps> = (props) => {
  if (props.currentUser.role === 'admin') {
    return <AppAdminShell {...props} />;
  }
  return <AppDriverShell {...props} />;
};

export default AppRouterShell;
