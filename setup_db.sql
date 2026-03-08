-- 0. 开启 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- 1. 彻底清理
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.daily_settlements CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.drivers CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.ai_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;

-- 2. 点位表 (Locations)
CREATE TABLE public.locations (
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

-- 3. 司机表 (Drivers)
CREATE TABLE public.drivers (
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

-- 4. 身份资料表 (Profiles)
CREATE TABLE public.profiles (
    "auth_user_id" UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
    "display_name" TEXT,
    "driver_id" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. 交易流水表 (Transactions)
-- 注意: timestamp 和 date 是保留字，必须加引号
CREATE TABLE public.transactions (
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

-- 6. 结账表 (Daily Settlements)
CREATE TABLE public.daily_settlements (
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

    -- 签到/签退 (用于每日路线与考勤)
    "checkInAt" TIMESTAMPTZ,
    "checkOutAt" TIMESTAMPTZ,
    "checkInGps" JSONB,
    "checkOutGps" JSONB,
    "hasCheckedIn" BOOLEAN DEFAULT false,
    "hasCheckedOut" BOOLEAN DEFAULT false
);

-- 7. AI 日志表 (AI Logs)
CREATE TABLE public.ai_logs (
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

-- 8. 通知表 (Notifications)
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    type TEXT,
    title TEXT,
    message TEXT,
    "timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN DEFAULT false,
    "driverId" TEXT,
    "relatedTransactionId" TEXT
);

-- 9. 索引优化
CREATE INDEX IF NOT EXISTS idx_locations_machineId ON public.locations("machineId");
CREATE INDEX IF NOT EXISTS idx_drivers_username ON public.drivers("username");
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON public.transactions("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_locationId ON public.transactions("locationId");
CREATE INDEX IF NOT EXISTS idx_transactions_driverId ON public.transactions("driverId");

-- 路线/时间线性能优化
CREATE INDEX IF NOT EXISTS idx_transactions_driver_timestamp
  ON public.transactions ("driverId", "timestamp" ASC);
CREATE INDEX IF NOT EXISTS idx_transactions_driver_date
  ON public.transactions ("driverId", (DATE("timestamp")));

CREATE INDEX IF NOT EXISTS idx_daily_settlements_driver_date
  ON public.daily_settlements ("driverId", "date");

-- 10. 行级安全 RLS (Row Level Security)
-- SECURITY DEFINER 辅助函数在 postgres 权限下执行，避免 profiles 表 RLS 循环检查。

-- 获取当前登录用户的角色 ('admin' | 'driver' | NULL)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

-- 获取当前登录用户绑定的 driver_id (TEXT | NULL)
CREATE OR REPLACE FUNCTION public.get_my_driver_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT driver_id FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

-- ─── 启用 RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.locations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;

-- ─── 清除旧策略（全库重建时保持幂等）────────────────────────────────────────
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
-- 读：用户只能读自己；管理员可读全部。
-- 写：仅 service_role（Edge Function / 后台脚本）可操作，前端不可直接写。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  USING (auth_user_id = auth.uid() OR public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- locations
-- 读：任意已认证用户。
-- 插入/删除：仅管理员。
-- 更新：管理员可更新全部；司机只能更新自己负责的点位（分数/欠款/分红余额）。
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
-- 读：任意已认证用户（司机互相可见基本信息，管理端需要全量）。
-- 插入/删除：仅管理员。
-- 更新：管理员可更新全部；司机可更新自己的 GPS / lastActive。
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "drivers_select"
  ON public.drivers FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "drivers_insert"
  ON public.drivers FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "drivers_update"
  ON public.drivers FOR UPDATE
  USING (
    public.get_my_role() = 'admin'
    OR id = public.get_my_driver_id()
  );

CREATE POLICY "drivers_delete"
  ON public.drivers FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- transactions
-- 读：管理员看全部；司机只看自己的。
-- 插入：管理员或司机自己（driverId 必须等于自己的 driver_id）。
-- 更新/删除：仅管理员（审批、驳回等）。
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
-- 读：管理员看全部；司机只看自己的。
-- 插入：管理员或司机自己（driverId 必须等于自己的 driver_id）。
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
-- 读：管理员看全部；司机只看自己的。
-- 插入：管理员或司机自己（driverId 必须等于自己的 driver_id）。
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
-- 读：管理员看全部；司机看自己的通知（driverId 匹配）或系统通知（driverId 为空）。
-- 插入/删除：仅管理员。
-- 更新：管理员全部；司机可将自己的通知标记为已读（isRead）。
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

-- 11. 约束 (可选)
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

-- 12. 增量迁移 (Incremental Migration)
-- 如果数据库已存在，请运行以下语句补充新字段/索引/约束，无需重建表。
-- Run these if upgrading an existing database instead of doing a full rebuild.

-- Locations
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "machinePhotoUrl" TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "lastRevenueDate" TEXT;

-- Drivers
ALTER TABLE public.drivers DROP COLUMN IF EXISTS password;

CREATE TABLE IF NOT EXISTS public.profiles (
  "auth_user_id" UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
  "display_name" TEXT,
  "driver_id" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "display_name" TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "driver_id" TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "uploadTimestamp" TIMESTAMPTZ;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "aiScore" NUMERIC;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "isAnomaly" BOOLEAN DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "isClearance" BOOLEAN DEFAULT false;

-- Daily settlements (签到/签退)
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "checkInAt" TIMESTAMPTZ;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "checkOutAt" TIMESTAMPTZ;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "checkInGps" JSONB;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "checkOutGps" JSONB;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "hasCheckedIn" BOOLEAN DEFAULT false;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "hasCheckedOut" BOOLEAN DEFAULT false;

-- Indexes (safe to run repeatedly)
CREATE INDEX IF NOT EXISTS idx_transactions_driver_timestamp
  ON public.transactions ("driverId", "timestamp" ASC);
CREATE INDEX IF NOT EXISTS idx_transactions_driver_date
  ON public.transactions ("driverId", (DATE("timestamp")));
CREATE INDEX IF NOT EXISTS idx_daily_settlements_driver_date
  ON public.daily_settlements ("driverId", "date");

-- Constraint (safe-ish)
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

-- 12. New columns for approval pipeline, reset-lock, and dividend features
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT DEFAULT 'pending';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "payoutAmount" NUMERIC DEFAULT 0;

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "resetLocked" BOOLEAN DEFAULT false;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "dividendBalance" NUMERIC DEFAULT 0;

-- Update type constraint to include new transaction types (safe re-run)
DO $$
BEGIN
  -- Drop old constraint if it exists, then recreate with expanded values
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_type_check'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_type_check;
  END IF;

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
END $$;
