import { createClient } from '@supabase/supabase-js';

const URL = 'https://edohkcvzaisrxunwnlvk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkb2hrY3Z6YWlzcnh1bndubHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjIyNzIsImV4cCI6MjA5MDc5ODI3Mn0.xwPGMVKoUphiq8Y-uwU2a2du2usxFKi8pOl_QkU_p9k';

// ── DRIVER TESTS ─────────────────────────────────────────────────────────────
{
  const sb = createClient(URL, ANON);
  await sb.auth.signInWithPassword({ email: 'sudi@bht.com', password: 'sudibht' });

  const DRIVER_ID = '4ab61c9d-5854-42c4-9314-f5dd0150a927';
  const LOC_ID    = '0a156c5f-720f-4725-93fa-e35796bb9b18';
  const TEST_TX   = 'TEST-E2E-' + Date.now();

  console.log('\n=== 1. submit_collection_v2 (driver as sudi) ===');
  const { data: submitted, error: rpcErr } = await sb.rpc('submit_collection_v2', {
    p_tx_id: TEST_TX,
    p_location_id: LOC_ID,
    p_driver_id: DRIVER_ID,
    p_current_score: 5100,
    p_expenses: 0,
    p_is_owner_retaining: true,
  });
  if (rpcErr) {
    console.log('RPC ERROR:', rpcErr.message, rpcErr.code);
  } else {
    const r = submitted;
    console.log('SUCCESS! tx_id:', r?.id);
    console.log('  revenue:', r?.revenue, '  netPayable:', r?.netPayable);
    console.log('  driverName:', r?.driverName, '  locationName:', r?.locationName);
    console.log('  isSynced:', r?.isSynced);
  }

  // Clean up test transaction
  if (!rpcErr) {
    const { error: delErr } = await sb.from('transactions').delete().eq('id', TEST_TX);
    if (delErr) console.log('  (cleanup may need admin — RLS blocks driver delete)');
    else console.log('  cleanup: OK');
  }

  // Check location lastScore updated
  const { data: loc } = await sb.from('locations').select('lastScore').eq('id', LOC_ID).single();
  console.log('\n=== 2. Location lastScore after submission ===', loc?.lastScore);

  // Check daily_settlements
  const { data: settlements, error: sErr } = await sb.from('daily_settlements').select('date, "totalRevenue", "totalNetPayable"').eq('"driverId"', DRIVER_ID).order('date', { ascending: false }).limit(3);
  console.log('\n=== 3. Daily settlements (driver-visible) ===', sErr?.message ?? '');
  console.log(JSON.stringify(settlements, null, 2));

  // Check notifications
  const { data: notifs, error: nErr } = await sb.from('notifications').select('type, title, message, "isRead"').limit(5);
  console.log('\n=== 4. Notifications ===', nErr?.message ?? '');
  console.log(JSON.stringify(notifs, null, 2));

  await sb.auth.signOut();
}

// ── ADMIN TESTS ───────────────────────────────────────────────────────────────
{
  const sb = createClient(URL, ANON);
  await sb.auth.signInWithPassword({ email: 'wengqilong016@gmail.com', password: 'Ll980529' });

  console.log('\n=== 5. Admin: all drivers ===');
  const { data: drivers, error: dErr } = await sb.from('drivers').select('id, name, username, status, dailyFloatingCoins, baseSalary').order('name');
  console.log(dErr?.message ?? '', JSON.stringify(drivers, null, 2));

  console.log('\n=== 6. Admin: all locations ===');
  const { data: locs, error: lErr } = await sb.from('locations').select('id, name, status, "assignedDriverId", "lastScore", "machineId"').order('name');
  console.log(lErr?.message ?? '', JSON.stringify(locs, null, 2));

  console.log('\n=== 7. Admin: unsynced/pending-payment transactions ===');
  const { data: pending, error: pErr } = await sb.from('transactions').select('id, "timestamp", "driverName", "locationName", revenue, "paymentStatus", "isSynced"').eq('"paymentStatus"', 'pending').order('"timestamp"', { ascending: false }).limit(5);
  console.log(pErr?.message ?? '', JSON.stringify(pending, null, 2));

  console.log('\n=== 8. Admin: approve_expense RPC available? ===');
  const { error: rpcProbe } = await sb.rpc('approve_expense_request', { p_request_id: '00000000-0000-0000-0000-000000000000' });
  console.log(rpcProbe?.message ?? 'OK');

  // Check health alerts
  const { data: alerts, error: aErr } = await sb.from('health_alerts').select('*').limit(3);
  console.log('\n=== 9. Health alerts ===', aErr?.message ?? '');
  console.log(JSON.stringify(alerts, null, 2));

  await sb.auth.signOut();
}

