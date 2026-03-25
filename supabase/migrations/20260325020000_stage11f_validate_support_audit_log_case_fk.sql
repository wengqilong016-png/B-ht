-- Stage 11F: validate support_audit_log.case_id foreign key.
--
-- Context
-- -------
-- Stage 11D added `support_audit_log_case_id_fkey` as NOT VALID.
-- Stage 11A/11B/11C established normalization, cleanup, and baseline checks.
--
-- Goal
-- ----
-- Complete the support relationship hardening path by validating the existing
-- FK once baseline checks confirm:
--   * no blank / whitespace-only case_id values
--   * no trim drift
--   * no orphan case_id rows
--
-- This migration intentionally performs only VALIDATE CONSTRAINT.
-- It does not redesign the schema and does not alter nullability.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_audit_log'::regclass
          AND conname  = 'support_audit_log_case_id_fkey'
          AND convalidated = false
    ) THEN
        ALTER TABLE public.support_audit_log
            VALIDATE CONSTRAINT support_audit_log_case_id_fkey;
    END IF;
END$$;
