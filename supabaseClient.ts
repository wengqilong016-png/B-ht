// supabaseClient.ts

import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!hasSupabaseConfig) {
  console.warn(
    '[Bahati] Supabase is not configured – set VITE_SUPABASE_URL and ' +
    'VITE_SUPABASE_ANON_KEY in your Vercel project environment variables. ' +
    'The app will run in offline/local mode only.'
  );
}

export const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const checkDbHealth = async () => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('drivers').select('id').limit(1);
    return !error;
  } catch (err) {
    console.error('Supabase health check failed:', err);
    return false;
  }
};

export default supabase;