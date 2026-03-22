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
 * Maximum ms to wait for Supabase session/profile fetch on startup.
 * If the server is unreachable or slow, we fall through to the login screen
 * rather than showing the spinner forever.
 */
const AUTH_INIT_TIMEOUT_MS = 20000;

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
 * IMPORTANT — RLS limitation: In disable-auth mode the Supabase client
 * operates under the "anon" role. Current RLS policies require an
 * authenticated session for reads/writes, so online Supabase fetch/sync will
 * fail unless you explicitly grant the anon role appropriate access or route
 * data through a service-role proxy. This mode is therefore recommended for
 * offline/local use unless you have updated your Supabase security config.
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
      // Race the session/profile fetch against a timeout so a slow or
      // unreachable Supabase server never leaves the app spinning forever.
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<{ success: false; error: 'Timeout' }>(
        (resolve) => {
          timeoutId = setTimeout(() => resolve({ success: false, error: 'Timeout' }), AUTH_INIT_TIMEOUT_MS);
        }
      );
      const result = await Promise.race([restoreCurrentUserFromSession(), timeout]);
      // Clear the timer so it doesn't fire after the race has already resolved.
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (!result.success) {
        const err = (result as { error: string }).error;
        if (err !== 'No active session' && err !== 'Timeout') {
          await signOutCurrentUser();
        }
        dispatch({ type: 'FINISH_INITIALIZING' });
        return;
      }
      dispatch({ type: 'SET_USER', user: result.user });
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // USER_UPDATED fires when the user changes their password or email via
      // supabase.auth.updateUser().  ForcePasswordChange handles its own
      // completion flow (RPC clear + onSuccess callback).  Re-fetching the
      // profile here races against the RPC that clears must_change_password:
      // a stale "true" response arriving after onSuccess would re-lock the user
      // on the force-change screen.  Skip this event — the component's own
      // success path sets the correct user state.
      //
      // INITIAL_SESSION fires when the listener is first registered, mirroring
      // the session that loadUser() already processed above. Skip it to avoid
      // a duplicate profile fetch on startup.
      if (_event === 'USER_UPDATED' || _event === 'INITIAL_SESSION') return;

      try {
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
      } catch (err) {
        console.error('[Auth] onAuthStateChange error:', err);
        dispatch({ type: 'LOGOUT' });
      }
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
