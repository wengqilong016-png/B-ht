import { useEffect, useReducer, useRef } from 'react';

import {
  restoreCurrentUserFromSession,
  signOutCurrentUser,
} from '../services/authService';
import { supabase } from '../supabaseClient';
import { User } from '../types';

import { writeCachedUser, readCachedUser, clearCachedUser } from './useAuthPersistence';

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

type AuthBootstrapResult =
  | Awaited<ReturnType<typeof restoreCurrentUserFromSession>>
  | { success: false; error: 'Timeout' };

function syncCachedUser(currentUser: User | null) {
  if (currentUser) {
    writeCachedUser(currentUser);
    return;
  }
  clearCachedUser();
}

async function restoreUserWithTimeout(): Promise<AuthBootstrapResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ success: false; error: 'Timeout' }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ success: false, error: 'Timeout' }), AUTH_INIT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([restoreCurrentUserFromSession(), timeout]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

function handleRestoreFailure(
  cachedUser: User | null,
  error: string,
  dispatch: React.Dispatch<AuthAction>,
) {
  // Never call signOutCurrentUser() here — doing so would wipe the
  // Supabase session token from localStorage, making subsequent logins
  // fail in the same browser. signOut must only happen when the user
  // explicitly clicks "Log out".
  if (!cachedUser) {
    dispatch({ type: 'FINISH_INITIALIZING' });
    return;
  }

  if (error === 'No active session') {
    dispatch({ type: 'LOGOUT' });
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthBootstrap() {
  const [state, dispatch] = useReducer(authReducer, {
    currentUser: null,
    userRole: null,
    lang: 'sw',
    isInitializing: true,
  });
  const restoreAttemptRef = useRef(0);

  // Persist the user to localStorage whenever it changes; clear on logout.
  // Skip the initial render (currentUser starts as null) so we don't wipe the
  // cache before the loadUser effect gets a chance to read it.
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    syncCachedUser(state.currentUser);
  }, [state.currentUser]);

  useEffect(() => {
    if (!supabase) {
      dispatch({ type: 'FINISH_INITIALIZING' });
      return;
    }

    let isActive = true;
    const restoreAttemptId = ++restoreAttemptRef.current;
    const dispatchIfCurrent: React.Dispatch<AuthAction> = (action) => {
      if (isActive && restoreAttemptRef.current === restoreAttemptId) {
        dispatch(action);
      }
    };

    const loadUser = async () => {
      const cached = readCachedUser();
      if (cached) {
        dispatchIfCurrent({ type: 'SET_USER', user: cached });
      }

      try {
        const result = await restoreUserWithTimeout();
        if (!result.success) {
          handleRestoreFailure(cached, result.error, dispatchIfCurrent);
          return;
        }
        dispatchIfCurrent({ type: 'SET_USER', user: result.user });
      } catch (error) {
        console.error('Unexpected auth bootstrap failure.', error);
        handleRestoreFailure(cached, 'Profile fetch failed', dispatchIfCurrent);
      }
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
      restoreAttemptRef.current += 1;
      dispatch({ type: 'LOGOUT' });
    });

    return () => {
      isActive = false;
      restoreAttemptRef.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = (user: User) => {
    restoreAttemptRef.current += 1;
    dispatch({ type: 'SET_USER', user });
  };

  const handleLogout = async () => {
    restoreAttemptRef.current += 1;
    clearCachedUser();
    try {
      await signOutCurrentUser();
    } catch (error) {
      console.error('Unexpected logout failure.', error);
    }
    dispatch({ type: 'LOGOUT' });
  };

  const setLang = (lang: 'zh' | 'sw') => dispatch({ type: 'SET_LANG', lang });

  return { ...state, handleLogin, handleLogout, setLang };
}
