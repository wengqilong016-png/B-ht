-- ═══════════════════════════════════════════════════════════════════════════
-- BAHATI JACKPOTS — 纯结构安装脚本（无需登录设置）
-- BAHATI JACKPOTS — Schema-only Setup (no Auth account creation)
--
-- 使用方法 / How to use:
--   1. 打开 Supabase Dashboard → SQL Editor
--   2. 将此文件全部内容复制粘贴进去
--   3. 点击 "Run" 执行
--
-- ✅ 此脚本包含：
--      - 所有表结构（locations / drivers / profiles / transactions 等）
--      - 索引、RLS 策略、触发器、辅助函数
--      - 司机基础数据（public.drivers）
--
-- ❌ 此脚本不包含：
--      - 任何 Supabase Auth 账号创建（不碰 auth.users）
--      - 密码设置
--
-- 👉 添加账号的方法：
--      Supabase Dashboard → Authentication → Users → "Invite user" 或 "Add user"
--      创建账号后，在 SQL Editor 运行以下语句绑定角色（替换 <AUTH_USER_ID> 和 <DRIVER_ID>）：
--
--      -- 管理员示例：
--      INSERT INTO public.profiles (auth_user_id, role, display_name, must_change_password)
--      VALUES ('<AUTH_USER_ID>', 'admin', 'Admin', false)
--      ON CONFLICT (auth_user_id) DO UPDATE
--          SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
--
--      -- 司机示例：
--      INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id, must_change_password)
--      VALUES ('<AUTH_USER_ID>', 'driver', 'Soudhamisi', 'D-SOUDA', false)
--      ON CONFLICT (auth_user_id) DO UPDATE
--          SET role = EXCLUDED.role, display_name = EXCLUDED.display_name,
--              driver_id = EXCLUDED.driver_id;
--
-- ⚠️  注意：此脚本会先删除并重建所有表。如果你已有数据，请先备份！
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0: 扩展 / Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: 清除旧表（如果存在）/ Drop old tables if they exist
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.location_change_requests CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.ai_logs CASCADE;
DROP TABLE IF EXISTS public.daily_settlements CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.drivers CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;

-- Drop old helper functions
DROP FUNCTION IF EXISTS public.get_my_role() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_driver_id() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.apply_location_change_request(uuid, boolean, text) CASCADE;
DROP FUNCTION IF EXISTS public.clear_my_must_change_password() CASCADE;

-- Drop old triggers / trigger functions
DROP FUNCTION IF EXISTS public.on_transaction_anomaly() CASCADE;
DROP FUNCTION IF EXISTS public.on_machine_overflow() CASCADE;
DROP FUNCTION IF EXISTS public.on_reset_locked() CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: 建表 / Create tables
-- ─────────────────────────────────────────────────────────────────────────────

