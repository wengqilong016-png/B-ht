-- Stage-6: fleet-wide queue health reporting table.
--
-- Each driver device periodically upserts a single row (one per device+driver
-- pair) to report its current local-queue state.  Admins can then query the
-- full table to get aggregated diagnostics without needing direct access to
-- each device's IndexedDB or localStorage.
--
-- Row identity: id = '{device_id}--{driver_id}'
-- Each device-driver pair keeps exactly one row, updated on every sync.

CREATE TABLE IF NOT EXISTS public.queue_health_reports (
    id                  TEXT        PRIMARY KEY,
    device_id           TEXT        NOT NULL,
    driver_id           TEXT        REFERENCES public.drivers(id),
    driver_name         TEXT,
    pending_count       INTEGER     NOT NULL DEFAULT 0,
    retry_waiting_count INTEGER     NOT NULL DEFAULT 0,
    dead_letter_count   INTEGER     NOT NULL DEFAULT 0,
    dead_letter_items   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    reported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS queue_health_reports_driver_idx
    ON public.queue_health_reports (driver_id);

CREATE INDEX IF NOT EXISTS queue_health_reports_reported_at_idx
    ON public.queue_health_reports (reported_at DESC);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.queue_health_reports ENABLE ROW LEVEL SECURITY;

-- Admins may read all rows.
CREATE POLICY qhr_admin_select ON public.queue_health_reports
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
             WHERE auth_user_id = auth.uid()
               AND role = 'admin'
        )
    );

-- Drivers (and admins) may insert rows for their own driver_id.
CREATE POLICY qhr_driver_insert ON public.queue_health_reports
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.auth_user_id = auth.uid()
               AND (p.role = 'admin' OR p.driver_id = driver_id)
        )
    );

-- Drivers (and admins) may update rows for their own driver_id.
CREATE POLICY qhr_driver_update ON public.queue_health_reports
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.auth_user_id = auth.uid()
               AND (p.role = 'admin' OR p.driver_id = driver_id)
        )
    );
