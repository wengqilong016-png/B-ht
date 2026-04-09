import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React, { PropsWithChildren } from 'react';

import { useSupabaseMutations } from '../hooks/useSupabaseMutations';

import type { DailySettlement, Driver, Transaction, User } from '../types';

const mockEnqueueTransaction = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFlushQueue = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockReportQueueHealthToServer = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSubmitCollectionV2 = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpsertDrivers = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDeleteDrivers = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdateDriverCoins = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpsertLocations = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDeleteLocations = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockApproveExpenseRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockApprovePayoutRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockApproveResetRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockReviewAnomalyTransaction = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreatePayoutRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateResetRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpsertTransaction = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateSettlement = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockReviewSettlement = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockInsertAiLog = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLocalDbSet = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../offlineQueue', () => ({
  enqueueTransaction: (...args: unknown[]) => mockEnqueueTransaction(...args),
  flushQueue: (...args: unknown[]) => mockFlushQueue(...args),
  reportQueueHealthToServer: (...args: unknown[]) => mockReportQueueHealthToServer(...args),
}));

jest.mock('../services/collectionSubmissionService', () => ({
  submitCollectionV2: (...args: unknown[]) => mockSubmitCollectionV2(...args),
}));

jest.mock('../repositories/driverRepository', () => ({
  upsertDrivers: (...args: unknown[]) => mockUpsertDrivers(...args),
  deleteDrivers: (...args: unknown[]) => mockDeleteDrivers(...args),
  updateDriverCoins: (...args: unknown[]) => mockUpdateDriverCoins(...args),
}));

jest.mock('../repositories/locationRepository', () => ({
  upsertLocations: (...args: unknown[]) => mockUpsertLocations(...args),
  deleteLocations: (...args: unknown[]) => mockDeleteLocations(...args),
}));

jest.mock('../repositories/approvalRepository', () => ({
  approveExpenseRequest: (...args: unknown[]) => mockApproveExpenseRequest(...args),
  approvePayoutRequest: (...args: unknown[]) => mockApprovePayoutRequest(...args),
  approveResetRequest: (...args: unknown[]) => mockApproveResetRequest(...args),
  reviewAnomalyTransaction: (...args: unknown[]) => mockReviewAnomalyTransaction(...args),
}));

jest.mock('../repositories/requestRepository', () => ({
  createPayoutRequest: (...args: unknown[]) => mockCreatePayoutRequest(...args),
  createResetRequest: (...args: unknown[]) => mockCreateResetRequest(...args),
}));

jest.mock('../repositories/transactionRepository', () => ({
  upsertTransaction: (...args: unknown[]) => mockUpsertTransaction(...args),
}));

jest.mock('../repositories/settlementRepository', () => ({
  createSettlement: (...args: unknown[]) => mockCreateSettlement(...args),
  reviewSettlement: (...args: unknown[]) => mockReviewSettlement(...args),
}));

jest.mock('../repositories/aiLogRepository', () => ({
  insertAiLog: (...args: unknown[]) => mockInsertAiLog(...args),
}));

jest.mock('../supabaseClient', () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
    realtime: { setAuth: jest.fn() },
  },
}));

jest.mock('../services/localDB', () => ({
  localDB: {
    set: (...args: unknown[]) => mockLocalDbSet(...args),
  },
}));


function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeDriverUser(): User {
  return {
    id: 'auth-driver-1',
    username: 'driver@example.com',
    role: 'driver',
    name: 'Driver One',
    driverId: 'drv-1',
  };
}

function makeAdminUser(): User {
  return {
    id: 'auth-admin-1',
    username: 'admin@example.com',
    role: 'admin',
    name: 'Admin One',
  };
}

function makeSettlement(overrides: Partial<DailySettlement> = {}): DailySettlement {
  return {
    id: 'STL-1',
    date: '2026-04-05',
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
    note: 'ready',
    timestamp: '2026-04-05T18:00:00.000Z',
    status: 'pending',
    isSynced: false,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'TX-1',
    timestamp: '2026-04-05T10:00:00.000Z',
    uploadTimestamp: '2026-04-05T10:00:00.000Z',
    locationId: 'loc-1',
    locationName: 'Shop One',
    driverId: 'drv-1',
    driverName: 'Driver One',
    previousScore: 100,
    currentScore: 120,
    revenue: 40000,
    commission: 6000,
    ownerRetention: 6000,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 30000,
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
    vehicleInfo: { model: 'Bajaj', plate: 'T123' },
    status: 'active',
    baseSalary: 0,
    commissionRate: 0.15,
    ...overrides,
  };
}

