import React, { lazy } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useMutations } from '../contexts/MutationContext';

import type { DriverView } from './driverShellConfig';
import type { Location } from '../types';

const Dashboard = lazy(() => import('../components/dashboard/DashboardPage'));
const DriverCollectionFlow = lazy(() => import('../driver/pages/DriverCollectionFlow'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const DriverStatusPanel = lazy(() => import('../driver/components/DriverStatusPanel'));

interface DriverShellViewRendererProps {
  view: DriverView;
  onSetView: (view: DriverView) => void;
}

const DriverShellViewRenderer: React.FC<DriverShellViewRendererProps> = ({
  view,
  onSetView,
}) => {
  const { activeDriverId } = useAuth();
  const { registerLocation } = useMutations();

  switch (view) {
    case 'collect':
      return (
        <DriverCollectionFlow
          onRegisterMachine={async (location) => {
            const newLocation: Location = { ...location, isSynced: false, assignedDriverId: activeDriverId };
            await registerLocation.mutateAsync(newLocation);
          }}
        />
      );
    case 'settlement':
      return (
        <Dashboard
          onNavigate={(nextView) => onSetView(nextView as DriverView)}
          initialTab="settlement"
          hideTabs={true}
        />
      );
    case 'debt':
      return <DebtManager />;
    case 'history':
      return <TransactionHistory />;
    case 'status':
      return <DriverStatusPanel />;
    default:
      return null;
  }
};

export default DriverShellViewRenderer;
