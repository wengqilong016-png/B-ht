import { User } from '../types';
import { PGRST_NO_ROWS } from '../types/constants';
import { supabase } from '../supabaseClient';

type UserProfileRow = {
  role: string;
  display_name: string | null;
  driver_id: string | null;
};

const VALID_USER_ROLES = ['admin', 'driver'] as const;

const isValidUserRole = (role: string): role is User['role'] =>
  VALID_USER_ROLES.includes(role as User['role']);

export type FetchCurrentUserProfileResult =
  | { success: true; user: User }
  | { success: false; error: 'Supabase not configured' | 'Profile not found' | 'Invalid user role' | 'Profile fetch failed' };

/**
 * PostgREST error code is now centralised in types/constants.ts.
 * Any other error code indicates a network or server-side failure — we must
 * NOT treat those as "profile not found" so that we avoid wiping the
 * Supabase session on transient errors.
 */

export const fetchCurrentUserProfile = async (
  authUserId: string,
  fallbackEmail = ''
): Promise<FetchCurrentUserProfileResult> => {
  const fallbackIdentity = fallbackEmail || authUserId;

  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, display_name, driver_id')
    .eq('auth_user_id', authUserId)
    .single<UserProfileRow>();

  if (error) {
    // PGRST116 = no rows returned by .single() → the profile genuinely doesn't exist.
    // Any other error code (network failure, server error, etc.) is transient — return a
    // distinct value so callers can avoid wiping the session unnecessarily.
    const isNotFound = !error.code || error.code === PGRST_NO_ROWS;
    return { success: false, error: isNotFound ? 'Profile not found' : 'Profile fetch failed' };
  }
  if (!profile) {
    return { success: false, error: 'Profile not found' };
  }

  if (!isValidUserRole(profile.role)) {
    return { success: false, error: 'Invalid user role' };
  }

  return {
    success: true,
    user: {
      id: authUserId,
      username: fallbackIdentity,
      role: profile.role,
      name: profile.display_name || fallbackIdentity,
      driverId: profile.driver_id || undefined,
    },
  };
};

export const restoreCurrentUserFromSession = async (): Promise<
  FetchCurrentUserProfileResult | { success: false; error: 'No active session' }
> => {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  // Attempt to validate the token (checking server if needed).
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (!userError && userData.user) {
    return fetchCurrentUserProfile(userData.user.id, userData.user.email || '');
  }

  // getUser() failed (network error, expired token, missing session, etc.).
  // Always fallback to getSession() to check if a local session still exists.
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;
  if (sessionUser) {
    return fetchCurrentUserProfile(sessionUser.id, sessionUser.email || '');
  }

  return { success: false, error: 'No active session' };
};

export const signInWithEmailPassword = async (email: string, password: string) => {
  if (!supabase) {
    return { success: false as const, error: 'Supabase not configured' as const };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { success: false as const, error: error?.message || 'Login failed' };
  }

  return { success: true as const, user: data.user };
};

export const signOutCurrentUser = async () => {
  try {
    await supabase?.auth.signOut();
  } catch {
    // Sign-out errors are non-critical: the local session is cleared by the
    // caller regardless. Silently ignore so callers are not blocked from
    // updating their own auth state (e.g. clearing the cached user).
  }
};

export const updateUserEmail = async (newEmail: string) => {
  if (!supabase) {
    return { success: false as const, error: 'Supabase not configured' };
  }
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) {
    return { success: false as const, error: error.message };
  }
  return { success: true as const };
};
