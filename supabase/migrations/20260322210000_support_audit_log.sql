-- Stage-9: support audit log table.
--
-- Overview
-- ────────
-- storage:   `support_audit_log` table — one row per operator action linked to a
--            support case ID.  Records are written by `recordAuditEvent()` in
--            `services/supportCaseService.ts` and read back by `fetchAuditLog()`.
-- linkage:   every row carries an optional `case_id` (free-form string set by the
--            operator).  Diagnostics exports, health-alert acknowledgements, and
--            manual replay attempts can all be linked to the same case.
-- retention: rows are never automatically deleted — the table provides a permanent
--            operator-visible audit trail.
--
-- This migration is intentionally additive and idempotent (uses IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS / CREATE POLICY IF NOT EXISTS).

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_audit_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     TEXT,                                   -- operator-assigned support case ref
    event_type  TEXT        NOT NULL,                   -- e.g. 'manual_replay_attempted'
    actor_id    TEXT,                                   -- authenticated user / device id
    payload     JSONB,                                  -- structured event details (no PII)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.support_audit_log IS
    'Stage-9 operator audit trail for support and recovery actions.';
COMMENT ON COLUMN public.support_audit_log.case_id IS
    'Optional free-form support case reference set by the operator.';
COMMENT ON COLUMN public.support_audit_log.event_type IS
    'Enumerated action type: diagnostic_export | health_alert_linked | '
    'manual_replay_attempted | manual_replay_succeeded | manual_replay_failed | recovery_action.';
COMMENT ON COLUMN public.support_audit_log.payload IS
    'Structured details safe for operator review — must not contain PII, GPS, or '
    'raw finance data.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS support_audit_log_case_id_idx
    ON public.support_audit_log (case_id)
    WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_audit_log_created_at_idx
    ON public.support_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS support_audit_log_event_type_idx
    ON public.support_audit_log (event_type);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.support_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins may read all rows.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_audit_log'
          AND policyname = 'sal_admin_select'
    ) THEN
        CREATE POLICY sal_admin_select ON public.support_audit_log
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id   = auth.uid()
                      AND profiles.role = 'admin'
                )
            );
    END IF;
END$$;

-- Authenticated users may insert audit events (fire-and-forget from the client).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_audit_log'
          AND policyname = 'sal_auth_insert'
    ) THEN
        CREATE POLICY sal_auth_insert ON public.support_audit_log
            FOR INSERT TO authenticated
            WITH CHECK (true);
    END IF;
END$$;

-- No updates or deletes — the audit log is append-only.
