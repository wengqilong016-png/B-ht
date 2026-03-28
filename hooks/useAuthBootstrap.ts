import { useEffect, useReducer, useRef } from 'react';
import { User } from '../types';
import { supabase } from '../supabaseClient';
import {
  fetchCurrentUserProfile,
  restoreCurrentUserFromSession,
  signOutCurrentUser,
} from '../services/authService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthState = {
  currentUser: User | null;
  userRole: 'admin' | 'driver' | null;
  lang: 'zh' | 'sw';
  isInitializing: boolean;
};

type AuthAction =
  | { type: 'SET_USER'; user: User }
  | { type: 'LOGOUT' }
  | { type: 'SET_LANG'; lang: 'zh' | 'sw' }
  | { type: 'FINISH_INITIALIZING' };

// ─── Reducer ──────────────────────────────────────────────────────────────────

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        currentUser: action.user,
        userRole: action.user.role as 'admin' | 'driver',
        lang: action.user.role === 'admin' ? 'zh' : 'sw',
        isInitializing: false,
      };
    case 'LOGOUT':
      return { ...state, currentUser: null, userRole: null, isInitializing: false };
    case 'SET_LANG':
      return { ...state, lang: action.lang };
    case 'FINISH_INITIALIZING':
      return { ...state, isInitializing: false };
    default:
      return state;
  }
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Reduced from 20 s → 8 s for faster fallback on slow networks. */
const AUTH_INIT_TIMEOUT_MS = 8000;

/** localStorage key for the cached user profile (fast-path restore). */
const CACHED_USER_KEY = 'bht-cached-user';

// ─── localStorage helpers ─────────────────────────────────────────────────────

function writeCachedUser(user: User): void {
  try {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
  } catch {
    // localStorage may be unavailable in some environments — fail silently.
  }
}

function isValidCachedUser(obj: unknown): obj is User {
  if (!obj || typeof obj !== 'object') return false;
  const u = obj as Record<string, unknown>;
  return (
    typeof u.id === 'string' && u.id.length > 0 &&
    typeof u.username === 'string' &&
    (u.role === 'admin' || u.role === 'driver') &&
    typeof u.name === 'string'
  );
}

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidCachedUser(parsed)) {
      clearCachedUser();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearCachedUser(): void {
  try {
    localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // fail silently
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthBootstrap() {
  const [state, dispatch] = useReducer(authReducer, {
    currentUser: null,
    userRole: null,
    lang: 'zh',
    isInitializing: true,
  });

  // Keep a ref so async callbacks inside the one-time useEffect can always read
  // the latest currentUser without capturing a stale closure value.
  const currentUserRef = useRef<User | null>(state.currentUser);
  useEffect(() => {
    currentUserRef.current = state.currentUser;
  }, [state.currentUser]);

  // Persist the user to localStorage whenever it changes; clear on logout.
  useEffect(() => {
    if (state.currentUser) {
      writeCachedUser(state.currentUser);
    } else {
      clearCachedUser();
    }
  }, [state.currentUser]);

  useEffect(() => {
    if (!supabase) {
      dispatch({ type: 'FINISH_INITIALIZING' });
      return;
    }

    const loadUser = async () => {
      // ── Fast path: restore from localStorage cache immediately so the UI is
      //    visible without waiting for Supabase.
      const cached = readCachedUser();
      if (cached) {
        dispatch({ type: 'SET_USER', user: cached });
        // Continue with a background validation — no spinner shown.
      }

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<{ success: false; error: 'Timeout' }>(
        (resolve) => {
          timeoutId = setTimeout(() => resolve({ success: false, error: 'Timeout' }), AUTH_INIT_TIMEOUT_MS);
        }
      );
      const result = await Promise.race([restoreCurrentUserFromSession(), timeout]);
      if (timeoutId !== null) clearTimeout(timeoutId);

      if (!result.success) {
        const err = (result as { error: string }).error;
        if (err !== 'No active session' && err !== 'Timeout') {
          await signOutCurrentUser();
        }
        // Only forcibly logout if we had no cached user — avoid flashing the
        // login screen when the network is temporarily slow.
        if (!cached) {
          dispatch({ type: 'FINISH_INITIALIZING' });
        } else if (err === 'No active session') {
          // Session is truly gone — clear cached user and show login.
          dispatch({ type: 'LOGOUT' });
        }
        return;
      }
      dispatch({ type: 'SET_USER', user: result.user });
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (
        _event === 'USER_UPDATED' ||
        _event === 'INITIAL_SESSION' ||
        _event === 'TOKEN_REFRESHED'
      ) return;

      try {
        if (!session?.user) {
          dispatch({ type: 'LOGOUT' });
          return;
        }
        const result = await fetchCurrentUserProfile(session.user.id, session.user.email || '');
        if (!result.success) {
          // If a user is already logged in, keep them logged in — don't force a
          // logout just because a background profile re-fetch failed (e.g. slow
          // network after token refresh).
          if (currentUserRef.current) {
            console.warn('[Auth] Profile fetch failed during state change, keeping current user.');
            return;
          }
          await signOutCurrentUser();
          dispatch({ type: 'LOGOUT' });
          return;
        }
        dispatch({ type: 'SET_USER', user: result.user });
      } catch (err) {
        console.error('[Auth] onAuthStateChange error:', err);
        if (!currentUserRef.current) {
          dispatch({ type: 'LOGOUT' });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (user: User) => dispatch({ type: 'SET_USER', user });

  const handleLogout = async () => {
    clearCachedUser();
    await signOutCurrentUser();
    dispatch({ type: 'LOGOUT' });
  };

  const setLang = (lang: 'zh' | 'sw') => dispatch({ type: 'SET_LANG', lang });

  return { ...state, handleLogin, handleLogout, setLang };
}
