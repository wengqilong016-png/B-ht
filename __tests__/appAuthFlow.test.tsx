import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '../types';
import AppWithBoundary from '../App';

const mockUseSupabaseData = jest.fn();
const mockUseSupabaseMutations = jest.fn();
const mockUseRealtimeSubscription = jest.fn();
const mockUseOfflineSyncLoop = jest.fn();
const mockUseDevicePerformance = jest.fn();

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'auth-user-1',
    username: 'driver@example.com',
    role: 'driver',
    name: 'Driver One',
    driverId: 'drv-1',
    mustChangePassword: false,
    ...overrides,
  };
}

jest.mock('../hooks/useAuthBootstrap', () => {
  const React = require('react');
  const user = {
    id: 'auth-user-1',
    username: 'driver@example.com',
    role: 'driver',
    name: 'Driver One',
    driverId: 'drv-1',
    mustChangePassword: false,
  };

  return {
    useAuthBootstrap: () => {
      const [currentUser, setCurrentUser] = React.useState(null as User | null);
      const [lang, setLang] = React.useState('zh' as 'zh' | 'sw');

      return {
        currentUser,
        userRole: currentUser?.role ?? null,
        lang,
        isInitializing: false,
        handleLogin: (nextUser = user) => setCurrentUser(nextUser),
        handleLogout: jest.fn(),
        setLang,
      };
    },
  };
});

jest.mock('../hooks/useDevicePerformance', () => ({
  useDevicePerformance: () => mockUseDevicePerformance(),
}));

jest.mock('../hooks/useSupabaseData', () => ({
  useSupabaseData: (...args: unknown[]) => mockUseSupabaseData(...args),
}));

jest.mock('../hooks/useSupabaseMutations', () => ({
  useSupabaseMutations: (...args: unknown[]) => mockUseSupabaseMutations(...args),
}));

jest.mock('../hooks/useRealtimeSubscription', () => ({
  useRealtimeSubscription: (...args: unknown[]) => mockUseRealtimeSubscription(...args),
}));

jest.mock('../hooks/useOfflineSyncLoop', () => ({
  useOfflineSyncLoop: (...args: unknown[]) => mockUseOfflineSyncLoop(...args),
}));

jest.mock('../components/Login', () => ({
  __esModule: true,
  default: ({ onLogin }: { onLogin: (user?: User) => void }) => (
    <button
      type="button"
      onClick={() =>
        onLogin({
          id: 'auth-user-1',
          username: 'driver@example.com',
          role: 'driver',
          name: 'Driver One',
          driverId: 'drv-1',
          mustChangePassword: false,
        } as User)
      }
    >
      Mock Login
    </button>
  ),
}));

jest.mock('../shared/AppRouterShell', () => ({
  __esModule: true,
  default: () => (
    <div data-testid="authenticated-app-shell">
      <div data-testid="router-shell-content">Authenticated Shell</div>
    </div>
  ),
}));

jest.mock('../shared/UpdatePrompt', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/AppUpdateModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/ForcePasswordChange', () => ({
  __esModule: true,
  default: () => null,
}));

describe('App auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSupabaseData.mockReturnValue({
      isOnline: false,
      locations: [],
      drivers: [],
      transactions: [],
      dailySettlements: [],
      aiLogs: [],
    });
    mockUseSupabaseMutations.mockReturnValue({
      syncOfflineData: jest.fn(),
      updateDrivers: { mutateAsync: jest.fn() },
      updateLocations: { mutateAsync: jest.fn() },
      deleteLocations: { mutateAsync: jest.fn() },
      deleteDrivers: { mutateAsync: jest.fn() },
      updateTransaction: { mutateAsync: jest.fn() },
      submitTransaction: { mutateAsync: jest.fn() },
      createSettlement: { mutateAsync: jest.fn() },
      reviewSettlement: { mutateAsync: jest.fn() },
      approveExpenseRequest: { mutateAsync: jest.fn() },
      reviewAnomalyTransaction: { mutateAsync: jest.fn() },
      approveResetRequest: { mutateAsync: jest.fn() },
      approvePayoutRequest: { mutateAsync: jest.fn() },
      logAI: { mutateAsync: jest.fn() },
    });
  });

  it('enters the authenticated shell after a successful login callback', async () => {
    render(<AppWithBoundary />);

    expect(screen.queryByTestId('authenticated-app-shell')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mock Login' }));

    await waitFor(() => expect(screen.queryByTestId('authenticated-app-shell')).not.toBeNull());
    expect(screen.getByTestId('router-shell-content').textContent).toContain('Authenticated Shell');
  });
});
