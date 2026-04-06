import React, { lazy } from 'react';
import type { Location } from '../types';
import type { AdminView } from './adminShellConfig';
import { mapAdminViewToDashboardTab } from './adminShellConfig';
import { isDashboardBackedAdminView } from './adminShellViewState';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';

const Dashboard = lazy(() => import('../components/dashboard/DashboardPage'));
const DriverCollectionFlow = lazy(() => import('../driver/pages/DriverCollectionFlow'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const DriverManagement = lazy(() => import('../components/driver-management'));

interface AdminShellViewRendererProps {
  view: AdminView;
  onSetView: (view: AdminView) => void;
}

const AdminShellViewRenderer: React.FC<AdminShellViewRendererProps> = ({
  view,
  onSetView,
}) => {
  const { activeDriverId } = useAuth();
  const { locations } = useAppData();
  const { updateLocations } = useMutations();

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
          onRegisterMachine={async (location) => {
            const newLocation: Location = { ...location, isSynced: false, assignedDriverId: activeDriverId };
            await updateLocations.mutateAsync([...locations, newLocation]);
          }}
        />
      );
    case 'history':
      return <TransactionHistory />;
    case 'debt':
      return <DebtManager />;
    default:
      return null;
  }
};

export default AdminShellViewRenderer;
