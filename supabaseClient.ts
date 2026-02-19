
import { createClient } from '@supabase/supabase-js';

// Helper to safely access process.env in various environments
const getEnv = (key: string): string => {
  try {
    return (process.env as any)[key] || '';
  } catch {
    return '';
  }
};

export const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

// Initialize only if credentials exist to prevent "url is required" error
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/**
 * Checks if the database is reachable and configured.
 */
export const checkDbHealth = async (): Promise<boolean> => {
  if (!supabase || !SUPABASE_URL) return false;
  try {
    // A simple light query to verify connection
    const { error } = await supabase.from('drivers').select('id').limit(1);
    if (error) {
      console.warn("Supabase Health Check Error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Supabase Connectivity Error:", err);
    return false;
  }
};
