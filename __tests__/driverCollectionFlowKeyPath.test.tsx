jest.mock('../supabaseClient', () => ({ supabase: null }));
jest.mock('../services/driverFlowTelemetry', () => ({
  recordDriverFlowEvent: jest.fn(),
  flushDriverFlowEvents: jest.fn(),
}));

/**
 * DriverCollectionFlow — minimal render test.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import React from 'react';

import { AuthProvider } from '../contexts/AuthContext';
import { ConfirmProvider } from '../contexts/ConfirmContext';
import { DataProvider } from '../contexts/DataContext';
import { MutationProvider } from '../contexts/MutationContext';
import { ToastProvider } from '../contexts/ToastContext';
import DriverCollectionFlow from '../driver/pages/DriverCollectionFlow';

const noop = jest.fn();
const noopMutation = { mutateAsync: jest.fn(), mutate: jest.fn() } as any;

function renderFlow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider value={{
        currentUser: { id: 'u1', role: 'driver', name: 'T', driverId: 'drv-1' } as any,
        lang: 'sw' as const, setLang: noop, handleLogout: noop,
        activeDriverId: 'drv-1', userRole: 'driver' as const,
      }}>
        <DataProvider value={{
          isOnline: true, locations: [], drivers: [{ id: 'drv-1', name: 'T', username: 't', phone: '0711', initialDebt: 0, remainingDebt: 0, dailyFloatingCoins: 100, vehicleInfo: { model: 'B', plate: 'T1' }, status: 'active', baseSalary: 300000, commissionRate: 0.05 }] as any,
          transactions: [], dailySettlements: [], aiLogs: [],
          filteredLocations: [], filteredDrivers: [], filteredTransactions: [], filteredSettlements: [],
          unsyncedCount: 0,
        }}>
          <MutationProvider value={{
            submitTransaction: noopMutation, syncOfflineData: noopMutation,
            updateLocations: noopMutation, registerLocation: noopMutation,
            deleteLocations: noopMutation, updateDrivers: noopMutation,
            deleteDrivers: noopMutation, updateTransaction: noopMutation,
            createSettlement: noopMutation, reviewSettlement: noopMutation,
            approveExpenseRequest: noopMutation, reviewAnomalyTransaction: noopMutation,
            approveResetRequest: noopMutation, approvePayoutRequest: noopMutation,
            logAI: noopMutation,
          }}>
            <ConfirmProvider>
              <ToastProvider>
                <DriverCollectionFlow />
              </ToastProvider>
            </ConfirmProvider>
          </MutationProvider>
        </DataProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('DriverCollectionFlow key path', () => {
  it('renders machine selection step', () => {
    const { container } = renderFlow();
    expect(container.querySelector('[data-testid="driver-flow-step-selection"]')).toBeTruthy();
  });
});
