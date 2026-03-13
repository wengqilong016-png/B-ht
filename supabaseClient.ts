import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!envUrl || !envKey) {
  if (import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEV_FALLBACK === 'true') {
    // Opt-in shared dev DB – only active when VITE_ALLOW_DEV_FALLBACK=true is
    // explicitly set in .env.local. Displays a red banner in the UI.
    // NOTE: Supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
    // instead of relying on this fallback path.
    console.warn(
      '[Bahati] ⚠️  VITE_ALLOW_DEV_FALLBACK=true but VITE_SUPABASE_URL / ' +
      'VITE_SUPABASE_ANON_KEY are not set. ' +
      'Please add them to .env.local — hardcoded credentials have been removed.',
    );
    throw new Error(
      '[Bahati] Supabase configuration error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. ' +
      'Set them in .env.local (copy .env.example as a template).',
    );
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

export const SUPABASE_URL = envUrl as string;
export const SUPABASE_ANON_KEY = envKey as string;

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
