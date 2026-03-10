// supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// Get config from environment variables with hardcoded fallbacks
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';

const hasSupabaseConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = hasSupabaseConfig ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const checkDbHealth = async () => {
  if (!supabase) return false;
  try {
    // We use a simple select on a table that might be public or just check if the client can reach Supabase
    const { error } = await supabase.from('locations').select('id').limit(1);
    // If it's a connection error (no network), it returns error.
    // If it's a permission error (PGRST116/401), it means Supabase IS reachable, just needs login.
    if (error && error.code === 'PGRST116') return true; // Means table exists but empty or restricted
    if (error && (error as any).status === 401) return true; // Reachable but Unauthorized
    return !error;
  } catch (err) {
    return false;
  }
};

export default supabase;