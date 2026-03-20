import { User } from '../types';
import { supabase } from '../supabaseClient';
import { withTimeout } from '../utils/timeout';

/** Maximum ms to wait for a Supabase Auth mutation (updateUser, etc.). */
const AUTH_MUTATION_TIMEOUT_MS = 15_000;

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

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;
  if (!sessionUser) {
    return { success: false, error: 'No active session' };
  }

  return fetchCurrentUserProfile(sessionUser.id, sessionUser.email || '');
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
  await supabase.rpc('clear_my_must_change_password');

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
