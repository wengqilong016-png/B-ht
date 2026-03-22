-- Stage-8 hardening: forward-only migration that applies safety improvements to
-- the objects created in 20260322200000_health_alerts.sql.
--
-- If migration 20260322200000 has already been applied to an environment,
-- this migration picks up where it left off without touching the original
-- migration file (which would cause Supabase CLI checksum drift).
--
-- Changes applied here
-- ────────────────────
-- 1. ADD CHECK constraint on alert_type (was missing from original table DDL).
-- 2. CREATE INDEX for per-device alert lookups.
-- 3. CREATE OR REPLACE FUNCTION with SET search_path = public, pg_temp
--    (SECURITY DEFINER functions should pin search_path to prevent hijacking).
-- 4. REVOKE/GRANT execute permissions (restrict from PUBLIC; grant to postgres
--    and service_role only, matching the pg_cron and Edge Function callers).
-- 5. Re-schedule the pg_cron job inside a compatibility DO block so the
--    migration succeeds on self-hosted Postgres instances without pg_cron.
-- 6. Bootstrap: invoke the function immediately so alerts are available at once.

-- ── 1. CHECK constraint on alert_type ─────────────────────────────────────────

ALTER TABLE public.health_alerts
    ADD CONSTRAINT IF NOT EXISTS health_alerts_alert_type_check
    CHECK (alert_type IN ('dead_letter_items', 'stale_snapshot', 'high_retry_waiting', 'high_pending'));

-- ── 2. Per-device index ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS health_alerts_device_id_idx
    ON public.health_alerts (device_id);

-- ── 3. Hardened generate_health_alerts() function ─────────────────────────────
--
-- Identical logic to the original; adds:
--   SET search_path = public, pg_temp  (prevents search-path hijacking for
--                                        SECURITY DEFINER functions)

CREATE OR REPLACE FUNCTION public.generate_health_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    c_stale_ms         CONSTANT BIGINT   := 7200000; -- 2 hours in milliseconds
    c_dead_letter_min  CONSTANT INTEGER  := 1;
    c_retry_max        CONSTANT INTEGER  := 5;
    c_pending_max      CONSTANT INTEGER  := 20;

    v_detected         TIMESTAMPTZ := NOW();
    v_active_ids       TEXT[]      := ARRAY[]::TEXT[];
    rec                RECORD;