-- 2-1. 点位表 Locations
CREATE TABLE public.locations (
    id                     UUID        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name                   TEXT        NOT NULL,
    area                   TEXT,
    "machineId"            TEXT        UNIQUE,
    "commissionRate"       NUMERIC     DEFAULT 0.15,
    "lastScore"            BIGINT      DEFAULT 0,
    status                 TEXT        DEFAULT 'active',
    coords                 JSONB,
    "assignedDriverId"     TEXT,
    "ownerName"            TEXT,
    "shopOwnerPhone"       TEXT,
    "ownerPhotoUrl"        TEXT,
    "machinePhotoUrl"      TEXT,
    "initialStartupDebt"   NUMERIC     DEFAULT 0,
    "remainingStartupDebt" NUMERIC     DEFAULT 0,
    "isNewOffice"          BOOLEAN     DEFAULT false,
    "lastRevenueDate"      TEXT,
    "resetLocked"          BOOLEAN     DEFAULT false,
    "dividendBalance"      NUMERIC     DEFAULT 0,
    "isSynced"             BOOLEAN     DEFAULT true,
    "createdAt"            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2-2. 司机表 Drivers
CREATE TABLE public.drivers (
    id                   TEXT        PRIMARY KEY,
    name                 TEXT        NOT NULL,
    username             TEXT        UNIQUE NOT NULL,
    phone                TEXT,
    "initialDebt"        NUMERIC     DEFAULT 0,
    "remainingDebt"      NUMERIC     DEFAULT 0,
    "dailyFloatingCoins" NUMERIC     DEFAULT 0,
    "vehicleInfo"        JSONB,
    status               TEXT        DEFAULT 'active',
    "baseSalary"         NUMERIC     DEFAULT 300000,
    "commissionRate"     NUMERIC     DEFAULT 0.05,
    "lastActive"         TIMESTAMPTZ,
    "currentGps"         JSONB,
    "isSynced"           BOOLEAN     DEFAULT true
);

-- 2-3. 用户身份资料表 Profiles（links auth.users → app role）
CREATE TABLE public.profiles (
    auth_user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role                 TEXT        NOT NULL CHECK (role IN ('admin', 'driver')),
    display_name         TEXT,
    driver_id            TEXT,
    must_change_password BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2-4. 交易流水表 Transactions
CREATE TABLE public.transactions (
    id                     TEXT        PRIMARY KEY,
    "timestamp"            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "locationId"           UUID        REFERENCES public.locations(id),
    "locationName"         TEXT,
    "driverId"             TEXT        REFERENCES public.drivers(id),
    "driverName"           TEXT,
    "previousScore"        BIGINT,
    "currentScore"         BIGINT,
    revenue                NUMERIC,
    commission             NUMERIC,
    "ownerRetention"       NUMERIC,
    "debtDeduction"        NUMERIC     DEFAULT 0,
    "startupDebtDeduction" NUMERIC     DEFAULT 0,
    expenses               NUMERIC     DEFAULT 0,
    "coinExchange"         NUMERIC     DEFAULT 0,
    "netPayable"           NUMERIC,
    "paymentStatus"        TEXT        DEFAULT 'unpaid',
    gps                    JSONB,
    "gpsDeviation"         NUMERIC,
    "photoUrl"             TEXT,
    "uploadTimestamp"      TIMESTAMPTZ,
    "aiScore"              NUMERIC,
    "isAnomaly"            BOOLEAN     DEFAULT false,
    "isClearance"          BOOLEAN     DEFAULT false,
    "isSynced"             BOOLEAN     DEFAULT true,
    type                   TEXT        DEFAULT 'collection',
    "extraIncome"          NUMERIC     DEFAULT 0,
    "dataUsageKB"          NUMERIC     DEFAULT 0,
    "reportedStatus"       TEXT,
    notes                  TEXT,
    "expenseType"          TEXT,
    "expenseCategory"      TEXT,
    "expenseStatus"        TEXT        DEFAULT 'pending',
    "expenseDescription"   TEXT,
    "approvalStatus"       TEXT        DEFAULT 'pending',
    "payoutAmount"         NUMERIC     DEFAULT 0,
    CONSTRAINT transactions_type_check CHECK (type IN (
        'collection', 'expense', 'debt', 'startup_debt',
        'check_in', 'check_out', 'reset_request', 'payout_request'
    ))
);

-- 2-5. 结账表 Daily Settlements
CREATE TABLE public.daily_settlements (
    id               TEXT        PRIMARY KEY,
    "date"           DATE        DEFAULT CURRENT_DATE,
    "adminId"        TEXT,
    "adminName"      TEXT,
    "driverId"       TEXT,
    "driverName"     TEXT,
    "totalRevenue"   NUMERIC,
    "totalNetPayable" NUMERIC,
    "totalExpenses"  NUMERIC,
    "driverFloat"    NUMERIC,
    "expectedTotal"  NUMERIC,
    "actualCash"     NUMERIC,
    "actualCoins"    NUMERIC,
    shortage         NUMERIC,
    note             TEXT,
    "transferProofUrl" TEXT,
    status           TEXT        DEFAULT 'pending',
    "isSynced"       BOOLEAN     DEFAULT true,
    "timestamp"      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "checkInAt"      TIMESTAMPTZ,
    "checkOutAt"     TIMESTAMPTZ,
    "checkInGps"     JSONB,
    "checkOutGps"    JSONB,
    "hasCheckedIn"   BOOLEAN     DEFAULT false,
    "hasCheckedOut"  BOOLEAN     DEFAULT false
);

-- 2-6. AI 日志表 AI Logs
CREATE TABLE public.ai_logs (
    id                     UUID        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    "timestamp"            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "driverId"             TEXT,
    "driverName"           TEXT,
    query                  TEXT,
    response               TEXT,
    "imageUrl"             TEXT,
    "modelUsed"            TEXT,
    "relatedLocationId"    TEXT,
    "relatedTransactionId" TEXT,
    "isSynced"             BOOLEAN     DEFAULT true
);

-- 2-7. 通知表 Notifications
CREATE TABLE public.notifications (
    id                     UUID        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    type                   TEXT,
    title                  TEXT,
    message                TEXT,
    "timestamp"            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "isRead"               BOOLEAN     DEFAULT false,
    "driverId"             TEXT,
    "relatedTransactionId" TEXT
);

-- 2-8. 点位变更申请表 Location Change Requests
CREATE TABLE public.location_change_requests (
    id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id               UUID        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    requested_by_auth_user_id UUID        NOT NULL REFERENCES auth.users(id),
    requested_by_driver_id    TEXT,
    status                    TEXT        NOT NULL DEFAULT 'pending'
                                          CHECK (status IN ('pending', 'approved', 'rejected')),
    reason                    TEXT,
    patch                     JSONB       NOT NULL DEFAULT '{}',
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at               TIMESTAMPTZ,
    reviewed_by_auth_user_id  UUID        REFERENCES auth.users(id),
    review_note               TEXT
);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: 索引 / Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_locations_machineId            ON public.locations("machineId");
CREATE INDEX idx_drivers_username               ON public.drivers("username");
CREATE INDEX idx_profiles_role                  ON public.profiles(role);
CREATE INDEX idx_transactions_timestamp         ON public.transactions("timestamp" DESC);
CREATE INDEX idx_transactions_locationId        ON public.transactions("locationId");
CREATE INDEX idx_transactions_driverId          ON public.transactions("driverId");
CREATE INDEX idx_transactions_driver_timestamp  ON public.transactions("driverId", "timestamp" ASC);
-- ✅ 使用 ::date 类型转换而非 DATE() 函数，避免 42P17 IMMUTABLE 报错
CREATE INDEX idx_transactions_driver_date       ON public.transactions("driverId", ("timestamp"::date));
CREATE INDEX idx_daily_settlements_driver_date  ON public.daily_settlements("driverId", "date");
CREATE INDEX idx_lcr_status_created_at          ON public.location_change_requests(status, created_at DESC);
CREATE INDEX idx_lcr_location_id_created_at     ON public.location_change_requests(location_id, created_at DESC);
CREATE INDEX idx_lcr_requester                  ON public.location_change_requests(requested_by_auth_user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: 辅助函数 / Helper functions
-- ─────────────────────────────────────────────────────────────────────────────

-- 4-1. 获取当前用户角色
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

-- 4-2. 获取当前用户绑定的司机 ID
CREATE OR REPLACE FUNCTION public.get_my_driver_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT driver_id FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

-- 4-3. 判断当前用户是否为管理员
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean STABLE SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
    _is_admin boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid() AND role = 'admin'
    ) INTO _is_admin;
    RETURN coalesce(_is_admin, false);
END;
$$;

-- 4-4. 清除当前用户的"强制修改密码"标志
CREATE OR REPLACE FUNCTION public.clear_my_must_change_password()
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE public.profiles
    SET must_change_password = FALSE
    WHERE auth_user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.clear_my_must_change_password() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_my_must_change_password() TO authenticated;

-- 4-5. 管理员审批点位变更申请
CREATE OR REPLACE FUNCTION public.apply_location_change_request(
    request_id uuid,
    approve    boolean,
    note       text DEFAULT NULL
)
RETURNS void SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
    _req   record;
    _patch jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Permission denied: caller is not an admin';
    END IF;

    SELECT * INTO _req
    FROM public.location_change_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request % not found or already processed', request_id;
    END IF;

    _patch := _req.patch;

    IF approve THEN
        UPDATE public.locations SET
            name                   = COALESCE(_patch->>'name',               name),
            area                   = COALESCE(_patch->>'area',               area),
            "machineId"            = COALESCE(_patch->>'machineId',          "machineId"),
            "ownerName"            = COALESCE(_patch->>'ownerName',          "ownerName"),
            "shopOwnerPhone"       = COALESCE(_patch->>'shopOwnerPhone',     "shopOwnerPhone"),
            "ownerPhotoUrl"        = COALESCE(_patch->>'ownerPhotoUrl',      "ownerPhotoUrl"),
            "machinePhotoUrl"      = COALESCE(_patch->>'machinePhotoUrl',    "machinePhotoUrl"),
            "assignedDriverId"     = COALESCE(_patch->>'assignedDriverId',   "assignedDriverId"),
            status                 = COALESCE(_patch->>'status',             status),
            "lastRevenueDate"      = COALESCE(_patch->>'lastRevenueDate',    "lastRevenueDate"),
            "commissionRate"       = CASE WHEN _patch ? 'commissionRate'
                                          THEN (_patch->>'commissionRate')::numeric
                                          ELSE "commissionRate" END,
            "initialStartupDebt"   = CASE WHEN _patch ? 'initialStartupDebt'
                                          THEN (_patch->>'initialStartupDebt')::numeric
                                          ELSE "initialStartupDebt" END,
            "remainingStartupDebt" = CASE WHEN _patch ? 'remainingStartupDebt'
                                          THEN (_patch->>'remainingStartupDebt')::numeric
                                          ELSE "remainingStartupDebt" END,
            "isNewOffice"          = CASE WHEN _patch ? 'isNewOffice'
                                          THEN (_patch->>'isNewOffice')::boolean
                                          ELSE "isNewOffice" END,
            coords                 = CASE WHEN _patch ? 'coords'
                                          THEN _patch->'coords'
                                          ELSE coords END,
            "isSynced"             = false
        WHERE id = _req.location_id;

        UPDATE public.location_change_requests SET
            status                   = 'approved',
            reviewed_at              = now(),
            reviewed_by_auth_user_id = auth.uid(),
            review_note              = note
        WHERE id = request_id;
    ELSE
        UPDATE public.location_change_requests SET
            status                   = 'rejected',
            reviewed_at              = now(),
            reviewed_by_auth_user_id = auth.uid(),
            review_note              = note
        WHERE id = request_id;
    END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: 行级安全策略 / Row Level Security (RLS) Policies
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.locations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_change_requests ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select"
    ON public.profiles FOR SELECT
    USING (auth_user_id = auth.uid() OR public.get_my_role() = 'admin');

-- locations
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

-- drivers
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
        OR (public.get_my_role() = 'driver' AND id = public.get_my_driver_id())
    );

REVOKE UPDATE ("baseSalary", "commissionRate", "initialDebt", "remainingDebt")
    ON public.drivers FROM authenticated;

CREATE POLICY "drivers_delete"
    ON public.drivers FOR DELETE
    USING (public.get_my_role() = 'admin');

-- transactions
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

-- daily_settlements
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

-- ai_logs
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

-- notifications
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

-- location_change_requests
CREATE POLICY "lcr_drivers_insert"
    ON public.location_change_requests FOR INSERT
    TO authenticated
    WITH CHECK (requested_by_auth_user_id = auth.uid());

CREATE POLICY "lcr_drivers_select"
    ON public.location_change_requests FOR SELECT
    TO authenticated
    USING (
        requested_by_auth_user_id = auth.uid()
        OR public.is_admin()
    );

CREATE POLICY "lcr_admins_update"
    ON public.location_change_requests FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: 自动触发器 / Automation triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- 6-1. 异常交易通知
CREATE OR REPLACE FUNCTION public.on_transaction_anomaly()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (type, title, message, "relatedTransactionId", "driverId")
    VALUES (
        'anomaly',
        'Transaction anomaly detected',
        COALESCE(NEW.notes, 'Anomaly flagged on transaction ' || NEW.id),
        NEW.id,
        NEW."driverId"
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_on_transaction_anomaly ON public.transactions;
CREATE TRIGGER trigger_on_transaction_anomaly
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW
WHEN (NEW."isAnomaly" IS TRUE)
EXECUTE FUNCTION public.on_transaction_anomaly();

-- 6-2. 机器分数溢出通知
CREATE OR REPLACE FUNCTION public.on_machine_overflow()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (type, title, message)
    VALUES (
        'overflow',
        'Machine near score overflow',
        'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') lastScore=' || NEW."lastScore"::text || ' is near overflow (≥9900).'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_on_machine_overflow ON public.locations;
CREATE TRIGGER trigger_on_machine_overflow
AFTER UPDATE OF "lastScore" ON public.locations
FOR EACH ROW
WHEN (NEW."lastScore" >= 9900)
EXECUTE FUNCTION public.on_machine_overflow();

-- 6-3. 重置锁定提醒
CREATE OR REPLACE FUNCTION public.on_reset_locked()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."resetLocked" IS TRUE AND (OLD."resetLocked" IS DISTINCT FROM TRUE) THEN
        INSERT INTO public.notifications (type, title, message)
        VALUES (
            'reset_locked',
            'Location locked – approval required',
            'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') has been locked and requires administrator approval to reset.'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_on_reset_locked ON public.locations;
CREATE TRIGGER trigger_on_reset_locked
AFTER UPDATE OF "resetLocked" ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.on_reset_locked();


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: 初始数据 — 司机记录 / Seed data — Driver records
-- （不涉及 Auth，可安全插入）
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.drivers (
    id, name, username, phone,
    "initialDebt", "remainingDebt", "dailyFloatingCoins",
    "vehicleInfo", status, "baseSalary", "commissionRate"
) VALUES
    ('D-SOUDA',   'Soudhamisi', 'soudhamisi302',  '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-DULLAH',  'Dullah',     'dullahchimbu18', '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-JKOMBO',  'Jkombo',     'jkombo495',      '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-MALIKI',  'Maliki',     'malikixking',    '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-NURDIN',  'Nurdin',     'nurdinyussuph',  '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-RHAMIDU', 'Rhamidu',    'rhamidu433',     '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-MTORO',   'Mtoro',      'mtororamadhan2', '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: 验证结果 / Verify results
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'tables' AS check_type, count(*)::text AS result
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'locations','drivers','profiles','transactions',
    'daily_settlements','ai_logs','notifications','location_change_requests'
  )
UNION ALL
SELECT 'drivers', count(*)::text FROM public.drivers
UNION ALL
SELECT 'indexes', count(*)::text
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%';

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ 结构安装完成！/ Schema setup complete!
--
-- 下一步 / Next steps:
--   1. 前往 Supabase Dashboard → Authentication → Users
--   2. 点击 "Add user" → 输入邮箱 + 密码 → 创建账号
--   3. 在 SQL Editor 中运行 INSERT INTO public.profiles ... 绑定角色
--      （模板见文件顶部注释）
-- ═══════════════════════════════════════════════════════════════════════════
