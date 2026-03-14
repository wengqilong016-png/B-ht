import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'CRITICAL: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Copy .env.example to .env and fill in your project credentials.'
  );
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
