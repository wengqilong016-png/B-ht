-- Production full baseline pack
-- 02_support_and_audit.sql
--
-- Purpose
-- -------
-- Third layer of the coherent production baseline pack.
-- This layer adds support-case management and append-only operator audit.
--
-- Scope
-- -----
--   * public.support_cases
--   * public.support_audit_log
--   * support indexes and constraints
--   * transactional support-case resolution function
--   * support/admin RLS aligned to profiles.auth_user_id
--
-- Assumes
-- -------
-- 00_identity_and_assignment.sql has already been applied.
-- 01_business_flow.sql may already be applied, but is not required for this layer.

-- Tables ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_cases (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'open',
    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at           TIMESTAMPTZ,
    resolution_notes    TEXT,
    resolved_by         TEXT,
    resolved_at         TIMESTAMPTZ,
    resolution_outcome  TEXT
);

CREATE TABLE IF NOT EXISTS public.support_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     TEXT,
    event_type  TEXT NOT NULL,
    actor_id    TEXT,
    payload     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints ----------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_cases'::regclass
          AND conname = 'support_cases_status_check_full_v1'
    ) THEN
        ALTER TABLE public.support_cases
            ADD CONSTRAINT support_cases_status_check_full_v1
            CHECK (status IN ('open', 'closed'));
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_cases'::regclass
          AND conname = 'support_cases_resolution_outcome_check_full_v1'
    ) THEN
        ALTER TABLE public.support_cases
            ADD CONSTRAINT support_cases_resolution_outcome_check_full_v1
            CHECK (
                resolution_outcome IS NULL OR resolution_outcome IN (
                    'fixed',
                    'wont-fix',
                    'duplicate',
                    'cannot-reproduce',
                    'other'
                )
            );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_cases'::regclass
          AND conname = 'support_cases_closed_resolution_check_full_v1'
    ) THEN
        ALTER TABLE public.support_cases
            ADD CONSTRAINT support_cases_closed_resolution_check_full_v1
            CHECK (
                (status = 'open' AND closed_at IS NULL AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_outcome IS NULL)
                OR
                (status = 'closed' AND closed_at IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_outcome IS NOT NULL)
            )
            NOT VALID;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_audit_log'::regclass
          AND conname = 'support_audit_log_event_type_check_full_v1'
    ) THEN
        ALTER TABLE public.support_audit_log
            ADD CONSTRAINT support_audit_log_event_type_check_full_v1
            CHECK (
                event_type IN (
                    'diagnostic_export',
                    'health_alert_linked',
                    'manual_replay_attempted',
                    'manual_replay_succeeded',
                    'manual_replay_failed',
                    'recovery_action',
                    'case_resolved'
                )
            );
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_audit_log'::regclass
          AND conname = 'support_audit_log_case_id_not_blank_full_v1'
    ) THEN
        ALTER TABLE public.support_audit_log
            ADD CONSTRAINT support_audit_log_case_id_not_blank_full_v1
            CHECK (case_id IS NULL OR length(btrim(case_id)) > 0)
            NOT VALID;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_audit_log'::regclass
          AND conname = 'support_audit_log_case_id_fkey_full_v1'
    ) THEN
        ALTER TABLE public.support_audit_log
            ADD CONSTRAINT support_audit_log_case_id_fkey_full_v1
            FOREIGN KEY (case_id)
            REFERENCES public.support_cases(id)
            NOT VALID;
    END IF;
END$$;

-- Indexes --------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS support_cases_status_idx_full_v1
    ON public.support_cases (status);

CREATE INDEX IF NOT EXISTS support_cases_created_at_idx_full_v1
    ON public.support_cases (created_at DESC);

CREATE INDEX IF NOT EXISTS support_audit_log_case_id_idx_full_v1
    ON public.support_audit_log (case_id)
    WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_audit_log_created_at_idx_full_v1
    ON public.support_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS support_audit_log_event_type_idx_full_v1
    ON public.support_audit_log (event_type);

CREATE INDEX IF NOT EXISTS support_audit_log_case_id_created_at_idx_full_v1
    ON public.support_audit_log (case_id, created_at DESC)
    WHERE case_id IS NOT NULL;

-- Helper function ------------------------------------------------------------

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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_resolved_by TEXT;
    v_resolution_outcome TEXT;
    v_case public.support_cases%ROWTYPE;
    v_audit_id UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Permission denied: caller is not an admin';
    END IF;

    IF p_case_id IS NULL OR btrim(p_case_id) = '' THEN
        RAISE EXCEPTION 'p_case_id is required';
    END IF;

    v_resolved_by := COALESCE(NULLIF(btrim(p_actor_id), ''), auth.uid()::text, 'system');
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

REVOKE EXECUTE ON FUNCTION public.resolve_support_case_v1(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_support_case_v1(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- RLS ------------------------------------------------------------------------

ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_cases'
          AND policyname = 'support_cases_admin_select_full_v1'
    ) THEN
        CREATE POLICY support_cases_admin_select_full_v1
            ON public.support_cases
            FOR SELECT
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_cases'
          AND policyname = 'support_cases_admin_insert_full_v1'
    ) THEN
        CREATE POLICY support_cases_admin_insert_full_v1
            ON public.support_cases
            FOR INSERT
            TO authenticated
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_cases'
          AND policyname = 'support_cases_admin_update_full_v1'
    ) THEN
        CREATE POLICY support_cases_admin_update_full_v1
            ON public.support_cases
            FOR UPDATE
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_audit_log'
          AND policyname = 'support_audit_log_admin_select_full_v1'
    ) THEN
        CREATE POLICY support_audit_log_admin_select_full_v1
            ON public.support_audit_log
            FOR SELECT
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_audit_log'
          AND policyname = 'support_audit_log_auth_insert_full_v1'
    ) THEN
        CREATE POLICY support_audit_log_auth_insert_full_v1
            ON public.support_audit_log
            FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;
END$$;

-- Notes ----------------------------------------------------------------------
-- 1. This layer aligns all admin checks to profiles.auth_user_id via public.is_admin().
-- 2. support_audit_log remains append-only; no update/delete policies are added.
-- 3. The next coherent production file should be 03_diagnostics_and_health.sql.
