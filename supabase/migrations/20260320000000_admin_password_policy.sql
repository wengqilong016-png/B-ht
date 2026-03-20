-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 管理员密码安全策略 — 强制首次登录修改密码
-- Admin password policy — enforce password change on first login
--
-- Changes:
--   1. Add must_change_password column to public.profiles (default FALSE).
--   2. Set must_change_password = TRUE for all admin-role accounts so they
--      are forced to replace the weak default "admin" password.
--   3. Create clear_my_must_change_password() — a SECURITY DEFINER helper
--      that lets the authenticated user clear only their own flag without
--      needing a broad UPDATE policy on the profiles table.
--
-- ⚠️  This migration is idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add the column if it does not already exist.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Force all admin accounts to change their password on next login.
--    (Seed passwords such as "admin" are intentionally weak.)
UPDATE public.profiles
  SET must_change_password = TRUE
WHERE role = 'admin';

-- 3. SECURITY DEFINER helper — allows any authenticated user to clear only
--    their own must_change_password flag, without requiring a permissive
--    UPDATE policy on profiles (which would expose role/driver_id to writes).
CREATE OR REPLACE FUNCTION public.clear_my_must_change_password()
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.profiles
  SET must_change_password = FALSE
  WHERE auth_user_id = auth.uid();
$$;

-- Grant EXECUTE to authenticated users only.
REVOKE EXECUTE ON FUNCTION public.clear_my_must_change_password() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_my_must_change_password() TO authenticated;
