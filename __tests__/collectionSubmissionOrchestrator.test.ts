import { describe, it, expect, jest } from '@jest/globals';
import type { Driver, Location, Transaction } from '../types';

// Mock supabaseClient so import.meta.env is not evaluated in the Jest/Node environment
jest.mock('../supabaseClient', () => ({ supabase: null }));

import {
  buildCollectionSubmissionInput,
  orchestrateCollectionSubmission,
  type OrchestrateCollectionSubmissionInput,
} from '../services/collectionSubmissionOrchestrator';

function makeLocation(): Location {
  return {
    id: 'loc-1',
    name: 'Test Location',
    machineId: 'M-1',
    commissionRate: 0.2,
    lastScore: 100,
    coords: { lat: -6.8, lng: 39.2 },
  } as Location;
}

function makeDriver(): Driver {
  return {
    id: 'drv-1',
    name: 'Driver One',
  } as Driver;
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    timestamp: new Date().toISOString(),
    uploadTimestamp: new Date().toISOString(),
    locationId: 'loc-1',
    locationName: 'Test Location',
    driverId: 'drv-1',
    previousScore: 100,
    currentScore: 150,
    revenue: 50,
    commission: 10,
    ownerRetention: 10,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 40,
    gps: { lat: -6.8, lng: 39.2 },
    dataUsageKB: 120,
    isAnomaly: false,
    anomalyFlag: false,
    isSynced: true,
    type: 'collection',
    approvalStatus: 'approved',
    paymentStatus: 'paid',
    reportedStatus: 'active',
    ...overrides,
  } as Transaction;
}

function makeInput(overrides: Partial<OrchestrateCollectionSubmissionInput> = {}): OrchestrateCollectionSubmissionInput {
  return {
    selectedLocation: makeLocation(),
    currentDriver: makeDriver(),
    isOnline: true,
    currentScore: '150',
    photoData: 'data:image/jpeg;base64,abc',
    aiReviewData: { score: '152', condition: 'Normal', notes: 'Looks fine' },
    expenses: '20',
    expenseType: 'public',
    expenseCategory: 'transport',
    coinExchange: '5',
    tip: '10',
    draftTxId: 'draft-1',
    isOwnerRetaining: true,
    ownerRetention: '12',
    calculations: {
      diff: 50,
      revenue: 50,
      commission: 10,
      finalRetention: 12,
      netPayable: 8,
      remainingCoins: 20,
      isCoinStockNegative: false,
    },
    resolvedGps: { lat: -6.8, lng: 39.2 },
    gpsSourceType: 'live',
    ...overrides,
  };
}

describe('buildCollectionSubmissionInput', () => {
  it('builds raw input from UI-facing values', () => {
    const input = buildCollectionSubmissionInput(makeInput());
    expect(input.locationId).toBe('loc-1');
    expect(input.driverId).toBe('drv-1');
    expect(input.currentScore).toBe(150);
    expect(input.expenses).toBe(20);
    expect(input.tip).toBe(10);
    expect(input.ownerRetention).toBe(12);
    expect(input.coinExchange).toBe(5);
    expect(input.reportedStatus).toBe('active');
    expect(input.notes).toContain('Looks fine');
  });

  it('drops gps to null when gpsSourceType resolves to none coordinates', () => {
    const input = buildCollectionSubmissionInput(
      makeInput({ resolvedGps: { lat: 0, lng: 0 }, gpsSourceType: 'none' }),
    );
    expect(input.gps).toBeNull();
    expect(input.notes).toContain('[GPS: none]');
  });
});

describe('orchestrateCollectionSubmission', () => {
  it('returns server transaction when online submission succeeds', async () => {
    const serverTransaction = makeTransaction({ id: 'server-tx' });
    const submitCollectionV2 = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      success: true,
      transaction: serverTransaction,
      source: 'server',
    });
    const deps = {
      submitCollectionV2,
      createCollectionTransaction: jest.fn(),
      enqueueTransaction: jest.fn(),
      logger: { warn: jest.fn() },
    };

    const result = await orchestrateCollectionSubmission(makeInput(), deps as any);

    expect(result).toEqual({
      source: 'server',
      transaction: serverTransaction,
      fallbackReason: null,
    });
    expect(submitCollectionV2).toHaveBeenCalledTimes(1);
    expect(deps.enqueueTransaction).not.toHaveBeenCalled();
  });

  it('falls back to offline transaction when online submission fails', async () => {
    const offlineTransaction = makeTransaction({ id: 'offline-tx', isSynced: false });
    const submitCollectionV2 = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      success: false,
      error: 'rpc failed',
    });
    const createCollectionTransaction = jest.fn().mockReturnValue(offlineTransaction);
    const enqueueTransaction = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
    const logger = { warn: jest.fn() };

    const result = await orchestrateCollectionSubmission(makeInput(), {
      submitCollectionV2,
      createCollectionTransaction,
      enqueueTransaction,
      logger,
    } as any);

    expect(result.source).toBe('offline');
    expect(result.transaction).toBe(offlineTransaction);
    expect(result.fallbackReason).toBe('rpc failed');
    expect(createCollectionTransaction).toHaveBeenCalledTimes(1);
    expect(enqueueTransaction).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('uses offline path immediately when not online', async () => {
    const offlineTransaction = makeTransaction({ id: 'offline-direct', isSynced: false });
    const submitCollectionV2 = jest.fn();
    const createCollectionTransaction = jest.fn().mockReturnValue(offlineTransaction);
    const enqueueTransaction = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);

    const result = await orchestrateCollectionSubmission(
      makeInput({ isOnline: false }),
      {
        submitCollectionV2,
        createCollectionTransaction,
        enqueueTransaction,
        logger: { warn: jest.fn() },
      } as any,
    );

    expect(result.source).toBe('offline');
    expect(result.transaction).toBe(offlineTransaction);
    expect(result.fallbackReason).toBeNull();
    expect(submitCollectionV2).not.toHaveBeenCalled();
    expect(enqueueTransaction).toHaveBeenCalledTimes(1);
  });
});
