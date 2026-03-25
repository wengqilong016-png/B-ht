-- Stage 13: support caseId audit trail lookup index.
--
-- Goal
-- ----
-- Improve audit trail filtering performance for per-case detail views
-- without redesigning the schema or changing application behavior.
--
-- This stage adds a composite index for the common case-detail / audit-trail
-- access pattern: filter by `case_id` with newest-first ordering.
--
-- Current application queries use exact equality after service-side
-- normalization (e.g. `eq('case_id', normalizedCaseId)`), so a plain
-- column index is the correct match for the planner.

-- Audit trail access path: events by case_id, newest first
CREATE INDEX IF NOT EXISTS support_audit_log_case_id_created_at_idx
    ON public.support_audit_log (case_id, created_at DESC)
    WHERE case_id IS NOT NULL;
