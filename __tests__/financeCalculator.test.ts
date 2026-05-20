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

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import {
  calculateCollectionFinanceLocal,
  calculateCollectionFinancePreview,
  CollectionFinanceInput,
} from '../services/financeCalculator';
import { CONSTANTS, type Location } from '../types';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();

/** Wraps a value/promise so .abortSignal() chains like the real Supabase builder */
function asBuilder(val: unknown) {
  const p = val instanceof Promise ? val : Promise.resolve(val);
  return Object.assign(p, { abortSignal: () => p });
}

jest.mock('../supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => asBuilder(mockRpc(...args)) },
}));

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeLocation(
  overrides: Partial<Pick<Location, 'lastScore' | 'commissionRate' | 'machineId' | 'area' | 'initialStartupDebt' | 'remainingStartupDebt'>> = {},
): Location {
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
    assignedDriverId: undefined,
    status: 'active' as const,
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

  it('treats commissionRate 0 as a valid zero percent rate', () => {
    const loc = makeLocation({ commissionRate: 0 });
    const result = calculateCollectionFinanceLocal(makeInput({ selectedLocation: loc }));
    expect(result.commission).toBe(0);
  });

  it('clamps diff to 0 when currentScore <= lastScore', () => {
    // score 900 < lastScore 1000 → diff 0
    const result = calculateCollectionFinanceLocal(makeInput({ currentScore: '900' }));
    expect(result.diff).toBe(0);
    expect(result.revenue).toBe(0);
  });

  it('deducts expenses from netPayable', () => {
    // diff=200, revenue=40000, commission=6000, subtract expenses 5000
    const result = calculateCollectionFinanceLocal(makeInput({ expenses: '5000' }));
    expect(result.netPayable).toBe(40000 - 6000 - 5000);
  });

  it('deducts tip from netPayable', () => {
    const result = calculateCollectionFinanceLocal(makeInput({ tip: '2000' }));
    expect(result.netPayable).toBe(40000 - 6000 - 2000);
  });

  it('adds merchant debt repayment up to remaining startup debt', () => {
    const result = calculateCollectionFinanceLocal(
      makeInput({
        selectedLocation: makeLocation({ remainingStartupDebt: 7000 }),
        startupDebtDeduction: '9000',
      }),
    );
    expect(result.startupDebtDeduction).toBe(7000);
    expect(result.netPayable).toBe(40000 - 6000 + 7000);
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

  it('uses ownerRetention for direct-pay mode too', () => {
    const result = calculateCollectionFinanceLocal(
      makeInput({ isOwnerRetaining: false, ownerRetention: '9999' }),
    );
    expect(result.finalRetention).toBe(9999);
  });

  it('calculates remainingCoins with initialFloat and coinExchange', () => {
    // netPayable = 34000, initialFloat=5000, coinExchange=10000
    // remainingCoins = 5000 + 34000 - 10000 = 29000
    const result = calculateCollectionFinanceLocal(
      makeInput({ initialFloat: 5000, coinExchange: '10000' }),
    );
    expect(result.remainingCoins).toBe(29000);
    expect(result.isCoinStockNegative).toBe(false);
  });

  it('flags isCoinStockNegative when remainingCoins < 0', () => {
    // netPayable = 34000, initialFloat=0, coinExchange=50000 → remaining = -16000
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

  it('applies Math.abs to expenses and tip (aligns with server ABS)', () => {
    // negative tip must be treated as positive deduction, same as server
    // diff=200, revenue=40000, commission=6000, tip=-1000 should be treated as 1000 deduction
    const result = calculateCollectionFinanceLocal(makeInput({ tip: '-1000' }));
    expect(result.netPayable).toBe(40000 - 6000 - 1000); // 33000, not 35000
  });
});

// ── Edge-case / boundary tests (M4 coverage) ──────────────────────────────────

describe('calculateCollectionFinanceLocal — edge cases', () => {
  it('caps currentScore at MAX_REASONABLE_SCORE (100 000)', () => {
    // Score > 100 000 is silently clamped, producing at most 100 000 - lastScore diff
    const result = calculateCollectionFinanceLocal(makeInput({ currentScore: '2147483647' }));
    // lastScore=1000, MAX=100000 → diff=99000, revenue=19 800 000
    expect(result.diff).toBe(100000 - 1000);
    expect(result.revenue).toBe(99000 * CONSTANTS.COIN_VALUE_TZS);
  });

  it('caps currentScore at MAX_REASONABLE_SCORE when it equals exactly 100 000', () => {
    const result = calculateCollectionFinanceLocal(makeInput({ currentScore: '100000' }));
    expect(result.diff).toBe(100000 - 1000);
    expect(result.revenue).toBe(99000 * CONSTANTS.COIN_VALUE_TZS);
  });

  it('clamps netPayable to 0 when expenses alone exceed revenue', () => {
    // diff=200, revenue=40000, commission=6000, expenses=50000 → netPayable=0
    const result = calculateCollectionFinanceLocal(makeInput({ expenses: '50000' }));
    expect(result.diff).toBe(200);
    expect(result.revenue).toBe(40000);
    expect(result.netPayable).toBe(0);
    // revenue is still 40000 — only netPayable is clamped
  });

  it('clamps netPayable to 0 when expenses + tip > revenue', () => {
    // revenue=40000, commission=6000, expenses=20000 + tip=20000 = 40000 deductions
    // availableAfterCoreDeductions = 40000-6000-20000-20000 = -6000 → clamped to 0
    const result = calculateCollectionFinanceLocal(makeInput({ expenses: '20000', tip: '20000' }));
    expect(result.diff).toBe(200);
    expect(result.revenue).toBe(40000);
    expect(result.netPayable).toBe(0);
    // finalRetention and commission remain computed normally
    expect(result.commission).toBe(6000);
    expect(result.finalRetention).toBe(6000);
  });

  it('clamps expenses + tip > revenue even with ownerRetention override', () => {
    // revenue=40000, finalRetention=10000, expenses=20000, tip=15000
    // available = 40000 - 10000 - 20000 - 15000 = -5000 → 0
    const result = calculateCollectionFinanceLocal(
      makeInput({ expenses: '20000', tip: '15000', isOwnerRetaining: true, ownerRetention: '10000' }),
    );
    expect(result.netPayable).toBe(0);
    expect(result.finalRetention).toBe(10000);
  });

  it('clamps startupDebtDeduction to remainingStartupDebt when request exceeds balance', () => {
    // remainingStartupDebt = 5000, request = 99999 → cap at 5000
    const loc = makeLocation({ remainingStartupDebt: 5000 });
    const result = calculateCollectionFinanceLocal(
      makeInput({ selectedLocation: loc, startupDebtDeduction: '99999' }),
    );
    expect(result.startupDebtDeduction).toBe(5000);
  });

  it('netPayable is 0 when every deduction is extreme', () => {
    // diff=200, revenue=40000, commission=6000
    // expenses=99999, tip=99999, ownerRetention=99999
    // finalRetention=99999 (explicit), availableAfterCoreDeductions = 40000-99999-99999-99999 = negative → 0
    // startupDebtDeduction = 0 (no remaining debt)
    const result = calculateCollectionFinanceLocal(
      makeInput({ expenses: '99999', tip: '99999', isOwnerRetaining: true, ownerRetention: '99999' }),
    );
    expect(result.netPayable).toBe(0);
    expect(result.isCoinStockNegative).toBe(false);
  });

  it('startupDebtDeduction is 0 when remainingStartupDebt is 0 regardless of request', () => {
    const loc = makeLocation({ remainingStartupDebt: 0 });
    const result = calculateCollectionFinanceLocal(
      makeInput({ selectedLocation: loc, startupDebtDeduction: '50000' }),
    );
    expect(result.startupDebtDeduction).toBe(0);
    expect(result.netPayable).toBe(40000 - 6000);
  });
});

// ── 极限值 / SQL INTEGER boundary tests (M4 coverage) ────────────────────────

describe('calculateCollectionFinanceLocal — 极限值 (extreme values)', () => {
  it('clamps currentScore at MAX_REASONABLE_SCORE even for 2^31-1 (PostgreSQL INTEGER max)', () => {
    // PostgreSQL INTEGER: -2147483648 to 2147483647
    const result = calculateCollectionFinanceLocal(makeInput({ currentScore: '2147483647' }));
    expect(result.diff).toBe(100000 - 1000); // MAX_REASONABLE_SCORE 100000 - lastScore 1000
    expect(result.revenue).toBe(99000 * CONSTANTS.COIN_VALUE_TZS);
    expect(result.source).toBe('local');
  });

  it('clamps currentScore to 0 diff for negative currentScore', () => {
    // PostgreSQL INTEGER min: -2147483648 — should still produce diff=0 locally
    const result = calculateCollectionFinanceLocal(makeInput({ currentScore: '-2147483648' }));
    // Math.min(Math.floor(-2147483648), 100000) = -2147483648
    // Math.max(0, -2147483648 - 1000) = 0
    expect(result.diff).toBe(0);
    expect(result.revenue).toBe(0);
  });

  it('currentScore = 0 with lastScore = 0 → diff=0, revenue=0', () => {
    const loc = makeLocation({ lastScore: 0 });
    const result = calculateCollectionFinanceLocal(
      makeInput({ selectedLocation: loc, currentScore: '0' }),
    );
    expect(result.diff).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.netPayable).toBe(0);
  });

  it('expenses + tip exactly equal to revenue → netPayable=0 at boundary', () => {
    // diff=200, revenue=40000, commission=6000
    // expenses=34000, tip=0 → availableAfterCoreDeductions = 40000-6000-34000-0 = 0
    const result = calculateCollectionFinanceLocal(makeInput({ expenses: '34000', tip: '0' }));
    expect(result.revenue).toBe(40000);
    expect(result.netPayable).toBe(0);
    // diff and revenue are still computed, only netPayable is clamped
    expect(result.diff).toBe(200);
  });

  it('tip + expenses = revenue - commission boundary', () => {
    // revenue=40000, commission=6000
    // expenses=17000, tip=17000 → 40000-6000-17000-17000 = 0
    const result = calculateCollectionFinanceLocal(makeInput({ expenses: '17000', tip: '17000' }));
    expect(result.netPayable).toBe(0);
  });

  it('startupDebtDeduction exactly equals remainingStartupDebt', () => {
    const loc = makeLocation({ remainingStartupDebt: 75000 });
    const result = calculateCollectionFinanceLocal(
      makeInput({ selectedLocation: loc, startupDebtDeduction: '75000' }),
    );
    expect(result.startupDebtDeduction).toBe(75000);
    expect(result.netPayable).toBe(40000 - 6000 + 75000);
  });

  it('startupDebtDeduction = 2147483647 with remainingStartupDebt = 100000 → clamped to 100000', () => {
    // SQL侧 INTEGER max startupDebtDeduction = 2.1B, 但前端 clamp 到 remainingStartupDebt
    const loc = makeLocation({ remainingStartupDebt: 100000 });
    const result = calculateCollectionFinanceLocal(
      makeInput({ selectedLocation: loc, startupDebtDeduction: '2147483647' }),
    );
    expect(result.startupDebtDeduction).toBe(100000);
  });

  it('combined extremes: max currentScore + max expenses + max tip + max ownerRetention', () => {
    // currentScore=2.1B → clamped to 100000, diff=99000, revenue=19800000
    // commission=floor(19800000*0.15)=2970000
    // expenses=999999, tip=999999, ownerRetention=999999
    // available = 19800000 - 999999 - 999999 - 999999 = 16800003 → positive
    // startupDebtDeduction = 0 (no remaining debt)
    const result = calculateCollectionFinanceLocal(
      makeInput({
        currentScore: '2147483647',
        expenses: '999999',
        tip: '999999',
        isOwnerRetaining: true,
        ownerRetention: '999999',
      }),
    );
    expect(result.diff).toBe(99000);
    expect(result.revenue).toBe(19800000);
    expect(result.commission).toBe(2970000);
    expect(result.finalRetention).toBe(999999);
    expect(result.netPayable).toBe(19800000 - 999999 - 999999 - 999999);
    expect(result.source).toBe('local');
  });

  it('expenses as negative string still treated as positive deduction', () => {
    // Math.abs(-5000) = 5000 deducted
    const result = calculateCollectionFinanceLocal(makeInput({ expenses: '-5000' }));
    expect(result.netPayable).toBe(40000 - 6000 - 5000);
  });

  it('commissionRate = 1 (100%) consumes all revenue', () => {
    const loc = makeLocation({ commissionRate: 1 });
    const result = calculateCollectionFinanceLocal(makeInput({ selectedLocation: loc }));
    expect(result.commission).toBe(40000); // 100% of 40000
    expect(result.netPayable).toBe(0); // revenue - commission = 0
  });

  it('commissionRate = 1.5 (150%) — revenue floor still applies', () => {
    // commission = floor(40000 * 1.5) = 60000
    // netPayable = max(0, 40000 - 60000) = 0
    const loc = makeLocation({ commissionRate: 1.5 });
    const result = calculateCollectionFinanceLocal(makeInput({ selectedLocation: loc }));
    expect(result.commission).toBe(60000);
    expect(result.netPayable).toBe(0);
  });
});

// ── SQL 函数契约测试 (M4 coverage) ────────────────────────────────────────────

describe('calculateCollectionFinancePreview — SQL contract', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls calculate_finance_v2 with correct SQL parameter names matching server signature', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 100, revenue: 20000, commission: 3000, finalRetention: 3000, netPayable: 17000 },
      error: null,
    });

    await calculateCollectionFinancePreview(makeInput({
      currentScore: '1200',
      expenses: '5000',
      tip: '1000',
      isOwnerRetaining: true,
      ownerRetention: '6000',
      startupDebtDeduction: '4000',
    }));

    expect(mockRpc).toHaveBeenCalledWith('calculate_finance_v2', expect.objectContaining({
      p_current_score: expect.any(Number),
      p_previous_score: expect.any(Number),
      p_commission_rate: expect.any(Number),
      p_expenses: expect.any(Number),
      p_tip: expect.any(Number),
      p_is_owner_retaining: expect.any(Boolean),
      p_owner_retention: expect.anything(),
      p_startup_debt_deduction_request: expect.any(Number),
      p_startup_debt_balance: expect.any(Number),
    }));
  });

  it('passes PostgreSQL INTEGER boundary values correctly through RPC params', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 99000, revenue: 19800000, commission: 2970000, finalRetention: 2970000, netPayable: 16830000 },
      error: null,
    });

    const loc = makeLocation({ lastScore: 1000, remainingStartupDebt: 200000 });
    await calculateCollectionFinancePreview(makeInput({
      selectedLocation: loc,
      currentScore: '2147483647',
      expenses: '1000000',
      tip: '500000',
      startupDebtDeduction: '200000',
      isOwnerRetaining: false,
    }));

    const callArgs = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(callArgs[0]).toBe('calculate_finance_v2');
    const params = callArgs[1];
    // currentScore 应该被 clamp 到 MAX_REASONABLE_SCORE
    expect(params.p_current_score).toBe(100000);
    expect(params.p_expenses).toBe(1000000);
    expect(params.p_tip).toBe(500000);
    expect(params.p_startup_debt_deduction_request).toBe(200000);
    expect(params.p_startup_debt_balance).toBe(200000);
    expect(params.p_is_owner_retaining).toBe(false);
    expect(params.p_owner_retention).toBe(null);
  });

  it('handles server returning partial data (missing some fields)', async () => {
    mockRpc.mockResolvedValueOnce({
      // Server returns only diff and revenue — missing commission, finalRetention, netPayable
      data: { diff: 200, revenue: 40000 },
      error: null,
    });

    const result = await calculateCollectionFinancePreview(makeInput());
    expect(result.source).toBe('server');
    expect(result.diff).toBe(200);
    expect(result.revenue).toBe(40000);
    // Fallback from local: commission=6000, finalRetention=6000, netPayable=34000
    expect(result.commission).toBe(6000);
    expect(result.finalRetention).toBe(6000);
    expect(result.netPayable).toBe(34000);
  });

  it('treats server diff=0 correctly (no revenue)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { diff: 0, revenue: 0, commission: 0, finalRetention: 0, netPayable: 0 },
      error: null,
    });

    const result = await calculateCollectionFinancePreview(makeInput({ currentScore: '500' }));
    expect(result.source).toBe('server');
    expect(result.diff).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.netPayable).toBe(0);
  });

  it('submit_collection_v2 idempotency: server returns persisted row on conflict', async () => {
    // Simulate submit_collection_v2 ON CONFLICT DO NOTHING behavior:
    // The RPC returns the already-persisted row with different values
    mockRpc.mockResolvedValueOnce({
      data: {
        // Server persisted values differ from local computation
        diff: 150,
        revenue: 30000,
        commission: 4500,
        finalRetention: 4500,
        netPayable: 25500,
      },
      error: null,
    });

    // Local computation would be: diff=200, revenue=40000, commission=6000, netPayable=34000
    // But server returns persisted row (ON CONFLICT for same txId) with different values
    const result = await calculateCollectionFinancePreview(makeInput());
    expect(result.source).toBe('server');
    expect(result.revenue).toBe(30000);
    expect(result.commission).toBe(4500);
    expect(result.netPayable).toBe(25500);
    // Local values are overridden by server-authoritative data
  });
});

// ── calculateCollectionFinancePreview ─────────────────────────────────────────

describe('calculateCollectionFinancePreview', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to calculate finance preview from server RPC.',
      expect.any(Error),
    );
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
