-- 0. 开启 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- 1. 彻底清理
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.daily_settlements CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.drivers CASCADE;
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
    "isSynced" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. 司机表 (Drivers)
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

-- 4. 交易流水表 (Transactions)
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
    "isSynced" BOOLEAN DEFAULT true,
    type TEXT DEFAULT 'collection',
    "extraIncome" NUMERIC DEFAULT 0,
    "dataUsageKB" NUMERIC DEFAULT 0,
    "reportedStatus" TEXT,
    notes TEXT,
    "expenseType" TEXT,
    "expenseCategory" TEXT,
    "expenseStatus" TEXT DEFAULT 'pending',
    "expenseDescription" TEXT
);

-- 5. 结账表 (Daily Settlements)
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
    "timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. AI 日志表 (AI Logs)
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

-- 7. 索引优化
CREATE INDEX IF NOT EXISTS idx_locations_assignedDriverId ON public.locations("assignedDriverId");
CREATE INDEX IF NOT EXISTS idx_transactions_driverId ON public.transactions("driverId");
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON public.transactions("timestamp" DESC);

-- 8. 开启 RLS
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- 9. 定义安全策略 (Policy)
-- 注意: 由于我们目前使用 ANON KEY + 前端手动过滤角色，我们采用简化的策略。
-- 未来如果接入 Supabase Auth，可以使用 auth.uid()。

-- 允许匿名访问进行开发测试，但在生产环境建议通过 API 密钥权限控制。
CREATE POLICY "Enable all for anon" ON public.locations FOR ALL USING (true);
CREATE POLICY "Enable all for anon" ON public.drivers FOR ALL USING (true);
CREATE POLICY "Enable all for anon" ON public.transactions FOR ALL USING (true);
CREATE POLICY "Enable all for anon" ON public.daily_settlements FOR ALL USING (true);
CREATE POLICY "Enable all for anon" ON public.ai_logs FOR ALL USING (true);

-- 10. 创建批量同步函数 (RPC)
CREATE OR REPLACE FUNCTION public.sync_transactions(items jsonb)
RETURNS void AS $$
BEGIN
    INSERT INTO public.transactions (
        id, timestamp, "locationId", "locationName", "driverId", "driverName",
        "previousScore", "currentScore", revenue, commission, "ownerRetention",
        "debtDeduction", "startupDebtDeduction", expenses, "coinExchange", "netPayable",
        "paymentStatus", gps, "photoUrl", type, "expenseType", "expenseCategory", "expenseStatus"
    )
    SELECT 
        (value->>'id'), 
        (value->>'timestamp')::timestamptz,
        (value->>'locationId')::uuid,
        (value->>'locationName'),
        (value->>'driverId'),
        (value->>'driverName'),
        (value->>'previousScore')::bigint,
        (value->>'currentScore')::bigint,
        (value->>'revenue')::numeric,
        (value->>'commission')::numeric,
        (value->>'ownerRetention')::numeric,
        (value->>'debtDeduction')::numeric,
        (value->>'startupDebtDeduction')::numeric,
        (value->>'expenses')::numeric,
        (value->>'coinExchange')::numeric,
        (value->>'netPayable')::numeric,
        (value->>'paymentStatus'),
        (value->'gps'),
        (value->>'photoUrl'),
        (value->>'type'),
        (value->>'expenseType'),
        (value->>'expenseCategory'),
        (value->>'expenseStatus')
    FROM jsonb_array_elements(items)
    ON CONFLICT (id) DO UPDATE SET
        "paymentStatus" = EXCLUDED."paymentStatus",
        "expenseStatus" = EXCLUDED."expenseStatus",
        "isSynced" = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
