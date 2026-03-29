import { useEffect, useReducer, useRef } from 'react';
import { User } from '../types';
import { supabase } from '../supabaseClient';
import {
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

export const authReducer = (state: AuthState, action: AuthAction): AuthState => {
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

  // Persist the user to localStorage whenever it changes; clear on logout.
  // Skip the initial render (currentUser starts as null) so we don't wipe the
  // cache before the loadUser effect gets a chance to read it.
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
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
        // Never call signOutCurrentUser() here — doing so would wipe the
        // Supabase session token from localStorage, making subsequent logins
        // fail in the same browser.  signOut must only happen when the user
        // explicitly clicks "Log out".
        if (!cached) {
          dispatch({ type: 'FINISH_INITIALIZING' });
        } else if (err === 'No active session') {
          // Session is truly gone — clear cached user and show login.
          dispatch({ type: 'LOGOUT' });
        }
        // cached + any other error (Timeout, Profile not found, network, etc.) → keep cached user, skip update.
        return;
      }
      dispatch({ type: 'SET_USER', user: result.user });
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, _session) => {
      // Only react to SIGNED_OUT — all other events are handled elsewhere:
      // - INITIAL_SESSION / TOKEN_REFRESHED: handled by loadUser() above
      // - USER_UPDATED: handled by dedicated profile-update UI
      // - SIGNED_IN: Login component handles this via handleLogin(); processing
      //   it here too causes a race where currentUserRef is still null and the
      //   profile fetch failure triggers a spurious signOut.
      if (_event !== 'SIGNED_OUT') return;

      // Supabase has already cleared the session; just update UI state.
      dispatch({ type: 'LOGOUT' });
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
