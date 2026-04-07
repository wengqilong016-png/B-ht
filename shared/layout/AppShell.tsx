import React from 'react';

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Root layout container for both admin and driver shells.
 * Provides the flex h-screen base structure.
 */
const AppShell: React.FC<AppShellProps> = ({ children }) => (
  <div className="flex h-screen overflow-hidden bg-slate-100">
    {children}
  </div>
);

export default AppShell;
