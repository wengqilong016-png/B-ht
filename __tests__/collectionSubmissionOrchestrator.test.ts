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
      startupDebtDeduction: 0,
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

  it('maps damaged AI condition to broken reported status', () => {
    const input = buildCollectionSubmissionInput(
      makeInput({ aiReviewData: { score: '152', condition: 'Damaged', notes: 'Glass cracked' } }),
    );

    expect(input.reportedStatus).toBe('broken');
  });

  it('preserves maintenance when AI condition is not recognized', () => {
    const input = buildCollectionSubmissionInput(
      makeInput({
        selectedLocation: { ...makeLocation(), status: 'maintenance' } as Location,
        aiReviewData: { score: '152', condition: 'Needs service soon', notes: 'Monitor' },
      }),
    );

    expect(input.reportedStatus).toBe('maintenance');
  });

  it('drops expense metadata when expenses are zero', () => {
    const input = buildCollectionSubmissionInput(
      makeInput({
        expenses: '0',
        expenseType: 'private',
        expenseCategory: 'fuel',
        expenseDescription: 'should not persist',
      }),
    );

    expect(input.expenseType).toBeNull();
    expect(input.expenseCategory).toBeNull();
    expect(input.expenseDescription).toBeUndefined();
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

  it('hydrates offline fallback transactions with derived workflow fields', async () => {
    const offlineTransaction = makeTransaction({ id: 'offline-enriched', isSynced: false });
    const submitCollectionV2 = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      success: false,
      error: 'rpc failed',
    });

    const result = await orchestrateCollectionSubmission(makeInput({
      expenseType: 'private',
      expenseCategory: 'transport',
      expenseDescription: 'Taxi fare',
      aiReviewData: { score: '149', condition: 'Repair', notes: 'Needs service' },
    }), {
      submitCollectionV2,
      createCollectionTransaction: jest.fn().mockReturnValue(offlineTransaction),
      enqueueTransaction: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
      logger: { warn: jest.fn() },
    } as any);

    expect(result.source).toBe('offline');
    expect(offlineTransaction.expenseType).toBe('private');
    expect(offlineTransaction.expenseCategory).toBe('transport');
    expect(offlineTransaction.expenseDescription).toBe('Taxi fare');
    expect(offlineTransaction.expenseStatus).toBe('pending');
    expect(offlineTransaction.paymentStatus).toBe('pending');
    expect(offlineTransaction.aiScore).toBe(149);
    expect(offlineTransaction.reportedStatus).toBe('maintenance');
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

// ── buildCollectionSubmissionInput — normalizeReportedStatus branches ─────────

describe('buildCollectionSubmissionInput() — normalizeReportedStatus branches', () => {
  function makeBaseInput(
    aiCondition: string | null = null,
    locationStatus: Location['status'] = 'active',
  ): OrchestrateCollectionSubmissionInput {
    return {
      selectedLocation: { ...makeLocation(), status: locationStatus },
      currentDriver: makeDriver(),
      isOnline: true,
      currentScore: '200',
      photoData: null,
      aiReviewData: aiCondition ? { score: '200', condition: aiCondition, notes: '' } : null,
      expenses: '0',
      expenseType: 'public',
      expenseCategory: 'tip',
      expenseDescription: '',
      coinExchange: '0',
      tip: '0',
      draftTxId: 'TX-test',
      isOwnerRetaining: false,
      ownerRetention: '',
      calculations: {
        diff: 100, revenue: 50000, commission: 10000, finalRetention: 0,
        startupDebtDeduction: 0, netPayable: 40000, remainingCoins: 50, isCoinStockNegative: false,
      },
      resolvedGps: { lat: -6.8, lng: 39.2 },
      gpsSourceType: 'live',
    };
  }

  it('returns "broken" for AI condition "damaged"', () => {
    const input = buildCollectionSubmissionInput(makeBaseInput('damaged'));
    expect(input.reportedStatus).toBe('broken');
  });

  it('returns "broken" for AI condition "fault"', () => {
    const input = buildCollectionSubmissionInput(makeBaseInput('fault'));
    expect(input.reportedStatus).toBe('broken');
  });

  it('returns "maintenance" for AI condition "repair"', () => {
    const input = buildCollectionSubmissionInput(makeBaseInput('repair'));
    expect(input.reportedStatus).toBe('maintenance');
  });

  it('returns "maintenance" for AI condition "servicing"', () => {
    const input = buildCollectionSubmissionInput(makeBaseInput('servicing'));
    expect(input.reportedStatus).toBe('maintenance');
  });

  it('returns "active" for AI condition "healthy"', () => {
    const input = buildCollectionSubmissionInput(makeBaseInput('healthy'));
    expect(input.reportedStatus).toBe('active');
  });

  it('falls back to location.status "maintenance" when AI condition is unrecognised', () => {
    const input = buildCollectionSubmissionInput(makeBaseInput('unknown_condition', 'maintenance'));
    expect(input.reportedStatus).toBe('maintenance');
  });

  it('falls back to location.status "broken" when AI condition is unrecognised', () => {
    const input = buildCollectionSubmissionInput(makeBaseInput(null, 'broken'));
    expect(input.reportedStatus).toBe('broken');
  });

  it('defaults to "active" when no AI condition and location is active', () => {
    const input = buildCollectionSubmissionInput(makeBaseInput(null, 'active'));
    expect(input.reportedStatus).toBe('active');
  });

  it('throws "Invalid current score" for empty score', () => {
    expect(() => buildCollectionSubmissionInput(makeBaseInput())).not.toThrow();
    const bad = { ...makeBaseInput(), currentScore: '' };
    expect(() => buildCollectionSubmissionInput(bad)).toThrow('Invalid current score');
  });

  it('throws "Invalid current score" for non-numeric score', () => {
    const bad = { ...makeBaseInput(), currentScore: 'abc' };
    expect(() => buildCollectionSubmissionInput(bad)).toThrow('Invalid current score');
  });
});

// ── orchestrateCollectionSubmission — IDB enqueue error paths ─────────────────

describe('orchestrateCollectionSubmission() — IDB enqueue failure', () => {
  it('throws a user-visible error when enqueueTransaction rejects (online→fallback path)', async () => {
    const offlineTransaction = makeTransaction({ id: 'tx-idb-fail', isSynced: false });
    const logger = { warn: jest.fn() };
    const enqueueTransaction = jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('IDB full'));

    await expect(orchestrateCollectionSubmission(
      makeInput({ isOnline: true }),
      {
        submitCollectionV2: jest.fn<() => Promise<{ success: false; error: string }>>().mockResolvedValue(
          { success: false, error: 'rpc failed' }
        ),
        createCollectionTransaction: jest.fn().mockReturnValue(offlineTransaction),
        enqueueTransaction,
        logger,
      } as any,
    )).rejects.toThrow('采集数据暂存失败');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('IDB enqueue failed'),
      expect.any(Error),
    );
  });

  it('throws a user-visible error when enqueueTransaction rejects (pure offline path)', async () => {
    const offlineTransaction = makeTransaction({ id: 'tx-idb-fail-offline', isSynced: false });
    const logger = { warn: jest.fn() };
    const enqueueTransaction = jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('IDB quota'));

    await expect(orchestrateCollectionSubmission(
      makeInput({ isOnline: false }),
      {
        submitCollectionV2: jest.fn(),
        createCollectionTransaction: jest.fn().mockReturnValue(offlineTransaction),
        enqueueTransaction,
        logger,
      } as any,
    )).rejects.toThrow('采集数据暂存失败');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('IDB enqueue failed'),
      expect.any(Error),
    );
  });
});