BEGIN
    FOR rec IN
        SELECT
            id,
            device_id,
            driver_id,
            COALESCE(driver_name, driver_id) AS driver_name,
            pending_count,
            retry_waiting_count,
            dead_letter_count,
            reported_at,
            (EXTRACT(EPOCH FROM (NOW() - reported_at)) * 1000)::BIGINT > c_stale_ms AS is_stale
          FROM public.queue_health_reports
    LOOP
        -- ── Dead-letter alert (critical) ─────────────────────────────────────
        IF rec.dead_letter_count >= c_dead_letter_min THEN
            INSERT INTO public.health_alerts
                (id, alert_type, severity, device_id, driver_id, driver_name, message, detected_at, resolved_at)
            VALUES (
                'dead_letter_items--' || rec.id,
                'dead_letter_items',
                'critical',
                rec.device_id,
                rec.driver_id,
                rec.driver_name,
                rec.driver_name || ': ' || rec.dead_letter_count ||
                    ' dead-letter item' ||
                    CASE WHEN rec.dead_letter_count <> 1 THEN 's' ELSE '' END ||
                    ' — manual replay required',
                v_detected,
                NULL
            )
            ON CONFLICT (id) DO UPDATE SET
                severity    = EXCLUDED.severity,
                message     = EXCLUDED.message,
                detected_at = EXCLUDED.detected_at,
                resolved_at = NULL;

            v_active_ids := array_append(v_active_ids, 'dead_letter_items--' || rec.id);
        END IF;

        -- ── Stale snapshot alert (warning) ───────────────────────────────────
        IF rec.is_stale THEN
            INSERT INTO public.health_alerts
                (id, alert_type, severity, device_id, driver_id, driver_name, message, detected_at, resolved_at)
            VALUES (
                'stale_snapshot--' || rec.id,
                'stale_snapshot',
                'warning',
                rec.device_id,
                rec.driver_id,
                rec.driver_name,
                rec.driver_name || ': snapshot is stale — device may be offline',
                v_detected,
                NULL
            )
            ON CONFLICT (id) DO UPDATE SET
                severity    = EXCLUDED.severity,
                message     = EXCLUDED.message,
                detected_at = EXCLUDED.detected_at,
                resolved_at = NULL;

            v_active_ids := array_append(v_active_ids, 'stale_snapshot--' || rec.id);
        END IF;

        -- ── High retry-waiting alert (warning) ───────────────────────────────
        IF rec.retry_waiting_count > c_retry_max THEN
            INSERT INTO public.health_alerts
                (id, alert_type, severity, device_id, driver_id, driver_name, message, detected_at, resolved_at)
            VALUES (
                'high_retry_waiting--' || rec.id,
                'high_retry_waiting',
                'warning',
                rec.device_id,
                rec.driver_id,
                rec.driver_name,
                rec.driver_name || ': ' || rec.retry_waiting_count ||
                    ' items waiting to retry — check connectivity',
                v_detected,
                NULL
            )
            ON CONFLICT (id) DO UPDATE SET
                severity    = EXCLUDED.severity,
                message     = EXCLUDED.message,
                detected_at = EXCLUDED.detected_at,
                resolved_at = NULL;

            v_active_ids := array_append(v_active_ids, 'high_retry_waiting--' || rec.id);
        END IF;

        -- ── High pending alert (info) ─────────────────────────────────────────
        IF rec.pending_count > c_pending_max THEN
            INSERT INTO public.health_alerts
                (id, alert_type, severity, device_id, driver_id, driver_name, message, detected_at, resolved_at)
            VALUES (
                'high_pending--' || rec.id,
                'high_pending',
                'info',
                rec.device_id,
                rec.driver_id,
                rec.driver_name,
                rec.driver_name || ': ' || rec.pending_count || ' items pending sync',
                v_detected,
                NULL
            )
            ON CONFLICT (id) DO UPDATE SET
                severity    = EXCLUDED.severity,
                message     = EXCLUDED.message,
                detected_at = EXCLUDED.detected_at,
                resolved_at = NULL;

            v_active_ids := array_append(v_active_ids, 'high_pending--' || rec.id);
        END IF;
    END LOOP;

    -- Mark previously-active alerts as resolved when their trigger condition
    -- no longer exists (i.e. they are not in the active set for this run).
    UPDATE public.health_alerts
       SET resolved_at = NOW()
     WHERE resolved_at IS NULL
       AND id <> ALL(v_active_ids);
END;
$$;

-- ── 4. Execute permissions ─────────────────────────────────────────────────────
--
-- Revoke default PUBLIC execute grant and restrict to the roles that actually
-- need to call this function:
--   • postgres     — the role pg_cron uses to invoke scheduled jobs
--   • service_role — Supabase service-role key / Edge Functions

REVOKE EXECUTE ON FUNCTION public.generate_health_alerts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.generate_health_alerts() TO postgres;
GRANT EXECUTE ON FUNCTION public.generate_health_alerts() TO service_role;

-- ── 5. pg_cron re-scheduling ───────────────────────────────────────────────────
--
-- Wrapped in a DO block so this migration completes on self-hosted Postgres
-- instances where pg_cron is not installed.
-- Unschedules any existing job with this name before re-creating, so this
-- block is idempotent regardless of what the original migration left behind.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname = 'generate-health-alerts';

        PERFORM cron.schedule(
            'generate-health-alerts',
            '*/15 * * * *',
            'SELECT public.generate_health_alerts()'
        );
    END IF;
END;
$$;

-- ── 6. Bootstrap ───────────────────────────────────────────────────────────────
--
-- Run once immediately so alerts are populated as soon as the migration is
-- applied, rather than waiting up to 15 minutes for the first scheduled run.

SELECT public.generate_health_alerts();
