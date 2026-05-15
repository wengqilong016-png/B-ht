// supabase/functions/create-driver/index.ts
// Edge Function: POST /functions/v1/create-driver
//
// Creates a complete driver account in one call:
//   1. Creates a Supabase Auth user (email + password, email pre-confirmed).
//   2. Stores driver metadata on the Auth user so the DB trigger creates
//      public.drivers + public.profiles.
//   3. Persists optional business fields with service_role.
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

type BusinessFields = {
  phone?: string;
  vehicleInfo?: unknown;
  dailyFloatingCoins?: number;
  baseSalary?: number;
  commissionRate?: number;
  initialDebt?: number;
  remainingDebt?: number;
};

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseBusinessFields(value: unknown): BusinessFields {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  return {
    phone: typeof source.phone === 'string' ? source.phone.trim() : undefined,
    vehicleInfo: source.vehicleInfo,
    dailyFloatingCoins: numberOrUndefined(source.dailyFloatingCoins),
    baseSalary: numberOrUndefined(source.baseSalary),
    commissionRate: numberOrUndefined(source.commissionRate),
    initialDebt: numberOrUndefined(source.initialDebt),
    remainingDebt: numberOrUndefined(source.remainingDebt),
  };
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

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
  const businessFields = parseBusinessFields(body.business_fields);

  if (!email) return json({ success: false, error: 'Missing required field: email' }, 400);
  if (!password) return json({ success: false, error: 'Missing required field: password' }, 400);
  if (!driverId) return json({ success: false, error: 'Missing required field: driver_id' }, 400);

  // ── 3. Check for duplicate driver binding ────────────────────────────────
  // A driver skeleton may already exist, but a profile binding means the
  // account has already been provisioned.
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
    user_metadata: {
      role: 'driver',
      driver_id: driverId,
      display_name: displayName,
      username,
    },
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

  // ── 5. Verify trigger-created public rows ────────────────────────────────
  const { data: driverRow, error: driverFetchError } = await supabaseAdmin
    .from('drivers')
    .select('id')
    .eq('id', driverId)
    .maybeSingle<{ id: string }>();

  if (driverFetchError || !driverRow) {
    await rollbackAuthUser();
    return json(
      { success: false, error: `drivers trigger insert failed: ${driverFetchError?.message ?? 'row not found'}` },
      500,
    );
  }

  const { data: profileRow, error: profileFetchError } = await supabaseAdmin
    .from('profiles')
    .select('auth_user_id, driver_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle<{ auth_user_id: string; driver_id: string }>();

  if (profileFetchError || profileRow?.driver_id !== driverId) {
    await rollbackAuthUser();
    return json(
      { success: false, error: `profiles trigger insert failed: ${profileFetchError?.message ?? 'row not found'}` },
      500,
    );
  }

  // ── 6. Persist business fields with service_role ─────────────────────────
  const driverBusinessPatch = compactRecord({
    phone: businessFields.phone,
    vehicleInfo: businessFields.vehicleInfo,
    dailyFloatingCoins: businessFields.dailyFloatingCoins,
    baseSalary: businessFields.baseSalary,
    commissionRate: businessFields.commissionRate,
    initialDebt: businessFields.initialDebt,
    remainingDebt: businessFields.remainingDebt ?? businessFields.initialDebt,
  });

  if (Object.keys(driverBusinessPatch).length > 0) {
    const { error: businessFieldsError } = await supabaseAdmin
      .from('drivers')
      .update(driverBusinessPatch)
      .eq('id', driverId);

    if (businessFieldsError) {
      await rollbackAuthUser();
      return json(
        { success: false, error: `drivers business update failed: ${businessFieldsError.message}` },
        500,
      );
    }
  }

  // ── 7. Success ───────────────────────────────────────────────────────────
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
