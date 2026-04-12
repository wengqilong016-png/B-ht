import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React from 'react';

import { useDriverSubmissionCompletion } from '../driver/hooks/useDriverSubmissionCompletion';
import { getQueueHealthSummary } from '../offlineQueue';

import type { CompletionResult } from '../driver/components/SubmitReview';
import type { Location, Transaction } from '../types';

jest.mock('../offlineQueue', () => ({
  getQueueHealthSummary: jest.fn(),
}));

jest.mock('../services/localDB', () => ({
  localDB: {
    set: jest.fn(() => Promise.resolve()),
  },
}));

const mockedGetQueueHealthSummary = getQueueHealthSummary as jest.MockedFunction<typeof getQueueHealthSummary>;

const location: Location = {
  id: 'loc-1',
  name: 'Bahati Shop',
  machineId: 'M-100',
  lastScore: 1000,
  area: 'Kariakoo',
  assignedDriverId: 'driver-1',
  coords: { lat: -6.8, lng: 39.2 },
  status: 'active',
  ownerName: '',
  shopOwnerPhone: '',
  initialStartupDebt: 0,
  remainingStartupDebt: 0,
  isNewOffice: false,
  createdAt: '2026-04-10T00:00:00.000Z',
  dividendBalance: 0,
} as Location;

const transaction: Transaction = {
  id: 'tx-1',
  timestamp: '2026-04-10T10:00:00.000Z',
  locationId: 'loc-1',
  locationName: 'Bahati Shop',
  driverId: 'driver-1',
  currentScore: 1200,
  netPayable: 140,
  isSynced: true,
  type: 'collection',
} as Transaction;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('useDriverSubmissionCompletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not block completion on background queue health inspection', async () => {
    mockedGetQueueHealthSummary.mockReturnValue(new Promise(() => {}));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData<Location[]>(['locations'], [location]);

    const submitTransaction = { mutateAsync: jest.fn(async () => undefined) };
    const syncOfflineData = { mutate: jest.fn() };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useDriverSubmissionCompletion({
        activeDriverId: 'driver-1',
        allTransactions: [],
        isOnline: true,
        locations: [location],
        submitTransaction,
        syncOfflineData,
      }),
      { wrapper },
    );

    const completion: CompletionResult = { source: 'server', transaction };
    let resolved = false;
    await act(async () => {
      const completionPromise = result.current(completion).then(() => {
        resolved = true;
      });
      await Promise.race([completionPromise, wait(20)]);
    });

    expect(resolved).toBe(true);
    expect(mockedGetQueueHealthSummary).toHaveBeenCalledTimes(1);
    expect(syncOfflineData.mutate).not.toHaveBeenCalled();
  });
});
