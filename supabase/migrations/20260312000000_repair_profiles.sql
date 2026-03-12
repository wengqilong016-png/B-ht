-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 自动修复 public.profiles 表
-- Auto-repair public.profiles for all existing Supabase Auth users
--
-- 场景 / When to use:
--   运行 setup_db.sql 或 fix_rls_safe.sql 导致 profiles 表被清空/重建后，
--   所有用户登录提示 "Account exists but profile is not provisioned"。
--   此脚本遍历所有 auth.users，自动补齐 profiles 行。
--
--   Use this after setup_db.sql / fix_rls_safe.sql wiped public.profiles,
--   causing every login to fail with "profile not provisioned".
--
-- 匹配逻辑 / Matching logic:
--   1. 若 auth.users.email 的前缀（@ 之前部分）能匹配 public.drivers.username
--      → role='driver', driver_id=drivers.id
--   2. 否则 → role='admin', driver_id=NULL
--   3. 已存在的 profiles 行保留（ON CONFLICT DO NOTHING），不覆盖人工设置的角色。
--      若需强制更新，见下方注释中的替代写法。
--
-- 幂等性 / Idempotent:
--   可多次执行，已存在的 profiles 行不会被重复写入或破坏。
--
-- ⚠️  安全提示 / SECURITY NOTICE:
--   - 此脚本必须在 Supabase SQL Editor（service_role 上下文）中执行，
--     普通 anon/authenticated 角色没有权限读写 auth.users。
--   - 执行完毕后，请立刻要求所有账号（尤其是管理员）修改默认密码。
--   - 确认 RLS 策略已正确启用（参见 setup_db.sql Section 10）。
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r           RECORD;
  v_driver    RECORD;
  v_email_pfx TEXT;
  v_role      TEXT;
  v_driver_id TEXT;
  v_display   TEXT;
BEGIN
  FOR r IN
    SELECT id, email, raw_user_meta_data
    FROM auth.users
    WHERE deleted_at IS NULL   -- skip soft-deleted users
  LOOP
    -- Extract the part of the email before '@'
    v_email_pfx := split_part(r.email, '@', 1);

    -- Try to find a matching driver by username (case-insensitive)
    SELECT id, name
    INTO v_driver
    FROM public.drivers
    WHERE lower(username) = lower(v_email_pfx);

    IF FOUND THEN
      v_role      := 'driver';
      v_driver_id := v_driver.id;
      v_display   := v_driver.name;
    ELSE
      v_role      := 'admin';
      v_driver_id := NULL;
      -- Prefer display_name from user metadata, fall back to email prefix
      v_display   := COALESCE(
        r.raw_user_meta_data->>'display_name',
        r.raw_user_meta_data->>'full_name',
        v_email_pfx
      );
    END IF;

    -- Upsert profile row (skip existing rows — change DO NOTHING → DO UPDATE
    -- if you want to force-overwrite manually set roles)
    INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
    VALUES (r.id, v_role, v_display, v_driver_id)
    ON CONFLICT (auth_user_id) DO NOTHING;
    -- To force-overwrite every row, replace the line above with:
    -- ON CONFLICT (auth_user_id) DO UPDATE
    --   SET role         = EXCLUDED.role,
    --       display_name = EXCLUDED.display_name,
    --       driver_id    = EXCLUDED.driver_id;

  END LOOP;
END $$;

-- ─── Guarantee at least one admin profile ─────────────────────────────────────
-- If admin@bahati.com exists in auth.users but its profile was set to 'driver'
-- by the loop above (unlikely but possible if someone named a driver "admin"),
-- force-correct it to admin here.
DO $$
DECLARE
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'admin@bahati.com' LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
    VALUES (v_uid, 'admin', 'Admin', NULL)
    ON CONFLICT (auth_user_id) DO UPDATE
      SET role         = 'admin',
          display_name = COALESCE(public.profiles.display_name, 'Admin'),
          driver_id    = NULL;
  END IF;
END $$;

-- ─── Summary report ───────────────────────────────────────────────────────────
SELECT
  p.role,
  count(*) AS profile_count,
  string_agg(u.email, ', ' ORDER BY u.email) AS emails
FROM public.profiles p
JOIN auth.users u ON u.id = p.auth_user_id
GROUP BY p.role
ORDER BY p.role;
