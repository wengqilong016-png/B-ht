import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import { createPayoutRequest, createResetRequest } from '../repositories/requestRepository';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('requestRepository', () => {
  it('calls create_reset_request_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'RST-1', type: 'reset_request', locationId: 'loc-1', driverId: 'drv-1' },
      error: null,
    });

    const result = await createResetRequest({
      id: 'RST-1',
      locationId: 'loc-1',
      driverId: 'drv-1',
      gps: { lat: -6.8, lng: 39.3 },
      photoUrl: 'data:image/jpeg;base64,abc',
      notes: 'reset needed',
    } as any);

    expect(mockRpc).toHaveBeenCalledWith('create_reset_request_v1', {
      p_tx_id: 'RST-1',
      p_location_id: 'loc-1',
      p_driver_id: 'drv-1',
      p_gps: { lat: -6.8, lng: 39.3 },
      p_photo_url: 'data:image/jpeg;base64,abc',
      p_notes: 'reset needed',
    });
    expect(result.type).toBe('reset_request');
  });

  it('throws when reset request RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('reset request failed'),
    });

    await expect(createResetRequest({
      id: 'RST-1',
      locationId: 'loc-1',
      driverId: 'drv-1',
      gps: { lat: -6.8, lng: 39.3 },
    } as any)).rejects.toThrow('reset request failed');
  });

  it('calls create_payout_request_v1 with expected parameters', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'PAY-1', type: 'payout_request', payoutAmount: 25000 },
      error: null,
    });

    const result = await createPayoutRequest({
      id: 'PAY-1',
      locationId: 'loc-1',
      driverId: 'drv-1',
      gps: { lat: -6.8, lng: 39.3 },
      payoutAmount: 25000,
      notes: 'owner payout',
    } as any);

    expect(mockRpc).toHaveBeenCalledWith('create_payout_request_v1', {
      p_tx_id: 'PAY-1',
      p_location_id: 'loc-1',
      p_driver_id: 'drv-1',
      p_gps: { lat: -6.8, lng: 39.3 },
      p_payout_amount: 25000,
      p_notes: 'owner payout',
    });
    expect(result.type).toBe('payout_request');
  });

  it('throws when payout request RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: new Error('payout request failed'),
    });

    await expect(createPayoutRequest({
      id: 'PAY-1',
      locationId: 'loc-1',
      driverId: 'drv-1',
      gps: { lat: -6.8, lng: 39.3 },
      payoutAmount: 20000,
    } as any)).rejects.toThrow('payout request failed');
  });
});
