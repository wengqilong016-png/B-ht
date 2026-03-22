import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'bht-main-auth',
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const checkDbHealth = async (): Promise<boolean> => {
  try {
    // Ping the Supabase REST API root with a short timeout.
    // Any valid HTTP response (including 4xx/5xx when RLS blocks anonymous access)
    // means the server is reachable — only a network failure returns false.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok || res.status >= 100;
  } catch {
    return false;
  }
};

export default supabase;
