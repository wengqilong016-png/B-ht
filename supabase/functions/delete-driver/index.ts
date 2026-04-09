// supabase/functions/delete-driver/index.ts
// Edge Function: POST /functions/v1/delete-driver
//
// Fully removes a driver account in three steps:
//   1. Looks up the auth_user_id from public.drivers.
//   2. Deletes the Supabase Auth user.
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

function errorJson(error: string, status: number, code: string): Response {
  return json({ success: false, error, code }, status);
}

async function unlinkDriverReferences(driverId: string): Promise<{ error: string; code: string } | null> {
  const { error: transactionUnlinkError } = await supabaseAdmin
    .from('transactions')
    .update({ driverId: null })
    .eq('driverId', driverId);

  if (transactionUnlinkError) {
    return { error: transactionUnlinkError.message, code: 'TRANSACTION_UNLINK_FAILED' };
  }

  const { error: settlementUnlinkError } = await supabaseAdmin
    .from('daily_settlements')
    .update({ driverId: null })
    .eq('driverId', driverId);

  if (settlementUnlinkError) {
    return { error: settlementUnlinkError.message, code: 'SETTLEMENT_UNLINK_FAILED' };
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  // ── 1. Authorization ─────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  const callerId = await isAdmin(authHeader);
  if (!callerId) {
    return errorJson('Forbidden: admin access required', 403, 'FORBIDDEN');
  }

  // ── 2. Parse & validate request body ────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid JSON body', 400, 'INVALID_JSON');
  }

  const driverId = typeof body.driver_id === 'string' ? body.driver_id.trim() : '';
  if (!driverId) {
    return errorJson('driver_id is required', 400, 'MISSING_DRIVER_ID');
  }

  // ── 3. Look up auth_user_id from drivers ─────────────────────────────────
  const { data: driverRow, error: driverLookupError } = await supabaseAdmin
    .from('drivers')
    .select('auth_user_id')
    .eq('id', driverId)
    .maybeSingle<{ auth_user_id: string | null }>();

  if (driverLookupError) {
    return errorJson(driverLookupError.message, 500, 'DRIVER_LOOKUP_FAILED');
  }

  // ── 4. Delete Supabase Auth user when linked ─────────────────────────────
  if (driverRow?.auth_user_id) {
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      driverRow.auth_user_id,
    );
    if (authDeleteError) {
      return errorJson(authDeleteError.message, 500, 'AUTH_DELETE_FAILED');
    }
  }

  // ── 5. Unlink transactions and settlements, then delete drivers row ──────
  // Transactions and daily_settlements have FK constraints on drivers.id, so
  // we NULL out the driverId first to preserve historical financial records.
  const unlinkError = await unlinkDriverReferences(driverId);
  if (unlinkError) {
    return errorJson(unlinkError.error, 500, unlinkError.code);
  }

  const { error: driverDeleteError } = await supabaseAdmin
    .from('drivers')
    .delete()
    .eq('id', driverId);

  if (driverDeleteError) {
    return errorJson(driverDeleteError.message, 500, 'DRIVER_DELETE_FAILED');
  }

  return json({ success: true, driver_id: driverId });
});
