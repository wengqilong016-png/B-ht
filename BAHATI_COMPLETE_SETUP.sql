-- ═══════════════════════════════════════════════════════════════════════════
-- BAHATI JACKPOTS — 完整数据库安装脚本
-- BAHATI JACKPOTS — Complete Database Setup Script
--
-- 使用方法 / How to use:
--   1. 打开 Supabase Dashboard → SQL Editor
--      Open Supabase Dashboard → SQL Editor
--   2. 将此文件全部内容复制粘贴进去
--      Copy-paste the entire contents of this file
--   3. 点击 "Run" 执行
--      Click "Run" to execute
--
-- ⚠️  注意：此脚本会先删除并重建所有表。如果你已有数据，请先备份！
-- ⚠️  WARNING: This script drops and recreates all tables. Back up your data first!
--
-- 账号列表 / Account credentials after running this script:
--   初始密码统一 / Initial password for ALL accounts: Bahati2024
--   ⚠️  所有账号首次登录时 APP 会强制要求修改密码！
--   ⚠️  The app forces a password change on FIRST login for every account!
--
--   管理员 Admin:  wengqilong016@gmail.com   (role: admin)
--   司机 D-SOUDA:  Soudhamisi302@gmail.com   (role: driver)
--   司机 D-DULLAH: dullahchimbu18@gmail.com  (role: driver)
--   司机 D-JKOMBO: jkombo495@gmail.com       (role: driver)
--   司机 D-MALIKI: Malikixking@gmail.com     (role: driver)
--   司机 D-NURDIN: Nurdinyussuph@gmail.com   (role: driver)
--   司机 D-RHAMIDU:Rhamidu433@gmail.com      (role: driver)
--   司机 D-MTORO:  mtororamadhan2@gmail.com  (role: driver)
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

-- Drop old triggers / trigger functions
DROP FUNCTION IF EXISTS public.on_transaction_anomaly() CASCADE;
DROP FUNCTION IF EXISTS public.on_machine_overflow() CASCADE;
DROP FUNCTION IF EXISTS public.on_reset_locked() CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: 建表 / Create tables
-- ─────────────────────────────────────────────────────────────────────────────

