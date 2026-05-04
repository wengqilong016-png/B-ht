jest.mock('../supabaseClient', () => ({ supabase: null }));
jest.mock('../services/collectionSubmissionOrchestrator', () => ({ orchestrateCollectionSubmission: jest.fn() }));
jest.mock('../services/financeCalculator', () => ({ calculateCollectionFinanceLocal: jest.fn(() => ({ diff: 200, revenue: 40000, commission: 6000, finalRetention: 6000, startupDebtDeduction: 0, netPayable: 34000, remainingCoins: 100, isCoinStockNegative: false, source: 'local' })) }));
jest.mock('../services/driverFlowTelemetry', () => ({ recordDriverFlowEvent: jest.fn() }));

/**
 * QuickCollect unit tests — v2 with expense fields + GPS sort.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { AuthProvider } from '../contexts/AuthContext';
import { DataProvider } from '../contexts/DataContext';
import { ToastProvider } from '../contexts/ToastContext';
import QuickCollect from '../driver/components/QuickCollect';
import { orchestrateCollectionSubmission } from '../services/collectionSubmissionOrchestrator';
import { recordDriverFlowEvent } from '../services/driverFlowTelemetry';

import { makeDriver, makeLocation } from './helpers/fixtures';

const mach1 = makeLocation({ id: 'loc-1', name: 'Machine A', lastScore: 1000, assignedDriverId: 'drv-1' });
const driver = makeDriver({ id: 'drv-1', dailyFloatingCoins: 0 });
const mockOrchestrate = orchestrateCollectionSubmission as jest.MockedFunction<typeof orchestrateCollectionSubmission>;
const mockRecordFlow = recordDriverFlowEvent as jest.MockedFunction<typeof recordDriverFlowEvent>;

function renderQC(cfg: any = {}) {
  const queryClient = cfg.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider value={{
        currentUser: { id: 'u1', role: 'driver', name: 'T', driverId: 'drv-1' } as any,
        lang: 'sw' as const, setLang: jest.fn(), handleLogin: jest.fn(), handleLogout: jest.fn(),
        activeDriverId: 'drv-1', userRole: 'driver' as const, isInitializing: false,
        ...cfg.auth,
      }}>
        <DataProvider value={{
          isOnline: true, locations: [], drivers: [], transactions: [],
          dailySettlements: [], aiLogs: [], filteredLocations: [mach1],
          filteredDrivers: [], filteredTransactions: [], filteredSettlements: [], unsyncedCount: 0,
          ...cfg.data,
        }}>
          <ToastProvider>
            <QuickCollect
              gpsCoords={cfg.gpsCoords ?? null}
              currentDriver={Object.prototype.hasOwnProperty.call(cfg, 'currentDriver') ? cfg.currentDriver : (driver as any)}
            />
          </ToastProvider>
        </DataProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('QuickCollect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrchestrate.mockResolvedValue({
      source: 'server',
      fallbackReason: null,
      transaction: {
        id: 'tx-quick', locationId: 'loc-1', driverId: 'drv-1', revenue: 40000,
        netPayable: 34000, timestamp: '2026-05-04T00:00:00.000Z',
      } as any,
    });
  });

  it('renders without crashing and shows machine', async () => {
    renderQC();
    expect(await screen.findByText('Machine A')).toBeInTheDocument();
  });

  it('shows empty state when no machines', async () => {
    renderQC({ data: { filteredLocations: [] } });
    expect(await screen.findByText(/No assigned|未分配/)).toBeInTheDocument();
  });

  it('expands on click and shows score input', async () => {
    renderQC();
    fireEvent.click(await screen.findByRole('button', { name: 'Machine A' }));
    expect(await screen.findByPlaceholderText('0000')).toBeInTheDocument();
  });

  it('shows photo button when expanded', async () => {
    renderQC();
    fireEvent.click(await screen.findByRole('button', { name: 'Machine A' }));
    expect(await screen.findByText(/Photo|拍照/)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('disables submit when no driver', async () => {
    renderQC({ currentDriver: undefined });
    fireEvent.click(await screen.findByRole('button', { name: 'Machine A' }));
    fireEvent.change(await screen.findByPlaceholderText('0000'), { target: { value: '1200' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('shows offline indicator', async () => {
    renderQC({ data: { filteredLocations: [mach1], isOnline: false } });
    fireEvent.click(await screen.findByRole('button', { name: 'Machine A' }));
    expect(await screen.findByText(/Offline|离线模式/)).toBeInTheDocument();
  });

  it('caches server transaction and records generic submit success telemetry', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['transactions', 'driver:drv-1'], []);

    renderQC({ queryClient });
    fireEvent.click(await screen.findByRole('button', { name: 'Machine A' }));
    fireEvent.change(await screen.findByPlaceholderText('0000'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(mockOrchestrate).toHaveBeenCalled());

    expect(queryClient.getQueryData(['transactions', 'driver:drv-1'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'tx-quick' })]),
    );
    expect(mockRecordFlow).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'submit_success' }));
  });
});
