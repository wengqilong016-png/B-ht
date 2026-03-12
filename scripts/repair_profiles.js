#!/usr/bin/env node
/**
 * repair_profiles.js — 自动修复 public.profiles 表
 * Auto-repair public.profiles for all existing Supabase Auth users.
 *
 * 使用场景 / When to use:
 *   运行 setup_db.sql 或 fix_rls_safe.sql 后 profiles 表被清空，
 *   导致所有用户登录提示 "Account exists but profile is not provisioned"。
 *
 * 前置条件 / Prerequisites:
 *   - Node.js ≥ 18
 *   - @supabase/supabase-js installed  (npm ci)
 *   - SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 必须通过环境变量传入
 *     （service_role key 才有权限读写 auth.users / admin API）
 *
 * 使用方法 / Usage:
 *   export SUPABASE_URL="https://<project-ref>.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   node scripts/repair_profiles.js
 *
 * 可选 / Optional:
 *   --dry-run   仅打印将要执行的操作，不写入数据库
 *   --overwrite 强制覆盖已存在的 profiles 行（默认跳过）
 *
 * ⚠️  安全提示 / SECURITY NOTICE:
 *   - 不要把 service_role key 提交到版本库！请通过环境变量传入。
 *   - 执行后立即要求所有用户修改默认密码。
 *   - 确认 RLS 已正确配置（参见 setup_db.sql Section 10）。
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '❌  Missing environment variables.\n' +
    '   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.\n' +
    '   Example:\n' +
    '     export SUPABASE_URL="https://<ref>.supabase.co"\n' +
    '     export SUPABASE_SERVICE_ROLE_KEY="eyJ..."'
  );
  process.exit(1);
}

// Use service_role so the Admin API and auth.users are accessible
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emailPrefix(email) {
  return (email ?? '').split('@')[0].toLowerCase();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔧  Bahati Jackpots — profiles repair script`);
  if (DRY_RUN)   console.log('   ⚠️  DRY-RUN mode — no data will be written');
  if (OVERWRITE) console.log('   ⚠️  OVERWRITE mode — existing profiles will be updated');
  console.log('');

  // 1. Load all auth users via Admin API (paginated; Supabase max perPage is 1000)
  const authUsers = [];
  let page = 1;
  const PER_PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error('❌  Failed to list auth users:', error.message);
      process.exit(1);
    }
    if (!data.users?.length) break;
    authUsers.push(...data.users);
    if (data.users.length < PER_PAGE) break;
    page++;
  }
  console.log(`📋  Found ${authUsers.length} auth user(s)`);

  // 2. Load all drivers (for email-prefix → driver_id matching)
  const { data: drivers, error: driversError } = await supabase
    .from('drivers')
    .select('id, name, username');
  if (driversError) {
    console.error('❌  Failed to load drivers table:', driversError.message);
    process.exit(1);
  }
  const driverByUsername = new Map(
    (drivers ?? []).map(d => [d.username.toLowerCase(), d])
  );
  console.log(`🚗  Found ${driverByUsername.size} driver(s) for matching`);

  // 3. Load existing profiles (to detect what already exists)
  const { data: existingProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('auth_user_id');
  if (profilesError) {
    console.error('❌  Failed to load profiles table:', profilesError.message);
    process.exit(1);
  }
  const existingSet = new Set((existingProfiles ?? []).map(p => p.auth_user_id));
  console.log(`📑  Found ${existingSet.size} existing profile(s)\n`);

  // 4. Process each auth user
  const stats = { inserted: 0, skipped: 0, overwritten: 0, errors: 0 };

  for (const user of authUsers) {
    const pfx = emailPrefix(user.email);
    const driver = driverByUsername.get(pfx);

    let role, driverId, displayName;
    if (driver) {
      role        = 'driver';
      driverId    = driver.id;
      displayName = driver.name;
    } else {
      role        = 'admin';
      driverId    = null;
      displayName =
        user.user_metadata?.display_name ??
        user.user_metadata?.full_name ??
        pfx;
    }

    const alreadyExists = existingSet.has(user.id);

    if (alreadyExists && !OVERWRITE) {
      console.log(`  ⏭️  SKIP   ${user.email}  (profile already exists)`);
      stats.skipped++;
      continue;
    }

    const label = alreadyExists ? 'OVERWRITE' : 'INSERT';
    const icon  = alreadyExists ? '♻️ ' : '✅';
    console.log(`  ${icon} ${label}  ${user.email}  →  role=${role}${driverId ? ', driver_id=' + driverId : ''}`);

    if (!DRY_RUN) {
      const payload = {
        auth_user_id: user.id,
        role,
        display_name: displayName,
        driver_id: driverId,
      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'auth_user_id' });

      if (upsertError) {
        console.error(`     ❌  Error: ${upsertError.message}`);
        stats.errors++;
        continue;
      }
    }

    if (alreadyExists) stats.overwritten++;
    else               stats.inserted++;
  }

  // 5. Guarantee admin@bahati.com is always admin role
  const adminUser = authUsers.find(u => u.email === 'admin@bahati.com');
  if (adminUser) {
    console.log('\n🔑  Ensuring admin@bahati.com has role=admin ...');
    if (!DRY_RUN) {
      const { error: adminErr } = await supabase
        .from('profiles')
        .upsert(
          { auth_user_id: adminUser.id, role: 'admin', display_name: 'Admin', driver_id: null },
          { onConflict: 'auth_user_id' }
        );
      if (adminErr) {
        console.error('  ❌  Failed to guarantee admin profile:', adminErr.message);
      } else {
        console.log('  ✅  admin@bahati.com profile confirmed as admin');
      }
    } else {
      console.log('  (dry-run: would upsert admin profile)');
    }
  }

  // 6. Summary
  console.log('\n─────────────────────────────────────────────────');
  console.log(`✅  Inserted:    ${stats.inserted}`);
  console.log(`♻️   Overwritten: ${stats.overwritten}`);
  console.log(`⏭️   Skipped:     ${stats.skipped}`);
  if (stats.errors) console.log(`❌  Errors:      ${stats.errors}`);
  console.log('─────────────────────────────────────────────────');

  if (DRY_RUN) {
    console.log('\n⚠️  Dry-run complete — no data was written. Remove --dry-run to apply changes.');
  } else {
    console.log('\n🎉  Done! All auth users now have a profiles row.');
    console.log('\n⚠️  NEXT STEPS (security):');
    console.log('   1. Immediately ask all users to change their default password.');
    console.log('   2. Verify RLS policies are active (setup_db.sql Section 10).');
    console.log('   3. Review profiles in Supabase Dashboard → Table Editor → profiles.');
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
