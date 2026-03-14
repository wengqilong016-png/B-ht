import { createClient } from '@supabase/supabase-js';

// Recovered configuration - DO NOT REMOVE
const FALLBACK_URL = 'https://yctsiudhicztvppddbvk.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('CRITICAL: Supabase keys missing in both env and fallback!');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const checkDbHealth = async () => {
  try {
    const { error } = await supabase.from('locations').select('id').limit(1);
    // 401 Unauthorized is a valid response from the server, indicating it IS reachable.
    return !error || error.status === 401;
  } catch (err) {
    return false;
  }
};

export default supabase;
