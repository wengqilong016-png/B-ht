import React, { lazy } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';

import { resolveCurrentDriver } from './driverShellViewState';

import type { DriverView } from './driverShellConfig';
import type { Location } from '../types';

const Dashboard = lazy(() => import('../components/dashboard/DashboardPage'));
const DriverCollectionFlow = lazy(() => import('../driver/pages/DriverCollectionFlow'));
const QuickCollect = lazy(() => import('../driver/components/QuickCollect'));
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
  const { drivers } = useAppData();
  const { registerLocation } = useMutations();
  const currentDriver = resolveCurrentDriver(drivers, activeDriverId);

  switch (view) {
    case 'quick':
      return <QuickCollect gpsCoords={null} currentDriver={currentDriver} />;
    case 'collect':
      return (
        <DriverCollectionFlow
          registrationDoneLabel="返回机器列表"
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
