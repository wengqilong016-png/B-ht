-- Repair linked-database lint failures exposed by Validate Supabase Changes.
-- 1) Resolve ambiguous "status" reference in resolve_support_case_v1().
-- 2) Backfill queue_health_reports.sync_state for older remote databases.

DO $$
BEGIN
    IF to_regclass('public.support_cases') IS NOT NULL
       AND to_regclass('public.support_audit_log') IS NOT NULL
       AND to_regprocedure('public.is_admin()') IS NOT NULL THEN
        EXECUTE $fn$
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
            AS $body$
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
                   AND public.support_cases.status = 'open'
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
            $body$;
        $fn$;

        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.resolve_support_case_v1(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.resolve_support_case_v1(TEXT, TEXT, TEXT, TEXT) TO authenticated';
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.queue_health_reports') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.queue_health_reports ADD COLUMN IF NOT EXISTS sync_state TEXT';
        EXECUTE $$UPDATE public.queue_health_reports SET sync_state = 'idle' WHERE sync_state IS NULL$$;
        EXECUTE $$ALTER TABLE public.queue_health_reports ALTER COLUMN sync_state SET DEFAULT 'idle'$$;
        EXECUTE $$ALTER TABLE public.queue_health_reports ALTER COLUMN sync_state SET NOT NULL$$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.queue_health_reports') IS NOT NULL
       AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'queue_health_reports_sync_state_check'
          AND conrelid = 'public.queue_health_reports'::regclass
    ) THEN
        ALTER TABLE public.queue_health_reports
            ADD CONSTRAINT queue_health_reports_sync_state_check
            CHECK (sync_state IN ('idle', 'syncing', 'degraded', 'offline'));
    END IF;
END;
$$;
