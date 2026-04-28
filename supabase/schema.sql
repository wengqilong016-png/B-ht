-- ═══════════════════════════════════════════════════════════════════════════
-- Bahati Jackpots — 完整生产 Schema（单文件版）
-- Complete Production Schema (single-file setup)
--
-- 使用方法 / Usage:
--   全新部署：在 Supabase Dashboard → SQL Editor 中运行此文件。
--   Fresh deployment: run this file in Supabase Dashboard → SQL Editor.
--
-- 覆盖范围 / Covers:
--   所有表、索引、辅助函数、RPC 函数、触发器、RLS 策略
--   All tables, indexes, helper functions, RPC functions, triggers, RLS policies
--
-- 幂等性 / Idempotent:
--   使用 IF NOT EXISTS / CREATE OR REPLACE，可安全重复运行。
--   Uses IF NOT EXISTS / CREATE OR REPLACE — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 扩展 / Extensions ────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── storage bucket / evidence uploads ───────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidence',
    'evidence',
    TRUE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Evidence uploads by authenticated users'
    ) THEN
        CREATE POLICY "Evidence uploads by authenticated users"
            ON storage.objects
            FOR INSERT
            TO authenticated
            WITH CHECK (bucket_id = 'evidence');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Evidence updates by authenticated users'
    ) THEN
        CREATE POLICY "Evidence updates by authenticated users"
            ON storage.objects
            FOR UPDATE
            TO authenticated
            USING (bucket_id = 'evidence')
            WITH CHECK (bucket_id = 'evidence');
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 表结构 / Tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ── drivers ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.drivers (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    username              TEXT NOT NULL UNIQUE,
    phone                 TEXT,
    status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive')),
    "baseSalary"          NUMERIC DEFAULT 300000,
    "commissionRate"      NUMERIC DEFAULT 0.05,
    "initialDebt"         NUMERIC DEFAULT 0,
    "remainingDebt"       NUMERIC DEFAULT 0,
    "dailyFloatingCoins"  NUMERIC DEFAULT 0,
    "vehicleInfo"         JSONB,
    "lastActive"          TIMESTAMPTZ,
    "currentGps"          JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── profiles ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
    auth_user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role                 TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
    display_name         TEXT,
    driver_id            TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── locations ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.locations (
    id                     UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name                   TEXT NOT NULL,
    area                   TEXT,
    "machineId"            TEXT UNIQUE,
    "commissionRate"       NUMERIC DEFAULT 0.15,
    "lastScore"            BIGINT DEFAULT 0,
    status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'inactive', 'maintenance', 'broken')),
    coords                 JSONB,
    "assignedDriverId"     TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    "ownerName"            TEXT,
    "shopOwnerPhone"       TEXT,
    "ownerPhotoUrl"        TEXT,
    "machinePhotoUrl"      TEXT,
    "initialStartupDebt"   NUMERIC DEFAULT 0,
    "remainingStartupDebt" NUMERIC DEFAULT 0,
    "isNewOffice"          BOOLEAN DEFAULT FALSE,
    "lastRevenueDate"      TEXT,
    "resetLocked"          BOOLEAN DEFAULT FALSE,
    "dividendBalance"      NUMERIC DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_relocated_at      TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.touch_location_relocation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.area IS DISTINCT FROM OLD.area
        OR NEW.coords IS DISTINCT FROM OLD.coords
    ) THEN
        NEW.last_relocated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_location_relocation_timestamp ON public.locations;
CREATE TRIGGER trg_touch_location_relocation_timestamp
    BEFORE UPDATE ON public.locations
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_location_relocation_timestamp();

-- ── transactions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transactions (
    id                     TEXT PRIMARY KEY,
    "timestamp"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "locationId"           UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    "locationName"         TEXT,
    "driverId"             TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    "driverName"           TEXT,
    "previousScore"        BIGINT,
    "currentScore"         BIGINT,
    revenue                NUMERIC,
    commission             NUMERIC,
    "ownerRetention"       NUMERIC,
    "debtDeduction"        NUMERIC DEFAULT 0,
    "startupDebtDeduction" NUMERIC DEFAULT 0,
    expenses               NUMERIC DEFAULT 0,
    "coinExchange"         NUMERIC DEFAULT 0,
    "netPayable"           NUMERIC,
    "paymentStatus"        TEXT DEFAULT 'unpaid',
    gps                    JSONB,
    "gpsDeviation"         NUMERIC,
    "photoUrl"             TEXT,
    "uploadTimestamp"      TIMESTAMPTZ,
    "aiScore"              NUMERIC,
    "isAnomaly"            BOOLEAN DEFAULT FALSE,
    "isClearance"          BOOLEAN DEFAULT FALSE,
    "isSynced"             BOOLEAN DEFAULT TRUE,
    type                   TEXT NOT NULL DEFAULT 'collection',
    "extraIncome"          NUMERIC DEFAULT 0,
    "dataUsageKB"          NUMERIC DEFAULT 0,
    "reportedStatus"       TEXT,
    notes                  TEXT,
    "expenseType"          TEXT,
    "expenseCategory"      TEXT,
    "expenseStatus"        TEXT DEFAULT 'pending',
    "expenseDescription"   TEXT,
    "approvalStatus"       TEXT DEFAULT 'pending',
    "payoutAmount"         NUMERIC DEFAULT 0,
    CONSTRAINT transactions_type_check CHECK (
        type IN (
            'collection',
            'expense',
            'debt',
            'startup_debt',
            'check_in',
            'check_out',
            'reset_request',
            'payout_request'
        )
    )
);

-- ── daily_settlements ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_settlements (
    id                  TEXT PRIMARY KEY,
    "date"              DATE DEFAULT CURRENT_DATE,
    "adminId"           TEXT,
    "adminName"         TEXT,
    "driverId"          TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    "driverName"        TEXT,
    "totalRevenue"      NUMERIC,
    "totalNetPayable"   NUMERIC,
    "totalExpenses"     NUMERIC,
    "driverFloat"       NUMERIC,
    "expectedTotal"     NUMERIC,
    "actualCash"        NUMERIC,
    "actualCoins"       NUMERIC,
    shortage            NUMERIC,
    note                TEXT,
    "transferProofUrl"  TEXT,
    status              TEXT DEFAULT 'pending',
    "isSynced"          BOOLEAN DEFAULT TRUE,
    "timestamp"         TIMESTAMPTZ DEFAULT NOW(),
    "checkInAt"         TIMESTAMPTZ,
    "checkOutAt"        TIMESTAMPTZ,
    "checkInGps"        JSONB,
    "checkOutGps"       JSONB,
    "hasCheckedIn"      BOOLEAN DEFAULT FALSE,
    "hasCheckedOut"     BOOLEAN DEFAULT FALSE
);

-- ── monthly_payrolls ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.monthly_payrolls (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "driverId"             TEXT NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    "driverName"           TEXT NOT NULL,
    month                  TEXT NOT NULL,
    "baseSalary"           NUMERIC NOT NULL DEFAULT 0,
    commission             NUMERIC NOT NULL DEFAULT 0,
    "privateLoanDeduction" NUMERIC NOT NULL DEFAULT 0,
    "shortageDeduction"    NUMERIC NOT NULL DEFAULT 0,
    "netPayable"           NUMERIC NOT NULL DEFAULT 0,
    "collectionCount"      INTEGER NOT NULL DEFAULT 0,
    "totalRevenue"         NUMERIC NOT NULL DEFAULT 0,
    status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'paid', 'cancelled')),
    "paymentMethod"        TEXT
                           CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('cash', 'bank_transfer', 'mobile_money', 'other')),
    "paymentProofUrl"      TEXT,
    note                   TEXT,
    "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "paidAt"               TIMESTAMPTZ,
    "paidBy"               TEXT,
    "paidByName"           TEXT,
    "isSynced"             BOOLEAN DEFAULT TRUE
);

-- ── location_change_requests ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.location_change_requests (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id               UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    requested_by_auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_by_driver_id    TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
    reason                    TEXT,
    patch                     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at               TIMESTAMPTZ,
    reviewed_by_auth_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_note               TEXT
);

-- ── ai_logs ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_logs (
    id                     UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    "timestamp"            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "driverId"             TEXT,
    "driverName"           TEXT,
    query                  TEXT,
    response               TEXT,
    "imageUrl"             TEXT,
    "modelUsed"            TEXT,
    "relatedLocationId"    TEXT,
    "relatedTransactionId" TEXT,
    "isSynced"             BOOLEAN DEFAULT TRUE
);

