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

const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpload = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPublicUrl = jest.fn<(path: string) => { data: { publicUrl: string } }>();
jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        getPublicUrl: (path: string) => mockGetPublicUrl(path),
      }),
    },
  },
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
  mockUpload.mockReset();
  mockGetPublicUrl.mockReset();
  mockUpload.mockResolvedValue({ error: null });
  mockGetPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/evidence/${path}` },
  }));
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
    expect(String(rpcParams['p_photo_url'])).toContain('/storage/v1/object/public/evidence/');

    // Pre-computed finance fields must NOT be sent
    expect(rpcParams).not.toHaveProperty('revenue');
    expect(rpcParams).not.toHaveProperty('netPayable');
    expect(rpcParams).not.toHaveProperty('commission');
  });

  it('uploads inline evidence before calling the RPC', async () => {
    mockRpc.mockResolvedValue({ data: serverRow, error: null });

    await submitCollectionV2(baseInput);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [path] = mockUpload.mock.calls[0] as [string, Blob];
    expect(path).toBe('collection/drv-001/TX-test-001.jpg');
  });

  it('forwards driver id as p_driver_id (server enforces ownership)', async () => {
    mockRpc.mockResolvedValue({ data: serverRow, error: null });

    await submitCollectionV2(baseInput);

    const [, rpcParams] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    // Client sends the driver id; the server is responsible for verifying it
    // matches the caller's profile (driver impersonation check in the RPC).
    expect(rpcParams['p_driver_id']).toBe('drv-001');
  });

  it('returns failure when the RPC reports a forbidden error (driver impersonation blocked by server)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Forbidden: driver may not submit on behalf of another driver' },
    });

    const result = await submitCollectionV2({ ...baseInput, driverId: 'drv-other' });

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toContain('Forbidden');
    }
  });

  it('returns the persisted row values on idempotent replay (server returns existing row on conflict)', async () => {
    // Simulate the server returning the originally-persisted row (with different
    // finance values than would be recomputed from the replayed inputs).
    const persistedRow = {
      ...serverRow,
      revenue: 38000,   // values from the original submission
      netPayable: 27000,
    };
    mockRpc.mockResolvedValue({ data: persistedRow, error: null });

    // Client replays the same txId with slightly different score (simulates retry)
    const result = await submitCollectionV2({ ...baseInput, currentScore: 1210 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Client must trust the server-returned row, not locally computed values
    expect(result.transaction.revenue).toBe(38000);
    expect(result.transaction.netPayable).toBe(27000);
  });

  it('returns failure when the RPC reports an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Location not found' } });

    const result = await submitCollectionV2(baseInput);

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toContain('Location not found');
    }
  });

  it('returns failure when the RPC returns no data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await submitCollectionV2(baseInput);

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toContain('no data');
    }
  });

  it('returns failure when Supabase throws an unexpected error', async () => {
    mockRpc.mockRejectedValue(new Error('Network timeout'));

    const result = await submitCollectionV2(baseInput);

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toContain('Network timeout');
    }
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
