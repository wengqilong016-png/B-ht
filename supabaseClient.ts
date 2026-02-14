
import { createClient } from '@supabase/supabase-js';

// 1. Try Local Storage (Manual Override for Cloud Deployments)
const storedUrl = localStorage.getItem('bahati_supa_url');
const storedKey = localStorage.getItem('bahati_supa_key');

// 2. Try Environment Variables (Build Time Fallback)
// Safe access to process.env to prevent crashes if polyfill misses
const envUrl = (typeof process !== 'undefined' && process.env) ? process.env.VITE_SUPABASE_URL : '';
const envKey = (typeof process !== 'undefined' && process.env) ? process.env.VITE_SUPABASE_ANON_KEY : '';

// 3. Resolve Final Credentials
const supabaseUrl = storedUrl || envUrl || '';
const supabaseAnonKey = storedKey || envKey || '';

const isConfigured = supabaseUrl && supabaseUrl !== 'https://placeholder.supabase.co' && supabaseUrl !== '';

if (!isConfigured) {
  console.warn(
    "%c[BAHATI PRO] Deployment Warning: Supabase credentials missing. App running in LOCAL-FIRST mode.",
    "background: #fff3cd; color: #856404; font-weight: bold; padding: 4px; border-radius: 4px;"
  );
}

// Initialize the client.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

/**
 * Utility to save credentials manually from the UI
 */
export const saveSupabaseConfig = (url: string, key: string) => {
    if(!url || !key) return;
    localStorage.setItem('bahati_supa_url', url.trim());
    localStorage.setItem('bahati_supa_key', key.trim());
    // Force reload to re-initialize the supabase client with new keys
    window.location.reload();
};

export const clearSupabaseConfig = () => {
    localStorage.removeItem('bahati_supa_url');
    localStorage.removeItem('bahati_supa_key');
    window.location.reload();
};

/**
 * Utility to check if the database is reachable
 */
export const checkDbHealth = async (): Promise<boolean> => {
  if (!isConfigured) return false;
  try {
    // Try a lightweight query to check connection
    const { error } = await supabase.from('drivers').select('count', { count: 'exact', head: true });
    return !error;
  } catch {
    return false;
  }
};
