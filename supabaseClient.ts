import { createClient, SupabaseClient } from '@supabase/supabase-js';

import FRONTEND_ENV from './env';

// Supabase credentials MUST be provided via environment variables.
// See .env.example for the required variables and docs/SECURITY_OPERATIONS.md
// for how to configure them in each deployment target (Vercel, GitHub Actions, local).
const envUrl = FRONTEND_ENV.supabaseUrl;
const envKey = FRONTEND_ENV.supabaseAnonKey;
export const envVarsMissing = !envUrl || !envKey;

if (envVarsMissing) {
  console.error(
    '[Bahati] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Copy .env.example to .env.local and fill in your Supabase project credentials.',
  );
}

export const SUPABASE_URL: string = envUrl ?? '';
export const SUPABASE_ANON_KEY: string = envKey ?? '';

export const supabase: SupabaseClient | null =
  !envVarsMissing
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
};

export default supabase;
