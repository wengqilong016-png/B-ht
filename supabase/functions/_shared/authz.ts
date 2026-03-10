// supabase/functions/_shared/authz.ts
// Authorization helpers for Supabase Edge Functions.
import { supabaseAdmin } from './supabaseAdmin.ts';

/**
 * Verify that the calling user is an admin by checking their JWT and then
 * looking up their role in public.profiles.
 *
 * @param authHeader - The raw "Authorization" header value (e.g. "Bearer <jwt>").
 * @returns The caller's auth_user_id if they are an admin, or null otherwise.
 */
export async function isAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;

  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;

  // Validate the JWT by fetching the user from Supabase Auth.
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !user) return null;

  // Check the caller's role in public.profiles.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .single<{ role: string }>();

  if (profileError || !profile) return null;
  if (profile.role !== 'admin') return null;

  return user.id;
}
