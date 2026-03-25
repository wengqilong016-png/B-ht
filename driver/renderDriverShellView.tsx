import React, { lazy } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { SyncMutationHandle } from '../hooks/useSyncStatus';
import type { AILog, DailySettlement, Driver, Location, Transaction, User } from '../types';
import type { DriverView } from './driverShellConfig';
import { resolveCurrentDriver } from './driverShellViewState';

const Dashboard = lazy(() => import('../components/Dashboard'));
const DriverCollectionFlow = lazy(() => import('../driver/pages/DriverCollectionFlow'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const LocationChangeRequestForm = lazy(() => import('../driver/components/LocationChangeRequestForm'));
const DriverStatusPanel = lazy(() => import('../driver/components/DriverStatusPanel'));

interface DriverShellViewRendererProps {
  view: DriverView;
  lang: 'zh' | 'sw';
  currentUser: User;
  activeDriverId?: string;
  isOnline: boolean;
  locations: Location[];
  drivers: Driver[];
  filteredLocations: Location[];
  filteredDrivers: Driver[];
  filteredTransactions: Transaction[];
  filteredSettlements: DailySettlement[];
  aiLogs: AILog[];
  unsyncedCount: number;
  syncOfflineData: SyncMutationHandle;
  updateDrivers: UseMutationResult<unknown, unknown, Driver[], unknown>;
  updateLocations: UseMutationResult<unknown, unknown, Location[], unknown>;
  deleteLocations: UseMutationResult<unknown, unknown, string[], unknown>;
  updateTransaction: UseMutationResult<unknown, unknown, { txId: string; updates: Partial<Transaction> }, unknown>;
  saveSettlement: UseMutationResult<unknown, unknown, DailySettlement, unknown>;
  logAI: UseMutationResult<unknown, unknown, AILog, unknown>;
  onSetView: (view: DriverView) => void;
}

const DriverShellViewRenderer: React.FC<DriverShellViewRendererProps> = ({
  view,
  lang,
  currentUser,
  activeDriverId,
  isOnline,
  locations,
  drivers,
  filteredLocations,
  filteredDrivers,
  filteredTransactions,
  filteredSettlements,
  aiLogs,
  unsyncedCount,
  syncOfflineData,
  updateDrivers,
  updateLocations,
  deleteLocations,
  updateTransaction,
  saveSettlement,
  logAI,
  onSetView,
}) => {
  const activeDriver = drivers.find((driver) => driver.id === activeDriverId);
  const currentDriver = resolveCurrentDriver(drivers, activeDriverId);

  switch (view) {
    case 'collect':
      return (
        <DriverCollectionFlow
          locations={filteredLocations}
          currentDriver={currentDriver!}
          onSubmit={() => syncOfflineData.mutate()}
          lang={lang}
          onLogAI={(log) => logAI.mutate(log)}
          isOnline={isOnline}
          allTransactions={filteredTransactions}
          onRegisterMachine={async (location) => {
            const newLocation: Location = { ...location, isSynced: false, assignedDriverId: activeDriverId };
            updateLocations.mutate([...locations, newLocation]);
          }}
        />
      );
    case 'settlement':
      return (
        <Dashboard
          transactions={filteredTransactions}
          drivers={filteredDrivers}
          locations={filteredLocations}
          dailySettlements={filteredSettlements}
          aiLogs={aiLogs}
          currentUser={currentUser}
          onUpdateDrivers={(driversToSave) => updateDrivers.mutateAsync(driversToSave).then(() => {})}
          onUpdateLocations={(locationsToSave) => updateLocations.mutate(locationsToSave)}
          onDeleteLocations={(ids) => deleteLocations.mutate(ids)}
          onUpdateTransaction={(txId, updates) => updateTransaction.mutate({ txId, updates })}
          onNewTransaction={() => {}}
          onSaveSettlement={(settlement) => saveSettlement.mutate(settlement)}
          onSync={async () => syncOfflineData.mutate()}
          isSyncing={syncOfflineData.isPending}
          offlineCount={unsyncedCount}
          lang={lang}
          onNavigate={(nextView) => onSetView(nextView as DriverView)}
          initialTab="settlement"
          hideTabs={true}
        />
      );
    case 'debt':
      return (
        <DebtManager
          drivers={filteredDrivers}
          locations={filteredLocations}
          currentUser={currentUser}
          onUpdateLocations={(locationsToSave) => updateLocations.mutate(locationsToSave)}
          lang={lang}
        />
      );
    case 'history':
      return <TransactionHistory transactions={filteredTransactions} locations={locations} onAnalyze={() => {}} />;
    case 'requests':
      return (
        <LocationChangeRequestForm
          locations={filteredLocations}
          currentUser={currentUser}
          lang={lang}
          isOnline={isOnline}
        />
      );
    case 'status':
      return (
        <DriverStatusPanel
          driver={activeDriver}
          locations={locations}
          transactions={filteredTransactions}
          lang={lang}
        />
      );
    default:
      return null;
  }
};

export default DriverShellViewRenderer;
