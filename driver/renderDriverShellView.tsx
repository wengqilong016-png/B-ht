import React, { lazy } from 'react';
import type { Location } from '../types';
import type { DriverView } from './driverShellConfig';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';

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
  const { locations } = useAppData();
  const { updateLocations } = useMutations();

  switch (view) {
    case 'collect':
      return (
        <DriverCollectionFlow
          onRegisterMachine={async (location) => {
            const newLocation: Location = { ...location, isSynced: false, assignedDriverId: activeDriverId };
            await updateLocations.mutateAsync([...locations, newLocation]);
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
