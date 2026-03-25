-- Production full baseline pack
-- 03_diagnostics_and_health.sql
--
-- Purpose
-- -------
-- Fourth layer of the coherent production baseline pack.
-- This layer adds fleet diagnostics snapshots and derived health alerts.
--
-- Scope
-- -----
--   * public.queue_health_reports
--   * public.health_alerts
--   * diagnostics/health indexes and constraints
--   * public.generate_health_alerts_v1()
--   * diagnostics/health RLS
--
-- Assumes
-- -------
-- 00_identity_and_assignment.sql has already been applied.
-- 01_business_flow.sql and 02_support_and_audit.sql are optional for this layer.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tables ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.queue_health_reports (
    device_id             TEXT PRIMARY KEY,
    driver_id             TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    driver_name           TEXT,
    pending_count         INTEGER NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
    retry_waiting_count   INTEGER NOT NULL DEFAULT 0 CHECK (retry_waiting_count >= 0),
    dead_letter_count     INTEGER NOT NULL DEFAULT 0 CHECK (dead_letter_count >= 0),
    sync_state            TEXT NOT NULL DEFAULT 'idle'
                          CHECK (sync_state IN ('idle', 'syncing', 'degraded', 'offline')),
    last_error            TEXT,
    app_version           TEXT,
    metadata              JSONB,
    reported_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.health_alerts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type            TEXT NOT NULL
                          CHECK (alert_type IN (
                            'dead_letter_items',
                            'stale_snapshot',
                            'high_retry_waiting',
                            'high_pending'
                          )),
    severity              TEXT NOT NULL
                          CHECK (severity IN ('critical', 'warning', 'info')),
    device_id             TEXT,
    driver_id             TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    driver_name           TEXT,
    payload               JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at           TIMESTAMPTZ
);

-- Indexes --------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_queue_health_reports_driver_full_v1
    ON public.queue_health_reports (driver_id);

CREATE INDEX IF NOT EXISTS idx_queue_health_reports_reported_at_full_v1
    ON public.queue_health_reports (reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_queue_health_reports_dead_letter_full_v1
    ON public.queue_health_reports (dead_letter_count DESC, reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_alerts_created_at_full_v1
    ON public.health_alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_alerts_unresolved_device_type_full_v1
    ON public.health_alerts (device_id, alert_type)
    WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_health_alerts_severity_full_v1
    ON public.health_alerts (severity, created_at DESC);

-- Helper function ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_health_alerts_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_count INTEGER := 0;
BEGIN
    FOR r IN
        SELECT
            device_id,
            driver_id,
            driver_name,
            pending_count,
            retry_waiting_count,
            dead_letter_count,
            reported_at,
            sync_state,
            last_error,
            app_version
        FROM public.queue_health_reports
    LOOP
        -- dead_letter_items ---------------------------------------------------
        IF r.dead_letter_count >= 1 THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.health_alerts
                WHERE device_id = r.device_id
                  AND alert_type = 'dead_letter_items'
                  AND resolved_at IS NULL
            ) THEN
                INSERT INTO public.health_alerts (
                    alert_type,
                    severity,
                    device_id,
                    driver_id,
                    driver_name,
                    payload
                ) VALUES (
                    'dead_letter_items',
                    'critical',
                    r.device_id,
                    r.driver_id,
                    r.driver_name,
                    jsonb_build_object(
                        'deadLetterCount', r.dead_letter_count,
                        'reportedAt', r.reported_at,
                        'syncState', r.sync_state,
                        'lastError', r.last_error,
                        'appVersion', r.app_version
                    )
                );
                v_count := v_count + 1;
            END IF;
        ELSE
            UPDATE public.health_alerts
            SET resolved_at = COALESCE(resolved_at, v_now)
            WHERE device_id = r.device_id
              AND alert_type = 'dead_letter_items'
              AND resolved_at IS NULL;
        END IF;

        -- stale_snapshot ------------------------------------------------------
        IF r.reported_at < (v_now - INTERVAL '2 hours') THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.health_alerts
                WHERE device_id = r.device_id
                  AND alert_type = 'stale_snapshot'
                  AND resolved_at IS NULL
            ) THEN
                INSERT INTO public.health_alerts (
                    alert_type,
                    severity,
                    device_id,
                    driver_id,
                    driver_name,
                    payload
                ) VALUES (
                    'stale_snapshot',
                    'warning',
                    r.device_id,
                    r.driver_id,
                    r.driver_name,
                    jsonb_build_object(
                        'reportedAt', r.reported_at,
                        'syncState', r.sync_state,
                        'appVersion', r.app_version
                    )
                );
                v_count := v_count + 1;
            END IF;
        ELSE
            UPDATE public.health_alerts
            SET resolved_at = COALESCE(resolved_at, v_now)
            WHERE device_id = r.device_id
              AND alert_type = 'stale_snapshot'
              AND resolved_at IS NULL;
        END IF;

        -- high_retry_waiting --------------------------------------------------
        IF r.retry_waiting_count > 5 THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.health_alerts
                WHERE device_id = r.device_id
                  AND alert_type = 'high_retry_waiting'
                  AND resolved_at IS NULL
            ) THEN
                INSERT INTO public.health_alerts (
                    alert_type,
                    severity,
                    device_id,
                    driver_id,
                    driver_name,
                    payload
                ) VALUES (
                    'high_retry_waiting',
                    'warning',
                    r.device_id,
                    r.driver_id,
                    r.driver_name,
                    jsonb_build_object(
                        'retryWaitingCount', r.retry_waiting_count,
                        'reportedAt', r.reported_at,
                        'syncState', r.sync_state
                    )
                );
                v_count := v_count + 1;
            END IF;
        ELSE
            UPDATE public.health_alerts
            SET resolved_at = COALESCE(resolved_at, v_now)
            WHERE device_id = r.device_id
              AND alert_type = 'high_retry_waiting'
              AND resolved_at IS NULL;
        END IF;

        -- high_pending --------------------------------------------------------
        IF r.pending_count > 20 THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.health_alerts
                WHERE device_id = r.device_id
                  AND alert_type = 'high_pending'
                  AND resolved_at IS NULL
            ) THEN
                INSERT INTO public.health_alerts (
                    alert_type,
                    severity,
                    device_id,
                    driver_id,
                    driver_name,
                    payload
                ) VALUES (
                    'high_pending',
                    'info',
                    r.device_id,
                    r.driver_id,
                    r.driver_name,
                    jsonb_build_object(
                        'pendingCount', r.pending_count,
                        'reportedAt', r.reported_at,
                        'syncState', r.sync_state
                    )
                );
                v_count := v_count + 1;
            END IF;
        ELSE
            UPDATE public.health_alerts
            SET resolved_at = COALESCE(resolved_at, v_now)
            WHERE device_id = r.device_id
              AND alert_type = 'high_pending'
              AND resolved_at IS NULL;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_health_alerts_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_health_alerts_v1() TO authenticated;

