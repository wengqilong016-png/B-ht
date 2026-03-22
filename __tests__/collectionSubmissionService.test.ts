/**
 * Tests for collectionSubmissionService.ts
 *
 * These tests exercise the client-side logic — payload mapping, error
 * handling, and the offline-fallback path — without requiring a live
 * Supabase connection.  The supabaseClient module is mocked so the RPC
 * call is intercepted and controlled by each test.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Supabase mock ──────────────────────────────────────────────────────────
// We need to intercept the supabase.rpc() call inside the service.
// Because the service imports `supabase` from '../../supabaseClient', we
// mock that module and control what the `rpc` mock returns.

const mockRpc = jest.fn();
jest.mock('../supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { submitCollectionV2, CollectionSubmissionInput } from '../services/collectionSubmissionService';

// ── Shared test input ──────────────────────────────────────────────────────
const baseInput: CollectionSubmissionInput = {
  txId: 'TX-test-001',
  locationId: 'loc-uuid-001',
  driverId: 'drv-001',
  currentScore: 1200,
  expenses: 5000,
  tip: 0,
  isOwnerRetaining: true,
  ownerRetention: null,
  coinExchange: 10000,
  gps: { lat: -6.7924, lng: 39.2083 },
  photoUrl: 'data:image/jpeg;base64,abc',
  aiScore: 1195,
  anomalyFlag: false,
  notes: 'Test note',
  expenseType: 'public',
  expenseCategory: 'fuel',
  reportedStatus: 'active',
};

// Simulated server response that mirrors what submit_collection_v2 returns.
const serverRow = {
  id: 'TX-test-001',
  timestamp: '2026-03-22T08:00:00.000Z',
  locationId: 'loc-uuid-001',
  locationName: 'Test Location',
  driverId: 'drv-001',
  driverName: 'Test Driver',
  previousScore: 1000,
  currentScore: 1200,
  revenue: 40000,
  commission: 6000,
  ownerRetention: 6000,
  debtDeduction: 0,
  startupDebtDeduction: 0,
  expenses: 5000,
  coinExchange: 10000,
  extraIncome: 0,
  netPayable: 29000,
  paymentStatus: 'paid',
  gps: { lat: -6.7924, lng: 39.2083 },
  photoUrl: 'data:image/jpeg;base64,abc',
  aiScore: 1195,
  isAnomaly: false,
  isSynced: true,
  type: 'collection',
  approvalStatus: 'approved',
  reportedStatus: 'active',
  notes: 'Test note',
  expenseType: 'public',
  expenseCategory: 'fuel',
  expenseStatus: 'pending',
};

beforeEach(() => {
  mockRpc.mockReset();
});

describe('submitCollectionV2', () => {
  it('returns a normalized Transaction on success', async () => {
    mockRpc.mockResolvedValue({ data: serverRow, error: null });

    const result = await submitCollectionV2(baseInput);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.source).toBe('server');
    const tx = result.transaction;
    expect(tx.id).toBe('TX-test-001');
    expect(tx.revenue).toBe(40000);
    expect(tx.commission).toBe(6000);
    expect(tx.ownerRetention).toBe(6000);
    expect(tx.netPayable).toBe(29000);
    expect(tx.isSynced).toBe(true);
    expect(tx.type).toBe('collection');
    expect(tx.approvalStatus).toBe('approved');
    expect(tx.expenseType).toBe('public');
    expect(tx.expenseCategory).toBe('fuel');
    expect(tx.expenseStatus).toBe('pending');
  });

  it('passes raw inputs to the RPC (does not send pre-computed finance)', async () => {
    mockRpc.mockResolvedValue({ data: serverRow, error: null });

    await submitCollectionV2(baseInput);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [rpcName, rpcParams] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe('submit_collection_v2');

    // Raw score inputs must be present
    expect(rpcParams['p_current_score']).toBe(1200);
    expect(rpcParams['p_expenses']).toBe(5000);
    expect(rpcParams['p_tip']).toBe(0);

    // Pre-computed finance fields must NOT be sent
    expect(rpcParams).not.toHaveProperty('revenue');
    expect(rpcParams).not.toHaveProperty('netPayable');
    expect(rpcParams).not.toHaveProperty('commission');
  });

  it('returns failure when the RPC reports an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Location not found' } });

    const result = await submitCollectionV2(baseInput);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Location not found');
  });

  it('returns failure when the RPC returns no data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await submitCollectionV2(baseInput);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('no data');
  });

  it('returns failure when Supabase throws an unexpected error', async () => {
    mockRpc.mockRejectedValue(new Error('Network timeout'));

    const result = await submitCollectionV2(baseInput);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Network timeout');
  });

  it('marks isSynced true on the returned transaction', async () => {
    mockRpc.mockResolvedValue({ data: serverRow, error: null });

    const result = await submitCollectionV2(baseInput);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.transaction.isSynced).toBe(true);
  });

  it('omits expenseType and expenseStatus when expenses is 0', async () => {
    const noExpenseRow = {
      ...serverRow,
      expenses: 0,
      expenseType: null,
      expenseCategory: null,
      expenseStatus: null,
    };
    mockRpc.mockResolvedValue({ data: noExpenseRow, error: null });

    const result = await submitCollectionV2({ ...baseInput, expenses: 0 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.transaction.expenseType).toBeUndefined();
    expect(result.transaction.expenseCategory).toBeUndefined();
    expect(result.transaction.expenseStatus).toBeUndefined();
  });
});
