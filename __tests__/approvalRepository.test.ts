import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import {
  approveExpenseRequest,
  approvePayoutRequest,
  approveResetRequest,
  reviewAnomalyTransaction,
} from '../repositories/approvalRepository';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('approvalRepository', () => {
  it('calls approve_reset_request_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue({
      data: { txId: 'RST-1', approvalStatus: 'approved', locationId: 'loc-1', lastScore: 0, resetLocked: false },
      error: null,
    });

    const result = await approveResetRequest('RST-1', true);

    expect(mockRpc).toHaveBeenCalledWith('approve_reset_request_v1', {
      p_tx_id: 'RST-1',
      p_approve: true,
    });
    expect(result.approvalStatus).toBe('approved');
  });

  it('throws when reset approval RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('reset approval failed'),
    });

    await expect(approveResetRequest('RST-1', false)).rejects.toThrow('reset approval failed');
  });

  it('calls approve_payout_request_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue({
      data: { txId: 'PAY-1', approvalStatus: 'approved', locationId: 'loc-1', dividendBalance: 20000 },
      error: null,
    });

    const result = await approvePayoutRequest('PAY-1', true);

    expect(mockRpc).toHaveBeenCalledWith('approve_payout_request_v1', {
      p_tx_id: 'PAY-1',
      p_approve: true,
    });
    expect(result.dividendBalance).toBe(20000);
  });

  it('throws when payout approval RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('payout approval failed'),
    });

    await expect(approvePayoutRequest('PAY-1', false)).rejects.toThrow('payout approval failed');
  });

  it('calls approve_expense_request_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue({
      data: { txId: 'EXP-1', expenseStatus: 'approved' },
      error: null,
    });

    const result = await approveExpenseRequest('EXP-1', true);

    expect(mockRpc).toHaveBeenCalledWith('approve_expense_request_v1', {
      p_tx_id: 'EXP-1',
      p_approve: true,
    });
    expect(result.expenseStatus).toBe('approved');
  });

  it('throws when expense approval RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('expense approval failed'),
    });

    await expect(approveExpenseRequest('EXP-1', false)).rejects.toThrow('expense approval failed');
  });

  it('calls review_anomaly_transaction_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue({
      data: { txId: 'ANM-1', approvalStatus: 'approved', isAnomaly: false },
      error: null,
    });

    const result = await reviewAnomalyTransaction('ANM-1', true);

    expect(mockRpc).toHaveBeenCalledWith('review_anomaly_transaction_v1', {
      p_tx_id: 'ANM-1',
      p_approve: true,
    });
    expect(result.isAnomaly).toBe(false);
  });

  it('throws when anomaly review RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('anomaly review failed'),
    });

    await expect(reviewAnomalyTransaction('ANM-1', false)).rejects.toThrow('anomaly review failed');
  });
});