-- RLS ------------------------------------------------------------------------

ALTER TABLE public.queue_health_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_alerts ENABLE ROW LEVEL SECURITY;

-- queue_health_reports: admins read all, drivers read/write own reports
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'queue_health_reports'
          AND policyname = 'queue_health_reports_admin_or_driver_select_full_v1'
    ) THEN
        CREATE POLICY queue_health_reports_admin_or_driver_select_full_v1
            ON public.queue_health_reports
            FOR SELECT
            TO authenticated
            USING (public.is_admin() OR driver_id = public.get_my_driver_id());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'queue_health_reports'
          AND policyname = 'queue_health_reports_admin_or_driver_insert_full_v1'
    ) THEN
        CREATE POLICY queue_health_reports_admin_or_driver_insert_full_v1
            ON public.queue_health_reports
            FOR INSERT
            TO authenticated
            WITH CHECK (
                public.is_admin()
                OR driver_id = public.get_my_driver_id()
                OR driver_id IS NULL
            );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'queue_health_reports'
          AND policyname = 'queue_health_reports_admin_or_driver_update_full_v1'
    ) THEN
        CREATE POLICY queue_health_reports_admin_or_driver_update_full_v1
            ON public.queue_health_reports
            FOR UPDATE
            TO authenticated
            USING (public.is_admin() OR driver_id = public.get_my_driver_id())
            WITH CHECK (public.is_admin() OR driver_id = public.get_my_driver_id());
    END IF;
END$$;

-- health_alerts: admins only
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'health_alerts'
          AND policyname = 'health_alerts_admin_select_full_v1'
    ) THEN
        CREATE POLICY health_alerts_admin_select_full_v1
            ON public.health_alerts
            FOR SELECT
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- Notes ----------------------------------------------------------------------
-- 1. queue_health_reports is intended for driver/app snapshot upserts.
-- 2. health_alerts is admin-facing derived state.
-- 3. generate_health_alerts_v1() is intended for server-side / operator invocation.
-- 4. This completes the current production full baseline pack layers.
