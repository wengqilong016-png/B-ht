import { useEffect, useReducer } from 'react';
import { User } from '../types';
import { supabase } from '../supabaseClient';
import {
  fetchCurrentUserProfile,
  restoreCurrentUserFromSession,
  signOutCurrentUser,
} from '../services/authService';
import {
  isAuthDisabled,
  getLocalDriverId,
  clearLocalDriverId,
  buildLocalUser,
} from '../utils/authMode';

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages session restoration and auth state changes.
 *
 * When VITE_DISABLE_AUTH=true the hook bypasses Supabase Auth entirely:
 * - It reads a driver id from localStorage (key: bht_local_driver_id).
 * - If a driver id is found it builds a local User and dispatches SET_USER.
 * - Otherwise it finishes initialising without a user so the app can show
 *   the LocalDriverPicker component.
 * - handleLogout clears the local driver id instead of calling Supabase signOut.
 *
 * When VITE_DISABLE_AUTH is falsy (default) the original Supabase Auth flow
 * runs unchanged.
 */
export function useAuthBootstrap() {
  const [state, dispatch] = useReducer(authReducer, {
    currentUser: null,
    userRole: null,
    lang: 'zh',
    isInitializing: true,
  });

  useEffect(() => {
    // ── Disable-Auth mode ───────────────────────────────────────────
    if (isAuthDisabled()) {
      const driverId = getLocalDriverId();
      if (driverId) {
        dispatch({ type: 'SET_USER', user: buildLocalUser(driverId) });
      } else {
        dispatch({ type: 'FINISH_INITIALIZING' });
      }
      return; // no Supabase subscription in this mode
    }

    // ── Normal Supabase Auth mode ───────────────────────────────────
    if (!supabase) {
      dispatch({ type: 'FINISH_INITIALIZING' });
      return;
    }

    const loadUser = async () => {
      const result = await restoreCurrentUserFromSession();
      if (!result.success) {
        if ('error' in result && result.error !== 'No active session') {
          await signOutCurrentUser();
        }
        dispatch({ type: 'FINISH_INITIALIZING' });
        return;
      }
      dispatch({ type: 'SET_USER', user: result.user });
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        dispatch({ type: 'LOGOUT' });
        return;
      }
      const result = await fetchCurrentUserProfile(session.user.id, session.user.email || '');
      if (!result.success) {
        await signOutCurrentUser();
        dispatch({ type: 'LOGOUT' });
        return;
      }
      dispatch({ type: 'SET_USER', user: result.user });
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (user: User) => dispatch({ type: 'SET_USER', user });

  const handleLogout = async () => {
    if (isAuthDisabled()) {
      clearLocalDriverId();
    } else {
      await signOutCurrentUser();
    }
    dispatch({ type: 'LOGOUT' });
  };

  const setLang = (lang: 'zh' | 'sw') => dispatch({ type: 'SET_LANG', lang });

  return { ...state, handleLogin, handleLogout, setLang };
}
