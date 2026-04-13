import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import SettlementTab from '../components/dashboard/SettlementTab';
import { ToastProvider } from '../contexts/ToastContext';
import { scanMeterFromBase64 } from '../services/scanMeterService';

import type { DailySettlement, Driver, Location, Transaction, User } from '../types';

jest.mock('../services/scanMeterService', () => ({
  scanMeterFromBase64: jest.fn(),
  getScanMeterErrorMessage: jest.fn(() => 'AI scan failed'),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function mockPhotoFetchAndReader(dataUrl = 'data:image/jpeg;base64,cGhvdG8=') {
  global.fetch = jest.fn(async () => ({
    ok: true,
    blob: async () => new Blob(['photo'], { type: 'image/jpeg' }),
  } as Response)) as unknown as typeof fetch;

  (global as unknown as { FileReader: typeof FileReader }).FileReader = class {
    result = dataUrl;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL() {
      Promise.resolve().then(() => this.onload?.());
    }
  } as unknown as typeof FileReader;
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
    settlementExpenseAmount: undefined,
    settlementExpenseCategory: undefined,
    settlementExpenseNote: undefined,
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
      settlementsForSubmissionGuard={[]}
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
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

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

  it('shows settlement expense details in admin settlement approval details', () => {
    renderSettlementTab({
      isAdmin: true,
      currentUser: makeUser('admin'),
      pendingSettlements: [
        makeSettlement({
          settlementExpenseAmount: 2500,
          settlementExpenseCategory: 'electricity',
          settlementExpenseNote: '晚班补电费',
          totalExpenses: 4500,
          expectedTotal: 27500,
        }),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /Driver One/i }));

    expect(screen.getByText('日结支出')).toBeTruthy();
    expect(screen.getByText('💡 电费')).toBeTruthy();
    expect(screen.getByText('晚班补电费')).toBeTruthy();
    expect(screen.getAllByText('TZS 2,500').length).toBeGreaterThan(0);
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

  it('blocks duplicate driver settlement submission when today settlement is already confirmed', () => {
    renderSettlementTab({
      todayStr: '2026-04-11',
      pendingSettlements: [],
      settlementsForSubmissionGuard: [
        makeSettlement({
          id: 'STL-confirmed-today',
          date: '2026-04-11',
          timestamp: '2026-04-11T18:00:00.000Z',
          status: 'confirmed',
        }),
      ],
      todayDriverTxs: [makeTransaction({ timestamp: '2026-04-11T09:00:00.000Z' })],
    });

    expect(screen.getByText('今日已提交结算')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /提交日结|submit/i })).toBeNull();
  });

  it('requires a note when driver selects other settlement expense', async () => {
    const onCreateSettlement = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    renderSettlementTab({
      todayDriverTxs: [makeTransaction({ timestamp: '2026-04-11T09:00:00.000Z' })],
      onCreateSettlement,
    });

    const numericInputs = screen.getAllByPlaceholderText('0');
    fireEvent.change(numericInputs[0], { target: { value: '10000' } });
    fireEvent.change(numericInputs[1], { target: { value: '5000' } });
    fireEvent.change(screen.getByDisplayValue('小费'), { target: { value: 'other' } });
    fireEvent.change(numericInputs[2], { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /提交今日结算/i }));

    await waitFor(() => {
      expect(onCreateSettlement).not.toHaveBeenCalled();
      expect(screen.getAllByText('选择“其他”时必须填写备注。').length).toBeGreaterThan(0);
    });
  });

  it('auto scans anomaly proof photos once in admin approval view', async () => {
    mockPhotoFetchAndReader();
    const scanMeterMock = scanMeterFromBase64 as jest.MockedFunction<typeof scanMeterFromBase64>;
    scanMeterMock.mockResolvedValue({
      success: true,
      data: {
        score: '120',
        condition: 'Normal',
        notes: 'Digits are clear',
      },
    });

    const anomaly = makeTransaction({
      id: 'TX-anomaly-photo',
      isAnomaly: true,
      approvalStatus: 'pending',
      photoUrl: 'https://example.com/meter.jpg',
      currentScore: 120,
    });

    const { rerender } = renderSettlementTab({
      isAdmin: true,
      currentUser: makeUser('admin'),
      anomalyTransactions: [anomaly],
    });

    fireEvent.click(screen.getByRole('button', { name: /Driver One/i }));

    await waitFor(() => {
      expect(scanMeterMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/AI 已验证/)).toBeTruthy();
    });

    rerender(
      <ToastProvider>
        <SettlementTab
          isAdmin={true}
          unsyncedCollectionsCount={0}
          transactions={[]}
          pendingSettlements={[]}
          settlementsForSubmissionGuard={[]}
          pendingExpenses={[]}
          anomalyTransactions={[{ ...anomaly }]}
          pendingResetRequests={[]}
          pendingPayoutRequests={[]}
          payrollStats={[]}
          driverMap={new Map<string, Driver>()}
          locationMap={new Map<string, Location>()}
          todayDriverTxs={[]}
          myProfile={makeDriver()}
          currentUser={makeUser('admin')}
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
        />
      </ToastProvider>,
    );

    await waitFor(() => expect(scanMeterMock).toHaveBeenCalledTimes(1));
  });
});
