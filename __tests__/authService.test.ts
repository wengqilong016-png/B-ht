/**
 * Tests for services/authService.ts
 *
 * Covers error-discrimination logic that prevents erroneous signOut calls:
 * - fetchCurrentUserProfile: PGRST116 (no rows) → 'Profile not found'
 *                            other Supabase errors → 'Profile fetch failed'
 *                            valid row + bad role → 'Invalid user role'
 *                            valid row → success
 * - restoreCurrentUserFromSession: delegates to fetchCurrentUserProfile and
 *   returns 'No active session' when both getUser and getSession find nothing.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ── Supabase mock ──────────────────────────────────────────────────────────
const mockFrom = jest.fn<(...args: unknown[]) => unknown>();
const mockGetUser = jest.fn<() => Promise<unknown>>();
const mockGetSession = jest.fn<() => Promise<unknown>>();
const mockSignOut = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSignInWithPassword = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdateUser = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => mockGetSession(),
      signOut: (args?: unknown) => mockSignOut(args),
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
      updateUser: (args: unknown) => mockUpdateUser(args),
    },
  },
}));

import {
  fetchCurrentUserProfile,
  restoreCurrentUserFromSession,
  signOutCurrentUser,
  signInWithEmailPassword,
  updateUserEmail,
} from '../services/authService';

// ── Query builder chain helper ─────────────────────────────────────────────
function makeQueryChain(resolvedValue: unknown) {
  type QueryChain = {
    select: jest.Mock;
    eq: jest.Mock;
    single: jest.Mock<() => Promise<unknown>>;
  };

  const chain: QueryChain = {
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn<() => Promise<unknown>>().mockResolvedValue(resolvedValue),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSignOut.mockResolvedValue({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ══ fetchCurrentUserProfile ═══════════════════════════════════════════════

describe('fetchCurrentUserProfile', () => {
  it('returns a User on a valid profile row', async () => {
    const chain = makeQueryChain({
      data: { role: 'admin', display_name: 'Alice', driver_id: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await fetchCurrentUserProfile('user-1', 'alice@example.com');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.user.role).toBe('admin');
    expect(result.user.name).toBe('Alice');
    expect(result.user.id).toBe('user-1');
    expect(result.user.username).toBe('alice@example.com');
  });

  it('uses authUserId as fallback identity when no email provided', async () => {
    const chain = makeQueryChain({
      data: { role: 'driver', display_name: null, driver_id: 'drv-99' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await fetchCurrentUserProfile('user-42');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.user.username).toBe('user-42');
    expect(result.user.name).toBe('user-42');
    expect(result.user.driverId).toBe('drv-99');
  });

  it('returns Profile not found for PGRST116 (no rows from .single())', async () => {
    const chain = makeQueryChain({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });
    mockFrom.mockReturnValue(chain);

    const result = await fetchCurrentUserProfile('user-missing');

    expect(result).toMatchObject({ success: false, error: 'Profile not found' });
  });

  it('returns Profile fetch failed for non-PGRST116 Supabase errors (transient)', async () => {
    const chain = makeQueryChain({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    });
    mockFrom.mockReturnValue(chain);

    const result = await fetchCurrentUserProfile('user-1');

    expect(result).toMatchObject({ success: false, error: 'Profile fetch failed' });
  });

  it('returns Profile not found when error has no code (legacy path)', async () => {
    const chain = makeQueryChain({
      data: null,
      error: { message: 'some generic error with no code' },
    });
    mockFrom.mockReturnValue(chain);

    const result = await fetchCurrentUserProfile('user-1');

    // No code → treated as "not found" (safe default)
    expect(result).toMatchObject({ success: false, error: 'Profile not found' });
  });

  it('returns Invalid user role when role is not admin or driver', async () => {
    const chain = makeQueryChain({
      data: { role: 'superuser', display_name: 'Bob', driver_id: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await fetchCurrentUserProfile('user-2');

    expect(result).toMatchObject({ success: false, error: 'Invalid user role' });
  });

  it('returns Profile not found when data is null with no error', async () => {
    const chain = makeQueryChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchCurrentUserProfile('user-3');

    expect(result).toMatchObject({ success: false, error: 'Profile not found' });
  });

  it('includes driverId when driver_id is present in the row', async () => {
    const chain = makeQueryChain({
      data: { role: 'driver', display_name: 'Carlo', driver_id: 'drv-7' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await fetchCurrentUserProfile('user-7', 'carlo@example.com');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.user.driverId).toBe('drv-7');
  });
});

// ══ restoreCurrentUserFromSession ════════════════════════════════════════════

describe('restoreCurrentUserFromSession', () => {
  it('returns the user from getUser() when the token is valid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null });
    const chain = makeQueryChain({
      data: { role: 'admin', display_name: 'Admin', driver_id: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await restoreCurrentUserFromSession();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.user.id).toBe('user-1');
  });

  it('falls back to getSession() when getUser() fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Token expired' } });
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-2', email: 'b@c.com' } } },
    });
    const chain = makeQueryChain({
      data: { role: 'driver', display_name: 'Bob', driver_id: 'drv-2' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await restoreCurrentUserFromSession();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.user.id).toBe('user-2');
  });

  it('falls back to getSession() when getUser() throws unexpectedly', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetUser.mockRejectedValue(new Error('network down'));
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-9', email: 'x@y.com' } } },
    });
    const chain = makeQueryChain({
      data: { role: 'driver', display_name: 'X', driver_id: 'drv-9' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await restoreCurrentUserFromSession();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.user.id).toBe('user-9');
    expect(console.warn).toHaveBeenCalledWith(
      'Supabase getUser failed during session restore.',
      expect.any(Error),
    );
  });

  it('returns No active session when both getUser and getSession find nothing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const result = await restoreCurrentUserFromSession();

    expect(result).toMatchObject({ success: false, error: 'No active session' });
  });

  it('propagates Profile fetch failed (not No active session) when profile query is transient', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-3', email: 'c@d.com' } }, error: null });
    const chain = makeQueryChain({
      data: null,
      error: { code: '57014', message: 'query canceled due to statement timeout' },
    });
    mockFrom.mockReturnValue(chain);

    const result = await restoreCurrentUserFromSession();

    // Must NOT be 'No active session' — the session is valid, the profile query failed
    expect(result).toMatchObject({ success: false, error: 'Profile fetch failed' });
  });

  it('returns No active session when both getUser and getSession throw', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetUser.mockRejectedValue(new Error('jwt service unavailable'));
    mockGetSession.mockRejectedValue(new Error('session lookup unavailable'));

    const result = await restoreCurrentUserFromSession();

    expect(result).toMatchObject({ success: false, error: 'No active session' });
    expect(console.warn).toHaveBeenCalledWith(
      'Supabase getUser failed during session restore.',
      expect.any(Error),
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Supabase getSession failed during session restore.',
      expect.any(Error),
    );
  });
});

// ══ signOutCurrentUser ════════════════════════════════════════════════════

describe('signOutCurrentUser', () => {
  it('calls supabase.auth.signOut()', async () => {
    await signOutCurrentUser();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('falls back to local signOut when global signOut returns an error', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSignOut
      .mockResolvedValueOnce({ error: { message: 'global failed' } })
      .mockResolvedValueOnce({ error: null });

    await signOutCurrentUser();

    expect(mockSignOut).toHaveBeenNthCalledWith(1, undefined);
    expect(mockSignOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(console.warn).toHaveBeenCalledWith(
      'Supabase global sign-out failed; attempting local session clear.',
      expect.objectContaining({ message: 'global failed' }),
    );
  });

  it('falls back to local signOut when global signOut throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSignOut
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce({ error: null });

    await signOutCurrentUser();

    expect(mockSignOut).toHaveBeenNthCalledWith(1, undefined);
    expect(mockSignOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(console.warn).toHaveBeenCalledWith(
      'Supabase global sign-out threw; attempting local session clear.',
      expect.any(Error),
    );
  });
});

// ══ signInWithEmailPassword ════════════════════════════════════════════════

describe('signInWithEmailPassword', () => {
  it('returns success with user on valid credentials', async () => {
    const fakeUser = { id: 'user-1', email: 'a@b.com' };
    mockSignInWithPassword.mockResolvedValue({
      data: { user: fakeUser, session: {} },
      error: null,
    });

    const result = await signInWithEmailPassword('a@b.com', 'password123');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.user).toEqual(fakeUser);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password123' });
  });

  it('returns error with the Supabase error message when login fails', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    const result = await signInWithEmailPassword('a@b.com', 'wrongpass');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('Invalid login credentials');
  });

  it('returns "Login failed" fallback when Supabase error has no message', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const result = await signInWithEmailPassword('a@b.com', 'pass');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('Login failed');
  });
});

// ══ updateUserEmail ════════════════════════════════════════════════════════

describe('updateUserEmail', () => {
  it('returns success when the email update succeeds', async () => {
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });

    const result = await updateUserEmail('new@example.com');

    expect(result.success).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });

  it('returns error with message when update fails', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'Email already in use' } });

    const result = await updateUserEmail('taken@example.com');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('Email already in use');
  });

  it('returns a fallback error when updateUser throws unexpectedly', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUpdateUser.mockRejectedValue(new Error('network timeout'));

    const result = await updateUserEmail('new@example.com');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('network timeout');
    expect(console.warn).toHaveBeenCalledWith(
      'Unexpected error updating user email.',
      expect.any(Error),
    );
  });
});
