import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

type MutationResult = { error: { message: string } | null };
type ProfileLookupResult = {
  data: { auth_user_id: string | null } | null;
  error: { message: string } | null;
};
type DeleteUserResult = { error: { message: string } | null };

type DriversTableStub = {
  delete: () => {
    eq: (column: string, value: string) => Promise<MutationResult>;
  };
};

type ProfilesTableStub = {
  select: () => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<ProfileLookupResult>;
    };
  };
  delete: () => {
    eq: (column: string, value: string) => Promise<MutationResult>;
  };
};

type UpdateTableStub = {
  update: () => {
    eq: (column: string, value: string) => Promise<MutationResult>;
  };
};

type MutableEdgeGlobals = {
  Deno?: {
    env: {
      get(name: string): string | undefined;
    };
    serve: typeof mockServe;
  };
  Response?: typeof Response;
};

const mockIsAdmin = jest.fn<() => Promise<string | null>>();
const mockDeleteUser = jest.fn<(userId: string) => Promise<DeleteUserResult>>();
const mockProfileMaybeSingle = jest.fn<() => Promise<ProfileLookupResult>>();
const mockTransactionUpdateEq = jest.fn<(column: string, value: string) => Promise<MutationResult>>();
const mockSettlementUpdateEq = jest.fn<(column: string, value: string) => Promise<MutationResult>>();
const mockLocationUpdateEq = jest.fn<(column: string, value: string) => Promise<MutationResult>>();
const mockProfileDeleteEq = jest.fn<(column: string, value: string) => Promise<MutationResult>>();
const mockDriverDeleteEq = jest.fn<(column: string, value: string) => Promise<MutationResult>>();
const mockFrom = jest.fn<(table: string) => DriversTableStub | ProfilesTableStub | UpdateTableStub>();
const mockServe = jest.fn<(handler: (req: Request) => Promise<Response>) => void>();
const originalResponse = globalThis.Response;

jest.mock('../supabase/functions/_shared/authz.ts', () => ({
  isAdmin: () => mockIsAdmin(),
}));

jest.mock('../supabase/functions/_shared/supabaseAdmin.ts', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: (userId: string) => mockDeleteUser(userId),
      },
    },
    from: (table: string) => mockFrom(table),
  },
}));

async function loadDeleteDriverHandler() {
  jest.resetModules();
  mockServe.mockClear();

  const edgeGlobals = globalThis as unknown as MutableEdgeGlobals;

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

  edgeGlobals.Deno = {
    env: {
      get: () => undefined,
    },
    serve: mockServe,
  };
  edgeGlobals.Response = MockResponse as unknown as typeof Response;

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
  if (table === 'profiles') {
    return {
      select: () => ({
        eq: (_column: string, _value: string) => ({
          maybeSingle: () => mockProfileMaybeSingle(),
        }),
      }),
      delete: () => ({
        eq: (column: string, value: string) => mockProfileDeleteEq(column, value),
      }),
    };
  }

  if (table === 'drivers') {
    return {
      delete: () => ({
        eq: (column: string, value: string) => mockDriverDeleteEq(column, value),
      }),
    };
  }

  if (table === 'transactions') {
    return {
      update: () => ({
        eq: (column: string, value: string) => mockTransactionUpdateEq(column, value),
      }),
    };
  }

  if (table === 'daily_settlements') {
    return {
      update: () => ({
        eq: (column: string, value: string) => mockSettlementUpdateEq(column, value),
      }),
    };
  }

  if (table === 'locations') {
    return {
      update: () => ({
        eq: (column: string, value: string) => mockLocationUpdateEq(column, value),
      }),
    };
  }

  throw new Error(`Unexpected table access: ${table}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAdmin.mockResolvedValue('admin-1');
  mockDeleteUser.mockResolvedValue({ error: null });
  mockProfileMaybeSingle.mockResolvedValue({ data: { auth_user_id: 'auth-1' }, error: null });
  mockTransactionUpdateEq.mockResolvedValue({ error: null });
  mockSettlementUpdateEq.mockResolvedValue({ error: null });
  mockLocationUpdateEq.mockResolvedValue({ error: null });
  mockProfileDeleteEq.mockResolvedValue({ error: null });
  mockDriverDeleteEq.mockResolvedValue({ error: null });
  mockFrom.mockImplementation((table: string) => makeSupabaseTableStub(table));
});

afterEach(() => {
  const edgeGlobals = globalThis as unknown as MutableEdgeGlobals;

  delete edgeGlobals.Deno;
  if (originalResponse) {
    edgeGlobals.Response = originalResponse;
  } else {
    delete edgeGlobals.Response;
  }
});

describe('delete-driver edge function', () => {
  it('looks up auth_user_id from profiles via driver_id before deleting auth', async () => {
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, driver_id: 'drv-1' });
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('drivers');
    expect(mockFrom).toHaveBeenCalledWith('transactions');
    expect(mockFrom).toHaveBeenCalledWith('daily_settlements');
    expect(mockFrom).toHaveBeenCalledWith('locations');
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-1');
    expect(mockTransactionUpdateEq).toHaveBeenCalledWith('driverId', 'drv-1');
    expect(mockSettlementUpdateEq).toHaveBeenCalledWith('driverId', 'drv-1');
    expect(mockLocationUpdateEq).toHaveBeenCalledWith('assignedDriverId', 'drv-1');
    expect(mockProfileDeleteEq).toHaveBeenCalledWith('driver_id', 'drv-1');
    expect(mockDriverDeleteEq).toHaveBeenCalledWith('id', 'drv-1');
  });

  it('skips auth deletion when the profile row has no linked auth user', async () => {
    mockProfileMaybeSingle.mockResolvedValueOnce({ data: { auth_user_id: null }, error: null });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-2' }));

    expect(response.status).toBe(200);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockProfileDeleteEq).toHaveBeenCalledWith('driver_id', 'drv-2');
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

  it('returns a structured error when location unassignment fails', async () => {
    mockLocationUpdateEq.mockResolvedValueOnce({ error: { message: 'locations locked' } });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-4' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'locations locked',
      code: 'LOCATION_UNLINK_FAILED',
    });
    expect(mockProfileDeleteEq).not.toHaveBeenCalled();
    expect(mockDriverDeleteEq).not.toHaveBeenCalled();
  });

  it('returns a structured error when profile deletion fails', async () => {
    mockProfileDeleteEq.mockResolvedValueOnce({ error: { message: 'profile locked' } });
    const handler = await loadDeleteDriverHandler();

    const response = await handler(makeRequest({ driver_id: 'drv-5' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'profile locked',
      code: 'PROFILE_DELETE_FAILED',
    });
    expect(mockDriverDeleteEq).not.toHaveBeenCalled();
  });
});
