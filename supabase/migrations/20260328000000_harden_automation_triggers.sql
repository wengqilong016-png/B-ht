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
-- 3. Fix on_machine_overflow: skip inserting a new overflow notification when
--    an unread (isRead = false) overflow notification already exists for the
--    same location (checked via "relatedLocationId"), preventing unbounded
--    notification fan-out.
-- 4. Recreate all three triggers idempotently (DROP … IF EXISTS + CREATE).
--
-- This migration is safe to re-run (idempotent).

-- ─── 0. Schema: add relatedLocationId to notifications ────────────────────────
-- Allows typed, index-friendly deduplication lookups in on_machine_overflow.

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS "relatedLocationId" UUID;

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
WHEN (NEW."isAnomaly" IS TRUE)
EXECUTE FUNCTION public.on_transaction_anomaly();

-- ─── 2. Machine score overflow notification (with deduplication) ──────────────
-- Skips the INSERT when an unread overflow notification already exists for the
-- same location (checked via the typed "relatedLocationId" column).
-- This prevents repeated UPDATE events on a high-score machine from flooding
-- the notifications table.

CREATE OR REPLACE FUNCTION public.on_machine_overflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Guard: skip if an unread overflow notification for this location exists.
    IF EXISTS (
        SELECT 1
          FROM public.notifications
         WHERE type               = 'overflow'
           AND "isRead"           = false
           AND "relatedLocationId" = NEW.id
         LIMIT 1
    ) THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.notifications (type, title, message, "relatedLocationId")
    VALUES (
        'overflow',
        'Machine near score overflow',
        'Location "' || NEW.name || '" (id: ' || NEW.id::text || ') lastScore=' || NEW."lastScore"::text || ' is near overflow (≥9900).',
        NEW.id
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_machine_overflow ON public.locations;
CREATE TRIGGER trigger_on_machine_overflow
AFTER UPDATE OF "lastScore" ON public.locations
FOR EACH ROW
WHEN (NEW."lastScore" >= 9900)
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
