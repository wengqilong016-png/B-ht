-- Stage-11 prep: harden support case resolution consistency.
--
-- Goal
-- ────
-- Make "case closed" + "case_resolved audit event" atomic by moving both
-- writes into a single SQL function, and enforce stricter closed-case metadata
-- semantics for all NEW writes.

-- ── Constraint: closed cases must carry resolution metadata ─────────────────
--
-- Use NOT VALID so existing historical rows are not blocked during rollout.
-- New INSERT/UPDATE writes are still checked immediately.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_cases'::regclass
          AND conname = 'support_cases_closed_resolution_check'
    ) THEN
        ALTER TABLE public.support_cases
            ADD CONSTRAINT support_cases_closed_resolution_check
            CHECK (
                (status = 'open' AND closed_at IS NULL AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_outcome IS NULL)
                OR
                (status = 'closed' AND closed_at IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_outcome IS NOT NULL)
            )
            NOT VALID;
    END IF;
END$$;

-- ── Transactional function: resolve + audit in one DB transaction ──────────
CREATE OR REPLACE FUNCTION public.resolve_support_case_v1(
    p_case_id TEXT,
    p_actor_id TEXT DEFAULT NULL,
    p_resolution_notes TEXT DEFAULT NULL,
    p_resolution_outcome TEXT DEFAULT NULL
)
RETURNS TABLE (
    case_id TEXT,
    status TEXT,
    closed_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_outcome TEXT,
    audit_recorded BOOLEAN,
    audit_event_id UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_resolved_by TEXT;
    v_resolution_outcome TEXT;
    v_case public.support_cases%ROWTYPE;
    v_audit_id UUID;
BEGIN
    IF p_case_id IS NULL OR btrim(p_case_id) = '' THEN
        RAISE EXCEPTION 'p_case_id is required';
    END IF;

    v_resolved_by := COALESCE(NULLIF(btrim(p_actor_id), ''), 'system');
    v_resolution_outcome := COALESCE(NULLIF(btrim(p_resolution_outcome), ''), 'other');

    UPDATE public.support_cases
       SET status = 'closed',
           closed_at = v_now,
           resolution_notes = p_resolution_notes,
           resolved_by = v_resolved_by,
           resolved_at = v_now,
           resolution_outcome = v_resolution_outcome
     WHERE id = p_case_id
       AND status = 'open'
     RETURNING * INTO v_case;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'support case % not found or not open', p_case_id;
    END IF;

    INSERT INTO public.support_audit_log (case_id, event_type, actor_id, payload)
    VALUES (
        p_case_id,
        'case_resolved',
        v_resolved_by,
        jsonb_strip_nulls(jsonb_build_object(
            'note', p_resolution_notes,
            'resolutionOutcome', v_resolution_outcome
        ))
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY
    SELECT
        v_case.id,
        v_case.status,
        v_case.closed_at,
        v_case.resolved_at,
        v_case.resolved_by,
        v_case.resolution_outcome,
        (v_audit_id IS NOT NULL),
        v_audit_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_support_case_v1(TEXT, TEXT, TEXT, TEXT) IS
    'Atomically resolves an open support case and appends a case_resolved audit event.';
