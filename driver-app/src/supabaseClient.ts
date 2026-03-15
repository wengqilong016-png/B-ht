import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY,
  {
    auth: {
      storageKey: 'bht-driver-auth',
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

export default supabase;

export async function checkOnline(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('locations')
      .select('id')
      .limit(1)
      .maybeSingle();
    return !error;
  } catch {
    return false;
  }
}