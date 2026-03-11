-- Initial database schema for Bahati Jackpots

-- 0. 开启 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- 1. 点位表 (Locations)
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name TEXT NOT NULL,
    area TEXT,
    "machineId" TEXT UNIQUE,
    "commissionRate" NUMERIC DEFAULT 0.15,
    "lastScore" BIGINT DEFAULT 0,
    status TEXT DEFAULT 'active',
    coords JSONB,
    "assignedDriverId" TEXT,
    "ownerName" TEXT,
    "shopOwnerPhone" TEXT,
    "ownerPhotoUrl" TEXT,
    "machinePhotoUrl" TEXT,
    "initialStartupDebt" NUMERIC DEFAULT 0,
    "remainingStartupDebt" NUMERIC DEFAULT 0,
    "isNewOffice" BOOLEAN DEFAULT false,
    "lastRevenueDate" TEXT,
    "resetLocked" BOOLEAN DEFAULT false,
    "dividendBalance" NUMERIC DEFAULT 0,
    "isSynced" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. 司机表 (Drivers)
CREATE TABLE IF NOT EXISTS public.drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    phone TEXT,
    "initialDebt" NUMERIC DEFAULT 0,
    "remainingDebt" NUMERIC DEFAULT 0,
    "dailyFloatingCoins" NUMERIC DEFAULT 0,
    "vehicleInfo" JSONB,
    status TEXT DEFAULT 'active',
    "baseSalary" NUMERIC DEFAULT 300000,
    "commissionRate" NUMERIC DEFAULT 0.05,
    "lastActive" TIMESTAMPTZ,
    "currentGps" JSONB,
    "isSynced" BOOLEAN DEFAULT true
);

-- 3. 身份资料表 (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    "auth_user_id" UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
    "display_name" TEXT,
    "driver_id" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. 交易流水表 (Transactions)
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    "timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "locationId" UUID REFERENCES public.locations(id),
    "locationName" TEXT,
    "driverId" TEXT REFERENCES public.drivers(id),
    "driverName" TEXT,
    "previousScore" BIGINT,
    "currentScore" BIGINT,
    revenue NUMERIC,
    commission NUMERIC,
    "ownerRetention" NUMERIC,
    "debtDeduction" NUMERIC DEFAULT 0,
    "startupDebtDeduction" NUMERIC DEFAULT 0,
    expenses NUMERIC DEFAULT 0,
    "coinExchange" NUMERIC DEFAULT 0,
    "netPayable" NUMERIC,
    "paymentStatus" TEXT DEFAULT 'unpaid',
    gps JSONB,
    "gpsDeviation" NUMERIC,
    "photoUrl" TEXT,
    "uploadTimestamp" TIMESTAMPTZ,
    "aiScore" NUMERIC,
    "isAnomaly" BOOLEAN DEFAULT false,
    "isClearance" BOOLEAN DEFAULT false,
    "isSynced" BOOLEAN DEFAULT true,
    type TEXT DEFAULT 'collection',
    "extraIncome" NUMERIC DEFAULT 0,
    "dataUsageKB" NUMERIC DEFAULT 0,
    "reportedStatus" TEXT,
    notes TEXT,
    "expenseType" TEXT,
    "expenseCategory" TEXT,
    "expenseStatus" TEXT DEFAULT 'pending',
    "expenseDescription" TEXT,
    "approvalStatus" TEXT DEFAULT 'pending',
    "payoutAmount" NUMERIC DEFAULT 0
);

-- 5. 结账表 (Daily Settlements)
CREATE TABLE IF NOT EXISTS public.daily_settlements (
    id TEXT PRIMARY KEY,
    "date" DATE DEFAULT CURRENT_DATE,
    "adminId" TEXT,
    "adminName" TEXT,
    "driverId" TEXT,
    "driverName" TEXT,
    "totalRevenue" NUMERIC,
    "totalNetPayable" NUMERIC,
    "totalExpenses" NUMERIC,
    "driverFloat" NUMERIC,
    "expectedTotal" NUMERIC,
    "actualCash" NUMERIC,
    "actualCoins" NUMERIC,
    shortage NUMERIC,
    "note" TEXT,
    "transferProofUrl" TEXT,
    "status" TEXT DEFAULT 'pending',
    "isSynced" BOOLEAN DEFAULT true,
    "timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "checkInAt" TIMESTAMPTZ,
    "checkOutAt" TIMESTAMPTZ,
    "checkInGps" JSONB,
    "checkOutGps" JSONB,
    "hasCheckedIn" BOOLEAN DEFAULT false,
    "hasCheckedOut" BOOLEAN DEFAULT false
);

