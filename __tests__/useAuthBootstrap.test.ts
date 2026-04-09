/**
 * __tests__/useAuthBootstrap.test.ts
 *
 * Tests for useAuthBootstrap hook and the authReducer it uses.
 *
 * Key scenarios verified:
 *  1. Pure authReducer state transitions (no side-effects).
 *  2. signOutCurrentUser() is NEVER called during initialization — only on
 *     explicit user logout — so a browser refresh never breaks re-login.
 *  3. Transient session errors (timeout / network) preserve a cached user.
 *  4. A genuine "No active session" error correctly clears the cache.
 *  5. onAuthStateChange only reacts to SIGNED_OUT; all other events ignored.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { User } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Capture the onAuthStateChange callback so tests can fire it directly.
let capturedAuthListener: ((event: string, session: null) => void) | null = null;
const mockUnsubscribe = jest.fn();
type AuthStateChangeHandler = (event: string, session: null) => void;
type OnAuthStateChange = (cb: AuthStateChangeHandler) => {
  data: { subscription: { unsubscribe: typeof mockUnsubscribe } };
};

const mockOnAuthStateChange = jest.fn<OnAuthStateChange>().mockImplementation(
  (cb) => {
    capturedAuthListener = cb;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  },
);

const mockRestoreCurrentUserFromSession =
  jest.fn<() => Promise<{ success: true; user: User } | { success: false; error: string }>>();
const mockSignOutCurrentUser = jest.fn<() => Promise<void>>();

// Mocks must be declared before any imports that depend on them.
jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

jest.mock('../services/authService', () => ({
  restoreCurrentUserFromSession: mockRestoreCurrentUserFromSession,
  signOutCurrentUser: mockSignOutCurrentUser,
  fetchCurrentUserProfile: jest.fn(),
}));

// Static imports — loaded after jest.mock hoisting resolves the mocks above.
import { authReducer, useAuthBootstrap } from '../hooks/useAuthBootstrap';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'driver@test.com',
    role: 'driver',
    name: 'Test Driver',
    ...overrides,
  } as User;
}

const CACHED_USER_KEY = 'bht-cached-user';

/** A promise that never resolves, used to simulate a hung network request. */
const HANGING_PROMISE = new Promise<never>(() => { /* never resolves */ });

// ─── authReducer (pure unit tests) ───────────────────────────────────────────

describe('authReducer', () => {
  const initialState = {
    currentUser: null,
    userRole: null as 'admin' | 'driver' | null,
    lang: 'zh' as 'zh' | 'sw',
    isInitializing: true,
  };

  it('SET_USER sets user, derives role and lang, clears isInitializing', () => {
    const user = makeUser({ role: 'admin' });
    const next = authReducer(initialState, { type: 'SET_USER', user });
    expect(next.currentUser).toBe(user);
    expect(next.userRole).toBe('admin');
    expect(next.lang).toBe('zh');
    expect(next.isInitializing).toBe(false);
  });

  it('SET_USER sets lang to sw for driver role', () => {
    const user = makeUser({ role: 'driver' });
    const next = authReducer(initialState, { type: 'SET_USER', user });
    expect(next.lang).toBe('sw');
  });

  it('LOGOUT clears user and role, sets isInitializing to false', () => {
    const stateWithUser = {
      ...initialState,
      currentUser: makeUser(),
      userRole: 'driver' as const,
    };
    const next = authReducer(stateWithUser, { type: 'LOGOUT' });
    expect(next.currentUser).toBeNull();
    expect(next.userRole).toBeNull();
    expect(next.isInitializing).toBe(false);
  });

  it('LOGOUT preserves the current lang setting', () => {
    const next = authReducer({ ...initialState, lang: 'sw' }, { type: 'LOGOUT' });
    expect(next.lang).toBe('sw');
  });

  it('SET_LANG updates lang only, leaves other fields unchanged', () => {
    const next = authReducer(initialState, { type: 'SET_LANG', lang: 'sw' });
    expect(next.lang).toBe('sw');
    expect(next.currentUser).toBeNull();
    expect(next.isInitializing).toBe(true);
  });

  it('FINISH_INITIALIZING only clears the loading flag', () => {
    const next = authReducer(initialState, { type: 'FINISH_INITIALIZING' });
    expect(next.isInitializing).toBe(false);
    expect(next.currentUser).toBeNull();
  });
});

// ─── useAuthBootstrap (integration-style hook tests) ─────────────────────────

