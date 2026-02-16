
import { createClient } from '@supabase/supabase-js';

// Your Hardcoded Credentials
export const DEFAULT_SUPABASE_URL = 'https://smouwcsqimfwdwrgpons.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtb3V3Y3NxaW1md2R3cmdwb25zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MTY1NjAsImV4cCI6MjA4Mjk5MjU2MH0.3itabnaWFjXjSo4HJQRMfJUMpPtSYJTtf-QrC7iyGLo';

// 1. Try Local Storage (Manual Override via UI Settings)
const storedUrl = localStorage.getItem('bahati_supa_url');
const storedKey = localStorage.getItem('bahati_supa_key');

// 2. Resolve Final Credentials
// Prefer stored values if they exist, otherwise use hardcoded defaults.
const finalUrl = storedUrl || DEFAULT_SUPABASE_URL;
const finalKey = storedKey || DEFAULT_SUPABASE_ANON_KEY;

const isConfigured = finalUrl && finalUrl.startsWith('http') && finalKey.length > 20;

if (!isConfigured) {
  console.warn("[BAHATI PRO] Supabase client is not properly configured.");
}

// Initialize the client.
export const supabase = createClient(finalUrl, finalKey);

/**
 * Utility to save credentials manually from the UI
 */
export const saveSupabaseConfig = (url: string, key: string) => {
    if(!url || !key) return;
    localStorage.setItem('bahati_supa_url', url.trim());
    localStorage.setItem('bahati_supa_key', key.trim());
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
    const { error } = await supabase.from('drivers').select('count', { count: 'exact', head: true });
    return !error;
  } catch {
    return false;
  }
};
