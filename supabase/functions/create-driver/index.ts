// supabase/functions/create-driver/index.ts
// Edge Function: POST /functions/v1/create-driver
//
// Creates a complete driver account in one call:
//   1. Creates a Supabase Auth user (email + password, email pre-confirmed).
//   2. Upserts a record in public.drivers (insert if absent, update name/username only).
//   3. Upserts a record in public.profiles (role='driver', driver_id, display_name).
//
// Security: only callers whose public.profiles.role = 'admin' may invoke this endpoint.
// The function uses the service_role key so RLS policies do not block any writes.
//
// Request body (JSON):
//   email        string  required
//   password     string  required
//   driver_id    string  required  — must match an existing or to-be-created drivers.id
//   display_name string  optional  — defaults to driver_id
//   username     string  optional  — defaults to driver_id.toLowerCase()
//
// Response body (JSON):
//   success: true  → { success, auth_user_id, email, driver_id }
//   success: false → { success, error, code? }

import { isAdmin } from '../_shared/authz.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  // ── 1. Authorization ────────────────────────────────────────────────────
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

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const driverId = typeof body.driver_id === 'string' ? body.driver_id.trim() : '';
  const displayName =
    typeof body.display_name === 'string' && body.display_name.trim()
      ? body.display_name.trim()
      : driverId;
  const username =
    typeof body.username === 'string' && body.username.trim()
      ? body.username.trim()
      : driverId.toLowerCase();

  if (!email) return json({ success: false, error: 'Missing required field: email' }, 400);
  if (!password) return json({ success: false, error: 'Missing required field: password' }, 400);
  if (!driverId) return json({ success: false, error: 'Missing required field: driver_id' }, 400);

  // ── 3. Check for duplicate driver_id in public.drivers ──────────────────
  const { data: existingDriver } = await supabaseAdmin
    .from('drivers')
    .select('id')
    .eq('id', driverId)
    .maybeSingle<{ id: string }>();

  // We allow the driver record to pre-exist — we will upsert it below.
  // But if a profile already references this driver_id that would be a conflict.
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('auth_user_id, driver_id')
    .eq('driver_id', driverId)
    .maybeSingle<{ auth_user_id: string; driver_id: string }>();

  if (existingProfile) {
    return json(
      {
        success: false,
        error: 'Conflict: driver_id already bound to another auth user',
        code: 'DRIVER_ID_CONFLICT',
        existing_auth_user_id: existingProfile.auth_user_id,
        driver_id: driverId,
      },
      409,
    );
  }

  // ── 4. Create Supabase Auth user ─────────────────────────────────────────
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,          // pre-confirm so the driver can log in immediately
  });

  if (authError || !authData.user) {
    // Detect duplicate-email error from Supabase (message contains "already registered")
    const msg = authError?.message ?? 'Unknown error';
    const isDuplicateEmail =
      msg.toLowerCase().includes('already registered') ||
      msg.toLowerCase().includes('already exists') ||
      (authError as { code?: string })?.code === 'email_exists';

    if (isDuplicateEmail) {
      return json(
        {
          success: false,
          error: 'Conflict: email already registered',
          code: 'EMAIL_CONFLICT',
          email,
        },
        409,
      );
    }

    return json({ success: false, error: `Auth user creation failed: ${msg}` }, 500);
  }

  const authUserId = authData.user.id;

  // Helper: roll back the just-created Auth user to avoid orphaned accounts.
  const rollbackAuthUser = () => supabaseAdmin.auth.admin.deleteUser(authUserId);

  // ── 5. Upsert public.drivers ─────────────────────────────────────────────
  // If the drivers record already exists (pre-created via SQL), we only update
  // name and username to match what was supplied; business fields are left alone.
  if (existingDriver) {
    const { error: driverUpdateError } = await supabaseAdmin
      .from('drivers')
      .update({ name: displayName, username })
      .eq('id', driverId);

    if (driverUpdateError) {
      await rollbackAuthUser();
      return json(
        { success: false, error: `drivers update failed: ${driverUpdateError.message}` },
        500,
      );
    }
  } else {
    const { error: driverInsertError } = await supabaseAdmin
      .from('drivers')
      .insert({ id: driverId, name: displayName, username, status: 'active' });

    if (driverInsertError) {
      await rollbackAuthUser();
      return json(
        { success: false, error: `drivers insert failed: ${driverInsertError.message}` },
        500,
      );
    }
  }

  // ── 6. Upsert public.profiles ────────────────────────────────────────────
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      auth_user_id: authUserId,
      role: 'driver',
      display_name: displayName,
      driver_id: driverId,
    },
    { onConflict: 'auth_user_id' },
  );

  if (profileError) {
    await rollbackAuthUser();
    return json(
      { success: false, error: `profiles insert failed: ${profileError.message}` },
      500,
    );
  }

  // ── 7. Success ────────────────────────────────────────────────────────────
  return json(
    {
      success: true,
      auth_user_id: authUserId,
      email,
      driver_id: driverId,
      display_name: displayName,
      username,
    },
    201,
  );
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
