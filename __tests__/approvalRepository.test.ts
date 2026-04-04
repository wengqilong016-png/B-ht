import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import { approvePayoutRequest, approveResetRequest } from '../repositories/approvalRepository';

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
});
