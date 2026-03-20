-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 重置管理员账号并初始化司机账号
-- Reset admin account and initialize driver accounts with default passwords
--
-- ⚠️  安全提示 / SECURITY NOTICE:
-- This script sets WEAK default passwords. All seeded accounts have the
-- must_change_password flag set to TRUE so users are forced to set a new
-- password (min 8 chars, uppercase + lowercase + number) on first login.
-- Do NOT deploy to production without running migration
-- 20260320000000_admin_password_policy.sql first.
--
-- 默认账号 / Default credentials:
--   admin@bahati.com   → password: admin   (MUST change on first login)
--   feilong@bahati.com → password: feilong (MUST change on first login)
--   q@bahati.com       → password: q       (MUST change on first login)
--   sudi@bahati.com    → password: sudi    (MUST change on first login)
--   w@bahati.com       → password: w       (MUST change on first login)
--
-- 使用方法 / Usage:
--   Run this file in the Supabase SQL Editor (service_role context).
--   It is idempotent: safe to re-run — existing accounts are updated,
--   not duplicated.
-- ═══════════════════════════════════════════════════════════════════════════

-- Require pgcrypto for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Helper: create-or-reset one Supabase Auth user and its profile ───────────
--
-- Logic:
--   1. Look up auth.users by email.
--   2. If not found → INSERT a new confirmed user + identity record.
--   3. If found     → UPDATE the password hash (and confirm email if needed).
--   4. UPSERT public.profiles to link the auth user to its app role.
--
-- Returns the auth user UUID.
--
-- Security note: SECURITY DEFINER is required to write to auth.* tables.
-- This function is dropped at the end of this migration, so it is never
-- accessible outside of this controlled execution context.
CREATE OR REPLACE FUNCTION _bahati_seed_user(
  p_email        text,
  p_password     text,
  p_role         text,
  p_display_name text,
  p_driver_id    text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
BEGIN
  -- 1. Resolve existing user
  SELECT id INTO v_uid FROM auth.users WHERE email = p_email;

  IF NOT FOUND THEN
    -- 2a. Create new auth user (email already confirmed)
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      p_email,
      crypt(p_password, gen_salt('bf')),
      NOW(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      '{}'::jsonb,
      FALSE,
      NOW(),
      NOW(),
      '', '', '', ''
    ) RETURNING id INTO v_uid;

    -- 2b. Create the email identity record.
    --     GoTrue v2 (Supabase JS ≥ 2) uses (provider_id, provider) as PK.
    --     Older versions used a UUID id column. We detect the schema at runtime.
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name   = 'identities'
        AND column_name  = 'provider_id'
    ) THEN
      -- GoTrue v2 schema
      INSERT INTO auth.identities (
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        p_email,
        v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', p_email),
        'email',
        NOW(), NOW(), NOW()
      ) ON CONFLICT (provider_id, provider) DO NOTHING;
    ELSE
      -- Legacy GoTrue schema (UUID id PK)
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', p_email),
        'email',
        NOW(), NOW(), NOW()
      );
    END IF;

  ELSE
    -- 3. Reset password for an existing user (and confirm email if not yet done)
    UPDATE auth.users
    SET
      encrypted_password  = crypt(p_password, gen_salt('bf')),
      email_confirmed_at  = COALESCE(email_confirmed_at, NOW()),
      updated_at          = NOW()
    WHERE id = v_uid;
  END IF;

  -- 4. Upsert the application profile
  INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id, must_change_password)
  VALUES (v_uid, p_role, p_display_name, p_driver_id, TRUE)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET role                 = EXCLUDED.role,
        display_name         = EXCLUDED.display_name,
        driver_id            = EXCLUDED.driver_id,
        must_change_password = TRUE;

  RETURN v_uid;
END $$;

-- ─── Ensure driver records exist (idempotent) ─────────────────────────────────
INSERT INTO public.drivers (
  id, name, username, phone,
  "initialDebt", "remainingDebt", "dailyFloatingCoins",
  "vehicleInfo", status, "baseSalary", "commissionRate"
) VALUES
  ('D-FEILONG', 'Feilong', 'feilong', '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
  ('D-Q',       'Q',       'q',       '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
  ('D-SUDI',    'Sudi',    'sudi',    '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
  ('D-W',       'W',       'w',       '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05)
ON CONFLICT (id) DO NOTHING;

-- ─── Admin account ────────────────────────────────────────────────────────────
SELECT _bahati_seed_user('admin@bahati.com', 'admin',   'admin',  'Admin',   NULL);

-- ─── Driver accounts ─────────────────────────────────────────────────────────
SELECT _bahati_seed_user('feilong@bahati.com', 'feilong', 'driver', 'Feilong', 'D-FEILONG');
SELECT _bahati_seed_user('q@bahati.com',       'q',       'driver', 'Q',       'D-Q');
SELECT _bahati_seed_user('sudi@bahati.com',    'sudi',    'driver', 'Sudi',    'D-SUDI');
SELECT _bahati_seed_user('w@bahati.com',       'w',       'driver', 'W',       'D-W');

-- ─── Cleanup: drop the temporary helper function ──────────────────────────────
DROP FUNCTION IF EXISTS _bahati_seed_user(text, text, text, text, text);
