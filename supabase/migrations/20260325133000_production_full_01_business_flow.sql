-- Production full baseline pack
-- 01_business_flow.sql
--
-- Purpose
-- -------
-- Second layer of the coherent production baseline pack.
-- This layer adds the core business-flow tables that depend on the identity
-- and assignment contract established by 00_identity_and_assignment.sql.
--
-- Scope
-- -----
--   * public.transactions
--   * public.daily_settlements
--   * public.location_change_requests
--   * business-flow indexes
--   * admin approval function for location change requests
--   * strict business-flow RLS
--
-- Assumes
-- -------
-- 00_identity_and_assignment.sql has already been applied.

-- Tables ---------------------------------------------------------------------

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
    CONSTRAINT transactions_type_check_full_v1 CHECK (
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
    "timestamp"         TIMESTAMPTZ DEFAULT NOW(),
    "checkInAt"         TIMESTAMPTZ,
    "checkOutAt"        TIMESTAMPTZ,
    "checkInGps"        JSONB,
    "checkOutGps"       JSONB,
    "hasCheckedIn"      BOOLEAN DEFAULT FALSE,
    "hasCheckedOut"     BOOLEAN DEFAULT FALSE
);

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

-- Indexes --------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_transactions_timestamp_full_v1
    ON public.transactions ("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_location_full_v1
    ON public.transactions ("locationId");

CREATE INDEX IF NOT EXISTS idx_transactions_driver_full_v1
    ON public.transactions ("driverId");

CREATE INDEX IF NOT EXISTS idx_transactions_driver_timestamp_full_v1
    ON public.transactions ("driverId", "timestamp" ASC);

CREATE INDEX IF NOT EXISTS idx_transactions_driver_date_full_v1
    ON public.transactions ("driverId", (("timestamp")::date));

CREATE INDEX IF NOT EXISTS idx_daily_settlements_driver_date_full_v1
    ON public.daily_settlements ("driverId", "date");

CREATE INDEX IF NOT EXISTS idx_lcr_status_created_at_full_v1
    ON public.location_change_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lcr_location_created_at_full_v1
    ON public.location_change_requests (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lcr_requester_auth_full_v1
    ON public.location_change_requests (requested_by_auth_user_id);

-- Helper function ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_location_change_request(
    request_id UUID,
    approve BOOLEAN,
    note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    _req RECORD;
    _patch JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Permission denied: caller is not an admin';
    END IF;

    SELECT * INTO _req
    FROM public.location_change_requests
    WHERE id = request_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request % not found or already processed', request_id;
    END IF;

    _patch := _req.patch;

    IF approve THEN
        UPDATE public.locations
        SET
            name = COALESCE(_patch->>'name', name),
            area = COALESCE(_patch->>'area', area),
            "machineId" = COALESCE(_patch->>'machineId', "machineId"),
            "ownerName" = COALESCE(_patch->>'ownerName', "ownerName"),
            "shopOwnerPhone" = COALESCE(_patch->>'shopOwnerPhone', "shopOwnerPhone"),
            "ownerPhotoUrl" = COALESCE(_patch->>'ownerPhotoUrl', "ownerPhotoUrl"),
            "machinePhotoUrl" = COALESCE(_patch->>'machinePhotoUrl', "machinePhotoUrl"),
            "assignedDriverId" = COALESCE(_patch->>'assignedDriverId', "assignedDriverId"),
            status = COALESCE(_patch->>'status', status),
            "lastRevenueDate" = COALESCE(_patch->>'lastRevenueDate', "lastRevenueDate"),
            "commissionRate" = CASE WHEN _patch ? 'commissionRate'
                                     THEN (_patch->>'commissionRate')::numeric
                                     ELSE "commissionRate" END,
            "initialStartupDebt" = CASE WHEN _patch ? 'initialStartupDebt'
                                         THEN (_patch->>'initialStartupDebt')::numeric
                                         ELSE "initialStartupDebt" END,
            "remainingStartupDebt" = CASE WHEN _patch ? 'remainingStartupDebt'
                                           THEN (_patch->>'remainingStartupDebt')::numeric
                                           ELSE "remainingStartupDebt" END,
            "isNewOffice" = CASE WHEN _patch ? 'isNewOffice'
                                  THEN (_patch->>'isNewOffice')::boolean
                                  ELSE "isNewOffice" END,
            coords = CASE WHEN _patch ? 'coords'
                          THEN _patch->'coords'
                          ELSE coords END
        WHERE id = _req.location_id;

        UPDATE public.location_change_requests
        SET
            status = 'approved',
            reviewed_at = NOW(),
            reviewed_by_auth_user_id = auth.uid(),
            review_note = note
        WHERE id = request_id;
    ELSE
        UPDATE public.location_change_requests
        SET
            status = 'rejected',
            reviewed_at = NOW(),
            reviewed_by_auth_user_id = auth.uid(),
            review_note = note
        WHERE id = request_id;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_location_change_request(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_location_change_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- RLS ------------------------------------------------------------------------

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_change_requests ENABLE ROW LEVEL SECURITY;

-- transactions: admin sees all, driver sees and inserts own rows
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'transactions'
          AND policyname = 'transactions_admin_or_driver_select_full_v1'
    ) THEN
        CREATE POLICY transactions_admin_or_driver_select_full_v1
            ON public.transactions
            FOR SELECT
            TO authenticated
            USING (public.is_admin() OR "driverId" = public.get_my_driver_id());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'transactions'
          AND policyname = 'transactions_admin_or_driver_insert_full_v1'
    ) THEN
        CREATE POLICY transactions_admin_or_driver_insert_full_v1
            ON public.transactions
            FOR INSERT
            TO authenticated
            WITH CHECK (public.is_admin() OR "driverId" = public.get_my_driver_id());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'transactions'
          AND policyname = 'transactions_admin_update_full_v1'
    ) THEN
        CREATE POLICY transactions_admin_update_full_v1
            ON public.transactions
            FOR UPDATE
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'transactions'
          AND policyname = 'transactions_admin_delete_full_v1'
    ) THEN
        CREATE POLICY transactions_admin_delete_full_v1
            ON public.transactions
            FOR DELETE
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- daily_settlements: admin sees all, driver sees and inserts own rows
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_settlements'
          AND policyname = 'settlements_admin_or_driver_select_full_v1'
    ) THEN
        CREATE POLICY settlements_admin_or_driver_select_full_v1
            ON public.daily_settlements
            FOR SELECT
            TO authenticated
            USING (public.is_admin() OR "driverId" = public.get_my_driver_id());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_settlements'
          AND policyname = 'settlements_admin_or_driver_insert_full_v1'
    ) THEN
        CREATE POLICY settlements_admin_or_driver_insert_full_v1
            ON public.daily_settlements
            FOR INSERT
            TO authenticated
            WITH CHECK (public.is_admin() OR "driverId" = public.get_my_driver_id());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_settlements'
          AND policyname = 'settlements_admin_update_full_v1'
    ) THEN
        CREATE POLICY settlements_admin_update_full_v1
            ON public.daily_settlements
            FOR UPDATE
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'daily_settlements'
          AND policyname = 'settlements_admin_delete_full_v1'
    ) THEN
        CREATE POLICY settlements_admin_delete_full_v1
            ON public.daily_settlements
            FOR DELETE
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- location_change_requests: requester inserts/selects own, admin reviews/selects all
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'location_change_requests'
          AND policyname = 'lcr_requester_insert_full_v1'
    ) THEN
        CREATE POLICY lcr_requester_insert_full_v1
            ON public.location_change_requests
            FOR INSERT
            TO authenticated
            WITH CHECK (
              requested_by_auth_user_id = auth.uid()
              AND (
                public.is_admin()
                OR requested_by_driver_id = public.get_my_driver_id()
                OR requested_by_driver_id IS NULL
              )
            );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'location_change_requests'
          AND policyname = 'lcr_requester_or_admin_select_full_v1'
    ) THEN
        CREATE POLICY lcr_requester_or_admin_select_full_v1
            ON public.location_change_requests
            FOR SELECT
            TO authenticated
            USING (
              requested_by_auth_user_id = auth.uid()
              OR public.is_admin()
            );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'location_change_requests'
          AND policyname = 'lcr_admin_update_full_v1'
    ) THEN
        CREATE POLICY lcr_admin_update_full_v1
            ON public.location_change_requests
            FOR UPDATE
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END$$;

-- Notes ----------------------------------------------------------------------
-- 1. This file assumes identity-layer helper functions already exist.
-- 2. No support / audit / diagnostics tables are introduced here.
-- 3. The next coherent production file should be 02_support_and_audit.sql.
