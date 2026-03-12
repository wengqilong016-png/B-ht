import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!envUrl || !envKey) {
  console.warn('[Bahati] Supabase is not configured: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Using built-in fallback credentials.');
}

export const SUPABASE_URL = envUrl || 'https://yctsiudhicztvppddbvk.supabase.co';
export const SUPABASE_ANON_KEY = envKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';

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
