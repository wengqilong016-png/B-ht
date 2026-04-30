import React, { lazy } from 'react';

import { useMutations } from '../contexts/MutationContext';

import { mapAdminViewToDashboardTab } from './adminShellConfig';
import { isDashboardBackedAdminView } from './adminShellViewState';

import type { AdminView } from './adminShellConfig';
import type { Location } from '../types';

const Dashboard = lazy(() => import('../components/dashboard/DashboardPage'));
const DriverCollectionFlow = lazy(() => import('../driver/pages/DriverCollectionFlow'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const DriverManagement = lazy(() => import('../components/driver-management'));
const MonthlyReportPage = lazy(() => import('./MonthlyReportPage'));
const DriverFlowDiagnosticsPage = lazy(() => import('./DriverFlowDiagnosticsPage'));
const AdminDeadLetterPage = lazy(() => import('./AdminDeadLetterPage'));

interface AdminShellViewRendererProps {
  view: AdminView;
  onSetView: (view: AdminView) => void;
}

const AdminShellViewRenderer: React.FC<AdminShellViewRendererProps> = ({
  view,
  onSetView,
}) => {
  const { registerLocation } = useMutations();

  if (isDashboardBackedAdminView(view)) {
    return (
      <Dashboard
        onNavigate={(nextView) => onSetView(nextView as AdminView)}
        initialTab={mapAdminViewToDashboardTab(view)}
        hideTabs={true}
      />
    );
  }

  switch (view) {
    case 'team':
      return <DriverManagement />;
    case 'collect':
      return (
        <DriverCollectionFlow
          registrationDoneLabel="返回管理录入"
          onRegisterMachine={async (location) => {
            // Keep assignedDriverId set by MachineRegistrationForm — admin
            // is intentionally registering FOR a specific driver.
            const newLocation: Location = { ...location, isSynced: false };
            await registerLocation.mutateAsync(newLocation);
          }}
        />
      );
    case 'history':
      return <TransactionHistory />;
    case 'debt':
      return <DebtManager />;
    case 'monthly':
      return <MonthlyReportPage />;
    case 'driver-flow':
      return <DriverFlowDiagnosticsPage />;
    case 'dead-letter':
      return <AdminDeadLetterPage />;
    default:
      return null;
  }
};

export default AdminShellViewRenderer;
