import React from 'react';
import { useAuth } from '../contexts';
import AppAdminShell from '../admin/AppAdminShell';
import AppDriverShell from '../driver/AppDriverShell';

const AppRouterShell: React.FC = () => {
  const { currentUser } = useAuth();
  if (currentUser?.role === 'admin') {
    return <AppAdminShell />;
  }
  return <AppDriverShell />;
};

export default AppRouterShell;
