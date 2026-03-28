// supabase/functions/create-admin/index.ts
// Edge Function: POST /functions/v1/create-admin
//
// Creates a complete admin account in one call:
//   1. Creates a Supabase Auth user (email + password, email pre-confirmed).
//   2. Inserts a record in public.profiles (role='admin', driver_id: null, display_name).
//
// Security: only callers whose public.profiles.role = 'admin' may invoke this endpoint.
// The function uses the service_role key so RLS policies do not block any writes.
//
// Request body (JSON):
//   email        string  required
//   password     string  required  — minimum 8 characters
//   display_name string  optional  — defaults to 'Admin'
//
// Response body (JSON):
//   success: true  → { success, auth_user_id, email, display_name }
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
  const displayName =
    typeof body.display_name === 'string' && body.display_name.trim()
      ? body.display_name.trim()
      : 'Admin';

  if (!email) return json({ success: false, error: 'Missing required field: email' }, 400);
  if (!password) return json({ success: false, error: 'Missing required field: password' }, 400);
  if (password.length < 8) {
    return json({ success: false, error: 'Password must be at least 8 characters' }, 400);
  }

  // ── 3. Create Supabase Auth user ─────────────────────────────────────────
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,          // pre-confirm so the admin can log in immediately
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

  // ── 4. Insert public.profiles ────────────────────────────────────────────
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    auth_user_id: authUserId,
    role: 'admin',
    display_name: displayName,
    driver_id: null,
  });

  if (profileError) {
    await rollbackAuthUser();
    return json(
      { success: false, error: `profiles insert failed: ${profileError.message}` },
      500,
    );
  }

  // ── 5. Success ────────────────────────────────────────────────────────────
  return json(
    {
      success: true,
      auth_user_id: authUserId,
      email,
      display_name: displayName,
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
