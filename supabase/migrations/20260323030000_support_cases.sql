-- Stage-9: support_cases table.
--
-- Overview
-- ────────
-- A lightweight support case entity used to group operator actions.
-- Cases carry a short title, an open/closed status, and timestamps.
-- They are referenced by `case_id` in `support_audit_log` for traceability.
--
-- This migration is additive and idempotent (IF NOT EXISTS everywhere).

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_cases (
    id          TEXT        PRIMARY KEY,               -- operator-assigned case ID (e.g. CASE-2026-001)
    title       TEXT        NOT NULL DEFAULT '',        -- short human-readable summary
    status      TEXT        NOT NULL DEFAULT 'open',    -- 'open' | 'closed'
    created_by  TEXT,                                   -- actor who opened the case
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at   TIMESTAMPTZ                             -- set when status → 'closed'
);

COMMENT ON TABLE  public.support_cases IS
    'Stage-9 lightweight support case entity for grouping operator actions.';
COMMENT ON COLUMN public.support_cases.id IS
    'Operator-assigned case ID, same value used in support_audit_log.case_id.';
COMMENT ON COLUMN public.support_cases.status IS
    'Case lifecycle status: open | closed.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS support_cases_status_idx
    ON public.support_cases (status);

CREATE INDEX IF NOT EXISTS support_cases_created_at_idx
    ON public.support_cases (created_at DESC);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;

-- Admins may read all cases.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_cases'
          AND policyname = 'sc_admin_select'
    ) THEN
        CREATE POLICY sc_admin_select ON public.support_cases
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

-- Admins may insert new cases.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_cases'
          AND policyname = 'sc_admin_insert'
    ) THEN
        CREATE POLICY sc_admin_insert ON public.support_cases
            FOR INSERT TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id   = auth.uid()
                      AND profiles.role = 'admin'
                )
            );
    END IF;
END$$;

-- Admins may update cases (e.g. closing them).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'support_cases'
          AND policyname = 'sc_admin_update'
    ) THEN
        CREATE POLICY sc_admin_update ON public.support_cases
            FOR UPDATE TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id   = auth.uid()
                      AND profiles.role = 'admin'
                )
            );
    END IF;
END$$;
