/**
 * __tests__/financeCalculator.test.ts
 *
 * Stabilization tests for the Stage-1/2 finance preview path.
 *
 * Covers:
 *   - calculateCollectionFinanceLocal (pure, no Supabase) – happy path, edge cases
 *   - calculateCollectionFinancePreview (server path) – success and fallback behavior
 *
 * The supabaseClient module is mocked so tests run without a live Supabase project.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CONSTANTS } from '../types';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import {
  calculateCollectionFinanceLocal,
  calculateCollectionFinancePreview,
  CollectionFinanceInput,
} from '../services/financeCalculator';

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeLocation(overrides: Partial<{ lastScore: number; commissionRate: number; machineId: string; area: string; initialStartupDebt: number; remainingStartupDebt: number }> = {}) {
  return {
    id: 'loc-001',
    name: 'Test Site',
    coords: { lat: -6.79, lng: 39.21 },
    lastScore: overrides.lastScore ?? 1000,
    commissionRate: overrides.commissionRate ?? 0.15,
    machineId: overrides.machineId ?? 'M-001',
    area: overrides.area ?? 'Test Area',
    initialStartupDebt: overrides.initialStartupDebt ?? 0,
    remainingStartupDebt: overrides.remainingStartupDebt ?? 0,
    initialFloat: 0,
    assignedDriverId: null,
    status: 'active' as const,
    coinStock: 0,
    debtBalance: 0,
    startupDebt: 0,
    notes: null,
    photoUrl: null,
  };
}

function makeInput(overrides: Partial<CollectionFinanceInput> = {}): CollectionFinanceInput {
  return {
    selectedLocation: makeLocation(),
    currentScore: '1200',
    expenses: '0',
    coinExchange: '0',
    ownerRetention: '',
    isOwnerRetaining: false,
    tip: '0',
    startupDebtDeduction: '0',
    initialFloat: 0,
    ...overrides,
  };
}

// ── calculateCollectionFinanceLocal ───────────────────────────────────────────

describe('calculateCollectionFinanceLocal', () => {
  it('returns zero result when selectedLocation is null', () => {
    const result = calculateCollectionFinanceLocal(makeInput({ selectedLocation: null }));
    expect(result.diff).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.netPayable).toBe(0);
    expect(result.source).toBe('local');
  });

  it('returns zero result when selectedLocation is undefined', () => {
    const result = calculateCollectionFinanceLocal(makeInput({ selectedLocation: undefined }));
    expect(result.diff).toBe(0);
    expect(result.revenue).toBe(0);
  });

  it('calculates diff, revenue, and commission correctly', () => {
    // score 1200 - lastScore 1000 = diff 200
    // revenue = 200 * COIN_VALUE_TZS (200) = 40 000
    // commission = floor(40000 * 0.15) = 6 000
    const result = calculateCollectionFinanceLocal(makeInput());
    expect(result.diff).toBe(200);
    expect(result.revenue).toBe(200 * CONSTANTS.COIN_VALUE_TZS);
    expect(result.commission).toBe(Math.floor(200 * CONSTANTS.COIN_VALUE_TZS * 0.15));
    expect(result.source).toBe('local');
  });

  it('uses DEFAULT_PROFIT_SHARE when commissionRate is 0', () => {
    const loc = makeLocation({ commissionRate: 0 });
    const result = calculateCollectionFinanceLocal(makeInput({ selectedLocation: loc }));
    const expectedCommission = Math.floor(
      200 * CONSTANTS.COIN_VALUE_TZS * CONSTANTS.DEFAULT_PROFIT_SHARE,
    );
    expect(result.commission).toBe(expectedCommission);
  });

  it('clamps diff to 0 when currentScore <= lastScore', () => {
    // score 900 < lastScore 1000 → diff 0
    const result = calculateCollectionFinanceLocal(makeInput({ currentScore: '900' }));
    expect(result.diff).toBe(0);
    expect(result.revenue).toBe(0);
  });

  it('deducts expenses from netPayable', () => {
    // diff=200, revenue=40000, no retention → netPayable before expenses = 40000
    // subtract expenses 5000 → 35000
    const result = calculateCollectionFinanceLocal(makeInput({ expenses: '5000' }));
    expect(result.netPayable).toBe(40000 - 5000);
  });

  it('deducts tip from netPayable', () => {
    const result = calculateCollectionFinanceLocal(makeInput({ tip: '2000' }));
    expect(result.netPayable).toBe(40000 - 2000);
  });

  it('deducts manual merchant debt up to remaining startup debt and available cash', () => {
    const result = calculateCollectionFinanceLocal(
      makeInput({
        selectedLocation: makeLocation({ remainingStartupDebt: 7000 }),
        startupDebtDeduction: '9000',
      }),
    );
    expect(result.startupDebtDeduction).toBe(7000);
    expect(result.netPayable).toBe(40000 - 7000);
  });

  it('clamps netPayable to 0 when deductions exceed revenue', () => {
    const result = calculateCollectionFinanceLocal(makeInput({ expenses: '99999' }));
    expect(result.netPayable).toBe(0);
  });

  it('applies owner retention (explicit amount)', () => {
    // isOwnerRetaining=true, ownerRetention='6000' → finalRetention=6000
    const result = calculateCollectionFinanceLocal(
      makeInput({ isOwnerRetaining: true, ownerRetention: '6000' }),
    );
    expect(result.finalRetention).toBe(6000);
    expect(result.netPayable).toBe(40000 - 6000);
  });

  it('falls back to commission when ownerRetention is empty string', () => {
    // isOwnerRetaining=true but ownerRetention='' → finalRetention = commission
    const result = calculateCollectionFinanceLocal(
      makeInput({ isOwnerRetaining: true, ownerRetention: '' }),
    );
    expect(result.finalRetention).toBe(result.commission);
  });

  it('ignores ownerRetention when isOwnerRetaining is false', () => {
    const result = calculateCollectionFinanceLocal(
      makeInput({ isOwnerRetaining: false, ownerRetention: '9999' }),
    );
    expect(result.finalRetention).toBe(0);
  });

  it('calculates remainingCoins with initialFloat and coinExchange', () => {
    // netPayable = 40000 (no deductions), initialFloat=5000, coinExchange=10000
    // remainingCoins = 5000 + 40000 - 10000 = 35000
    const result = calculateCollectionFinanceLocal(
      makeInput({ initialFloat: 5000, coinExchange: '10000' }),
    );
    expect(result.remainingCoins).toBe(35000);
    expect(result.isCoinStockNegative).toBe(false);
  });

  it('flags isCoinStockNegative when remainingCoins < 0', () => {
    // netPayable = 40000, initialFloat=0, coinExchange=50000 → remaining = -10000
    const result = calculateCollectionFinanceLocal(
      makeInput({ coinExchange: '50000' }),
    );
    expect(result.isCoinStockNegative).toBe(true);
  });

  it('treats invalid number strings as 0', () => {
    const result = calculateCollectionFinanceLocal(
      makeInput({ currentScore: 'abc', expenses: 'xyz' }),
    );
    expect(result.diff).toBe(0);
    expect(result.revenue).toBe(0);
  });
});

// ── calculateCollectionFinancePreview ─────────────────────────────────────────

describe('calculateCollectionFinancePreview', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns local fallback when selectedLocation is null', async () => {
    const result = await calculateCollectionFinancePreview(makeInput({ selectedLocation: null }));
    expect(result.source).toBe('local');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns local fallback when currentScore is empty', async () => {
    const result = await calculateCollectionFinancePreview(makeInput({ currentScore: '  ' }));
    expect(result.source).toBe('local');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns server result on successful RPC call', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 200, revenue: 40000, commission: 6000, finalRetention: 6000, netPayable: 34000 },
      error: null,
    });

    const result = await calculateCollectionFinancePreview(makeInput());
    expect(result.source).toBe('server');
    expect(result.revenue).toBe(40000);
    expect(result.netPayable).toBe(34000);
  });

  it('incorporates coinExchange and initialFloat into remainingCoins from server path', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 200, revenue: 40000, commission: 6000, finalRetention: 0, netPayable: 40000 },
      error: null,
    });

    const result = await calculateCollectionFinancePreview(
      makeInput({ initialFloat: 5000, coinExchange: '10000' }),
    );
    expect(result.source).toBe('server');
    expect(result.remainingCoins).toBe(35000); // 5000 + 40000 - 10000
  });

  it('falls back to local result when RPC returns an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC error' } });

    const result = await calculateCollectionFinancePreview(makeInput());
    expect(result.source).toBe('local');
  });

  it('falls back to local result when RPC returns null data', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await calculateCollectionFinancePreview(makeInput());
    expect(result.source).toBe('local');
  });

  it('falls back to local result when RPC throws', async () => {
    mockRpc.mockRejectedValueOnce(new Error('network failure'));

    const result = await calculateCollectionFinancePreview(makeInput());
    expect(result.source).toBe('local');
  });

  it('passes correct RPC parameters', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 200, revenue: 40000, commission: 6000, finalRetention: 6000, netPayable: 34000 },
      error: null,
    });

    const loc = makeLocation({ lastScore: 1000, commissionRate: 0.15 });
    await calculateCollectionFinancePreview(
      makeInput({
        selectedLocation: loc,
        currentScore: '1200',
        expenses: '5000',
        tip: '1000',
        isOwnerRetaining: true,
        ownerRetention: '6000',
      }),
    );

    expect(mockRpc).toHaveBeenCalledWith('calculate_finance_v2', expect.objectContaining({
      p_current_score: 1200,
      p_previous_score: 1000,
      p_commission_rate: 0.15,
      p_expenses: 5000,
      p_tip: 1000,
      p_is_owner_retaining: true,
      p_owner_retention: 6000,
    }));
  });

  it('sends null owner_retention when isOwnerRetaining is false', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 200, revenue: 40000, commission: 6000, finalRetention: 0, netPayable: 40000 },
      error: null,
    });

    await calculateCollectionFinancePreview(makeInput({ isOwnerRetaining: false }));

    expect(mockRpc).toHaveBeenCalledWith('calculate_finance_v2', expect.objectContaining({
      p_is_owner_retaining: false,
      p_owner_retention: null,
    }));
  });

  it('sends null owner_retention when ownerRetention string is empty', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 200, revenue: 40000, commission: 6000, finalRetention: 6000, netPayable: 34000 },
      error: null,
    });

    await calculateCollectionFinancePreview(
      makeInput({ isOwnerRetaining: true, ownerRetention: '' }),
    );

    expect(mockRpc).toHaveBeenCalledWith('calculate_finance_v2', expect.objectContaining({
      p_owner_retention: null,
    }));
  });

  it('parses comma-formatted ownerRetention string (e.g. "1,500")', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 100, revenue: 20000, commission: 3000, finalRetention: 1500, netPayable: 15500 },
      error: null,
    });

    await calculateCollectionFinancePreview(
      makeInput({ isOwnerRetaining: true, ownerRetention: '1,500' }),
    );

    expect(mockRpc).toHaveBeenCalledWith('calculate_finance_v2', expect.objectContaining({
      p_owner_retention: 1500,
    }));
  });

  it('parses non-finite ownerRetention as 0', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 100, revenue: 20000, commission: 3000, finalRetention: 0, netPayable: 17000 },
      error: null,
    });

    await calculateCollectionFinancePreview(
      makeInput({ isOwnerRetaining: true, ownerRetention: 'abc' }),
    );

    expect(mockRpc).toHaveBeenCalledWith('calculate_finance_v2', expect.objectContaining({
      p_owner_retention: 0,
    }));
  });

  it('clamps startup_debt_deduction_request to 0 when negative string', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 100, revenue: 20000, commission: 3000, finalRetention: 3000, netPayable: 17000 },
      error: null,
    });

    await calculateCollectionFinancePreview(
      makeInput({ startupDebtDeduction: '-500' }),
    );

    expect(mockRpc).toHaveBeenCalledWith('calculate_finance_v2', expect.objectContaining({
      p_startup_debt_deduction_request: 0,
    }));
  });

  it('isCoinStockNegative is true when server netPayable < coinExchange - initialFloat', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 10, revenue: 2000, commission: 300, finalRetention: 300, netPayable: 1700 },
      error: null,
    });

    const result = await calculateCollectionFinancePreview(
      makeInput({ coinExchange: '5000', initialFloat: 0 }),
    );

    expect(result.remainingCoins).toBe(1700 - 5000); // negative
    expect(result.isCoinStockNegative).toBe(true);
  });
});
