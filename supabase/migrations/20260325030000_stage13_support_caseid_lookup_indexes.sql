-- Stage 13: canonical support caseId lookup indexes.
--
-- Goal
-- ----
-- Improve support-case lookup and audit trail filtering performance without
-- redesigning the schema or changing application behavior.
--
-- This stage adds expression indexes for canonical caseId lookup using the
-- same normalization dimension used during Stage 11 baseline analysis:
--   lower(btrim(case_id_or_id))
--
-- It also adds a targeted audit log index for common case-detail / audit-trail
-- access patterns (`case_id` + newest-first ordering).

-- Canonical lookup for support_cases(id)
CREATE INDEX IF NOT EXISTS support_cases_id_canonical_lookup_idx
    ON public.support_cases ((lower(btrim(id))));

-- Canonical lookup for support_audit_log(case_id)
CREATE INDEX IF NOT EXISTS support_audit_log_case_id_canonical_lookup_idx
    ON public.support_audit_log ((lower(btrim(case_id))))
    WHERE case_id IS NOT NULL;

-- Common audit trail access path: events by case_id, newest first
CREATE INDEX IF NOT EXISTS support_audit_log_case_id_created_at_idx
    ON public.support_audit_log (case_id, created_at DESC)
    WHERE case_id IS NOT NULL;
