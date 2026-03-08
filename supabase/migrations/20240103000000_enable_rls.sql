-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 启用行级安全（RLS）并配置角色策略
-- 适用场景：已存在数据库的增量升级，全库重建请使用 setup_db.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 辅助函数：SECURITY DEFINER 在 postgres 权限下执行，避免 profiles RLS 循环
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_my_driver_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT driver_id FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

-- ─── 启用 RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;

-- ─── 清除已有策略（幂等）────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- profiles
-- 读：用户只读自己；管理员可读全部。
-- 写：仅 service_role（Edge Function / 后台脚本）。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  USING (auth_user_id = auth.uid() OR public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- locations
-- 读：任意已认证用户。
-- 插入/删除：仅管理员。
-- 更新：管理员全部；司机只能更新自己负责的点位。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "locations_select"
  ON public.locations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "locations_insert"
  ON public.locations FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "locations_update"
  ON public.locations FOR UPDATE
  USING (
    public.get_my_role() = 'admin'
    OR "assignedDriverId" = public.get_my_driver_id()
  );

CREATE POLICY "locations_delete"
  ON public.locations FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- drivers
-- 读：任意已认证用户。
-- 插入/删除：仅管理员。
-- 更新：管理员全部；司机可更新自己的 GPS/lastActive。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "drivers_select"
  ON public.drivers FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "drivers_insert"
  ON public.drivers FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

-- 更新策略：管理员可更新任意司机；司机仅可更新自己的行（配合列级权限限制字段）。
CREATE POLICY "drivers_update"
  ON public.drivers FOR UPDATE
  USING (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'driver'
      AND id = public.get_my_driver_id()
    )
  );

-- 保护工资与债务等敏感字段：仅管理员（非 authenticated 普通用户）可更新。
REVOKE UPDATE (baseSalary, commissionRate, initialDebt, remainingDebt)
  ON public.drivers FROM authenticated;
CREATE POLICY "drivers_delete"
  ON public.drivers FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- transactions
-- 读：管理员全部；司机只读自己的。
-- 插入：管理员或司机自己（driverId 必须等于自己 driver_id）。
-- 更新/删除：仅管理员（审批/驳回）。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "transactions_select"
  ON public.transactions FOR SELECT
  USING (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
  );

CREATE POLICY "transactions_insert"
  ON public.transactions FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
  );

CREATE POLICY "transactions_update"
  ON public.transactions FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "transactions_delete"
  ON public.transactions FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- daily_settlements
-- 读：管理员全部；司机只读自己的。
-- 插入：管理员或司机自己（driverId 必须等于自己 driver_id）。
-- 更新/删除：仅管理员。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "settlements_select"
  ON public.daily_settlements FOR SELECT
  USING (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
  );

CREATE POLICY "settlements_insert"
  ON public.daily_settlements FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
  );

CREATE POLICY "settlements_update"
  ON public.daily_settlements FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "settlements_delete"
  ON public.daily_settlements FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- ai_logs
-- 读：管理员全部；司机只读自己的。
-- 插入：管理员或司机自己（driverId 必须等于自己 driver_id）。
-- 更新/删除：仅管理员。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "ai_logs_select"
  ON public.ai_logs FOR SELECT
  USING (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
  );

CREATE POLICY "ai_logs_insert"
  ON public.ai_logs FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
  );

CREATE POLICY "ai_logs_update"
  ON public.ai_logs FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "ai_logs_delete"
  ON public.ai_logs FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- notifications
-- 读：管理员全部；司机读自己的或系统通知（driverId IS NULL）。
-- 插入/删除：仅管理员。
-- 更新：管理员全部；司机可标记自己通知为已读。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
    OR "driverId" IS NULL
  );

CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
  );

CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE
  USING (public.get_my_role() = 'admin');