-- 2-1. 点位表 Locations
CREATE TABLE public.locations (
    id                    UUID        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name                  TEXT        NOT NULL,
    area                  TEXT,
    "machineId"           TEXT        UNIQUE,
    "commissionRate"      NUMERIC     DEFAULT 0.15,
    "lastScore"           BIGINT      DEFAULT 0,
    status                TEXT        DEFAULT 'active',
    coords                JSONB,
    "assignedDriverId"    TEXT,
    "ownerName"           TEXT,
    "shopOwnerPhone"      TEXT,
    "ownerPhotoUrl"       TEXT,
    "machinePhotoUrl"     TEXT,
    "initialStartupDebt"  NUMERIC     DEFAULT 0,
    "remainingStartupDebt" NUMERIC    DEFAULT 0,
    "isNewOffice"         BOOLEAN     DEFAULT false,
    "lastRevenueDate"     TEXT,
    "resetLocked"         BOOLEAN     DEFAULT false,
    "dividendBalance"     NUMERIC     DEFAULT 0,
    "isSynced"            BOOLEAN     DEFAULT true,
    "createdAt"           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2-2. 司机表 Drivers
CREATE TABLE public.drivers (
    id                    TEXT        PRIMARY KEY,
    name                  TEXT        NOT NULL,
    username              TEXT        UNIQUE NOT NULL,
    phone                 TEXT,
    "initialDebt"         NUMERIC     DEFAULT 0,
    "remainingDebt"       NUMERIC     DEFAULT 0,
    "dailyFloatingCoins"  NUMERIC     DEFAULT 0,
    "vehicleInfo"         JSONB,
    status                TEXT        DEFAULT 'active',
    "baseSalary"          NUMERIC     DEFAULT 300000,
    "commissionRate"      NUMERIC     DEFAULT 0.05,
    "lastActive"          TIMESTAMPTZ,
    "currentGps"          JSONB,
    "isSynced"            BOOLEAN     DEFAULT true
);

-- 2-3. 用户身份资料表 Profiles (links auth.users → app role)
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
    id                    TEXT        PRIMARY KEY,
    "timestamp"           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "locationId"          UUID        REFERENCES public.locations(id),
    "locationName"        TEXT,
    "driverId"            TEXT        REFERENCES public.drivers(id),
    "driverName"          TEXT,
    "previousScore"       BIGINT,
    "currentScore"        BIGINT,
    revenue               NUMERIC,
    commission            NUMERIC,
    "ownerRetention"      NUMERIC,
    "debtDeduction"       NUMERIC     DEFAULT 0,
    "startupDebtDeduction" NUMERIC    DEFAULT 0,
    expenses              NUMERIC     DEFAULT 0,
    "coinExchange"        NUMERIC     DEFAULT 0,
    "netPayable"          NUMERIC,
    "paymentStatus"       TEXT        DEFAULT 'unpaid',
    gps                   JSONB,
    "gpsDeviation"        NUMERIC,
    "photoUrl"            TEXT,
    "uploadTimestamp"     TIMESTAMPTZ,
    "aiScore"             NUMERIC,
    "isAnomaly"           BOOLEAN     DEFAULT false,
    "isClearance"         BOOLEAN     DEFAULT false,
    "isSynced"            BOOLEAN     DEFAULT true,
    type                  TEXT        DEFAULT 'collection',
    "extraIncome"         NUMERIC     DEFAULT 0,
    "dataUsageKB"         NUMERIC     DEFAULT 0,
    "reportedStatus"      TEXT,
    notes                 TEXT,
    "expenseType"         TEXT,
    "expenseCategory"     TEXT,
    "expenseStatus"       TEXT        DEFAULT 'pending',
    "expenseDescription"  TEXT,
    "approvalStatus"      TEXT        DEFAULT 'pending',
    "payoutAmount"        NUMERIC     DEFAULT 0,
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
CREATE INDEX idx_transactions_driver_date       ON public.transactions("driverId", (DATE("timestamp")));
CREATE INDEX idx_daily_settlements_driver_date  ON public.daily_settlements("driverId", "date");
CREATE INDEX idx_lcr_status_created_at          ON public.location_change_requests(status, created_at DESC);
CREATE INDEX idx_lcr_location_id_created_at     ON public.location_change_requests(location_id, created_at DESC);
CREATE INDEX idx_lcr_requester                  ON public.location_change_requests(requested_by_auth_user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: 辅助函数 / Helper functions
-- ─────────────────────────────────────────────────────────────────────────────

-- 4-1. 获取当前用户角色 / Get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

-- 4-2. 获取当前用户绑定的司机 ID / Get current user's linked driver ID
CREATE OR REPLACE FUNCTION public.get_my_driver_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT driver_id FROM public.profiles WHERE auth_user_id = auth.uid()
$$;

-- 4-3. 判断当前用户是否为管理员 / Is current user an admin?
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

-- 4-4. 清除当前用户的"强制修改密码"标志 / Clear must_change_password for current user
-- Called by the app after the user successfully sets a new password.
-- Uses SECURITY DEFINER so no permissive UPDATE policy is needed on profiles.
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

-- 4-4. 管理员审批点位变更申请 / Admin approves/rejects a location change request
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

-- Enable RLS on all tables
ALTER TABLE public.locations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_change_requests ENABLE ROW LEVEL SECURITY;

-- profiles: 用户只读自己；管理员可读全部 / Users read own; admins read all
CREATE POLICY "profiles_select"
    ON public.profiles FOR SELECT
    USING (auth_user_id = auth.uid() OR public.get_my_role() = 'admin');

-- locations: 任意已认证用户可读；管理员可增删；司机可更新自己负责的点位
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

-- drivers: 任意已认证用户可读；管理员可增删；司机可更新自己的记录
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

-- Protect sensitive financial fields: only admin can update these columns
REVOKE UPDATE ("baseSalary", "commissionRate", "initialDebt", "remainingDebt")
    ON public.drivers FROM authenticated;

CREATE POLICY "drivers_delete"
    ON public.drivers FOR DELETE
    USING (public.get_my_role() = 'admin');

-- transactions: 管理员可读全部；司机只读自己的
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

-- 6-1. 异常交易通知 / Transaction anomaly notification
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

-- 6-2. 机器分数溢出通知 / Machine score overflow notification
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

-- 6-3. 重置锁定提醒 / Reset-lock alert
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
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.drivers (
    id, name, username, phone,
    "initialDebt", "remainingDebt", "dailyFloatingCoins",
    "vehicleInfo", status, "baseSalary", "commissionRate"
) VALUES
    ('D-SOUDA',   'Soudhamisi',   'soudhamisi302',  '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-DULLAH',  'Dullah',       'dullahchimbu18', '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-JKOMBO',  'Jkombo',       'jkombo495',      '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-MALIKI',  'Maliki',       'malikixking',    '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-NURDIN',  'Nurdin',       'nurdinyussuph',  '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-RHAMIDU', 'Rhamidu',      'rhamidu433',     '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05),
    ('D-MTORO',   'Mtoro',        'mtororamadhan2', '', 0, 0, 10000, '{"model":"","plate":""}', 'active', 300000, 0.05)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: 初始数据 — 认证账号 / Seed data — Auth accounts
--
-- 此函数创建或重置 Supabase Auth 账号，并绑定 profiles 表
-- This function creates/resets Supabase Auth users and links them to profiles
-- ─────────────────────────────────────────────────────────────────────────────

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
    -- Check if user already exists
    SELECT id INTO v_uid FROM auth.users WHERE email = p_email;

    IF NOT FOUND THEN
        -- Create new confirmed user
        INSERT INTO auth.users (
            instance_id, id, aud, role, email,
            encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data,
            is_super_admin, created_at, updated_at,
            confirmation_token, email_change,
            email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated', 'authenticated',
            p_email,
            crypt(p_password, gen_salt('bf')),
            NOW(),
            jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
            '{}'::jsonb,
            FALSE, NOW(), NOW(),
            '', '', '', ''
        ) RETURNING id INTO v_uid;

        -- Create the identity record (supports both GoTrue v1 and v2)
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
        ) THEN
            -- GoTrue v2
            INSERT INTO auth.identities (
                provider_id, user_id, identity_data, provider,
                last_sign_in_at, created_at, updated_at
            ) VALUES (
                p_email, v_uid,
                jsonb_build_object('sub', v_uid::text, 'email', p_email),
                'email', NOW(), NOW(), NOW()
            ) ON CONFLICT (provider_id, provider) DO NOTHING;
        ELSE
            -- GoTrue v1
            INSERT INTO auth.identities (
                id, user_id, identity_data, provider,
                last_sign_in_at, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), v_uid,
                jsonb_build_object('sub', v_uid::text, 'email', p_email),
                'email', NOW(), NOW(), NOW()
            );
        END IF;
    ELSE
        -- Reset password for existing user
        UPDATE auth.users
        SET
            encrypted_password = crypt(p_password, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            updated_at         = NOW()
        WHERE id = v_uid;
    END IF;

    -- Upsert profile (must_change_password = TRUE forces password change on first login)
    INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id, must_change_password)
    VALUES (v_uid, p_role, p_display_name, p_driver_id, TRUE)
    ON CONFLICT (auth_user_id) DO UPDATE
        SET role                 = EXCLUDED.role,
            display_name         = EXCLUDED.display_name,
            driver_id            = EXCLUDED.driver_id,
            must_change_password = TRUE;

    RETURN v_uid;
END $$;

-- ─── 创建/重置真实生产账号 / Create or reset production accounts ──────────────
-- 初始密码 / Initial password: Bahati2024
-- APP 会在首次登录时强制要求修改密码（≥8位，含大小写字母和数字）
-- The app forces a password change on first login (≥8 chars, upper+lower+digit)

-- 管理员 / Admin
SELECT _bahati_seed_user('wengqilong016@gmail.com',  'Bahati2024', 'admin',  'Admin',      NULL);

-- 司机 / Drivers
SELECT _bahati_seed_user('Soudhamisi302@gmail.com',  'Bahati2024', 'driver', 'Soudhamisi', 'D-SOUDA');
SELECT _bahati_seed_user('dullahchimbu18@gmail.com', 'Bahati2024', 'driver', 'Dullah',     'D-DULLAH');
SELECT _bahati_seed_user('jkombo495@gmail.com',      'Bahati2024', 'driver', 'Jkombo',     'D-JKOMBO');
SELECT _bahati_seed_user('Malikixking@gmail.com',    'Bahati2024', 'driver', 'Maliki',     'D-MALIKI');
SELECT _bahati_seed_user('Nurdinyussuph@gmail.com',  'Bahati2024', 'driver', 'Nurdin',     'D-NURDIN');
SELECT _bahati_seed_user('Rhamidu433@gmail.com',     'Bahati2024', 'driver', 'Rhamidu',    'D-RHAMIDU');
SELECT _bahati_seed_user('mtororamadhan2@gmail.com', 'Bahati2024', 'driver', 'Mtoro',      'D-MTORO');

-- Cleanup temp function
DROP FUNCTION IF EXISTS _bahati_seed_user(text, text, text, text, text);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: 验证结果 / Verify results
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    p.role,
    count(*) AS account_count,
    string_agg(u.email, ', ' ORDER BY u.email) AS emails
FROM public.profiles p
JOIN auth.users u ON u.id = p.auth_user_id
GROUP BY p.role
ORDER BY p.role;

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ 安装完成！/ Setup complete!
--
-- 下一步 / Next steps:
--   1. 用上面的默认账号登录 APP 测试
--      Test login with the default credentials listed above
--   2. 立即修改所有账号的默认密码
--      Immediately change all default passwords
--   3. 在 Supabase Dashboard → Authentication → Users 中管理用户
--      Manage users in Supabase Dashboard → Authentication → Users
-- ═══════════════════════════════════════════════════════════════════════════
