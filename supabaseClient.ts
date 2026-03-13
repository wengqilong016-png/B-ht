import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let resolvedUrl = envUrl;
let resolvedKey = envKey;

/**
 * Whether the app is currently connected to the shared development database
 * instead of a project-specific Supabase instance.
 * Exposed so the UI can display a prominent warning banner.
 */
export let isUsingDevFallback = false;

if (!envUrl || !envKey) {
  if (import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEV_FALLBACK === 'true') {
    // Opt-in shared dev DB – only active when VITE_ALLOW_DEV_FALLBACK=true is
    // explicitly set in .env.local. Displays a red banner in the UI.
    console.warn(
      '[Bahati] ⚠️  Using shared development Supabase credentials ' +
      '(VITE_ALLOW_DEV_FALLBACK=true). ' +
      'Never deploy with this setting – use project-specific keys instead.',
    );
    resolvedUrl = envUrl || 'https://yctsiudhicztvppddbvk.supabase.co';
    resolvedKey =
      envKey ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';
    isUsingDevFallback = true;
  } else if (import.meta.env.DEV) {
    console.error(
      '[Bahati] Supabase environment variables are missing. ' +
      'Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
      'To use the shared dev DB set VITE_ALLOW_DEV_FALLBACK=true in .env.local.',
    );
    throw new Error(
      '[Bahati] Supabase configuration error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.',
    );
  } else {
    console.error(
      '[Bahati] Supabase environment variables are missing in production. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
    throw new Error(
      '[Bahati] Supabase configuration error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in production build.',
    );
  }
}

export const SUPABASE_URL = resolvedUrl as string;
export const SUPABASE_ANON_KEY = resolvedKey as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const checkDbHealth = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('locations').select('id').limit(1);
    return !error;
  } catch (err) {
    return false;
  }
};

export default supabase;
