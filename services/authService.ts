import { User } from '../types';
import { supabase } from '../supabaseClient';
import { withTimeout } from '../utils/timeout';

/** Maximum ms to wait for a Supabase Auth mutation (updateUser, etc.). */
const AUTH_MUTATION_TIMEOUT_MS = 30_000;

type UserProfileRow = {
  role: string;
  display_name: string | null;
  driver_id: string | null;
  must_change_password: boolean | null;
};

const VALID_USER_ROLES = ['admin', 'driver'] as const;

const isValidUserRole = (role: string): role is User['role'] =>
  VALID_USER_ROLES.includes(role as User['role']);

export type FetchCurrentUserProfileResult =
  | { success: true; user: User }
  | { success: false; error: 'Supabase not configured' | 'Profile not found' | 'Invalid user role' };

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
    .select('role, display_name, driver_id, must_change_password')
    .eq('auth_user_id', authUserId)
    .single<UserProfileRow>();

  if (error || !profile) {
    return { success: false, error: 'Profile not found' };
  }

  if (!isValidUserRole(profile.role)) {
    return { success: false, error: 'Invalid user role' };
  }

  return {
    success: true,
    user: {
      // User.id is always the Supabase auth user id; driver records are exposed separately via user.driverId.
      id: authUserId,
      username: fallbackIdentity,
      role: profile.role,
      name: profile.display_name || fallbackIdentity,
      driverId: profile.driver_id || undefined,
      mustChangePassword: profile.must_change_password === true,
    },
  };
};

export const restoreCurrentUserFromSession = async (): Promise<
  FetchCurrentUserProfileResult | { success: false; error: 'No active session' }
> => {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  // Try to validate the token against the Supabase Auth server via getUser().
  // This catches expired/invalidated refresh tokens ("Refresh Token Not Found")
  // and returns a clean error before any data requests fire.
  //
  // If getUser() fails due to a network/connectivity problem (the device is
  // offline or the server is unreachable) we fall back to getSession(), which
  // reads the cached session from localStorage. This preserves offline usability
  // for users who have a valid session token that hasn't actually been revoked.
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    // Distinguish network failures from real auth errors. Supabase surfaces
    // network issues as "Failed to fetch" or similar fetch-level strings.
    const isNetworkError =
      userError.message?.toLowerCase().includes('fetch') ||
      userError.message?.toLowerCase().includes('network');

    if (isNetworkError) {
      // Offline path: trust the locally-cached session.
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;
      if (!sessionUser) {
        return { success: false, error: 'No active session' };
      }
      return fetchCurrentUserProfile(sessionUser.id, sessionUser.email || '');
    }

    // Auth error (e.g. invalid/expired refresh token) — clear and show login.
    return { success: false, error: 'No active session' };
  }

  if (!userData.user) {
    return { success: false, error: 'No active session' };
  }

  return fetchCurrentUserProfile(userData.user.id, userData.user.email || '');
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
  await supabase?.auth.signOut();
};

export const changeUserPassword = async (newPassword: string) => {
  if (!supabase) {
    return { success: false as const, error: 'Supabase not configured' };
  }

  // Wrap updateUser in a timeout so a slow or unresponsive Supabase Auth
  // service never leaves the UI stuck in a permanent loading state.
  let updateResult: Awaited<ReturnType<typeof supabase.auth.updateUser>>;
  try {
    updateResult = await withTimeout(
      supabase.auth.updateUser({ password: newPassword }),
      AUTH_MUTATION_TIMEOUT_MS,
    );
  } catch (e) {
    const isTimeout = e != null && typeof e === 'object' && (e as { timedOut?: boolean }).timedOut;
    return {
      success: false as const,
      error: isTimeout
        ? '请求超时，请检查网络连接后重试 / Request timed out — please check your connection and try again'
        : '密码更新失败，请重试 / Password update failed, please try again',
    };
  }

  if (updateResult.error) {
    return { success: false as const, error: updateResult.error.message };
  }

  // Clear the "must change password" flag so the forced-change gate is lifted.
  // Uses a server-side SECURITY DEFINER function to avoid requiring a broad
  // UPDATE RLS policy on the profiles table.
  // Wrap in a timeout so a hung RPC never leaves the UI stuck in loading state.
  try {
    await withTimeout(
      Promise.resolve(supabase.rpc('clear_my_must_change_password')),
      10_000,
    );
  } catch {
    // Non-fatal: password was already changed successfully. The flag will be
    // re-checked on next login; ignore timeout/network errors here.
  }

  return { success: true as const };
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
