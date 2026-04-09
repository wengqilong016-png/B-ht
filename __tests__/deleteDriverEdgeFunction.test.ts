import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockIsAdmin = jest.fn<() => Promise<string | null>>();
const mockDeleteUser = jest.fn<() => Promise<unknown>>();
const mockDriverMaybeSingle = jest.fn<() => Promise<unknown>>();
const mockTransactionUpdateEq = jest.fn<() => Promise<unknown>>();
const mockSettlementUpdateEq = jest.fn<() => Promise<unknown>>();
const mockDriverDeleteEq = jest.fn<() => Promise<unknown>>();
const mockFrom = jest.fn<(table: string) => unknown>();
const mockServe = jest.fn<(handler: (req: Request) => Promise<Response>) => void>();
const originalResponse = globalThis.Response;

jest.mock('../supabase/functions/_shared/authz.ts', () => ({
  isAdmin: () => mockIsAdmin(),
}));

jest.mock('../supabase/functions/_shared/supabaseAdmin.ts', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    from: (table: string) => mockFrom(table),
  },
}));

async function loadDeleteDriverHandler() {
  jest.resetModules();
  mockServe.mockClear();

  class MockResponse {
    status: number;
    headers: Record<string, string>;
    private bodyText: string;

    constructor(body: string | null, init?: { status?: number; headers?: Record<string, string> }) {
      this.bodyText = body ?? '';
      this.status = init?.status ?? 200;
      this.headers = init?.headers ?? {};
    }

    async json() {
      return JSON.parse(this.bodyText);
    }
  }

  (globalThis as typeof globalThis & {
    Deno?: { serve: typeof mockServe };
    Response?: typeof MockResponse;
  }).Deno = {
    serve: mockServe,
  };
  (globalThis as typeof globalThis & { Response?: typeof MockResponse }).Response = MockResponse as unknown as typeof Response;

  await import('../supabase/functions/delete-driver/index.ts');

  const handler = mockServe.mock.calls[0]?.[0];
  if (!handler) {
    throw new Error('delete-driver did not register a Deno.serve handler');
  }
  return handler as (req: Request) => Promise<Response>;
}

function makeRequest(body: Record<string, unknown>, method = 'POST') {
  return {
    method,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'authorization') return 'Bearer token';
        if (name.toLowerCase() === 'content-type') return 'application/json';
        return null;
      },
    },
    json: async () => body,
  } as unknown as Request;
}

function makeSupabaseTableStub(table: string) {
  if (table === 'drivers') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockDriverMaybeSingle(),
        }),
      }),
      delete: () => ({
        eq: (...args: unknown[]) => mockDriverDeleteEq(...args),
      }),
    };
  }

  if (table === 'transactions') {
    return {
      update: () => ({
        eq: (...args: unknown[]) => mockTransactionUpdateEq(...args),
      }),
    };
  }

  if (table === 'daily_settlements') {
    return {
      update: () => ({
        eq: (...args: unknown[]) => mockSettlementUpdateEq(...args),
      }),
    };
  }

  throw new Error(`Unexpected table access: ${table}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAdmin.mockResolvedValue('admin-1');
  mockDeleteUser.mockResolvedValue({ error: null });
  mockDriverMaybeSingle.mockResolvedValue({ data: { auth_user_id: 'auth-1' }, error: null });
  mockTransactionUpdateEq.mockResolvedValue({ error: null });
  mockSettlementUpdateEq.mockResolvedValue({ error: null });
  mockDriverDeleteEq.mockResolvedValue({ error: null });
  mockFrom.mockImplementation((table: string) => makeSupabaseTableStub(table));
});

afterEach(() => {
  delete (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  if (originalResponse) {
    globalThis.Response = originalResponse;
  } else {
    delete (globalThis as typeof globalThis & { Response?: unknown }).Response;
  }
});

describe('delete-driver edge function', () => {
  it('looks up auth_user_id from drivers and never queries profiles', async () => {
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, driver_id: 'drv-1' });
    expect(mockFrom).toHaveBeenCalledWith('drivers');
    expect(mockFrom).toHaveBeenCalledWith('transactions');
    expect(mockFrom).toHaveBeenCalledWith('daily_settlements');
    expect(mockFrom.mock.calls.map(([table]) => table)).not.toContain('profiles');
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-1');
    expect(mockTransactionUpdateEq).toHaveBeenCalledWith('driverId', 'drv-1');
    expect(mockSettlementUpdateEq).toHaveBeenCalledWith('driverId', 'drv-1');
    expect(mockDriverDeleteEq).toHaveBeenCalledWith('id', 'drv-1');
  });

  it('skips auth deletion when the driver row has no linked auth user', async () => {
    mockDriverMaybeSingle.mockResolvedValueOnce({ data: { auth_user_id: null }, error: null });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-2' }));

    expect(response.status).toBe(200);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockDriverDeleteEq).toHaveBeenCalledWith('id', 'drv-2');
  });

  it('returns a structured error when transaction unlinking fails', async () => {
    mockTransactionUpdateEq.mockResolvedValueOnce({ error: { message: 'transactions locked' } });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-3' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'transactions locked',
      code: 'TRANSACTION_UNLINK_FAILED',
    });
    expect(mockDriverDeleteEq).not.toHaveBeenCalled();
  });
});
