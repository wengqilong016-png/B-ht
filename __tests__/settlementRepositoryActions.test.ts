import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import { createSettlement, reviewSettlement } from '../repositories/settlementRepository';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('settlementRepository actions', () => {
  it('calls create_daily_settlement_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'STL-1', status: 'pending', driverId: 'drv-1' },
      error: null,
    });

    const result = await createSettlement({
      id: 'STL-1',
      date: '2026-04-04',
      driverId: 'drv-1',
      driverName: 'Driver One',
      totalRevenue: 40000,
      totalNetPayable: 30000,
      totalExpenses: 2000,
      driverFloat: 10000,
      expectedTotal: 30000,
      settlementExpenseAmount: 1500,
      settlementExpenseCategory: 'electricity',
      settlementExpenseNote: 'late shift power',
      actualCash: 25000,
      actualCoins: 5000,
      shortage: 0,
      note: 'all good',
      transferProofUrl: 'https://example.com/proof.jpg',
      timestamp: '2026-04-04T10:00:00.000Z',
      status: 'pending',
    } as any);

    expect(mockRpc).toHaveBeenCalledWith('create_daily_settlement_v1', {
      p_id: 'STL-1',
      p_date: '2026-04-04',
      p_driver_id: 'drv-1',
      p_total_revenue: 40000,
      p_total_net_payable: 30000,
      p_total_expenses: 2000,
      p_driver_float: 10000,
      p_expected_total: 30000,
      p_settlement_expense_amount: 1500,
      p_settlement_expense_category: 'electricity',
      p_settlement_expense_note: 'late shift power',
      p_actual_cash: 25000,
      p_actual_coins: 5000,
      p_shortage: 0,
      p_note: 'all good',
      p_transfer_proof_url: 'https://example.com/proof.jpg',
    });
    expect(result.status).toBe('pending');
  });

  it('throws when create settlement RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('create settlement failed'),
    });

    await expect(createSettlement({
      id: 'STL-1',
      date: '2026-04-04',
      driverId: 'drv-1',
      totalRevenue: 1,
      totalNetPayable: 1,
      totalExpenses: 0,
      driverFloat: 0,
      expectedTotal: 1,
      actualCash: 1,
      actualCoins: 0,
      shortage: 0,
      timestamp: '2026-04-04T10:00:00.000Z',
      status: 'pending',
    } as any)).rejects.toThrow('create settlement failed');
  });

  it('calls review_daily_settlement_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'STL-1', status: 'confirmed', adminId: 'admin-1' },
      error: null,
    });

    const result = await reviewSettlement('STL-1', 'confirmed', 'count verified');

    expect(mockRpc).toHaveBeenCalledWith('review_daily_settlement_v1', {
      p_settlement_id: 'STL-1',
      p_status: 'confirmed',
      p_note: 'count verified',
    });
    expect(result.status).toBe('confirmed');
  });

  it('throws when review settlement RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('review settlement failed'),
    });

    await expect(reviewSettlement('STL-1', 'rejected')).rejects.toThrow('review settlement failed');
  });

  it('throws when confirming a zero-revenue settlement (RPC guard)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('Cannot confirm zero-revenue settlement'),
    });

    await expect(reviewSettlement('STL-ZERO', 'confirmed')).rejects.toThrow('Cannot confirm zero-revenue settlement');

    expect(mockRpc).toHaveBeenCalledWith('review_daily_settlement_v1', {
      p_settlement_id: 'STL-ZERO',
      p_status: 'confirmed',
      p_note: null,
    });
  });
});
