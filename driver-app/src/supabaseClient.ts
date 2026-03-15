import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'your_supabase_url';
const supabaseAnonKey = 'your_supabase_anon_key';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'bht-driver-auth',
    persistSession: true,
    autoRefreshToken: true
  }
});

export default supabase;