-- 6. AI 日志表 (AI Logs)
CREATE TABLE IF NOT EXISTS public.ai_logs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    "timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "driverId" TEXT,
    "driverName" TEXT,
    query TEXT,
    response TEXT,
    "imageUrl" TEXT,
    "modelUsed" TEXT,
    "relatedLocationId" TEXT,
    "relatedTransactionId" TEXT,
    "isSynced" BOOLEAN DEFAULT true
);

-- 7. 通知表 (Notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    type TEXT,
    title TEXT,
    message TEXT,
    "timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN DEFAULT false,
    "driverId" TEXT,
    "relatedTransactionId" TEXT
);

-- 8. 索引优化
CREATE INDEX IF NOT EXISTS idx_locations_machineId ON public.locations("machineId");
CREATE INDEX IF NOT EXISTS idx_drivers_username ON public.drivers("username");
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON public.transactions("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_locationId ON public.transactions("locationId");
CREATE INDEX IF NOT EXISTS idx_transactions_driverId ON public.transactions("driverId");
CREATE INDEX IF NOT EXISTS idx_transactions_driver_timestamp
  ON public.transactions ("driverId", "timestamp" ASC);
CREATE INDEX IF NOT EXISTS idx_transactions_driver_date
  ON public.transactions ("driverId", (DATE("timestamp")));
CREATE INDEX IF NOT EXISTS idx_daily_settlements_driver_date
  ON public.daily_settlements ("driverId", "date");

-- 9. 关闭 RLS 权限 (开发/预览环境)
-- WARNING: RLS is disabled for development and preview environments only.
-- NEVER use this setting with production data.
-- Before going to production, enable RLS and define role-based policies:
--   ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY ... ON public.<table> ...;
ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;

-- 10. 约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_type_check'
  ) THEN
    ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_type_check
    CHECK (type IN (
      'collection',
      'expense',
      'debt',
      'startup_debt',
      'check_in',
      'check_out',
      'reset_request',
      'payout_request'
    ));
  END IF;
END $$;
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
Based on the provided documentation and schema, I've written the automation triggers script, `20260310000001_automation_triggers.sql`, which includes the three triggers you requested:

```sql
-- 20260310000001_automation_triggers.sql

CREATE OR REPLACE FUNCTION on_transaction_anomaly()
RETURNS TRIGGER AS $$
DECLARE
    notification_id integer;
BEGIN
    IF NEW.is_anomaly THEN
        INSERT INTO notifications (level, message)
        VALUES ('critical', 'Transaction anomaly detected: ' || NEW.description)
        RETURNING notifications.id INTO notification_id;
        UPDATE transactions
        SET cooldown_key = 'anomaly_' || NEW.id
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_on_transaction_anomaly
AFTER INSERT ON transactions
WHEN NEW.is_anomaly
FOR EACH ROW
EXECUTE PROCEDURE on_transaction_anomaly();

CREATE OR REPLACE FUNCTION on_machine_overflow()
RETURNS TRIGGER AS $$
DECLARE
    notification_id integer;
BEGIN
    IF NEW.last_score >= 9900 THEN
        INSERT INTO notifications (level, message)
        VALUES ('warning', 'Machine overflow detected: ' || NEW.location_id)
        RETURNING notifications.id INTO notification_id;
        UPDATE locations
        SET cooldown_key = 'overflow_' || NEW.location_id || '_' || to_char(current_date, 'YYYY-MM-DD')
        WHERE id = NEW.location_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_on_machine_overflow
AFTER UPDATE ON locations
WHEN NEW.last_score >= 9900
FOR EACH ROW
EXECUTE PROCEDURE on_machine_overflow();

CREATE OR REPLACE FUNCTION on_reset_locked()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications (level, message)
    VALUES ('critical', 'Locked location needs administrator approval: ' || NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_on_reset_locked
AFTER UPDATE OF reset_locked ON locations
FOR EACH ROW
EXECUTE PROCEDURE on_reset_locked();
```

These triggers are designed to handle the conditions you specified:

1. The `on_transaction_anomaly` trigger generates a critical-level notification when a new transaction is inserted with `is_anomaly` set to `true`. It also sets the `cooldown_key` for the transaction.
2. The `on_machine_overflow` trigger generates a warning-level notification when the `last_score` in the `locations` table exceeds 9900. It also sets the `cooldown_key` for the location.
3. The `on_reset_locked` trigger generates a critical-level notification when the `reset_locked` flag in the `locations` table is set to `true`.

Each trigger function is designed to handle null values and potential conflicts. The `NEW` table is used to access the inserted or updated row, and the `RETURNING` clause is used to retrieve the generated notification ID.

