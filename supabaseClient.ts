import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase credentials MUST be provided via environment variables.
// See .env.example for the required variables and docs/SECURITY_OPERATIONS.md
// for how to configure them in each deployment target (Vercel, GitHub Actions, local).
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!envUrl || !envKey) {
  console.error(
    '[Bahati] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Copy .env.example to .env.local and fill in your Supabase project credentials.',
  );
}

export const SUPABASE_URL: string = envUrl ?? '';
export const SUPABASE_ANON_KEY: string = envKey ?? '';

export const supabase: SupabaseClient | null =
  envUrl && envKey
    ? createClient(envUrl, envKey, {
        auth: {
          storageKey: 'bht-main-auth',
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const checkDbHealth = async (): Promise<boolean> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    // Use the auth health endpoint instead of the REST root so the browser
    // doesn't log a 401 on every connectivity poll.
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
};

export default supabase;
