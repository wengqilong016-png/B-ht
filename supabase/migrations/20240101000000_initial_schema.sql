-- Initial database schema for Bahati Jackpots.

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
  ON public.transactions ("driverId", ("timestamp"::date));
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