describe('useSupabaseMutations settlement workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSettlement.mockResolvedValue(makeSettlement({ isSynced: true }));
    mockReviewSettlement.mockResolvedValue(makeSettlement({ status: 'confirmed', isSynced: true }));
    mockUpdateDriverCoins.mockResolvedValue(undefined);
    mockLocalDbSet.mockResolvedValue(undefined);
  });

  it('adds a newly created settlement to the driver cache immediately', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = makeWrapper(queryClient);
    const settlement = makeSettlement();

    queryClient.setQueryData(['dailySettlements', 'driver:drv-1'], []);

    const { result } = renderHook(() => useSupabaseMutations(true, makeDriverUser()), { wrapper });

    await act(async () => {
      await result.current.createSettlement.mutateAsync(settlement);
    });

    const cached = queryClient.getQueryData<DailySettlement[]>(['dailySettlements', 'driver:drv-1']) ?? [];
    expect(cached).toHaveLength(1);
    expect(cached[0].id).toBe('STL-1');
    expect(cached[0].status).toBe('pending');
    expect(mockCreateSettlement).toHaveBeenCalledWith(settlement);
  });

  it('marks matching collection transactions paid when settlement is confirmed', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = makeWrapper(queryClient);
    const settlement = makeSettlement({ actualCoins: 7000 });
    mockReviewSettlement.mockResolvedValue(makeSettlement({ actualCoins: 7000, status: 'confirmed', isSynced: true }));

    queryClient.setQueryData(['dailySettlements', 'admin'], [settlement]);
    queryClient.setQueryData(['transactions', 'admin'], [
      makeTransaction({ id: 'TX-match-1', timestamp: '2026-04-05T08:00:00.000Z', driverId: 'drv-1', paymentStatus: 'pending' }),
      makeTransaction({ id: 'TX-match-2', timestamp: '2026-04-05T14:00:00.000Z', driverId: 'drv-1', paymentStatus: 'pending' }),
      makeTransaction({ id: 'TX-other-driver', driverId: 'drv-2', timestamp: '2026-04-05T09:00:00.000Z', paymentStatus: 'pending' }),
      makeTransaction({ id: 'TX-other-day', driverId: 'drv-1', timestamp: '2026-04-04T09:00:00.000Z', paymentStatus: 'pending' }),
    ]);
    queryClient.setQueryData(['drivers'], [makeDriver()]);

    const { result } = renderHook(() => useSupabaseMutations(true, makeAdminUser()), { wrapper });

    await act(async () => {
      await result.current.reviewSettlement.mutateAsync({
        settlementId: settlement.id,
        status: 'confirmed',
      });
    });

    const transactions = queryClient.getQueryData<Transaction[]>(['transactions', 'admin']) ?? [];
    expect(transactions.find((tx) => tx.id === 'TX-match-1')?.paymentStatus).toBe('paid');
    expect(transactions.find((tx) => tx.id === 'TX-match-2')?.paymentStatus).toBe('paid');
    expect(transactions.find((tx) => tx.id === 'TX-other-driver')?.paymentStatus).toBe('pending');
    expect(transactions.find((tx) => tx.id === 'TX-other-day')?.paymentStatus).toBe('pending');

    const drivers = queryClient.getQueryData<Driver[]>(['drivers']) ?? [];
    expect(drivers[0]?.dailyFloatingCoins).toBe(7000);
    expect(mockReviewSettlement).toHaveBeenCalledWith('STL-1', 'confirmed', undefined);
    expect(mockUpdateDriverCoins).toHaveBeenCalledWith('drv-1', 7000);
  });

  it('marks matching collection transactions rejected when settlement is rejected', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = makeWrapper(queryClient);
    const settlement = makeSettlement();

    mockReviewSettlement.mockResolvedValue(makeSettlement({ status: 'rejected', isSynced: true }));

    queryClient.setQueryData(['dailySettlements', 'admin'], [settlement]);
    queryClient.setQueryData(['transactions', 'admin'], [
      makeTransaction({ id: 'TX-match', timestamp: '2026-04-05T08:00:00.000Z', driverId: 'drv-1', paymentStatus: 'pending' }),
      makeTransaction({ id: 'TX-other', timestamp: '2026-04-04T08:00:00.000Z', driverId: 'drv-1', paymentStatus: 'pending' }),
    ]);
    queryClient.setQueryData(['drivers'], [makeDriver({ dailyFloatingCoins: 1000 })]);

    const { result } = renderHook(() => useSupabaseMutations(true, makeAdminUser()), { wrapper });

    await act(async () => {
      await result.current.reviewSettlement.mutateAsync({
        settlementId: settlement.id,
        status: 'rejected',
        note: 'cash mismatch',
      });
    });

    const transactions = queryClient.getQueryData<Transaction[]>(['transactions', 'admin']) ?? [];
    expect(transactions.find((tx) => tx.id === 'TX-match')?.paymentStatus).toBe('rejected');
    expect(transactions.find((tx) => tx.id === 'TX-other')?.paymentStatus).toBe('pending');

    const drivers = queryClient.getQueryData<Driver[]>(['drivers']) ?? [];
    expect(drivers[0]?.dailyFloatingCoins).toBe(1000);
    expect(mockUpdateDriverCoins).not.toHaveBeenCalled();
  });
});
