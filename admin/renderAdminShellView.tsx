import React, { lazy } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { SyncMutationHandle } from '../hooks/useSyncStatus';
import type { AILog, DailySettlement, Driver, Location, Transaction, User } from '../types';
import type { AdminView } from './adminShellConfig';
import { mapAdminViewToDashboardTab } from './adminShellConfig';
import { isDashboardBackedAdminView } from './adminShellViewState';

const Dashboard = lazy(() => import('../components/Dashboard'));
const CollectionForm = lazy(() => import('../components/CollectionForm'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const FinancialReports = lazy(() => import('../components/FinancialReports'));
const AIHub = lazy(() => import('../components/ai-hub'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const BillingReconciliation = lazy(() => import('../components/BillingReconciliation'));
const DriverManagement = lazy(() => import('../components/driver-management'));
const LocationChangeReview = lazy(() => import('./pages/LocationChangeReview'));
const QueueDiagnostics = lazy(() => import('./components/QueueDiagnostics'));
const FleetDiagnostics = lazy(() => import('./components/FleetDiagnostics'));
const HealthAlerts = lazy(() => import('./components/HealthAlerts'));
const AuditTrail = lazy(() => import('./components/AuditTrail'));
const SupportCases = lazy(() => import('./components/SupportCases'));
const CaseDetail = lazy(() => import('./components/CaseDetail'));
const DriverLookup = lazy(() => import('./components/DriverLookup'));
const DriverMachines = lazy(() => import('./components/DriverMachines'));

interface AdminShellViewRendererProps {
  view: AdminView;
  currentUser: User;
  lang: 'zh' | 'sw';
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
  aiContextId: string;
  auditCaseFilter: string;
  selectedCaseId: string;
  selectedDriverId: string;
  onSetView: (view: AdminView) => void;
  onClearAiContext: () => void;
  onConsumeAuditCaseFilter: () => void;
  onSelectCaseId: (caseId: string) => void;
  onSelectDriverId: (driverId: string) => void;
  onSetAuditCaseFilter: (caseId: string) => void;
  syncOfflineData: SyncMutationHandle;
  updateDrivers: UseMutationResult<unknown, unknown, Driver[], unknown>;
  updateLocations: UseMutationResult<unknown, unknown, Location[], unknown>;
  deleteLocations: UseMutationResult<unknown, unknown, string[], unknown>;
  deleteDrivers: UseMutationResult<unknown, unknown, string[], unknown>;
  updateTransaction: UseMutationResult<unknown, unknown, { txId: string; updates: Partial<Transaction> }, unknown>;
  saveSettlement: UseMutationResult<unknown, unknown, DailySettlement, unknown>;
  logAI: UseMutationResult<unknown, unknown, AILog, unknown>;
}

const AdminShellViewRenderer: React.FC<AdminShellViewRendererProps> = ({
  view,
  currentUser,
  lang,
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
  aiContextId,
  auditCaseFilter,
  selectedCaseId,
  selectedDriverId,
  onSetView,
  onClearAiContext,
  onConsumeAuditCaseFilter,
  onSelectCaseId,
  onSelectDriverId,
  onSetAuditCaseFilter,
  syncOfflineData,
  updateDrivers,
  updateLocations,
  deleteLocations,
  deleteDrivers,
  updateTransaction,
  saveSettlement,
  logAI,
}) => {
  if (isDashboardBackedAdminView(view)) {
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
        onNavigate={(nextView) => onSetView(nextView as AdminView)}
        initialTab={mapAdminViewToDashboardTab(view)}
        hideTabs={true}
      />
    );
  }

  switch (view) {
    case 'team':
      return (
        <DriverManagement
          drivers={filteredDrivers}
          locations={locations}
          transactions={filteredTransactions}
          dailySettlements={filteredSettlements}
          onUpdateDrivers={(driversToSave) => updateDrivers.mutateAsync(driversToSave).then(() => {})}
          onUpdateLocations={(locationsToSave) => updateLocations.mutate(locationsToSave)}
          onDeleteDrivers={(ids) => deleteDrivers.mutate(ids)}
        />
      );
    case 'billing':
      return (
        <BillingReconciliation
          drivers={filteredDrivers}
          transactions={filteredTransactions}
          dailySettlements={filteredSettlements}
        />
      );
    case 'collect':
      return (
        <CollectionForm
          locations={filteredLocations}
          currentDriver={drivers.find((driver) => driver.id === activeDriverId) || drivers[0]}
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
    case 'history':
      return <TransactionHistory transactions={filteredTransactions} locations={locations} onAnalyze={() => {}} />;
    case 'reports':
      return (
        <FinancialReports
          transactions={filteredTransactions}
          drivers={filteredDrivers}
          locations={filteredLocations}
          dailySettlements={filteredSettlements}
          lang={lang}
        />
      );
    case 'debt':
      return (
        <DebtManager
          drivers={filteredDrivers}
          locations={filteredLocations}
          currentUser={currentUser}
          onUpdateLocations={(locationsToSave) => updateLocations.mutate(locationsToSave)}
          onUpdateDrivers={(driversToSave) => updateDrivers.mutateAsync(driversToSave).then(() => {})}
          lang={lang}
        />
      );
    case 'ai':
      return (
        <AIHub
          drivers={filteredDrivers}
          locations={filteredLocations}
          transactions={filteredTransactions}
          onLogAI={(log) => logAI.mutate(log)}
          currentUser={currentUser}
          initialContextId={aiContextId}
          onClearContext={onClearAiContext}
        />
      );
    case 'change-review':
      return <LocationChangeReview locations={locations} lang={lang} />;
    case 'diagnostics':
      return <QueueDiagnostics />;
    case 'fleet-diagnostics':
      return <FleetDiagnostics />;
    case 'health-alerts':
      return <HealthAlerts />;
    case 'support-cases':
      return (
        <SupportCases
          onNavigateToAudit={(caseId) => {
            onSetAuditCaseFilter(caseId);
            onSetView('audit-trail');
          }}
          onNavigateToCaseDetail={(caseId) => {
            onSelectCaseId(caseId);
            onSetView('case-detail');
          }}
        />
      );
    case 'case-detail':
      return selectedCaseId ? (
        <CaseDetail
          caseId={selectedCaseId}
          onBack={() => onSetView('support-cases')}
          onNavigateToAudit={(caseId) => {
            onSetAuditCaseFilter(caseId);
            onSetView('audit-trail');
          }}
          currentOperator={currentUser.id}
        />
      ) : null;
    case 'audit-trail':
      return (
        <AuditTrail
          initialCaseFilter={auditCaseFilter}
          onCaseFilterConsumed={onConsumeAuditCaseFilter}
          onNavigateToCases={() => onSetView('support-cases')}
        />
      );
    case 'driver-lookup':
      return (
        <DriverLookup
          drivers={filteredDrivers}
          locations={locations}
          onSelectDriver={(driverId) => {
            onSelectDriverId(driverId);
            onSetView('driver-machines');
          }}
        />
      );
    case 'driver-machines': {
      if (!selectedDriverId) {
        return null;
      }

      const selectedDriver = drivers.find((d) => d.id === selectedDriverId);

      if (!selectedDriver) {
        return (
          <div className="p-4">
            <p className="mb-4 text-red-600">未找到对应的司机，请返回重新选择。</p>
            <button
              type="button"
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              onClick={() => {
                onSelectDriverId('');
                onSetView('driver-lookup');
              }}
            >
              返回
            </button>
          </div>
        );
      }

      return (
        <DriverMachines
          driver={selectedDriver}
          locations={locations}
          drivers={drivers}
          onBack={() => {
            onSelectDriverId('');
            onSetView('driver-lookup');
          }}
          onUpdateLocations={(locs) => updateLocations.mutate(locs)}
        />
      );
    }
    default:
      return null;
  }
};

export default AdminShellViewRenderer;
