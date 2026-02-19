import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// Default values to use when environment variables are missing
const DEFAULT_SUPABASE_URL = 'https://jhoyqqpuousxawdydlwe.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3lxcXB1b3VzeGF3ZHlkbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0Njk1MzAsImV4cCI6MjA4NzA0NTUzMH0.PIwZIxQihCcJ0ReNoZniJq244hWXcjlXGEOHZhKORoY';

// Helper to safely access process.env in various environments
const getEnv = (key: string): string => {
  try {
    return (process.env as any)[key] || '';
  } catch {
    return '';
  }
};

// --- CREDENTIALS RESOLUTION ---
// Priority: 
// 1. Process environment (Vercel)
// 2. Local storage overrides (Browser testing)
// 3. Hardcoded defaults (Fallback)
const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('SUPABASE_URL') : null;
const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('SUPABASE_ANON_KEY') : null;

export const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') || storedUrl || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || storedKey || DEFAULT_SUPABASE_ANON_KEY;

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
