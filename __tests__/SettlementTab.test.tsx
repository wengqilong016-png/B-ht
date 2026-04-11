import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import SettlementTab from '../components/dashboard/SettlementTab';
import { ToastProvider } from '../contexts/ToastContext';

import type { DailySettlement, Driver, Location, Transaction, User } from '../types';

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function makeSettlement(overrides: Partial<DailySettlement> = {}): DailySettlement {
  return {
    id: 'STL-1',
    date: '2026-04-10',
    driverId: 'drv-1',
    driverName: 'Driver One',
    totalRevenue: 40000,
    totalNetPayable: 30000,
    totalExpenses: 2000,
    driverFloat: 1200,
    expectedTotal: 30000,
    actualCash: 25000,
    actualCoins: 5000,
    shortage: 0,
    timestamp: '2026-04-10T18:00:00.000Z',
    status: 'pending',
    isSynced: true,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'TX-1',
    timestamp: '2026-04-10T10:00:00.000Z',
    uploadTimestamp: '2026-04-10T10:00:00.000Z',
    locationId: 'loc-1',
    locationName: 'Shop One',
    driverId: 'drv-1',
    driverName: 'Driver One',
    previousScore: 100,
    currentScore: 120,
    revenue: 20000,
    commission: 3000,
    ownerRetention: 3000,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 15000,
    gps: { lat: -6.8, lng: 39.2 },
    dataUsageKB: 120,
    isSynced: true,
    paymentStatus: 'pending',
    approvalStatus: 'approved',
    type: 'collection',
    reportedStatus: 'active',
    ...overrides,
  };
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'drv-1',
    name: 'Driver One',
    username: 'driver-one',
    phone: '0711000000',
    initialDebt: 0,
    remainingDebt: 0,
    dailyFloatingCoins: 1000,
    vehicleInfo: { model: 'Bajaj', plate: 'T123 ABC' },
    status: 'active',
    baseSalary: 0,
    commissionRate: 0.15,
    ...overrides,
  };
}

function makeUser(role: User['role']): User {
  if (role === 'admin') {
    return {
      id: 'admin-1',
      username: 'admin@example.com',
      role: 'admin',
      name: 'Admin One',
    };
  }

  return {
    id: 'driver-auth-1',
    username: 'driver@example.com',
    role: 'driver',
    name: 'Driver One',
    driverId: 'drv-1',
  };
}

function renderSettlementTab(
  overrides: Partial<React.ComponentProps<typeof SettlementTab>> = {},
) {
  return renderWithProviders(
    <SettlementTab
      isAdmin={false}
      unsyncedCollectionsCount={0}
      transactions={[]}
      pendingSettlements={[]}
      pendingExpenses={[]}
      anomalyTransactions={[]}
      pendingResetRequests={[]}
      pendingPayoutRequests={[]}
      payrollStats={[]}
      driverMap={new Map<string, Driver>()}
      locationMap={new Map<string, Location>()}
      todayDriverTxs={[]}
      myProfile={makeDriver()}
      currentUser={makeUser('driver')}
      activeDriverId="drv-1"
      todayStr="2026-04-11"
      onCreateSettlement={jest.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      onReviewSettlement={jest.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      onApproveExpenseRequest={jest.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      onReviewAnomalyTransaction={jest.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      onApproveResetRequest={jest.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      onApprovePayoutRequest={jest.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      isOnline={true}
      lang="zh"
      {...overrides}
    />,
  );
}

describe('SettlementTab', () => {
  it('shows cash and coin breakdown in admin settlement approval details', () => {
    renderSettlementTab({
      isAdmin: true,
      currentUser: makeUser('admin'),
      todayStr: '2026-04-10',
      pendingSettlements: [makeSettlement()],
      transactions: [
        makeTransaction({ id: 'TX-1' }),
        makeTransaction({ id: 'TX-2', timestamp: '2026-04-10T12:00:00.000Z' }),
        makeTransaction({ id: 'TX-other-day', timestamp: '2026-04-09T12:00:00.000Z' }),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /Driver One/i }));

    expect(screen.getByText('今日汇总')).toBeTruthy();
    expect(screen.getByText('实收纸币')).toBeTruthy();
    expect(screen.getByText('实收硬币')).toBeTruthy();
    expect(screen.getAllByText('TZS 25,000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TZS 5,000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TZS 30,000').length).toBeGreaterThan(0);
    expect(screen.getByText('收款笔数')).toBeTruthy();
    expect(screen.getByText('营收')).toBeTruthy();
  });

  it('shows an overdue settlement reminder for older pending settlements on the driver view', () => {
    renderSettlementTab({
      pendingSettlements: [makeSettlement({ date: '2026-04-10', timestamp: '2026-04-10T18:00:00.000Z', expectedTotal: 18000 })],
      todayDriverTxs: [makeTransaction({ timestamp: '2026-04-11T09:00:00.000Z' })],
    });

    expect(screen.getByText('历史待审批提醒')).toBeTruthy();
    expect(screen.getByText('逾期笔数')).toBeTruthy();
    expect(screen.getByText('逾期待确认金额')).toBeTruthy();
    expect(screen.getAllByText('TZS 18,000').length).toBeGreaterThan(0);
  });
});
