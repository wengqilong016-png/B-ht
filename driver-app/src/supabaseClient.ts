import { createClient } from '@supabase/supabase-js';

// Use existing environment variables or fallback options
const SUPABASE_URL = process.env.SUPABASE_URL || 'your_default_supabase_url';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your_default_anon_key';

// Restore ESM TypeScript implementation with env fallback
const checkOnline = async () => {
    // Logic to check online status
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storageKey: 'bht-driver-auth',
        persistSession: false,
        autoRefreshToken: true,
    },
});

export { supabase, checkOnline };