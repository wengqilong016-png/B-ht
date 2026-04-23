/**
 * __tests__/driverManagementService.test.ts
 *
 * Tests for services/driverManagementService.ts
 * Covers createDriverAccount and persistDriverBusinessFields with a mocked
 * Supabase client.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Supabase mock ──────────────────────────────────────────────────────────
const mockInvoke = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdate = jest.fn<(fields: Record<string, unknown>) => { eq: typeof mockEq }>();
const mockEq = jest.fn<(field: string, value: unknown) => Promise<unknown>>();
let mockSupabase: unknown;

jest.mock('../supabaseClient', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

import {
  createDriverAccount,
  deleteDriverAccount,
  persistDriverBusinessFields,
} from '../services/driverManagementService';

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabase = {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        mockUpdate(fields);
        return { eq: mockEq };
      },
    }),
  };
});

// ══ createDriverAccount ════════════════════════════════════════════════════

describe('createDriverAccount()', () => {
  const params = {
    email: 'driver@example.com',
    password: 'Secure123!',
    username: 'drv001',
    name: 'Driver One',
  };

  it('returns success with driverId on successful Edge Function call', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, driver_id: 'uuid-drv-001' },
      error: null,
    });

    const result = await createDriverAccount(params);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.driverId).toBe('uuid-drv-001');
    }
  });

  it('invokes the create-driver edge function with correct body', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, driver_id: 'uuid-drv-002' },
      error: null,
    });

    await createDriverAccount(params);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fnName, opts] = mockInvoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fnName).toBe('create-driver');
    expect(opts.body.email).toBe('driver@example.com');
    expect(opts.body.driver_id).toBe('drv001');
    expect(opts.body.display_name).toBe('Driver One');
    expect(opts.body.username).toBe('drv001');
  });

  it('returns failure with code and message when Edge Function reports error', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: false, error: 'Email already exists', code: 'EMAIL_CONFLICT' },
      error: null,
    });

    const result = await createDriverAccount(params);

    expect(result.success).toBe(false);
    const fail = result as { success: false; code: string; message: string };
    expect(fail.code).toBe('EMAIL_CONFLICT');
    expect(fail.message).toBe('Email already exists');
  });

  it('returns failure when http-level error occurs', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function timeout' },
    });

    const result = await createDriverAccount(params);

    expect(result.success).toBe(false);
    const fail = result as { success: false; code: string; message: string };
    expect(fail.message).toBe('Edge Function timeout');
    expect(fail.code).toBe('UNKNOWN');
  });

  it('uses UNKNOWN code when data provides no code', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: false, error: 'Something went wrong' },
      error: null,
    });

    const result = await createDriverAccount(params);

    expect(result.success).toBe(false);
    const fail = result as { success: false; code: string; message: string };
    expect(fail.code).toBe('UNKNOWN');
  });

  it('returns CLIENT_UNAVAILABLE when Supabase client is missing', async () => {
    mockSupabase = null;

    const result = await createDriverAccount(params);

    expect(result).toEqual({
      success: false,
      code: 'CLIENT_UNAVAILABLE',
      message: 'Supabase client unavailable',
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// ══ deleteDriverAccount ════════════════════════════════════════════════════

describe('deleteDriverAccount()', () => {
  it('returns success and driverId when delete edge function succeeds', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, driver_id: 'uuid-drv-001' },
      error: null,
    });

    const result = await deleteDriverAccount('drv-001');

    expect(result).toEqual({ success: true, driverId: 'uuid-drv-001' });
    expect(mockInvoke).toHaveBeenCalledWith('delete-driver', {
      body: { driver_id: 'drv-001' },
    });
  });

  it('returns failure when delete edge function reports an error payload', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: false, error: 'Driver not found', code: 'NOT_FOUND' },
      error: null,
    });

    const result = await deleteDriverAccount('drv-404');

    expect(result).toEqual({
      success: false,
      code: 'NOT_FOUND',
      message: 'Driver not found',
    });
  });

  it('returns CLIENT_UNAVAILABLE when Supabase client is missing', async () => {
    mockSupabase = null;

    const result = await deleteDriverAccount('drv-001');

    expect(result).toEqual({
      success: false,
      code: 'CLIENT_UNAVAILABLE',
      message: 'Supabase client unavailable',
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// ══ persistDriverBusinessFields ═══════════════════════════════════════════

describe('persistDriverBusinessFields()', () => {
  const fields = {
    phone: '0711000001',
    vehicleInfo: { model: 'Toyota', plate: 'TZ-001A' },
    dailyFloatingCoins: 200,
    baseSalary: 300000,
    commissionRate: 15,
    initialDebt: 50000,
  };

  it('resolves without error on successful update', async () => {
    mockEq.mockResolvedValue({ error: null });

    await expect(persistDriverBusinessFields('drv-001', fields)).resolves.toBeUndefined();
  });

  it('calls update with correct field values', async () => {
    mockEq.mockResolvedValue({ error: null });

    await persistDriverBusinessFields('drv-001', fields);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '0711000001',
        vehicleInfo: { model: 'Toyota', plate: 'TZ-001A' },
        dailyFloatingCoins: 200,
        baseSalary: 300000,
        commissionRate: 15,
        initialDebt: 50000,
        remainingDebt: 50000, // defaults to initialDebt when not provided
      }),
    );
  });

  it('uses explicit remainingDebt when provided', async () => {
    mockEq.mockResolvedValue({ error: null });

    await persistDriverBusinessFields('drv-001', { ...fields, remainingDebt: 30000 });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ remainingDebt: 30000 }),
    );
  });

  it('filters by driverId', async () => {
    mockEq.mockResolvedValue({ error: null });

    await persistDriverBusinessFields('drv-special', fields);

    expect(mockEq).toHaveBeenCalledWith('id', 'drv-special');
  });

  it('throws when Supabase returns an error', async () => {
    const dbError = new Error('Permission denied');
    mockEq.mockResolvedValue({ error: dbError });

    await expect(persistDriverBusinessFields('drv-001', fields)).rejects.toThrow('Permission denied');
  });

  it('throws when Supabase client is unavailable', async () => {
    mockSupabase = null;

    await expect(persistDriverBusinessFields('drv-001', fields)).rejects.toThrow('Supabase client unavailable');
  });
});
