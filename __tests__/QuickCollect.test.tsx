jest.mock('../supabaseClient', () => ({ supabase: null }));
jest.mock('../services/collectionSubmissionOrchestrator', () => ({ orchestrateCollectionSubmission: jest.fn() }));
jest.mock('../services/financeCalculator', () => ({ calculateCollectionFinanceLocal: jest.fn(() => ({ diff: 200, revenue: 40000, commission: 6000, finalRetention: 6000, startupDebtDeduction: 0, netPayable: 34000, remainingCoins: 100, isCoinStockNegative: false, source: 'local' })) }));
jest.mock('../services/driverFlowTelemetry', () => ({ recordDriverFlowEvent: jest.fn() }));

/**
 * QuickCollect unit tests — v2 with expense fields + GPS sort.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { AuthProvider } from '../contexts/AuthContext';
import { DataProvider } from '../contexts/DataContext';
import { ToastProvider } from '../contexts/ToastContext';
import QuickCollect from '../driver/components/QuickCollect';

import { makeDriver, makeLocation } from './helpers/fixtures';

const mach1 = makeLocation({ id: 'loc-1', name: 'Machine A', lastScore: 1000, assignedDriverId: 'drv-1' });
const driver = makeDriver({ id: 'drv-1', dailyFloatingCoins: 0 });

function renderQC(cfg: any = {}) {
  return render(
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
    </AuthProvider>,
  );
}

describe('QuickCollect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing and shows machine', () => {
    const { container } = renderQC();
    expect(container.textContent).toContain('Machine A');
  });

  it('shows empty state when no machines', () => {
    const { container } = renderQC({ data: { filteredLocations: [] } });
    expect(container.textContent).toMatch(/No assigned|未分配/);
  });

  it('expands on click and shows score input', () => {
    renderQC();
    fireEvent.click(screen.getByText('Machine A'));
    expect(screen.getByPlaceholderText('0000')).toBeInTheDocument();
  });

  it('shows photo button when expanded', () => {
    renderQC();
    fireEvent.click(screen.getByText('Machine A'));
    expect(screen.getByText(/Photo|拍照/)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('disables submit when no driver', () => {
    renderQC({ currentDriver: undefined });
    fireEvent.click(screen.getByText('Machine A'));
    fireEvent.change(screen.getByPlaceholderText('0000'), { target: { value: '1200' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('shows offline indicator', () => {
    renderQC({ data: { filteredLocations: [mach1], isOnline: false } });
    fireEvent.click(screen.getByText('Machine A'));
    expect(screen.getByText(/Offline|离线模式/)).toBeInTheDocument();
  });
});
