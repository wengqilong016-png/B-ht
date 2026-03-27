-- 20260328000000_harden_automation_triggers.sql
-- Forward-only hardening of the trigger functions introduced in
-- 20260310000001_automation_triggers.sql.  The original file is NOT modified
-- to avoid Supabase CLI checksum drift.
--
-- Changes applied here
-- ────────────────────
-- 1. Add "relatedLocationId" column to public.notifications (idempotent) so
--    overflow deduplication can use a typed column rather than LIKE on message.
-- 2. Re-define all three SECURITY DEFINER trigger functions with
--    SET search_path = public, pg_temp  (prevents search-path hijacking).
-- 3. Fix on_machine_overflow: concurrent-safe deduplication via a partial
--    unique index on (type, "relatedLocationId") WHERE type='overflow' AND
--    "isRead"=false, with INSERT … ON CONFLICT DO NOTHING.
-- 4. Recreate all three triggers idempotently (DROP … IF EXISTS + CREATE).
-- 5. Fix trigger_on_transaction_anomaly: fire only on isAnomaly false→true
--    transition to prevent duplicate notifications on unrelated upserts.
-- 6. Fix trigger_on_machine_overflow: fire only when lastScore crosses the
--    9900 threshold (old < 9900 → new ≥ 9900) for performance.
-- 7. REVOKE EXECUTE FROM PUBLIC on all three SECURITY DEFINER functions to
--    prevent direct invocation by anon/authenticated roles.
--
-- This migration is safe to re-run (idempotent).

-- ─── 0. Schema: add relatedLocationId to notifications ────────────────────────
-- Allows typed, index-friendly deduplication lookups in on_machine_overflow.

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS "relatedLocationId" UUID;

-- Partial unique index for concurrent-safe overflow deduplication.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_overflow_dedup
    ON public.notifications (type, "relatedLocationId")
    WHERE type = 'overflow' AND "isRead" = false;

-- ─── 1. Transaction anomaly notification ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.on_transaction_anomaly()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS trigger_on_transaction_anomaly ON public.transactions;
CREATE TRIGGER trigger_on_transaction_anomaly
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW
WHEN (NEW."isAnomaly" IS TRUE AND OLD."isAnomaly" IS DISTINCT FROM TRUE)
EXECUTE FUNCTION public.on_transaction_anomaly();

-- ─── 2. Machine score overflow notification (with deduplication) ──────────────
-- Uses INSERT … ON CONFLICT DO NOTHING together with the partial unique index
-- idx_notifications_overflow_dedup to atomically prevent duplicate unread
-- overflow notifications, even under concurrent UPDATE events.

CREATE OR REPLACE FUNCTION public.on_machine_overflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.notifications (type, title, message, "relatedLocationId")
    VALUES (
        'overflow',
        'Machine near score overflow',
        'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') lastScore=' || NEW."lastScore"::text || ' is near overflow (≥9900).',
        NEW.id
    )
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

-- ─── 3. Reset-lock alert ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.on_reset_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS trigger_on_reset_locked ON public.locations;
CREATE TRIGGER trigger_on_reset_locked
AFTER UPDATE OF "resetLocked" ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.on_reset_locked();

-- ─── 4. Revoke direct EXECUTE from PUBLIC on SECURITY DEFINER functions ───────
-- Prevents anon/authenticated roles from calling these functions directly with
-- definer-level privileges.  They remain callable only via the triggers above.

REVOKE EXECUTE ON FUNCTION public.on_transaction_anomaly()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_machine_overflow()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_reset_locked()         FROM PUBLIC;
