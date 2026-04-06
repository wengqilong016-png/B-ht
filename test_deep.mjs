import { createClient } from '@supabase/supabase-js';
const URL = 'https://edohkcvzaisrxunwnlvk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkb2hrY3Z6YWlzcnh1bndubHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjIyNzIsImV4cCI6MjA5MDc5ODI3Mn0.xwPGMVKoUphiq8Y-uwU2a2du2usxFKi8pOl_QkU_p9k';

const sb = createClient(URL, ANON);
await sb.auth.signInWithPassword({ email: 'wengqilong016@gmail.com', password: 'Ll980529' });

// 1. Clean up test transaction
console.log('=== Cleanup test transaction ===');
const { error: delErr } = await sb.from('transactions').delete().eq('id', 'TEST-E2E-1775445004563');
console.log(delErr?.message ?? 'deleted OK');

// Restore lastScore to 5000
const { error: restoreErr } = await sb.from('locations').update({ lastScore: 5000 }).eq('id', '0a156c5f-720f-4725-93fa-e35796bb9b18');
console.log('Restore lastScore:', restoreErr?.message ?? 'OK');

// 2. Check daily_settlements duplication
console.log('\n=== Daily settlements ALL ===');
const { data: allSettlements } = await sb.from('daily_settlements').select('*').order('date', { ascending: false });
console.log(JSON.stringify(allSettlements, null, 2));

// 3. Find approve_expense_request signature
console.log('\n=== Available expense RPCs ===');
const rpcs = ['approve_expense_request', 'create_payout_request', 'create_reset_request', 'calculate_finance_v2'];
for (const rpc of rpcs) {
  const { data, error } = await sb.rpc(rpc, {});
  // If schema error → not found, if parameter error → exists with diff params
  const msg = error?.message ?? 'OK';
  const exists = !msg.includes('Could not find the function');
  console.log(`${rpc}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'} — ${msg.slice(0, 80)}`);
}

// 4. Check expense_requests table
console.log('\n=== Expense requests table ===');
const { data: expReqs, error: eErr } = await sb.from('expense_requests').select('*').limit(5);
console.log(eErr?.message ?? '', JSON.stringify(expReqs, null, 2));

// 5. Check payout_requests table
console.log('\n=== Payout requests table ===');
const { data: payReqs, error: pErr } = await sb.from('payout_requests').select('*').limit(5);
console.log(pErr?.message ?? '', JSON.stringify(payReqs, null, 2));

// 6. Check transactions with isSynced=false
console.log('\n=== Unsynced transactions ===');
const { data: unsynced, error: uErr } = await sb.from('transactions').select('id, "timestamp", "driverName", "isSynced"').eq('isSynced', false).limit(10);
console.log(uErr?.message ?? '', JSON.stringify(unsynced, null, 2));

// 7. Check must_change_password for both profiles
console.log('\n=== Profiles ===');
const { data: profiles } = await sb.from('profiles').select('auth_user_id, role, display_name, must_change_password');
console.log(JSON.stringify(profiles, null, 2));

await sb.auth.signOut();
