import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase credentials MUST be provided via environment variables.
// See .env.example for the required variables and docs/SECURITY_OPERATIONS.md
// for how to configure them in each deployment target (Vercel, GitHub Actions, local).
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const envVarsMissing: boolean = !envUrl || !envKey;

if (envVarsMissing) {
  console.error(
    '[Bahati] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Copy .env.example to .env.local and fill in your Supabase project credentials. ' +
    'If deploying to Vercel, set these variables under Settings → Environment Variables and redeploy.',
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
    // Ping the Supabase REST API root with a short timeout.
    // 2xx–4xx means the server is reachable; 5xx means server-side failure.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
    });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
};

export default supabase;
