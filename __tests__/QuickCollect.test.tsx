/**
 * QuickCollect unit tests.
 */

import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { AuthProvider } from '../contexts/AuthContext';
import { DataProvider } from '../contexts/DataContext';
import { ToastProvider } from '../contexts/ToastContext';
import { makeDriver, makeLocation } from './helpers/fixtures';
import QuickCollect from '../driver/components/QuickCollect';

jest.mock('../services/collectionSubmissionOrchestrator', () => ({
  orchestrateCollectionSubmission: jest.fn(),
}));

jest.mock('../services/financeCalculator', () => ({
  calculateCollectionFinanceLocal: jest.fn(() => ({
    diff: 200, revenue: 40000, commission: 6000,
    finalRetention: 6000, startupDebtDeduction: 0,
    netPayable: 34000, remainingCoins: 100,
    isCoinStockNegative: false, source: 'local',
  })),
}));

const mach1 = makeLocation({ id: 'loc-1', name: 'Machine A', lastScore: 1000, assignedDriverId: 'drv-1' });
const mach2 = makeLocation({ id: 'loc-2', name: 'Machine B', lastScore: 2000, assignedDriverId: 'drv-1' });
const drv = makeDriver({ id: 'drv-1' });

function emptyArr(): any[] { return []; }

function renderQC(gpsCoords = null, currentDriver = drv, overrides: any = {}) {
  const authCtx = {
    currentUser: { id: 'u1', role: 'driver', name: 'T', driverId: 'drv-1' } as any,
    lang: 'sw' as const, setLang: jest.fn(), handleLogin: jest.fn(),
    handleLogout: jest.fn(), activeDriverId: 'drv-1', userRole: 'driver' as const,
    isInitializing: false,
    ...overrides.auth,
  };
  const dataCtx = {
    isOnline: true, locations: [], drivers: [], transactions: [],
    dailySettlements: [], aiLogs: [], filteredLocations: [mach1, mach2],
    filteredDrivers: [], filteredTransactions: [], filteredSettlements: [],
    unsyncedCount: 0,
    ...overrides.data,
  };

  return render(
    <AuthProvider value={authCtx}>
      <DataProvider value={dataCtx}>
        <ToastProvider>
          <QuickCollect gpsCoords={gpsCoords} currentDriver={currentDriver as any} />
        </ToastProvider>
      </DataProvider>
    </AuthProvider>,
  );
}

describe('QuickCollect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders assigned machines', () => {
    renderQC();
    expect(screen.getByText('Machine A')).toBeInTheDocument();
    expect(screen.getByText('Machine B')).toBeInTheDocument();
  });

  it('shows empty state with no machines', () => {
    renderQC(null, drv, { data: { filteredLocations: [], isOnline: true, locations: [], drivers: [], transactions: emptyArr(), dailySettlements: emptyArr(), aiLogs: emptyArr(), filteredDrivers: emptyArr(), filteredTransactions: emptyArr(), filteredSettlements: emptyArr(), unsyncedCount: 0 } });
    expect(screen.getByText(/No assigned|未分配/)).toBeInTheDocument();
  });

  it('expands machine on tap and shows score input', () => {
    renderQC();
    fireEvent.click(screen.getByText('Machine A'));
    expect(screen.getByPlaceholderText('0000')).toBeInTheDocument();
  });

  it('collapses on second tap', () => {
    renderQC();
    const btn = screen.getByText('Machine A');
    fireEvent.click(btn);
    expect(screen.getByPlaceholderText('0000')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByPlaceholderText('0000')).not.toBeInTheDocument();
  });

  it('shows diff and revenue preview when score entered', () => {
    renderQC();
    fireEvent.click(screen.getByText('Machine A'));
    fireEvent.change(screen.getByPlaceholderText('0000'), { target: { value: '1200' } });
    expect(screen.getByText('+200')).toBeInTheDocument();
    expect(screen.getByText('TZS 40,000')).toBeInTheDocument();
  });

  it('disables submit when no driver', () => {
    renderQC(null, undefined, { data: { filteredLocations: [mach1], isOnline: true, locations: [], drivers: [], transactions: emptyArr(), dailySettlements: emptyArr(), aiLogs: emptyArr(), filteredDrivers: emptyArr(), filteredTransactions: emptyArr(), filteredSettlements: emptyArr(), unsyncedCount: 0 } });
    fireEvent.click(screen.getByText('Machine A'));
    fireEvent.change(screen.getByPlaceholderText('0000'), { target: { value: '1200' } });
    expect(screen.getByText(/Submit|提交收款/)).toBeDisabled();
  });

  it('shows offline indicator', () => {
    renderQC(null, drv, { data: { filteredLocations: [mach1], isOnline: false, locations: [], drivers: [], transactions: emptyArr(), dailySettlements: emptyArr(), aiLogs: emptyArr(), filteredDrivers: emptyArr(), filteredTransactions: emptyArr(), filteredSettlements: emptyArr(), unsyncedCount: 0 } });
    fireEvent.click(screen.getByText('Machine A'));
    expect(screen.getByText(/Offline|离线模式/)).toBeInTheDocument();
  });

  it('submits via orchestrator and shows success', async () => {
    const orch = require('../services/collectionSubmissionOrchestrator').orchestrateCollectionSubmission;
    orch.mockResolvedValue({ source: 'server', transaction: { id: 'tx-1' } });

    renderQC();
    fireEvent.click(screen.getByText('Machine A'));
    fireEvent.change(screen.getByPlaceholderText('0000'), { target: { value: '1200' } });
    fireEvent.click(screen.getByText(/Submit|提交收款/));

    await waitFor(() => expect(orch).toHaveBeenCalledTimes(1));
    expect(orch.mock.calls[0][0].currentScore).toBe('1200');
    expect(orch.mock.calls[0][0].selectedLocation.id).toBe('loc-1');

    await waitFor(() => expect(screen.getByText(/Done|已提交/)).toBeInTheDocument());
  });

  it('shows photo button and hidden file input when expanded', () => {
    renderQC();
    fireEvent.click(screen.getByText('Machine A'));
    expect(screen.getByText(/Photo|拍照/)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });
});
