import { supabase } from '../supabaseClient';
import { User } from '../types';
import { PGRST_NO_ROWS } from '../types/constants';

type UserProfileRow = {
  role: string;
  display_name: string | null;
  driver_id: string | null;
  must_change_password: boolean | null;
};

type NoActiveSessionResult = { success: false; error: 'No active session' };

const VALID_USER_ROLES = ['admin', 'driver'] as const;

const isValidUserRole = (role: string): role is User['role'] =>
  VALID_USER_ROLES.includes(role as User['role']);

export type FetchCurrentUserProfileResult =
  | { success: true; user: User }
  | { success: false; error: 'Supabase not configured' | 'Profile not found' | 'Invalid user role' | 'Profile fetch failed' };

function mapProfileRowToUser(
  authUserId: string,
  fallbackIdentity: string,
  profile: UserProfileRow,
): FetchCurrentUserProfileResult {
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
      mustChangePassword: profile.must_change_password === true,
    },
  };
}

function normalizeProfileError(error: { code?: string | null } | null): Extract<FetchCurrentUserProfileResult, { success: false }>['error'] {
  if (!error) {
    return 'Profile not found';
  }
  const isNotFound = !error.code || error.code === PGRST_NO_ROWS;
  return isNotFound ? 'Profile not found' : 'Profile fetch failed';
}

async function resolveSessionUser(): Promise<{ id: string; email?: string | null } | null> {
  if (!supabase) {
    return null;
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userError && userData.user) {
      return userData.user;
    }
  } catch (error) {
    console.warn('Supabase getUser failed during session restore.', error);
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.user ?? null;
  } catch (error) {
    console.warn('Supabase getSession failed during session restore.', error);
    return null;
  }
}

async function attemptSignOut(scope?: 'local'): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  try {
    const { error } = await supabase.auth.signOut(scope ? { scope } : undefined);
    if (error) {
      console.warn(
        scope
          ? 'Supabase local sign-out fallback failed.'
          : 'Supabase global sign-out failed; attempting local session clear.',
        error,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      scope
        ? 'Supabase local sign-out fallback threw.'
        : 'Supabase global sign-out threw; attempting local session clear.',
      error,
    );
    return false;
  }
}

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

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, display_name, driver_id, must_change_password')
      .eq('auth_user_id', authUserId)
      .single<UserProfileRow>();

    if (error || !profile) {
      return { success: false, error: normalizeProfileError(error) };
    }

    return mapProfileRowToUser(authUserId, fallbackIdentity, profile);
  } catch (error) {
    console.warn('Unexpected error fetching current user profile.', error);
    return { success: false, error: 'Profile fetch failed' };
  }
};

export const restoreCurrentUserFromSession = async (): Promise<
  FetchCurrentUserProfileResult | NoActiveSessionResult
> => {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const sessionUser = await resolveSessionUser();
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
  if (!supabase) {
    return;
  }

  const globalSignOutSucceeded = await attemptSignOut();
  if (!globalSignOutSucceeded) {
    await attemptSignOut('local');
  }
};

export const updateUserEmail = async (newEmail: string) => {
  if (!supabase) {
    return { success: false as const, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      return { success: false as const, error: error.message };
    }
    return { success: true as const };
  } catch (error) {
    console.warn('Unexpected error updating user email.', error);
    return { success: false as const, error: error instanceof Error ? error.message : 'Failed to update email' };
  }
};
