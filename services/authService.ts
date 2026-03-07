import { User } from '../types';
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
    .select('role, display_name, driver_id')
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
