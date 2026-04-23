/**
 * __tests__/integration/collectionSubmissionFlow.test.ts
 *
 * Integration test: Collection submission end-to-end flow.
 * Tests the full pipeline from orchestrator → service → offline queue,
 * verifying cross-module interactions with mocked Supabase.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mock Supabase client ──────────────────────────────────────────────────
const mockRpc = jest.fn<() => Promise<{ data: unknown; error: unknown }>>();
const mockAbortSignal = jest.fn<() => Promise<{ data: unknown; error: unknown }>>();

jest.mock('../../supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    })),
    rpc: (...args: unknown[]) => {
      mockRpc(...(args as []));
      return { abortSignal: () => mockAbortSignal() };
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: { path: 'test.jpg' }, error: null }),
        getPublicUrl: jest.fn<() => unknown>().mockReturnValue({ data: { publicUrl: 'https://example.com/test.jpg' } }),
      })),
    },
  },
}));

// ── Mock audit service (not under test) ───────────────────────────────────
jest.mock('../../services/collectionSubmissionAudit', () => ({
  appendCollectionSubmissionAudit: jest.fn(),
}));

// ── Mock evidence storage ──────────────────────────────────────────────────
jest.mock('../../services/evidenceStorage', () => ({
  persistEvidencePhotoUrl: jest.fn<() => Promise<string>>().mockResolvedValue('https://example.com/test.jpg'),
}));

// ── Mock offline queue ────────────────────────────────────────────────────
const mockEnqueue = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.mock('../../offlineQueue', () => ({
  enqueueTransaction: (...args: unknown[]) => mockEnqueue(...(args as [])),
}));

import {
  orchestrateCollectionSubmission,
  buildCollectionSubmissionInput,
  type OrchestrateCollectionSubmissionInput,
} from '../../services/collectionSubmissionOrchestrator';
import { makeLocation, makeDriver, resetFixtureCounter } from '../helpers/fixtures';

function makeOrchestratorInput(
  overrides: Partial<OrchestrateCollectionSubmissionInput> = {},
): OrchestrateCollectionSubmissionInput {
  const loc = makeLocation();
  const drv = makeDriver();
  return {
    selectedLocation: loc,
    currentDriver: drv,
    isOnline: true,
    currentScore: '1200',
    photoData: 'data:image/jpeg;base64,abc',
    aiReviewData: null,
    expenses: '0',
    expenseType: 'public',
    expenseCategory: 'tip',
    coinExchange: '0',
    tip: '0',
    draftTxId: 'draft-001',
    isOwnerRetaining: false,
    ownerRetention: '',
    calculations: {
      diff: 200,
      revenue: 200,
      commission: 60,
      finalRetention: 140,
      startupDebtDeduction: 0,
      netPayable: 140,
      remainingCoins: 100,
      isCoinStockNegative: false,
    },
    resolvedGps: { lat: -6.7924, lng: 39.2083 },
    gpsSourceType: 'live',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFixtureCounter();
});

describe('Collection Submission Flow (Integration)', () => {
  describe('online path: orchestrator → service → server', () => {
    it('returns server result when submit_collection_v2 RPC succeeds', async () => {
      const serverTx = {
        id: 'server-tx-1',
        timestamp: '2026-01-01T00:00:00Z',
        locationId: 'loc-1',
        locationName: 'Shop A',
        driverId: 'drv-1',
        previousScore: 1000,
        currentScore: 1200,
        revenue: 200,
        commission: 60,
        ownerRetention: 140,
        debtDeduction: 0,
        startupDebtDeduction: 0,
        expenses: 0,
        coinExchange: 0,
        extraIncome: 0,
        netPayable: 140,
        gps: { lat: -6.7924, lng: 39.2083 },
        dataUsageKB: 120,
        isSynced: true,
        paymentStatus: 'pending',
        reportedStatus: 'active',
      };

      mockAbortSignal.mockResolvedValue({ data: serverTx, error: null });

      const input = makeOrchestratorInput({ isOnline: true });
      const result = await orchestrateCollectionSubmission(input);

      expect(result.source).toBe('server');
      expect(result.transaction.id).toBe('server-tx-1');
      expect(result.transaction.isSynced).toBe(true);
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('falls back to offline queue when RPC returns error', async () => {
      mockAbortSignal.mockResolvedValue({ data: null, error: { message: 'DB timeout' } });

      const input = makeOrchestratorInput({ isOnline: true });
      const result = await orchestrateCollectionSubmission(input);

      expect(result.source).toBe('offline');
      expect(result.fallbackReason).toBe('DB timeout');
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('offline path: orchestrator → local transaction → queue', () => {
    it('creates local transaction and enqueues when offline', async () => {
      const input = makeOrchestratorInput({ isOnline: false });
      const result = await orchestrateCollectionSubmission(input);

      expect(result.source).toBe('offline');
      expect(result.fallbackReason).toBeNull();
      expect(result.transaction.isSynced).toBe(false);
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('zeroes expense fields even when input has expenses (migration: expenses moved to settlement)', async () => {
      const input = makeOrchestratorInput({
        isOnline: false,
        expenses: '5000',
        expenseType: 'private',
        expenseCategory: 'fuel',
        expenseDescription: 'Petrol for route',
      });
      const result = await orchestrateCollectionSubmission(input);

      // Orchestrator forces expenses to 0 and clears type/category
      expect(result.transaction.expenses).toBe(0);
      expect(result.transaction.expenseType).toBeUndefined();
      expect(result.transaction.expenseCategory).toBeUndefined();
    });
  });

  describe('buildCollectionSubmissionInput validation', () => {
    it('throws on empty score', () => {
      const input = makeOrchestratorInput({ currentScore: '' });
      expect(() => buildCollectionSubmissionInput(input)).toThrow('Invalid current score');
    });

    it('throws on non-numeric score', () => {
      const input = makeOrchestratorInput({ currentScore: 'abc' });
      expect(() => buildCollectionSubmissionInput(input)).toThrow('Invalid current score');
    });

    it('normalizes reported status from AI condition', () => {
      const input = makeOrchestratorInput({
        aiReviewData: { score: '1200', condition: 'broken', notes: null },
      });
      const built = buildCollectionSubmissionInput(input);
      expect(built.reportedStatus).toBe('broken');
    });

    it('sets anomalyFlag when AI score differs significantly', () => {
      const input = makeOrchestratorInput({
        currentScore: '1200',
        aiReviewData: { score: '5000', condition: null, notes: null },
      });
      const built = buildCollectionSubmissionInput(input);
      expect(built.anomalyFlag).toBe(true);
    });
  });
});