-- ── driver_flow_events ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.driver_flow_events (
    id              UUID PRIMARY KEY,
    driver_id       TEXT NOT NULL,
    flow_id         TEXT NOT NULL,
    draft_tx_id     TEXT,
    location_id     TEXT,
    step            TEXT NOT NULL CHECK (step IN (
                        'selection', 'capture', 'amounts', 'confirm', 'complete',
                        'reset_request', 'payout_request', 'office_loan', 'site_info'
                    )),
    event_name      TEXT NOT NULL,
    online_status   BOOLEAN NOT NULL DEFAULT FALSE,
    gps_permission  TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (gps_permission IN ('prompt', 'granted', 'denied', 'timeout', 'error', 'unknown')),
    has_photo       BOOLEAN NOT NULL DEFAULT FALSE,
    error_category  TEXT,
    duration_ms     INTEGER,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── notifications ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
    id                     UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    type                   TEXT,
    title                  TEXT,
    message                TEXT,
    "timestamp"            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "isRead"               BOOLEAN DEFAULT FALSE,
    "driverId"             TEXT,
    "relatedTransactionId" TEXT,
    "relatedLocationId"    UUID
);

-- ── support_cases ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_cases (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'open',
    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at           TIMESTAMPTZ,
    resolution_notes    TEXT,
    resolved_by         TEXT,
    resolved_at         TIMESTAMPTZ,
    resolution_outcome  TEXT
);

-- ── support_audit_log ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     TEXT,
    event_type  TEXT NOT NULL,
    actor_id    TEXT,
    payload     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── queue_health_reports ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.queue_health_reports (
    device_id           TEXT PRIMARY KEY,
    driver_id           TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    driver_name         TEXT,
    pending_count       INTEGER NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
    retry_waiting_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_waiting_count >= 0),
    dead_letter_count   INTEGER NOT NULL DEFAULT 0 CHECK (dead_letter_count >= 0),
    sync_state          TEXT NOT NULL DEFAULT 'idle'
                        CHECK (sync_state IN ('idle', 'syncing', 'degraded', 'offline')),
    last_error          TEXT,
    app_version         TEXT,
    metadata            JSONB,
    reported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── health_alerts ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.health_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type  TEXT NOT NULL
                CHECK (alert_type IN (
                    'dead_letter_items',
                    'stale_snapshot',
                    'high_retry_waiting',
                    'high_pending'
                )),
    severity    TEXT NOT NULL
                CHECK (severity IN ('critical', 'warning', 'info')),
    device_id   TEXT,
    driver_id   TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    driver_name TEXT,
    payload     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 约束 / Constraints
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.support_cases'::regclass AND conname = 'support_cases_status_check') THEN
        ALTER TABLE public.support_cases ADD CONSTRAINT support_cases_status_check
            CHECK (status IN ('open', 'closed'));
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.support_cases'::regclass AND conname = 'support_cases_resolution_outcome_check') THEN
        ALTER TABLE public.support_cases ADD CONSTRAINT support_cases_resolution_outcome_check
            CHECK (
                resolution_outcome IS NULL OR resolution_outcome IN (
                    'fixed', 'wont-fix', 'duplicate', 'cannot-reproduce', 'other'
                )
            );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.support_cases'::regclass AND conname = 'support_cases_closed_resolution_check') THEN
        ALTER TABLE public.support_cases ADD CONSTRAINT support_cases_closed_resolution_check
            CHECK (
                (status = 'open'   AND closed_at IS NULL     AND resolved_at IS NULL     AND resolved_by IS NULL     AND resolution_outcome IS NULL)
                OR
                (status = 'closed' AND closed_at IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_outcome IS NOT NULL)
            ) NOT VALID;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.support_audit_log'::regclass AND conname = 'support_audit_log_event_type_check') THEN
        ALTER TABLE public.support_audit_log ADD CONSTRAINT support_audit_log_event_type_check
            CHECK (
                event_type IN (
                    'diagnostic_export',
                    'health_alert_linked',
                    'manual_replay_attempted',
                    'manual_replay_succeeded',
                    'manual_replay_failed',
                    'recovery_action',
                    'case_resolved'
                )
            );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.support_audit_log'::regclass AND conname = 'support_audit_log_case_id_not_blank') THEN
        ALTER TABLE public.support_audit_log ADD CONSTRAINT support_audit_log_case_id_not_blank
            CHECK (case_id IS NULL OR length(btrim(case_id)) > 0) NOT VALID;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.support_audit_log'::regclass AND conname = 'support_audit_log_case_id_fkey') THEN
        ALTER TABLE public.support_audit_log ADD CONSTRAINT support_audit_log_case_id_fkey
            FOREIGN KEY (case_id) REFERENCES public.support_cases(id) NOT VALID;
    END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 索引 / Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- drivers
