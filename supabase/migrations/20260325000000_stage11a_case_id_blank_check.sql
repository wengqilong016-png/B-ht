-- Stage 11A: block blank/whitespace-only case_id values in support_audit_log.
--
-- Overview
-- ────────
-- Adds a CHECK constraint that prevents empty or whitespace-only strings from
-- being stored in `support_audit_log.case_id`.  NULL values are still allowed
-- (case_id is optional).
--
-- This is a "soft hardening" step.  No foreign key is introduced here; that is
-- deferred to a future stage (11B) after historical data compatibility has been
-- verified.
--
-- The constraint is added as NOT VALID so it does not scan or validate
-- existing rows during deployment.  This prevents migration failure if
-- historical data already contains blank/whitespace-only case_id values.
-- New inserts/updates are still enforced immediately.
--
-- A future stage (11B) may VALIDATE the constraint after a baseline data
-- cleanup confirms no violating rows remain.
--
-- The constraint expression:
--   CHECK (case_id IS NULL OR length(btrim(case_id)) > 0)
--
-- Semantics:
--   • NULL   → allowed  (fire-and-forget inserts without a case reference)
--   • ''     → rejected (empty string, new inserts only)
--   • '   '  → rejected (whitespace-only, new inserts only)
--   • 'CASE' → allowed  (any non-blank value)
--
-- This migration is additive and idempotent (uses IF NOT EXISTS guard).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.support_audit_log'::regclass
          AND conname  = 'support_audit_log_case_id_not_blank'
    ) THEN
        ALTER TABLE public.support_audit_log
            ADD CONSTRAINT support_audit_log_case_id_not_blank
            CHECK (case_id IS NULL OR length(btrim(case_id)) > 0)
            NOT VALID;
    END IF;
END$$;
