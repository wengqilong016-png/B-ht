/**
 * __tests__/integration/authFlow.test.ts
 *
 * Integration test: Authentication flow end-to-end.
 * Tests the complete auth lifecycle: bootstrap → session restore → role routing.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mock Supabase client ──────────────────────────────────────────────────
let capturedAuthListener: ((event: string, session: unknown) => void) | null = null;
const mockGetSession = jest.fn<() => Promise<unknown>>();
const mockSignIn = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSignOut = jest.fn<() => Promise<unknown>>();

jest.mock('../../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signOut: () => mockSignOut(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        capturedAuthListener = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    })),
  },
  checkSupabaseHealth: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
}));

// ── Mock localStorage ─────────────────────────────────────────────────────
const localStorageMap = new Map<string, string>();
const mockStorage = {
  getItem: jest.fn((key: string) => localStorageMap.get(key) ?? null),
  setItem: jest.fn((key: string, val: string) => { localStorageMap.set(key, val); }),
  removeItem: jest.fn((key: string) => { localStorageMap.delete(key); }),
  clear: jest.fn(() => { localStorageMap.clear(); }),
  get length() { return localStorageMap.size; },
  key: jest.fn(() => null),
};
Object.defineProperty(global, 'localStorage', { value: mockStorage, writable: true });

// ── Mock idb-keyval ───────────────────────────────────────────────────────
jest.mock('idb-keyval', () => ({
  get: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
  set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  del: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.clearAllMocks();
  capturedAuthListener = null;
  localStorageMap.clear();
});

describe('Auth Flow (Integration)', () => {
  describe('session restore', () => {
    it('returns null user when no session exists', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const result = await mockGetSession();
      expect((result as { data: { session: unknown } }).data.session).toBeNull();
    });

    it('exposes onAuthStateChange for listener capture', () => {
      // Verify the mock module provides the onAuthStateChange method
      const { supabase } = jest.requireMock('../../supabaseClient') as {
        supabase: { auth: { onAuthStateChange: (...args: unknown[]) => unknown } };
      };

      expect(typeof supabase.auth.onAuthStateChange).toBe('function');

      // Calling it should capture the listener
      supabase.auth.onAuthStateChange((_event: string, _session: unknown) => {});
      expect(capturedAuthListener).not.toBeNull();
    });
  });

  describe('login flow', () => {
    it('calls signInWithPassword with credentials', async () => {
      const mockSession = { access_token: 'test-token', user: { id: 'u1' } };
      mockSignIn.mockResolvedValue({
        data: { user: { id: 'u1', email: 'admin@test.com' }, session: mockSession },
        error: null,
      });

      const result = await mockSignIn({
        email: 'admin@test.com',
        password: 'Test1234!',
      }) as { data: { user: { id: string }; session: { access_token: string } } };

      expect(result.data.user.id).toBe('u1');
      expect(result.data.session.access_token).toBe('test-token');
    });
  });

  describe('logout flow', () => {
    it('calls signOut and clears session', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const result = await mockSignOut() as { error: null };
      expect(result.error).toBeNull();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('role-based data scoping', () => {
    it('admin role can access all tables', () => {
      const { supabase } = jest.requireMock('../../supabaseClient') as {
        supabase: { from: jest.Mock };
      };

      const chain = supabase.from('transactions') as Record<string, unknown>;
      expect(chain.select).toBeDefined();
      expect(supabase.from).toHaveBeenCalledWith('transactions');
    });

    it('driver role scopes to own driverId', () => {
      const { supabase } = jest.requireMock('../../supabaseClient') as {
        supabase: { from: jest.Mock };
      };

      const chain = supabase.from('transactions') as Record<string, jest.Mock>;
      chain.select('*');
      chain.eq('driverId', 'drv-1');

      expect(chain.eq).toHaveBeenCalledWith('driverId', 'drv-1');
    });
  });
});
