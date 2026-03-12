import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let resolvedUrl = envUrl;
let resolvedKey = envKey;

if (!envUrl || !envKey) {
  if (import.meta.env.DEV) {
    console.warn(
      '[Bahati] Supabase is not fully configured: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Using built-in development fallback credentials.',
    );
    resolvedUrl = envUrl || 'https://yctsiudhicztvppddbvk.supabase.co';
    resolvedKey =
      envKey ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';
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
