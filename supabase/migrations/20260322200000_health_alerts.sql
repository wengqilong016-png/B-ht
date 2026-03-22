-- Stage-8: persistent health alerts table and background alert-generation function.
--
-- Overview
-- ────────
-- alert storage: `health_alerts` table, one row per (alert-type, source-snapshot)
-- generation:    `generate_health_alerts()` SQL function — reads `queue_health_reports`,
--                applies the same threshold logic as the TypeScript service layer, and
--                upserts into `health_alerts`.  Resolves alerts that are no longer triggered.
-- scheduling:    pg_cron fires `generate_health_alerts()` every 15 minutes so alerts
--                exist in the database independently of any admin session.
--
-- Row identity: id = '{alert_type}--{snapshot_id}' (matches the TypeScript deterministic ID).
-- Only active (unresolved) alerts have resolved_at = NULL.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.health_alerts (
    id           TEXT        PRIMARY KEY,               -- '{type}--{snapshot_id}'
    alert_type   TEXT        NOT NULL,
    severity     TEXT        NOT NULL
                             CHECK (severity IN ('critical', 'warning', 'info')),
    device_id    TEXT        NOT NULL,
    driver_id    TEXT        NOT NULL,
    driver_name  TEXT,
    message      TEXT        NOT NULL,
    detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ,                            -- NULL = active; non-NULL = resolved
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS health_alerts_severity_idx
    ON public.health_alerts (severity);

CREATE INDEX IF NOT EXISTS health_alerts_detected_at_idx
    ON public.health_alerts (detected_at DESC);

-- Partial index to make "fetch active alerts" fast.
CREATE INDEX IF NOT EXISTS health_alerts_active_idx
    ON public.health_alerts (detected_at DESC)
    WHERE resolved_at IS NULL;

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.health_alerts ENABLE ROW LEVEL SECURITY;

-- Admins may read all rows (active and resolved).
CREATE POLICY ha_admin_select ON public.health_alerts
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
             WHERE auth_user_id = auth.uid()
               AND role = 'admin'
        )
    );

-- ── Server-side alert generation function ────────────────────────────────────
--
-- Thresholds mirror the TypeScript constants in healthAlertService.ts:
--   DEAD_LETTER_ALERT_THRESHOLD  = 1
--   HIGH_RETRY_WAITING_THRESHOLD = 5
--   HIGH_PENDING_THRESHOLD       = 20
--   STALE_THRESHOLD_MS           = 7,200,000  (2 hours)
--
-- SECURITY DEFINER: runs as the function owner (postgres) so it can bypass
-- RLS to write to health_alerts without requiring an authenticated session.
-- This is correct for a cron-invoked server-side function.

CREATE OR REPLACE FUNCTION public.generate_health_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ── pg_cron scheduling ────────────────────────────────────────────────────────
--
-- Requires the pg_cron extension (enabled by default on Supabase hosted projects).
-- The job runs every 15 minutes so alerts exist in the database regardless of
-- whether any admin has the HealthAlerts page open.
--
-- Idempotent: unschedule any pre-existing job with this name before re-creating.

SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'generate-health-alerts';

SELECT cron.schedule(
    'generate-health-alerts',
    '*/15 * * * *',
    'SELECT public.generate_health_alerts()'
);
