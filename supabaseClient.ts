import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Runtime credential store ─────────────────────────────────────────────────
// When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not baked into the build
// (e.g. Vercel env vars were added after the build, or the packaged mobile app
// was built without them), users can supply credentials at runtime via the
// Connection Settings panel on the login screen.  They are persisted in
// localStorage so they survive page reloads.
//
// ⚠️  Only the PUBLIC anon key should ever be stored here.
//     The service_role key bypasses all Row-Level Security and must NEVER be
//     placed in browser storage or frontend code.

const RUNTIME_CREDS_KEY = 'bht-runtime-creds';

interface RuntimeCreds { url: string; key: string }

function loadRuntimeCreds(): RuntimeCreds | null {
  try {
    const raw = globalThis.localStorage?.getItem(RUNTIME_CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RuntimeCreds>;
    return parsed.url && parsed.key ? { url: parsed.url, key: parsed.key } : null;
  } catch {
    return null;
  }
}

/** Persist runtime credentials and reload the page so the Supabase client
 *  re-initialises with the new values. */
export function saveRuntimeCredentials(url: string, key: string): void {
  try {
    localStorage.setItem(
      RUNTIME_CREDS_KEY,
      JSON.stringify({ url: url.trim(), key: key.trim() }),
    );
  } catch (err) {
    // localStorage may be unavailable (e.g. private browsing with storage blocked)
    console.warn('[Bahati] Could not save runtime credentials to localStorage:', err);
  }
}

/** Remove any runtime credentials that were saved in localStorage. */
export function clearRuntimeCredentials(): void {
  try {
    localStorage.removeItem(RUNTIME_CREDS_KEY);
  } catch { /* ignore */ }
}

// ─── Resolve effective credentials ───────────────────────────────────────────
// Priority:  localStorage runtime creds  >  build-time env vars  >  ''
const runtimeCreds = loadRuntimeCreds();

/** True when the active credentials came from runtime localStorage config
 *  rather than build-time environment variables. */
export const usingRuntimeCredentials: boolean = runtimeCreds !== null;

// Supabase credentials MUST be provided via environment variables.
// See .env.example for the required variables and docs/SECURITY_OPERATIONS.md
// for how to configure them in each deployment target (Vercel, GitHub Actions, local).
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_URL: string = runtimeCreds?.url ?? envUrl ?? '';
export const SUPABASE_ANON_KEY: string = runtimeCreds?.key ?? envKey ?? '';

export const envVarsMissing: boolean = !SUPABASE_URL || !SUPABASE_ANON_KEY;

if (envVarsMissing) {
  console.error(
    '[Bahati] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Copy .env.example to .env.local and fill in your Supabase project credentials. ' +
    'If deploying to Vercel, set these variables under Settings → Environment Variables and redeploy. ' +
    'Alternatively, use the Connection Settings panel on the login screen.',
  );
}

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
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
