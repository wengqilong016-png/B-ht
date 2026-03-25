-- Stage 11D: add a transitional NOT VALID FK on support_audit_log.case_id.
--
-- Overview
-- ────────
-- Adds a foreign key from `public.support_audit_log(case_id)` to
-- `public.support_cases(id)` as a transition step for support relationship
-- hardening.
--
-- Important rollout semantics:
--   • `case_id` remains nullable (NULL is still allowed).
--   • FK is added as NOT VALID (no full historical scan at deploy time).
--   • No VALIDATE CONSTRAINT is executed in this stage.
--   • Stage 11E is expected to run VALIDATE after data compatibility checks.
--
-- This migration is additive and idempotent.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_audit_log'::regclass
          AND conname  = 'support_audit_log_case_id_fkey'
    ) THEN
        ALTER TABLE public.support_audit_log
            ADD CONSTRAINT support_audit_log_case_id_fkey
            FOREIGN KEY (case_id)
            REFERENCES public.support_cases(id)
            NOT VALID;
    END IF;
END$$;
