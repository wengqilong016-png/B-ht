-- 0. 启用必要的扩展 (防止 gen_random_uuid 报错)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. 清理旧表
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.daily_settlements CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.drivers CASCADE;
DROP TABLE IF EXISTS public.ai_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;

-- 2. 创建点位表 (Locations)
CREATE TABLE public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    area TEXT,
    "machineId" TEXT UNIQUE,
    "commissionRate" NUMERIC DEFAULT 0.15,
    "lastScore" BIGINT DEFAULT 0,
    status TEXT DEFAULT 'active',
    coords JSONB,
    "assignedDriverId" TEXT,
    "shopOwnerPhone" TEXT,
    "ownerPhotoUrl" TEXT,
    "initialStartupDebt" NUMERIC DEFAULT 0,
    "remainingStartupDebt" NUMERIC DEFAULT 0,
    "isNewOffice" BOOLEAN DEFAULT false,
    "isSynced" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- 3. 创建司机表 (Drivers)
CREATE TABLE public.drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
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

-- 4. 创建交易流水表 (Transactions)
CREATE TABLE public.transactions (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT now(),
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
    "photoUrl" TEXT,
    "isSynced" BOOLEAN DEFAULT true,
    type TEXT DEFAULT 'collection',
    "expenseType" TEXT,
    "expenseCategory" TEXT,
    "expenseStatus" TEXT DEFAULT 'pending',
    "expenseDescription" TEXT
);

-- 5. 创建结账表 (Daily Settlements)
CREATE TABLE public.daily_settlements (
    id TEXT PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
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
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- 6. 创建 AI 日志表 (AI Logs)
CREATE TABLE public.ai_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT now(),
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

-- 7. 创建通知表 (Notifications)
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT,
    title TEXT,
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    "isRead" BOOLEAN DEFAULT false,
    "driverId" TEXT,
    "relatedTransactionId" TEXT
);

-- 8. 关闭 RLS 权限 (开发测试阶段)
ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
