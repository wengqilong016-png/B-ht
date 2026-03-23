-- Stage 10 post-merge smoke checks (repeatable, no data mutation).
-- Usage:
--   1) Replace the default case_id below with the case you just resolved in UI.
--   2) Run in Supabase SQL Editor, or:
--        psql "$DATABASE_URL" -v case_id='CASE-2026-001' -f scripts/stage10_post_merge_smoke.sql

\set case_id 'CASE-2026-001'

-- 1) Validate the acceptance chain anchor row: case exists and is closed.
SELECT id,
       status,
       resolution_outcome,
       resolution_notes,
       resolved_by,
       resolved_at,
       updated_at
FROM public.support_cases
WHERE id = :'case_id';

-- 2) Validate resolution metadata is fully persisted.
SELECT id,
       (resolution_notes IS NOT NULL)   AS has_resolution_notes,
       (resolution_outcome IS NOT NULL) AS has_resolution_outcome,
       (resolved_by IS NOT NULL)        AS has_resolved_by,
       (resolved_at IS NOT NULL)        AS has_resolved_at
FROM public.support_cases
WHERE id = :'case_id';

-- 3) Validate audit log contains case_resolved event(s) for this case.
SELECT case_id,
       event_type,
       actor_id,
       created_at,
       payload
FROM public.support_audit_log
WHERE case_id = :'case_id'
  AND event_type = 'case_resolved'
ORDER BY created_at DESC;

-- 4) Quick cardinality check: expect >= 1 for a successfully resolved case.
SELECT case_id,
       COUNT(*) AS case_resolved_events
FROM public.support_audit_log
WHERE case_id = :'case_id'
  AND event_type = 'case_resolved'
GROUP BY case_id;

-- 5) Schema guard: CHECK constraint includes case_resolved.
SELECT conname,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.support_audit_log'::regclass
  AND c.conname = 'support_audit_log_event_type_check';
