import { createClient } from '@supabase/supabase-js';

const URL = 'https://edohkcvzaisrxunwnlvk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkb2hrY3Z6YWlzcnh1bndubHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjIyNzIsImV4cCI6MjA5MDc5ODI3Mn0.xwPGMVKoUphiq8Y-uwU2a2du2usxFKi8pOl_QkU_p9k';

async function testAccount(email, password, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${label} (${email})`);
  console.log('='.repeat(60));

  const sb = createClient(URL, ANON);
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr) { console.log('LOGIN FAILED:', authErr.message); return; }
  console.log('LOGIN OK — user id:', auth.user.id);
  console.log('Email confirmed:', auth.user.email_confirmed_at ? 'YES' : 'NO');

  // Profile / role
  const { data: profile, error: pErr } = await sb.from('profiles').select('*').eq('auth_user_id', auth.user.id).single();
  console.log('\n--- Profile ---');
  if (pErr) console.log('Profile error:', pErr.message);
  else console.log(JSON.stringify(profile, null, 2));

  // Driver row (if driver)
  if (profile?.driver_id) {
    const { data: driver, error: dErr } = await sb.from('drivers').select('*').eq('id', profile.driver_id).single();
    console.log('\n--- Driver row ---');
    if (dErr) console.log('Driver error:', dErr.message);
    else console.log(JSON.stringify(driver, null, 2));

    // Assigned locations
    const { data: locs, error: lErr } = await sb.from('locations').select('id, name, status, "assignedDriverId", "lastScore"').eq('"assignedDriverId"', profile.driver_id);
    console.log('\n--- Assigned Locations ---', lErr?.message ?? '');
    console.log(JSON.stringify(locs, null, 2));

    // Recent transactions
    const { data: txns, error: tErr } = await sb.from('transactions').select('id, "timestamp", "isSynced", "driverId", "locationName", revenue, "paymentStatus"').eq('"driverId"', profile.driver_id).order('"timestamp"', { ascending: false }).limit(5);
    console.log('\n--- Recent Transactions ---', tErr?.message ?? '');
    console.log(JSON.stringify(txns, null, 2));
  }

  // Test submit_collection_v2 RPC (with dummy data to test auth only)
  const { data: rpcTest, error: rpcErr } = await sb.rpc('get_my_role');
  console.log('\n--- get_my_role() ---', rpcErr?.message ?? rpcTest);

  const { data: myDriverId } = await sb.rpc('get_my_driver_id');
  console.log('get_my_driver_id():', myDriverId);

  await sb.auth.signOut();
}

await testAccount('sudi@bht.com', 'sudibht', 'DRIVER');
await testAccount('wengqilong016@gmail.com', 'Ll980529', 'ADMIN');
