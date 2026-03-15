import { createClient } from '@supabase/supabase-js';

// Project credentials — the anon key is safe to include in client-side code;
// it is protected by Supabase Row Level Security policies.
// Override with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars when needed.
const DEFAULT_SUPABASE_URL = 'https://yctsiudhicztvppddbvk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!envUrl || !envKey) {
  console.warn(
    '[Bahati] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — using built-in project credentials. ' +
    'Set these env vars to override.',
  );
}

export const SUPABASE_URL: string = envUrl || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY: string = envKey || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'bht-main-auth',
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const checkDbHealth = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('locations').select('id').limit(1);
    return !error;
  } catch (err) {
    return false;
  }
};

export default supabase;