CREATE INDEX IF NOT EXISTS idx_drivers_username           ON public.drivers (username);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role              ON public.profiles (role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_driver_id  ON public.profiles (driver_id) WHERE driver_id IS NOT NULL;

-- locations
CREATE INDEX IF NOT EXISTS idx_locations_machineid        ON public.locations ("machineId");
CREATE INDEX IF NOT EXISTS idx_locations_assigned_driver  ON public.locations ("assignedDriverId");

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp     ON public.transactions ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_location      ON public.transactions ("locationId");
CREATE INDEX IF NOT EXISTS idx_transactions_driver        ON public.transactions ("driverId");
CREATE INDEX IF NOT EXISTS idx_transactions_driver_ts     ON public.transactions ("driverId", "timestamp" ASC);

-- daily_settlements
CREATE INDEX IF NOT EXISTS idx_settlements_driver_date    ON public.daily_settlements ("driverId", "date");

-- monthly_payrolls
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_payrolls_driver_month
    ON public.monthly_payrolls ("driverId", month);
CREATE INDEX IF NOT EXISTS idx_monthly_payrolls_month_status
    ON public.monthly_payrolls (month DESC, status);
CREATE INDEX IF NOT EXISTS idx_monthly_payrolls_paid_at
    ON public.monthly_payrolls ("paidAt" DESC);

-- location_change_requests
CREATE INDEX IF NOT EXISTS idx_lcr_status_created         ON public.location_change_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lcr_location_created       ON public.location_change_requests (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lcr_requester_auth         ON public.location_change_requests (requested_by_auth_user_id);

-- support_cases
CREATE INDEX IF NOT EXISTS idx_support_cases_status       ON public.support_cases (status);
CREATE INDEX IF NOT EXISTS idx_support_cases_created_at   ON public.support_cases (created_at DESC);

-- support_audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_case_id          ON public.support_audit_log (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at       ON public.support_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type       ON public.support_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_case_created     ON public.support_audit_log (case_id, created_at DESC) WHERE case_id IS NOT NULL;

-- driver_flow_events
CREATE INDEX IF NOT EXISTS idx_driver_flow_events_created
    ON public.driver_flow_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_flow_events_driver_created
    ON public.driver_flow_events (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_flow_events_flow
    ON public.driver_flow_events (flow_id, created_at);
CREATE INDEX IF NOT EXISTS idx_driver_flow_events_step_event
    ON public.driver_flow_events (step, event_name, created_at DESC);

-- queue_health_reports
CREATE INDEX IF NOT EXISTS idx_queue_reports_driver       ON public.queue_health_reports (driver_id);
CREATE INDEX IF NOT EXISTS idx_queue_reports_reported_at  ON public.queue_health_reports (reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_reports_dead_letter  ON public.queue_health_reports (dead_letter_count DESC, reported_at DESC);

-- health_alerts
CREATE INDEX IF NOT EXISTS idx_health_alerts_created_at   ON public.health_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_alerts_unresolved   ON public.health_alerts (device_id, alert_type) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_health_alerts_severity     ON public.health_alerts (severity, created_at DESC);

-- notifications
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_overflow_dedup
    ON public.notifications (type, "relatedLocationId")
    WHERE type = 'overflow' AND "isRead" = false;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. 辅助函数 / Helper Functions
-- ═══════════════════════════════════════════════════════════════════════════

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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(public.get_my_role() = 'admin', FALSE)
$$;

CREATE OR REPLACE FUNCTION public.clear_my_must_change_password()
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE public.profiles SET must_change_password = FALSE WHERE auth_user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role()                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_driver_id()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin()                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_my_must_change_password() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_role()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_driver_id()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_my_must_change_password() TO authenticated;

-- ── 点位变更审批 / Location change-request approval ──────────────────────────

CREATE OR REPLACE FUNCTION public.apply_location_change_request(
    request_id UUID,
    approve    BOOLEAN,
    note       TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _req   RECORD;
    _patch JSONB;
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
            name                   = COALESCE(_patch->>'name',                   name),
            area                   = COALESCE(_patch->>'area',                   area),
            "machineId"            = COALESCE(_patch->>'machineId',            "machineId"),
            "ownerName"            = COALESCE(_patch->>'ownerName',            "ownerName"),
            "shopOwnerPhone"       = COALESCE(_patch->>'shopOwnerPhone',       "shopOwnerPhone"),
            "ownerPhotoUrl"        = COALESCE(_patch->>'ownerPhotoUrl',        "ownerPhotoUrl"),
            "machinePhotoUrl"      = COALESCE(_patch->>'machinePhotoUrl',      "machinePhotoUrl"),
            "assignedDriverId"     = COALESCE(_patch->>'assignedDriverId',     "assignedDriverId"),
            status                 = COALESCE(_patch->>'status',                 status),
            "lastRevenueDate"      = COALESCE(_patch->>'lastRevenueDate',      "lastRevenueDate"),
            "commissionRate"       = CASE WHEN _patch ? 'commissionRate'
                                           THEN (_patch->>'commissionRate')::numeric ELSE "commissionRate" END,
            "initialStartupDebt"   = CASE WHEN _patch ? 'initialStartupDebt'
                                           THEN (_patch->>'initialStartupDebt')::numeric ELSE "initialStartupDebt" END,
            "remainingStartupDebt" = CASE WHEN _patch ? 'remainingStartupDebt'
                                           THEN (_patch->>'remainingStartupDebt')::numeric ELSE "remainingStartupDebt" END,
            "isNewOffice"          = CASE WHEN _patch ? 'isNewOffice'
                                           THEN (_patch->>'isNewOffice')::boolean ELSE "isNewOffice" END,
            coords                 = CASE WHEN _patch ? 'coords' THEN _patch->'coords' ELSE coords END
        WHERE id = _req.location_id;

        UPDATE public.location_change_requests SET
            status = 'approved', reviewed_at = NOW(),
            reviewed_by_auth_user_id = auth.uid(), review_note = note
        WHERE id = request_id;
    ELSE
        UPDATE public.location_change_requests SET
            status = 'rejected', reviewed_at = NOW(),
            reviewed_by_auth_user_id = auth.uid(), review_note = note
        WHERE id = request_id;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_location_change_request(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_location_change_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RPC 函数 / RPC Functions
-- ═══════════════════════════════════════════════════════════════════════════

-- ── approve_reset_request_v1 ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_reset_request_v1(
    p_tx_id TEXT,
    p_approve BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_location RECORD;
    v_status TEXT := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
    v_last_score BIGINT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Permission denied: caller is not an admin' USING ERRCODE = '42501';
    END IF;

    SELECT id, "locationId", type, "approvalStatus"
      INTO v_tx
      FROM public.transactions
     WHERE id = p_tx_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reset request not found: %', p_tx_id USING ERRCODE = 'P0002';
    END IF;

    IF v_tx.type IS DISTINCT FROM 'reset_request' THEN
        RAISE EXCEPTION 'Transaction % is not a reset request', p_tx_id USING ERRCODE = '22023';
    END IF;

    IF v_tx."approvalStatus" IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Reset request % already processed', p_tx_id USING ERRCODE = '22023';
    END IF;

    SELECT id, "lastScore", "resetLocked"
      INTO v_location
      FROM public.locations
     WHERE id = v_tx."locationId"
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found for reset request: %', v_tx."locationId" USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.transactions
       SET "approvalStatus" = v_status
     WHERE id = p_tx_id;

    UPDATE public.locations
       SET "lastScore" = CASE WHEN p_approve THEN 0 ELSE "lastScore" END,
           "resetLocked" = FALSE
     WHERE id = v_tx."locationId"
     RETURNING "lastScore" INTO v_last_score;

    RETURN json_build_object(
        'txId', p_tx_id,
        'approvalStatus', v_status,
        'locationId', v_tx."locationId",
        'lastScore', v_last_score,
        'resetLocked', FALSE
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_reset_request_v1(TEXT, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_reset_request_v1(TEXT, BOOLEAN) TO authenticated;

-- ── approve_payout_request_v1 ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_payout_request_v1(
    p_tx_id TEXT,
    p_approve BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_location RECORD;
    v_status TEXT := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
    v_next_balance NUMERIC;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Permission denied: caller is not an admin' USING ERRCODE = '42501';
    END IF;

    SELECT id, "locationId", type, "approvalStatus", "payoutAmount"
      INTO v_tx
      FROM public.transactions
     WHERE id = p_tx_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payout request not found: %', p_tx_id USING ERRCODE = 'P0002';
    END IF;

    IF v_tx.type IS DISTINCT FROM 'payout_request' THEN
        RAISE EXCEPTION 'Transaction % is not a payout request', p_tx_id USING ERRCODE = '22023';
    END IF;

    IF v_tx."approvalStatus" IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Payout request % already processed', p_tx_id USING ERRCODE = '22023';
    END IF;

    SELECT id, "dividendBalance"
      INTO v_location
      FROM public.locations
     WHERE id = v_tx."locationId"
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found for payout request: %', v_tx."locationId" USING ERRCODE = 'P0002';
    END IF;

    IF p_approve AND COALESCE(v_location."dividendBalance", 0) < COALESCE(v_tx."payoutAmount", 0) THEN
        RAISE EXCEPTION 'Insufficient dividend balance for payout approval' USING ERRCODE = '22023';
    END IF;

    UPDATE public.transactions
       SET "approvalStatus" = v_status
     WHERE id = p_tx_id;

    IF p_approve THEN
        UPDATE public.locations
           SET "dividendBalance" = COALESCE("dividendBalance", 0) - COALESCE(v_tx."payoutAmount", 0)
         WHERE id = v_tx."locationId"
         RETURNING "dividendBalance" INTO v_next_balance;
    ELSE
        v_next_balance := COALESCE(v_location."dividendBalance", 0);
    END IF;

    RETURN json_build_object(
        'txId', p_tx_id,
        'approvalStatus', v_status,
        'locationId', v_tx."locationId",
        'dividendBalance', v_next_balance
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_payout_request_v1(TEXT, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_payout_request_v1(TEXT, BOOLEAN) TO authenticated;

-- ── approve_expense_request_v1 ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_expense_request_v1(
    p_tx_id TEXT,
    p_approve BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_status TEXT := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: only admins may approve expense requests' USING ERRCODE = '42501';
    END IF;

    SELECT id, expenses, "expenseStatus", type
      INTO v_tx
      FROM public.transactions
     WHERE id = p_tx_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found: %', p_tx_id USING ERRCODE = 'P0002';
    END IF;

    IF COALESCE(v_tx.expenses, 0) <= 0 THEN
        RAISE EXCEPTION 'Transaction is not an expense request: %', p_tx_id USING ERRCODE = '22023';
    END IF;

    IF v_tx."expenseStatus" IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Expense request is not pending: %', p_tx_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.transactions
       SET "expenseStatus" = v_status,
           "isSynced" = TRUE
     WHERE id = p_tx_id;

    RETURN json_build_object(
        'txId', p_tx_id,
        'expenseStatus', v_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_expense_request_v1(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_expense_request_v1(TEXT, BOOLEAN) TO authenticated;

-- ── review_anomaly_transaction_v1 ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.review_anomaly_transaction_v1(
    p_tx_id TEXT,
    p_approve BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_status TEXT := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
    v_is_anomaly BOOLEAN := CASE WHEN p_approve THEN FALSE ELSE TRUE END;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: only admins may review anomaly transactions' USING ERRCODE = '42501';
    END IF;

    SELECT id, "isAnomaly", "approvalStatus"
      INTO v_tx
      FROM public.transactions
     WHERE id = p_tx_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found: %', p_tx_id USING ERRCODE = 'P0002';
    END IF;

    IF v_tx."isAnomaly" IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Transaction is not flagged as anomaly: %', p_tx_id USING ERRCODE = '22023';
    END IF;

    IF v_tx."approvalStatus" IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Anomaly transaction already reviewed: %', p_tx_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.transactions
       SET "approvalStatus" = v_status,
           "isAnomaly" = v_is_anomaly,
           "isSynced" = TRUE
     WHERE id = p_tx_id;

    RETURN json_build_object(
        'txId', p_tx_id,
        'approvalStatus', v_status,
        'isAnomaly', v_is_anomaly
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_anomaly_transaction_v1(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_anomaly_transaction_v1(TEXT, BOOLEAN) TO authenticated;

-- ── create_reset_request_v1 ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_reset_request_v1(
    p_tx_id TEXT,
    p_location_id UUID,
    p_driver_id TEXT,
    p_gps JSONB DEFAULT NULL,
    p_photo_url TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_location RECORD;
    v_driver RECORD;
    v_existing_tx RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' AND v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
        RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver' USING ERRCODE = '42501';
    END IF;

    SELECT id, name, "machineId", "lastScore", "resetLocked"
      INTO v_location
      FROM public.locations
     WHERE id = p_location_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
    END IF;

    SELECT id, name
      INTO v_driver
      FROM public.drivers
     WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.transactions (
        id, "timestamp", "locationId", "locationName", "driverId", "driverName",
        "previousScore", "currentScore", revenue, commission, "ownerRetention",
        "debtDeduction", "startupDebtDeduction", expenses, "coinExchange", "extraIncome",
        "netPayable", gps, "photoUrl", "dataUsageKB", type, notes, "approvalStatus", "isSynced"
    ) VALUES (
        p_tx_id, NOW(), p_location_id, v_location.name, p_driver_id, v_driver.name,
        v_location."lastScore", v_location."lastScore", 0, 0, 0,
        0, 0, 0, 0, 0,
        0, p_gps, p_photo_url, 80, 'reset_request', p_notes, 'pending', TRUE
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
        SELECT
            t.id, t."timestamp", t."locationId", t."locationName", t."driverId", t."driverName",
            t."previousScore", t."currentScore", t.revenue, t.commission, t."ownerRetention",
            t."debtDeduction", t."startupDebtDeduction", t.expenses, t."coinExchange",
            t."extraIncome", t."netPayable", t.gps, t."photoUrl", t."dataUsageKB", t.type,
            t.notes, t."approvalStatus", t."isSynced"
          INTO v_existing_tx
          FROM public.transactions t
         WHERE t.id = p_tx_id;
        RETURN row_to_json(v_existing_tx);
    END IF;

    UPDATE public.locations
       SET "resetLocked" = TRUE
     WHERE id = p_location_id;

    RETURN json_build_object(
        'id', p_tx_id,
        'timestamp', NOW(),
        'locationId', p_location_id,
        'locationName', v_location.name,
        'driverId', p_driver_id,
        'driverName', v_driver.name,
        'previousScore', v_location."lastScore",
        'currentScore', v_location."lastScore",
        'revenue', 0,
        'commission', 0,
        'ownerRetention', 0,
        'debtDeduction', 0,
        'startupDebtDeduction', 0,
        'expenses', 0,
        'coinExchange', 0,
        'extraIncome', 0,
        'netPayable', 0,
        'gps', p_gps,
        'photoUrl', p_photo_url,
        'dataUsageKB', 80,
        'type', 'reset_request',
        'notes', p_notes,
        'approvalStatus', 'pending',
        'isSynced', TRUE
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_reset_request_v1(TEXT, UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_reset_request_v1(TEXT, UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;

-- ── create_payout_request_v1 ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_payout_request_v1(
    p_tx_id TEXT,
    p_location_id UUID,
    p_driver_id TEXT,
    p_gps JSONB DEFAULT NULL,
    p_payout_amount NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_location RECORD;
    v_driver RECORD;
    v_existing_tx RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' AND v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
        RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(p_payout_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'Invalid payout amount' USING ERRCODE = '22023';
    END IF;

    SELECT id, name, "lastScore", "dividendBalance"
      INTO v_location
      FROM public.locations
     WHERE id = p_location_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
    END IF;

    IF COALESCE(v_location."dividendBalance", 0) < p_payout_amount THEN
        RAISE EXCEPTION 'Insufficient dividend balance for payout request' USING ERRCODE = '22023';
    END IF;

    SELECT id, name
      INTO v_driver
      FROM public.drivers
     WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.transactions (
        id, "timestamp", "locationId", "locationName", "driverId", "driverName",
        "previousScore", "currentScore", revenue, commission, "ownerRetention",
        "debtDeduction", "startupDebtDeduction", expenses, "coinExchange", "extraIncome",
        "netPayable", gps, "dataUsageKB", type, notes, "approvalStatus", "payoutAmount", "isSynced"
    ) VALUES (
        p_tx_id, NOW(), p_location_id, v_location.name, p_driver_id, v_driver.name,
        v_location."lastScore", v_location."lastScore", 0, 0, 0,
        0, 0, 0, 0, 0,
        0, p_gps, 40, 'payout_request', p_notes, 'pending', p_payout_amount, TRUE
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
        SELECT
            t.id, t."timestamp", t."locationId", t."locationName", t."driverId", t."driverName",
            t."previousScore", t."currentScore", t.revenue, t.commission, t."ownerRetention",
            t."debtDeduction", t."startupDebtDeduction", t.expenses, t."coinExchange",
            t."extraIncome", t."netPayable", t.gps, t."dataUsageKB", t.type,
            t.notes, t."approvalStatus", t."payoutAmount", t."isSynced"
          INTO v_existing_tx
          FROM public.transactions t
         WHERE t.id = p_tx_id;
        RETURN row_to_json(v_existing_tx);
    END IF;

    RETURN json_build_object(
        'id', p_tx_id,
        'timestamp', NOW(),
        'locationId', p_location_id,
        'locationName', v_location.name,
        'driverId', p_driver_id,
        'driverName', v_driver.name,
        'previousScore', v_location."lastScore",
        'currentScore', v_location."lastScore",
        'revenue', 0,
        'commission', 0,
        'ownerRetention', 0,
        'debtDeduction', 0,
        'startupDebtDeduction', 0,
        'expenses', 0,
        'coinExchange', 0,
        'extraIncome', 0,
        'netPayable', 0,
        'gps', p_gps,
        'dataUsageKB', 40,
        'type', 'payout_request',
        'notes', p_notes,
        'approvalStatus', 'pending',
        'payoutAmount', p_payout_amount,
        'isSynced', TRUE
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_payout_request_v1(TEXT, UUID, TEXT, JSONB, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_payout_request_v1(TEXT, UUID, TEXT, JSONB, NUMERIC, TEXT) TO authenticated;

-- ── create_daily_settlement_v1 ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_daily_settlement_v1(
    p_id TEXT,
    p_date DATE,
    p_driver_id TEXT,
    p_total_revenue NUMERIC,
    p_total_net_payable NUMERIC,
    p_total_expenses NUMERIC,
    p_driver_float NUMERIC,
    p_expected_total NUMERIC,
    p_actual_cash NUMERIC,
    p_actual_coins NUMERIC,
    p_shortage NUMERIC,
    p_note TEXT DEFAULT NULL,
    p_transfer_proof_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_driver RECORD;
    v_existing_settlement RECORD;
    v_conflicting_settlement RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' AND v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
        RAISE EXCEPTION 'Forbidden: driver may not submit settlement for another driver' USING ERRCODE = '42501';
    END IF;

    SELECT id, name
      INTO v_driver
      FROM public.drivers
     WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    SELECT
        s.id, s."date", s."driverId", s."driverName", s."totalRevenue", s."totalNetPayable",
        s."totalExpenses", s."driverFloat", s."expectedTotal", s."actualCash", s."actualCoins",
        s.shortage, s.note, s."transferProofUrl", s.status, s."timestamp", s."adminId",
        s."adminName", s."checkInAt", s."checkOutAt", s."checkInGps", s."checkOutGps",
        s."hasCheckedIn", s."hasCheckedOut", s."isSynced"
      INTO v_existing_settlement
      FROM public.daily_settlements s
     WHERE s.id = p_id;

    IF FOUND THEN
        RETURN row_to_json(v_existing_settlement);
    END IF;

    SELECT
        s.id, s.status
      INTO v_conflicting_settlement
      FROM public.daily_settlements s
     WHERE s."driverId" = p_driver_id
       AND s."date" = p_date
       AND s.status IN ('pending', 'confirmed')
     ORDER BY s."timestamp" DESC
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'Settlement already exists for driver % on % (existing id: %, status: %)',
            p_driver_id, p_date, v_conflicting_settlement.id, v_conflicting_settlement.status
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.daily_settlements (
        id, "date", "driverId", "driverName", "totalRevenue", "totalNetPayable",
        "totalExpenses", "driverFloat", "expectedTotal", "actualCash", "actualCoins",
        shortage, note, "transferProofUrl", status, "timestamp", "isSynced"
    ) VALUES (
        p_id, p_date, p_driver_id, v_driver.name, p_total_revenue, p_total_net_payable,
        p_total_expenses, p_driver_float, p_expected_total, p_actual_cash, p_actual_coins,
        p_shortage, p_note, p_transfer_proof_url, 'pending', v_now, TRUE
    );

    RETURN json_build_object(
        'id', p_id,
        'date', p_date,
        'driverId', p_driver_id,
        'driverName', v_driver.name,
        'totalRevenue', p_total_revenue,
        'totalNetPayable', p_total_net_payable,
        'totalExpenses', p_total_expenses,
        'driverFloat', p_driver_float,
        'expectedTotal', p_expected_total,
        'actualCash', p_actual_cash,
        'actualCoins', p_actual_coins,
        'shortage', p_shortage,
        'note', p_note,
        'transferProofUrl', p_transfer_proof_url,
        'status', 'pending',
        'timestamp', v_now,
        'isSynced', TRUE
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_daily_settlement_v1(
    TEXT, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_daily_settlement_v1(
    TEXT, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
) TO authenticated;

-- ── review_daily_settlement_v1 ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.review_daily_settlement_v1(
    p_settlement_id TEXT,
    p_status TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_settlement RECORD;
    v_next_note TEXT;
    v_payment_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may review settlements' USING ERRCODE = '42501';
    END IF;

    IF p_status NOT IN ('confirmed', 'rejected') THEN
        RAISE EXCEPTION 'Invalid settlement review status: %', p_status USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_settlement
      FROM public.daily_settlements
     WHERE id = p_settlement_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found: %', p_settlement_id USING ERRCODE = 'P0002';
    END IF;

    IF v_settlement.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Settlement is not pending: %', p_settlement_id USING ERRCODE = '22023';
    END IF;

    v_next_note := COALESCE(p_note, v_settlement.note);
    v_payment_status := CASE WHEN p_status = 'confirmed' THEN 'paid' ELSE 'rejected' END;

    UPDATE public.daily_settlements
       SET status = p_status,
           note = v_next_note,
           "adminId" = auth.uid()::text,
           "adminName" = COALESCE(v_caller_profile.display_name, 'Admin'),
           "isSynced" = TRUE
     WHERE id = p_settlement_id;

    UPDATE public.transactions
       SET "paymentStatus" = v_payment_status
     WHERE "driverId" = v_settlement."driverId"
       AND type = 'collection'
       AND ("timestamp" AT TIME ZONE 'UTC')::date = v_settlement."date";

    IF p_status = 'confirmed' AND v_settlement."driverId" IS NOT NULL THEN
        UPDATE public.drivers
           SET "dailyFloatingCoins" = COALESCE(v_settlement."actualCoins", 0)
         WHERE id = v_settlement."driverId";
    END IF;

    SELECT
        s.id, s."date", s."driverId", s."driverName", s."totalRevenue", s."totalNetPayable",
        s."totalExpenses", s."driverFloat", s."expectedTotal", s."actualCash", s."actualCoins",
        s.shortage, s.note, s."transferProofUrl", s.status, s."timestamp", s."adminId",
        s."adminName", s."checkInAt", s."checkOutAt", s."checkInGps", s."checkOutGps",
        s."hasCheckedIn", s."hasCheckedOut", s."isSynced"
      INTO v_settlement
      FROM public.daily_settlements s
     WHERE s.id = p_settlement_id;

    RETURN row_to_json(v_settlement);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_daily_settlement_v1(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_daily_settlement_v1(TEXT, TEXT, TEXT) TO authenticated;

-- ── create_monthly_payroll_v1 ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_monthly_payroll_v1(
    p_driver_id TEXT,
    p_month TEXT,
    p_base_salary NUMERIC,
    p_commission NUMERIC,
    p_private_loan_deduction NUMERIC DEFAULT 0,
    p_shortage_deduction NUMERIC DEFAULT 0,
    p_net_payable NUMERIC DEFAULT 0,
    p_collection_count INTEGER DEFAULT 0,
    p_total_revenue NUMERIC DEFAULT 0,
    p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_driver RECORD;
    v_existing_payroll RECORD;
    v_payroll_json JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND OR v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may create payrolls' USING ERRCODE = '42501';
    END IF;

    SELECT id, name
      INTO v_driver
      FROM public.drivers
     WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    SELECT *
      INTO v_existing_payroll
      FROM public.monthly_payrolls
     WHERE "driverId" = p_driver_id
       AND month = p_month
     FOR UPDATE;

    IF FOUND AND v_existing_payroll.status IS DISTINCT FROM 'cancelled' THEN
        RAISE EXCEPTION 'Payroll already exists for driver % in month %', p_driver_id, p_month USING ERRCODE = '23505';
    END IF;

    IF FOUND AND v_existing_payroll.status = 'cancelled' THEN
        UPDATE public.monthly_payrolls
           SET "driverName" = v_driver.name,
               "baseSalary" = COALESCE(p_base_salary, 0),
               commission = COALESCE(p_commission, 0),
               "privateLoanDeduction" = COALESCE(p_private_loan_deduction, 0),
               "shortageDeduction" = COALESCE(p_shortage_deduction, 0),
               "netPayable" = COALESCE(p_net_payable, 0),
               "collectionCount" = COALESCE(p_collection_count, 0),
               "totalRevenue" = COALESCE(p_total_revenue, 0),
               status = 'pending',
               note = p_note,
               "paymentMethod" = NULL,
               "paymentProofUrl" = NULL,
               "paidAt" = NULL,
               "paidBy" = NULL,
               "paidByName" = NULL,
               "isSynced" = TRUE
         WHERE id = v_existing_payroll.id;
    ELSE
        INSERT INTO public.monthly_payrolls (
            "driverId", "driverName", month, "baseSalary", commission,
            "privateLoanDeduction", "shortageDeduction", "netPayable",
            "collectionCount", "totalRevenue", status, note, "isSynced"
        ) VALUES (
            p_driver_id, v_driver.name, p_month, COALESCE(p_base_salary, 0), COALESCE(p_commission, 0),
            COALESCE(p_private_loan_deduction, 0), COALESCE(p_shortage_deduction, 0), COALESCE(p_net_payable, 0),
            COALESCE(p_collection_count, 0), COALESCE(p_total_revenue, 0), 'pending', p_note, TRUE
        );
    END IF;

    SELECT row_to_json(payroll_row)
      INTO v_payroll_json
      FROM (
        SELECT id, "driverId", "driverName", month, "baseSalary", commission,
               "privateLoanDeduction", "shortageDeduction", "netPayable",
               "collectionCount", "totalRevenue", status, "paymentMethod",
               "paymentProofUrl", note, "createdAt", "paidAt", "paidBy",
               "paidByName", "isSynced"
          FROM public.monthly_payrolls
         WHERE "driverId" = p_driver_id
           AND month = p_month
      ) payroll_row;

    RETURN v_payroll_json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_monthly_payroll_v1(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_monthly_payroll_v1(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, TEXT) TO authenticated;

-- ── mark_monthly_payroll_paid_v1 ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_monthly_payroll_paid_v1(
    p_payroll_id UUID,
    p_payment_method TEXT,
    p_note TEXT DEFAULT NULL,
    p_payment_proof_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_payroll RECORD;
    v_payroll_json JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND OR v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may mark payrolls paid' USING ERRCODE = '42501';
    END IF;

    IF p_payment_method NOT IN ('cash', 'bank_transfer', 'mobile_money', 'other') THEN
        RAISE EXCEPTION 'Invalid payment method: %', p_payment_method USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_payroll
      FROM public.monthly_payrolls
     WHERE id = p_payroll_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll not found: %', p_payroll_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payroll.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Payroll is not pending: %', p_payroll_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.monthly_payrolls
       SET status = 'paid',
           "paymentMethod" = p_payment_method,
           note = COALESCE(p_note, note),
           "paymentProofUrl" = COALESCE(p_payment_proof_url, "paymentProofUrl"),
           "paidAt" = NOW(),
           "paidBy" = auth.uid()::text,
           "paidByName" = COALESCE(v_caller_profile.display_name, 'Admin'),
           "isSynced" = TRUE
     WHERE id = p_payroll_id;

    SELECT row_to_json(payroll_row)
      INTO v_payroll_json
      FROM (
        SELECT id, "driverId", "driverName", month, "baseSalary", commission,
               "privateLoanDeduction", "shortageDeduction", "netPayable",
               "collectionCount", "totalRevenue", status, "paymentMethod",
               "paymentProofUrl", note, "createdAt", "paidAt", "paidBy",
               "paidByName", "isSynced"
          FROM public.monthly_payrolls
         WHERE id = p_payroll_id
      ) payroll_row;

    RETURN v_payroll_json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_monthly_payroll_paid_v1(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_monthly_payroll_paid_v1(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ── cancel_monthly_payroll_v1 ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_monthly_payroll_v1(
    p_payroll_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_payroll RECORD;
    v_payroll_json JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND OR v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may cancel payrolls' USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_payroll
      FROM public.monthly_payrolls
     WHERE id = p_payroll_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll not found: %', p_payroll_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payroll.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Only pending payrolls may be cancelled: %', p_payroll_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.monthly_payrolls
       SET status = 'cancelled',
           note = COALESCE(p_note, note),
           "isSynced" = TRUE
     WHERE id = p_payroll_id;

    SELECT row_to_json(payroll_row)
      INTO v_payroll_json
      FROM (
        SELECT id, "driverId", "driverName", month, "baseSalary", commission,
               "privateLoanDeduction", "shortageDeduction", "netPayable",
               "collectionCount", "totalRevenue", status, "paymentMethod",
               "paymentProofUrl", note, "createdAt", "paidAt", "paidBy",
               "paidByName", "isSynced"
          FROM public.monthly_payrolls
         WHERE id = p_payroll_id
      ) payroll_row;

    RETURN v_payroll_json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_monthly_payroll_v1(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_monthly_payroll_v1(UUID, TEXT) TO authenticated;

-- ── calculate_finance_v2 ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_finance_v2(
    p_current_score      INTEGER,
    p_previous_score     INTEGER,
    p_commission_rate    NUMERIC,
    p_expenses           INTEGER DEFAULT 0,
    p_tip                INTEGER DEFAULT 0,
    p_is_owner_retaining BOOLEAN DEFAULT TRUE,
    p_owner_retention    NUMERIC DEFAULT NULL,
    p_startup_debt_deduction_request INTEGER DEFAULT 0,
    p_startup_debt_balance NUMERIC DEFAULT 0
)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_diff                           INTEGER;
    v_revenue                        NUMERIC;
    v_commission                     NUMERIC;
    v_final_retention                NUMERIC;
    v_available_after_core_deductions NUMERIC;
    v_startup_debt_deduction         NUMERIC;
    v_net_payable                    NUMERIC;
BEGIN
    v_diff     := GREATEST(0, p_current_score - p_previous_score);
    v_revenue  := v_diff * 200;
    v_commission := FLOOR(v_revenue * COALESCE(p_commission_rate, 0.15));
    v_final_retention := GREATEST(0, COALESCE(p_owner_retention, v_commission));

    v_available_after_core_deductions := GREATEST(
        0,
        v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0))
    );

    v_startup_debt_deduction := LEAST(
        GREATEST(0, COALESCE(p_startup_debt_deduction_request, 0)),
        GREATEST(0, COALESCE(p_startup_debt_balance, 0))
    );

    v_net_payable := GREATEST(0, v_available_after_core_deductions + v_startup_debt_deduction);

    RETURN json_build_object(
        'diff',           v_diff,
        'revenue',        v_revenue,
        'commission',     v_commission,
        'finalRetention', v_final_retention,
        'startupDebtDeduction', v_startup_debt_deduction,
        'netPayable',     v_net_payable
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_finance_v2(INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calculate_finance_v2(INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, NUMERIC) TO authenticated;

-- ── submit_collection_v2 ─────────────────────────────────────────────────────
-- 服务端授权收款提交，鉴权 + 幂等 (ON CONFLICT DO NOTHING)
-- Server-authoritative collection submission with idempotent insert.

CREATE OR REPLACE FUNCTION public.submit_collection_v2(
    p_tx_id              TEXT,
    p_location_id        UUID,
    p_driver_id          TEXT,
    p_current_score      INTEGER,
    p_expenses           INTEGER DEFAULT 0,
    p_tip                INTEGER DEFAULT 0,
    p_startup_debt_deduction INTEGER DEFAULT 0,
    p_is_owner_retaining BOOLEAN DEFAULT TRUE,
    p_owner_retention    NUMERIC DEFAULT NULL,
    p_coin_exchange      INTEGER DEFAULT 0,
    p_gps                JSONB   DEFAULT NULL,
    p_photo_url          TEXT    DEFAULT NULL,
    p_ai_score           INTEGER DEFAULT NULL,
    p_anomaly_flag       BOOLEAN DEFAULT FALSE,
    p_notes              TEXT    DEFAULT NULL,
    p_expense_type       TEXT    DEFAULT NULL,
    p_expense_category   TEXT    DEFAULT NULL,
    p_reported_status    TEXT    DEFAULT 'active'
)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_profile  RECORD;
    v_location        RECORD;
    v_driver          RECORD;
    v_diff            INTEGER;
    v_revenue         NUMERIC;
    v_commission      NUMERIC;
    v_final_retention NUMERIC;
    v_available_after_core_deductions NUMERIC;
    v_startup_debt_deduction NUMERIC;
    v_net_payable     NUMERIC;
    v_now             TIMESTAMPTZ := NOW();
    v_rows_inserted   INTEGER;
    v_existing_tx     RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id INTO v_caller_profile
    FROM public.profiles WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' THEN
        IF v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
            RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id, name, "lastScore", "commissionRate", "machineId", "remainingStartupDebt" INTO v_location
    FROM public.locations WHERE id = p_location_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
    END IF;

    SELECT id, name INTO v_driver FROM public.drivers WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    v_diff     := GREATEST(0, p_current_score - v_location."lastScore");
    v_revenue  := v_diff * 200;
    v_commission := FLOOR(v_revenue * COALESCE(v_location."commissionRate", 0.15));
    v_final_retention := GREATEST(0, COALESCE(p_owner_retention, v_commission));

    v_available_after_core_deductions := GREATEST(
        0,
        v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0))
    );

    v_startup_debt_deduction := LEAST(
        GREATEST(0, COALESCE(p_startup_debt_deduction, 0)),
        GREATEST(0, COALESCE(v_location."remainingStartupDebt", 0))
    );

    v_net_payable := GREATEST(0, v_available_after_core_deductions + v_startup_debt_deduction);

    INSERT INTO public.transactions (
        id, "timestamp", "uploadTimestamp",
        "locationId", "locationName", "driverId", "driverName",
        "previousScore", "currentScore",
        revenue, commission, "ownerRetention",
        "debtDeduction", "startupDebtDeduction",
        expenses, "coinExchange", "extraIncome", "netPayable",
        "paymentStatus", gps, "photoUrl",
        "aiScore", "isAnomaly", "isClearance", "isSynced",
        type, "dataUsageKB", "reportedStatus", notes,
        "expenseType", "expenseCategory", "expenseStatus", "approvalStatus"
    ) VALUES (
        p_tx_id, v_now, v_now,
        p_location_id, v_location.name, p_driver_id, v_driver.name,
        v_location."lastScore", p_current_score,
        v_revenue, v_commission, v_final_retention,
        0, v_startup_debt_deduction,
        COALESCE(p_expenses, 0), COALESCE(p_coin_exchange, 0), 0, v_net_payable,
        'pending', p_gps, p_photo_url,
        p_ai_score, COALESCE(p_anomaly_flag, FALSE), FALSE, TRUE,
        'collection', 120, COALESCE(p_reported_status, 'active'), p_notes,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type     ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending'          ELSE NULL END,
        'approved'
    )
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted = 1 THEN
        UPDATE public.locations
        SET "lastScore" = CASE
            WHEN "lastScore" IS NULL OR p_current_score >= "lastScore"
                THEN p_current_score
            ELSE "lastScore"
        END,
            "remainingStartupDebt" = GREATEST(
                0,
                COALESCE("remainingStartupDebt", 0) - v_startup_debt_deduction
            ),
            "dividendBalance" = CASE
                WHEN p_is_owner_retaining
                    THEN COALESCE("dividendBalance", 0) + v_final_retention
                ELSE COALESCE("dividendBalance", 0)
            END
        WHERE id = p_location_id;
    END IF;

    IF v_rows_inserted = 0 THEN
        SELECT
            t.id,
            t."timestamp",
            t."locationId",
            t."locationName",
            t."driverId",
            t."driverName",
            t."previousScore",
            t."currentScore",
            t.revenue,
            t.commission,
            t."ownerRetention",
            t."debtDeduction",
            t."startupDebtDeduction",
            t.expenses,
            t."coinExchange",
            t."extraIncome",
            t."netPayable",
            t."paymentStatus",
            t.gps,
            t."photoUrl",
            t."aiScore",
            t."isAnomaly",
            t."isSynced",
            t.type,
            t."approvalStatus",
            t."reportedStatus",
            t.notes,
            t."expenseType",
            t."expenseCategory",
            t."expenseStatus"
        INTO v_existing_tx
        FROM public.transactions t
        WHERE t.id = p_tx_id;
        RETURN row_to_json(v_existing_tx);
    END IF;

    RETURN json_build_object(
        'id',                   p_tx_id,
        'timestamp',            v_now,
        'locationId',           p_location_id,
        'locationName',         v_location.name,
        'driverId',             p_driver_id,
        'driverName',           v_driver.name,
        'previousScore',        v_location."lastScore",
        'currentScore',         p_current_score,
        'revenue',              v_revenue,
        'commission',           v_commission,
        'ownerRetention',       v_final_retention,
        'debtDeduction',        0,
        'startupDebtDeduction', v_startup_debt_deduction,
        'expenses',             COALESCE(p_expenses, 0),
        'coinExchange',         COALESCE(p_coin_exchange, 0),
        'extraIncome',          0,
        'netPayable',           v_net_payable,
        'paymentStatus',        'pending',
        'gps',                  p_gps,
        'photoUrl',             p_photo_url,
        'aiScore',              p_ai_score,
        'isAnomaly',            COALESCE(p_anomaly_flag, FALSE),
        'isSynced',             TRUE,
        'type',                 'collection',
        'approvalStatus',       'approved',
        'reportedStatus',       COALESCE(p_reported_status, 'active'),
        'notes',                p_notes,
        'expenseType',          CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type     ELSE NULL END,
        'expenseCategory',      CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
        'expenseStatus',        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending'          ELSE NULL END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_collection_v2(TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_collection_v2(TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── resolve_support_case_v1 ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_support_case_v1(
    p_case_id          TEXT,
    p_actor_id         TEXT DEFAULT NULL,
    p_resolution_notes TEXT DEFAULT NULL,
    p_resolution_outcome TEXT DEFAULT NULL
)
RETURNS TABLE (
    case_id          TEXT,
    status           TEXT,
    closed_at        TIMESTAMPTZ,
    resolved_at      TIMESTAMPTZ,
    resolved_by      TEXT,
    resolution_outcome TEXT,
    audit_recorded   BOOLEAN,
    audit_event_id   UUID
)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now              TIMESTAMPTZ := NOW();
    v_resolved_by      TEXT;
    v_resolution_outcome TEXT;
    v_case             public.support_cases%ROWTYPE;
    v_audit_id         UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Permission denied: caller is not an admin';
    END IF;

    IF p_case_id IS NULL OR btrim(p_case_id) = '' THEN
        RAISE EXCEPTION 'p_case_id is required';
    END IF;

    v_resolved_by        := COALESCE(NULLIF(btrim(p_actor_id), ''), auth.uid()::text, 'system');
    v_resolution_outcome := COALESCE(NULLIF(btrim(p_resolution_outcome), ''), 'other');

    UPDATE public.support_cases SET
        status = 'closed', closed_at = v_now,
        resolution_notes = p_resolution_notes,
        resolved_by = v_resolved_by, resolved_at = v_now,
        resolution_outcome = v_resolution_outcome
    WHERE id = p_case_id AND status = 'open'
    RETURNING * INTO v_case;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'support case % not found or not open', p_case_id;
    END IF;

    INSERT INTO public.support_audit_log (case_id, event_type, actor_id, payload)
    VALUES (
        p_case_id, 'case_resolved', v_resolved_by,
        jsonb_strip_nulls(jsonb_build_object(
            'note', p_resolution_notes,
            'resolutionOutcome', v_resolution_outcome
        ))
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT
        v_case.id, v_case.status, v_case.closed_at,
        v_case.resolved_at, v_case.resolved_by, v_case.resolution_outcome,
        (v_audit_id IS NOT NULL), v_audit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_support_case_v1(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_support_case_v1(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── generate_health_alerts_v1 ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_health_alerts_v1()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r       RECORD;
    v_now   TIMESTAMPTZ := NOW();
    v_count INTEGER := 0;
BEGIN
    FOR r IN SELECT * FROM public.queue_health_reports LOOP

        -- dead_letter_items
        IF r.dead_letter_count >= 1 THEN
            IF NOT EXISTS (SELECT 1 FROM public.health_alerts WHERE device_id = r.device_id AND alert_type = 'dead_letter_items' AND resolved_at IS NULL) THEN
                INSERT INTO public.health_alerts (alert_type, severity, device_id, driver_id, driver_name, payload)
                VALUES ('dead_letter_items', 'critical', r.device_id, r.driver_id, r.driver_name,
                    jsonb_build_object('deadLetterCount', r.dead_letter_count, 'reportedAt', r.reported_at, 'syncState', r.sync_state, 'lastError', r.last_error, 'appVersion', r.app_version));
                v_count := v_count + 1;
            END IF;
        ELSE
            UPDATE public.health_alerts SET resolved_at = COALESCE(resolved_at, v_now)
            WHERE device_id = r.device_id AND alert_type = 'dead_letter_items' AND resolved_at IS NULL;
        END IF;

        -- stale_snapshot
        IF r.reported_at < (v_now - INTERVAL '2 hours') THEN
            IF NOT EXISTS (SELECT 1 FROM public.health_alerts WHERE device_id = r.device_id AND alert_type = 'stale_snapshot' AND resolved_at IS NULL) THEN
                INSERT INTO public.health_alerts (alert_type, severity, device_id, driver_id, driver_name, payload)
                VALUES ('stale_snapshot', 'warning', r.device_id, r.driver_id, r.driver_name,
                    jsonb_build_object('reportedAt', r.reported_at, 'syncState', r.sync_state, 'appVersion', r.app_version));
                v_count := v_count + 1;
            END IF;
        ELSE
            UPDATE public.health_alerts SET resolved_at = COALESCE(resolved_at, v_now)
            WHERE device_id = r.device_id AND alert_type = 'stale_snapshot' AND resolved_at IS NULL;
        END IF;

        -- high_retry_waiting
        IF r.retry_waiting_count > 5 THEN
            IF NOT EXISTS (SELECT 1 FROM public.health_alerts WHERE device_id = r.device_id AND alert_type = 'high_retry_waiting' AND resolved_at IS NULL) THEN
                INSERT INTO public.health_alerts (alert_type, severity, device_id, driver_id, driver_name, payload)
                VALUES ('high_retry_waiting', 'warning', r.device_id, r.driver_id, r.driver_name,
                    jsonb_build_object('retryWaitingCount', r.retry_waiting_count, 'reportedAt', r.reported_at, 'syncState', r.sync_state));
                v_count := v_count + 1;
            END IF;
        ELSE
            UPDATE public.health_alerts SET resolved_at = COALESCE(resolved_at, v_now)
            WHERE device_id = r.device_id AND alert_type = 'high_retry_waiting' AND resolved_at IS NULL;
        END IF;

        -- high_pending
        IF r.pending_count > 20 THEN
            IF NOT EXISTS (SELECT 1 FROM public.health_alerts WHERE device_id = r.device_id AND alert_type = 'high_pending' AND resolved_at IS NULL) THEN
                INSERT INTO public.health_alerts (alert_type, severity, device_id, driver_id, driver_name, payload)
                VALUES ('high_pending', 'info', r.device_id, r.driver_id, r.driver_name,
                    jsonb_build_object('pendingCount', r.pending_count, 'reportedAt', r.reported_at, 'syncState', r.sync_state));
                v_count := v_count + 1;
            END IF;
        ELSE
            UPDATE public.health_alerts SET resolved_at = COALESCE(resolved_at, v_now)
            WHERE device_id = r.device_id AND alert_type = 'high_pending' AND resolved_at IS NULL;
        END IF;

    END LOOP;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_health_alerts_v1() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_health_alerts_v1() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. 自动化触发器 / Automation Triggers（已加固安全版本）
-- ═══════════════════════════════════════════════════════════════════════════

-- 异常交易通知（仅在 isAnomaly false → true 时触发）
CREATE OR REPLACE FUNCTION public.on_transaction_anomaly()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.notifications (type, title, message, "relatedTransactionId", "driverId")
    VALUES ('anomaly', 'Transaction anomaly detected',
            COALESCE(NEW.notes, 'Anomaly flagged on transaction ' || NEW.id),
            NEW.id, NEW."driverId");
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_transaction_anomaly ON public.transactions;
CREATE TRIGGER trigger_on_transaction_anomaly
AFTER UPDATE ON public.transactions
FOR EACH ROW
WHEN (NEW."isAnomaly" IS TRUE AND OLD."isAnomaly" IS DISTINCT FROM TRUE)
EXECUTE FUNCTION public.on_transaction_anomaly();

-- 机器分数溢出通知（lastScore ≥ 9900 时，使用去重索引防止重复通知）
CREATE OR REPLACE FUNCTION public.on_machine_overflow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.notifications (type, title, message, "relatedLocationId")
    VALUES ('overflow', 'Machine near score overflow',
            'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') lastScore=' || NEW."lastScore"::text || ' is near overflow (≥9900).',
            NEW.id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_machine_overflow ON public.locations;
CREATE TRIGGER trigger_on_machine_overflow
AFTER UPDATE OF "lastScore" ON public.locations
FOR EACH ROW
WHEN (NEW."lastScore" >= 9900 AND (OLD."lastScore" IS NULL OR OLD."lastScore" < 9900))
EXECUTE FUNCTION public.on_machine_overflow();

-- 重置锁定通知（resetLocked false → true 时触发）
CREATE OR REPLACE FUNCTION public.on_reset_locked()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW."resetLocked" IS TRUE AND (OLD."resetLocked" IS DISTINCT FROM TRUE) THEN
        INSERT INTO public.notifications (type, title, message)
        VALUES ('reset_locked', 'Location locked – approval required',
                'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') has been locked and requires administrator approval to reset.');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_reset_locked ON public.locations;
CREATE TRIGGER trigger_on_reset_locked
AFTER UPDATE OF "resetLocked" ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.on_reset_locked();

REVOKE EXECUTE ON FUNCTION public.on_transaction_anomaly() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_machine_overflow()    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_reset_locked()        FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. 实时广播触发器 / Realtime Broadcast Triggers
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_table_changes()
RETURNS TRIGGER SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM realtime.broadcast_changes(
        'db:' || TG_TABLE_NAME, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_table_changes() FROM PUBLIC;

DROP TRIGGER IF EXISTS transactions_broadcast_trigger ON public.transactions;
CREATE TRIGGER transactions_broadcast_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.notify_table_changes();

DROP TRIGGER IF EXISTS drivers_broadcast_trigger ON public.drivers;
CREATE TRIGGER drivers_broadcast_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.drivers
    FOR EACH ROW EXECUTE FUNCTION public.notify_table_changes();

DROP TRIGGER IF EXISTS daily_settlements_broadcast_trigger ON public.daily_settlements;
CREATE TRIGGER daily_settlements_broadcast_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.daily_settlements
    FOR EACH ROW EXECUTE FUNCTION public.notify_table_changes();

DROP POLICY IF EXISTS "authenticated_users_can_receive_broadcasts" ON realtime.messages;
CREATE POLICY "authenticated_users_can_receive_broadcasts" ON realtime.messages
    FOR SELECT TO authenticated
    USING (topic IN ('db:transactions', 'db:drivers', 'db:daily_settlements'));

CREATE INDEX IF NOT EXISTS idx_realtime_messages_topic ON realtime.messages (topic);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. 行级安全 / Row-Level Security
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.drivers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_payrolls     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_flow_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_cases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_audit_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_health_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_alerts        ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
    USING (public.is_admin() OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── drivers ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS drivers_select ON public.drivers;
CREATE POLICY drivers_select ON public.drivers FOR SELECT TO authenticated
    USING (public.is_admin() OR id = public.get_my_driver_id());

DROP POLICY IF EXISTS drivers_insert ON public.drivers;
CREATE POLICY drivers_insert ON public.drivers FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

-- 允许司机更新自己的行（GPS / lastActive）；保护敏感薪资字段
DROP POLICY IF EXISTS drivers_update ON public.drivers;
CREATE POLICY drivers_update ON public.drivers FOR UPDATE TO authenticated
    USING (
        public.get_my_role() = 'admin'
        OR (public.get_my_role() = 'driver' AND id = public.get_my_driver_id())
    )
    WITH CHECK (
        public.get_my_role() = 'admin'
        OR (public.get_my_role() = 'driver' AND id = public.get_my_driver_id())
    );

REVOKE UPDATE ("baseSalary", "commissionRate", "initialDebt", "remainingDebt")
    ON public.drivers FROM authenticated;

DROP POLICY IF EXISTS drivers_delete ON public.drivers;
CREATE POLICY drivers_delete ON public.drivers FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── locations ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS locations_select ON public.locations;
CREATE POLICY locations_select ON public.locations FOR SELECT TO authenticated
    USING (public.is_admin() OR "assignedDriverId" = public.get_my_driver_id());

-- 允许司机注册新点位（新店入驻流程：assignedDriverId = 自己）
DROP POLICY IF EXISTS locations_insert ON public.locations;
CREATE POLICY locations_insert ON public.locations FOR INSERT TO authenticated
    WITH CHECK (
        public.get_my_role() = 'admin'
        OR (public.get_my_role() = 'driver' AND "assignedDriverId" = public.get_my_driver_id())
    );

DROP POLICY IF EXISTS locations_update ON public.locations;
CREATE POLICY locations_update ON public.locations FOR UPDATE TO authenticated
    USING (public.get_my_role() = 'admin' OR "assignedDriverId" = public.get_my_driver_id())
    WITH CHECK (public.get_my_role() = 'admin' OR "assignedDriverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS locations_delete ON public.locations;
CREATE POLICY locations_delete ON public.locations FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── transactions ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS transactions_select ON public.transactions;
CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated
    USING (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions FOR UPDATE TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS transactions_delete ON public.transactions;
CREATE POLICY transactions_delete ON public.transactions FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── daily_settlements ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS settlements_select ON public.daily_settlements;
CREATE POLICY settlements_select ON public.daily_settlements FOR SELECT TO authenticated
    USING (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS settlements_insert ON public.daily_settlements;
CREATE POLICY settlements_insert ON public.daily_settlements FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS settlements_update ON public.daily_settlements;
CREATE POLICY settlements_update ON public.daily_settlements FOR UPDATE TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS settlements_delete ON public.daily_settlements;
CREATE POLICY settlements_delete ON public.daily_settlements FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── monthly_payrolls ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS payrolls_select ON public.monthly_payrolls;
CREATE POLICY payrolls_select ON public.monthly_payrolls FOR SELECT TO authenticated
    USING (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS payrolls_insert ON public.monthly_payrolls;
CREATE POLICY payrolls_insert ON public.monthly_payrolls FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS payrolls_update ON public.monthly_payrolls;
CREATE POLICY payrolls_update ON public.monthly_payrolls FOR UPDATE TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS payrolls_delete ON public.monthly_payrolls;
CREATE POLICY payrolls_delete ON public.monthly_payrolls FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── location_change_requests ─────────────────────────────────────────────────

DROP POLICY IF EXISTS lcr_insert ON public.location_change_requests;
CREATE POLICY lcr_insert ON public.location_change_requests FOR INSERT TO authenticated
    WITH CHECK (
        requested_by_auth_user_id = auth.uid()
        AND (
            public.is_admin()
            OR requested_by_driver_id = public.get_my_driver_id()
            OR requested_by_driver_id IS NULL
        )
    );

DROP POLICY IF EXISTS lcr_select ON public.location_change_requests;
CREATE POLICY lcr_select ON public.location_change_requests FOR SELECT TO authenticated
    USING (requested_by_auth_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS lcr_update ON public.location_change_requests;
CREATE POLICY lcr_update ON public.location_change_requests FOR UPDATE TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── ai_logs ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ai_logs_select ON public.ai_logs;
CREATE POLICY ai_logs_select ON public.ai_logs FOR SELECT TO authenticated
    USING (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS ai_logs_insert ON public.ai_logs;
CREATE POLICY ai_logs_insert ON public.ai_logs FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS ai_logs_update ON public.ai_logs;
CREATE POLICY ai_logs_update ON public.ai_logs FOR UPDATE TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS ai_logs_delete ON public.ai_logs;
CREATE POLICY ai_logs_delete ON public.ai_logs FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── notifications ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR "driverId" = public.get_my_driver_id()
        OR "driverId" IS NULL
    );

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
    USING (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated
    USING (public.is_admin());

-- ── support_cases ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS support_cases_select ON public.support_cases;
CREATE POLICY support_cases_select ON public.support_cases FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS support_cases_insert ON public.support_cases;
CREATE POLICY support_cases_insert ON public.support_cases FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS support_cases_update ON public.support_cases;
CREATE POLICY support_cases_update ON public.support_cases FOR UPDATE TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── support_audit_log ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS support_audit_log_select ON public.support_audit_log;
CREATE POLICY support_audit_log_select ON public.support_audit_log FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS support_audit_log_insert ON public.support_audit_log;
CREATE POLICY support_audit_log_insert ON public.support_audit_log FOR INSERT TO authenticated
    WITH CHECK (true);

-- ── driver_flow_events ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS driver_flow_events_admin_select ON public.driver_flow_events;
CREATE POLICY driver_flow_events_admin_select ON public.driver_flow_events FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS driver_flow_events_driver_insert ON public.driver_flow_events;
CREATE POLICY driver_flow_events_driver_insert ON public.driver_flow_events FOR INSERT TO authenticated
    WITH CHECK (public.is_admin() OR driver_id = public.get_my_driver_id());

-- ── queue_health_reports ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS queue_health_select ON public.queue_health_reports;
CREATE POLICY queue_health_select ON public.queue_health_reports FOR SELECT TO authenticated
    USING (public.is_admin() OR driver_id = public.get_my_driver_id());

DROP POLICY IF EXISTS queue_health_insert ON public.queue_health_reports;
CREATE POLICY queue_health_insert ON public.queue_health_reports FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR driver_id = public.get_my_driver_id()
        OR driver_id IS NULL
    );

DROP POLICY IF EXISTS queue_health_update ON public.queue_health_reports;
CREATE POLICY queue_health_update ON public.queue_health_reports FOR UPDATE TO authenticated
    USING (public.is_admin() OR driver_id = public.get_my_driver_id())
    WITH CHECK (public.is_admin() OR driver_id = public.get_my_driver_id());

-- ── health_alerts ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS health_alerts_select ON public.health_alerts;
CREATE POLICY health_alerts_select ON public.health_alerts FOR SELECT TO authenticated
    USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 完成 / Done
-- ═══════════════════════════════════════════════════════════════════════════
-- 创建第一个管理员账号 / Creating the first admin account:
--   1. Supabase Dashboard → Authentication → Users → Add user (email + password)
--   2. 在 SQL Editor 中运行（替换 <AUTH_USER_ID>）/ Run in SQL Editor (replace <AUTH_USER_ID>):
--
--      INSERT INTO public.profiles (auth_user_id, role, display_name)
--      VALUES ('<AUTH_USER_ID>', 'admin', 'Admin')
--      ON CONFLICT (auth_user_id) DO UPDATE
--          SET role = 'admin', display_name = EXCLUDED.display_name;
--
-- 创建司机账号请使用 create-driver Edge Function。
-- Use the create-driver Edge Function to create driver accounts.
-- ═══════════════════════════════════════════════════════════════════════════
