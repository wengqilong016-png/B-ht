import { createClient } from '@supabase/supabase-js';
const URL = 'https://edohkcvzaisrxunwnlvk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkb2hrY3Z6YWlzcnh1bndubHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjIyNzIsImV4cCI6MjA5MDc5ODI3Mn0.xwPGMVKoUphiq8Y-uwU2a2du2usxFKi8pOl_QkU_p9k';

const sb = createClient(URL, ANON);
await sb.auth.signInWithPassword({ email: 'sudi@bht.com', password: 'sudibht' });

const DRIVER_ID = '4ab61c9d-5854-42c4-9314-f5dd0150a927';
const LOC_ID    = '0a156c5f-720f-4725-93fa-e35796bb9b18';

// Test create_reset_request_v1
console.log('=== create_reset_request_v1 ===');
const { data: rd, error: re } = await sb.rpc('create_reset_request_v1', {
  p_tx_id: 'RESET-TEST-' + Date.now(),
  p_location_id: LOC_ID,
  p_driver_id: DRIVER_ID,
  p_gps: null,
  p_photo_url: null,
  p_notes: 'e2e test',
});
if (re) console.log('ERROR:', re.message);
else { console.log('SUCCESS:', JSON.stringify(rd).slice(0, 200)); }

// Test create_payout_request_v1
console.log('\n=== create_payout_request_v1 ===');
const { data: pd, error: pe } = await sb.rpc('create_payout_request_v1', {
  p_tx_id: 'PAYOUT-TEST-' + Date.now(),
  p_location_id: LOC_ID,
  p_driver_id: DRIVER_ID,
  p_gps: null,
  p_payout_amount: 10000,
  p_notes: 'e2e test',
});
if (pe) console.log('ERROR:', pe.message);
else { console.log('SUCCESS:', JSON.stringify(pd).slice(0, 200)); }

await sb.auth.signOut();

// Admin: test approve_reset_request_v1
await sb.auth.signInWithPassword({ email: 'wengqilong016@gmail.com', password: 'Ll980529' });

const recentTx = rd?.id || pd?.id;
if (recentTx) {
  console.log('\n=== approve_reset_request_v1 ===');
  const { data: ad, error: ae } = await sb.rpc('approve_reset_request_v1', {
    p_tx_id: recentTx,
    p_approve: false,  // reject to avoid side effects
  });
  if (ae) console.log('ERROR:', ae.message);
  else console.log('SUCCESS:', JSON.stringify(ad).slice(0, 200));
}

// Check approve_payout_request function
console.log('\n=== approve_payout_request_v1 probe ===');
const { error: apErr } = await sb.rpc('approve_payout_request_v1', { p_tx_id: '000', p_approve: false });
console.log(apErr?.message?.slice(0, 100) ?? 'OK');

// Clean up test data
console.log('\n=== Cleanup test records ===');
const idsToDelete = [rd?.id, pd?.id].filter(Boolean);
for (const id of idsToDelete) {
  const { error } = await sb.from('transactions').delete().eq('id', id);
  console.log(`Delete ${id}:`, error?.message ?? 'OK');
}

// Check calculate_finance_v2
console.log('\n=== calculate_finance_v2 probe ===');
const { error: cfErr } = await sb.rpc('calculate_finance_v2', {
  p_driver_id: DRIVER_ID,
  p_date: '2026-04-06',
});
console.log(cfErr?.message?.slice(0, 100) ?? 'OK (no error)');

await sb.auth.signOut();
