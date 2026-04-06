// supabase/functions/delete-driver/index.ts
// Edge Function: POST /functions/v1/delete-driver
//
// Fully removes a driver account in three steps:
//   1. Looks up the auth_user_id from public.profiles (via driver_id).
//   2. Deletes the Supabase Auth user → cascades to public.profiles deletion.
//   3. Deletes the public.drivers row.
//
// Security: only callers whose public.profiles.role = 'admin' may invoke this
// endpoint.  The service_role key is used so RLS policies do not block writes.
//
// Request body (JSON):
//   driver_id   string  required — UUID of the driver to delete
//
// Response body (JSON):
//   success: true  → { success, driver_id }
//   success: false → { success, error, code? }

import { isAdmin } from '../_shared/authz.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  // ── 1. Authorization ─────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  const callerId = await isAdmin(authHeader);
  if (!callerId) {
    return json({ success: false, error: 'Forbidden: admin access required' }, 403);
  }

  // ── 2. Parse & validate request body ────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const driverId = typeof body.driver_id === 'string' ? body.driver_id.trim() : '';
  if (!driverId) {
    return json({ success: false, error: 'driver_id is required', code: 'MISSING_DRIVER_ID' }, 400);
  }

  // ── 3. Look up auth_user_id from profiles ────────────────────────────────
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('auth_user_id')
    .eq('driver_id', driverId)
    .maybeSingle<{ auth_user_id: string }>();

  if (profileError) {
    return json({ success: false, error: profileError.message, code: 'PROFILE_LOOKUP_FAILED' }, 500);
  }

  // ── 4. Delete Supabase Auth user (cascades to profiles row) ─────────────
  if (profile?.auth_user_id) {
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      profile.auth_user_id,
    );
    if (authDeleteError) {
      return json({ success: false, error: authDeleteError.message, code: 'AUTH_DELETE_FAILED' }, 500);
    }
  }

  // ── 5. Delete drivers row ────────────────────────────────────────────────
  const { error: driverDeleteError } = await supabaseAdmin
    .from('drivers')
    .delete()
    .eq('id', driverId);

  if (driverDeleteError) {
    return json({ success: false, error: driverDeleteError.message, code: 'DRIVER_DELETE_FAILED' }, 500);
  }

  return json({ success: true, driver_id: driverId });
});