describe('useAuthBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedAuthListener = null;
    localStorage.clear();
    // Re-attach the listener capture after clearAllMocks resets it.
    mockOnAuthStateChange.mockImplementation(
      (cb) => {
        capturedAuthListener = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Successful session restore ─────────────────────────────────────────

  it('dispatches SET_USER when session restore succeeds', async () => {
    const user = makeUser();
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({ success: true, user });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.currentUser).toEqual(user);
    // Critical: no signOut during initialization.
    expect(mockSignOutCurrentUser).not.toHaveBeenCalled();
  });

  // ── No cache, transient failure → show login without signOut ──────────

  it('shows login without calling signOut when restore fails and no cache exists', async () => {
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({
      success: false,
      error: 'Profile not found',
    });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.currentUser).toBeNull();
    // Calling signOut here would wipe the Supabase session token from
    // localStorage and prevent re-login after a page refresh.
    expect(mockSignOutCurrentUser).not.toHaveBeenCalled();
  });

  it('shows login without calling signOut on timeout when no cache exists', async () => {
    jest.useFakeTimers();
    mockRestoreCurrentUserFromSession.mockReturnValueOnce(HANGING_PROMISE);

    const { result } = renderHook(() => useAuthBootstrap());

    await act(async () => {
      jest.advanceTimersByTime(9000); // past AUTH_INIT_TIMEOUT_MS (8 s)
    });

    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.currentUser).toBeNull();
    expect(mockSignOutCurrentUser).not.toHaveBeenCalled();
  });

  // ── Cached user + transient error → keep cached user ──────────────────

  it('keeps cached user when restore fails with a transient error', async () => {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(makeUser({ name: 'Cached Driver' })));
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({
      success: false,
      error: 'Profile not found',
    });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    // Must NOT log the user out — transient errors should degrade gracefully.
    expect(result.current.currentUser?.id).toBe('user-1');
    expect(mockSignOutCurrentUser).not.toHaveBeenCalled();
  });

  it('keeps cached user on slow-network timeout', async () => {
    jest.useFakeTimers();
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(makeUser()));
    mockRestoreCurrentUserFromSession.mockReturnValueOnce(HANGING_PROMISE);

    const { result } = renderHook(() => useAuthBootstrap());

    await act(async () => {
      jest.advanceTimersByTime(9000);
    });

    await waitFor(() => expect(result.current.currentUser).not.toBeNull());

    expect(result.current.currentUser?.id).toBe('user-1');
    expect(mockSignOutCurrentUser).not.toHaveBeenCalled();
  });

  // ── Cached user + genuine "No active session" → clear cache ───────────

  it('clears cached user when session is genuinely gone ("No active session")', async () => {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(makeUser()));
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({
      success: false,
      error: 'No active session',
    });

    const { result } = renderHook(() => useAuthBootstrap());

    // The fast path briefly shows the cached user, then the LOGOUT dispatch
    // fires when Supabase confirms the session is gone.
    await waitFor(() => expect(result.current.currentUser).toBeNull());

    // Session is truly gone → return to login screen without calling signOut.
    expect(result.current.isInitializing).toBe(false);
    expect(mockSignOutCurrentUser).not.toHaveBeenCalled();
  });

  // ── onAuthStateChange event filter ────────────────────────────────────

  it('dispatches LOGOUT when Supabase fires SIGNED_OUT', async () => {
    const user = makeUser();
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({ success: true, user });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.currentUser).not.toBeNull());

    act(() => { capturedAuthListener?.('SIGNED_OUT', null); });

    expect(result.current.currentUser).toBeNull();
  });

  it.each([
    'INITIAL_SESSION',
    'TOKEN_REFRESHED',
    'SIGNED_IN',
    'USER_UPDATED',
    'PASSWORD_RECOVERY',
  ])('ignores %s auth state change event (no state change)', async (event) => {
    const user = makeUser();
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({ success: true, user });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.currentUser).not.toBeNull());

    act(() => { capturedAuthListener?.(event, null); });

    // Only SIGNED_OUT should mutate state; everything else must be ignored.
    expect(result.current.currentUser).not.toBeNull();
  });

  // ── Explicit logout (handleLogout) ────────────────────────────────────

  it('handleLogout calls signOutCurrentUser and clears state', async () => {
    const user = makeUser();
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({ success: true, user });
    mockSignOutCurrentUser.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.currentUser).not.toBeNull());

    await act(async () => { await result.current.handleLogout(); });

    expect(mockSignOutCurrentUser).toHaveBeenCalledTimes(1);
    expect(result.current.currentUser).toBeNull();
  });

  // ── handleLogin ───────────────────────────────────────────────────────

  it('handleLogin sets current user without calling signOut', async () => {
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({
      success: false,
      error: 'No active session',
    });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    const freshUser = makeUser({ name: 'Freshly Logged In' });
    act(() => { result.current.handleLogin(freshUser); });

    expect(result.current.currentUser).toEqual(freshUser);
    expect(mockSignOutCurrentUser).not.toHaveBeenCalled();
  });

  // ── setLang ────────────────────────────────────────────────────────────

  it('setLang updates the lang field', async () => {
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({
      success: false,
      error: 'No active session',
    });

    const { result } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    act(() => { result.current.setLang('sw'); });

    expect(result.current.lang).toBe('sw');
  });

  // ── Subscription cleanup ──────────────────────────────────────────────

  it('unsubscribes from onAuthStateChange on unmount', async () => {
    mockRestoreCurrentUserFromSession.mockResolvedValueOnce({
      success: false,
      error: 'No active session',
    });

    const { unmount } = renderHook(() => useAuthBootstrap());
    await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalled());

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
