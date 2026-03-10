// supabase/functions/_shared/supabaseAdmin.ts
// Supabase Admin client using service_role key — bypasses RLS for Edge Functions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl) throw new Error('Missing environment variable: SUPABASE_URL');
if (!supabaseServiceRoleKey) throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
