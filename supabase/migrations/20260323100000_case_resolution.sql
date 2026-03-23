-- Stage-10: add resolution metadata to support_cases and extend audit event types.
--
-- Overview
-- ────────
-- Adds four columns to `support_cases` for explicit resolution tracking:
--   • resolution_notes    – operator notes / resolution summary
--   • resolved_by         – who resolved the case
--   • resolved_at         – when the case was resolved
--   • resolution_outcome  – short outcome label (e.g. "fixed", "wont-fix", "duplicate")
--
-- Also extends the `support_audit_log.event_type` CHECK constraint to allow
-- the new `case_resolved` event type.
--
-- This migration is additive and idempotent.

-- ── New columns on support_cases ────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'support_cases'
          AND column_name  = 'resolution_notes'
    ) THEN
        ALTER TABLE public.support_cases
            ADD COLUMN resolution_notes TEXT;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'support_cases'
          AND column_name  = 'resolved_by'
    ) THEN
        ALTER TABLE public.support_cases
            ADD COLUMN resolved_by TEXT;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'support_cases'
          AND column_name  = 'resolved_at'
    ) THEN
        ALTER TABLE public.support_cases
            ADD COLUMN resolved_at TIMESTAMPTZ;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'support_cases'
          AND column_name  = 'resolution_outcome'
    ) THEN
        ALTER TABLE public.support_cases
            ADD COLUMN resolution_outcome TEXT;
    END IF;
END$$;

COMMENT ON COLUMN public.support_cases.resolution_notes IS
    'Stage-10 operator notes or resolution summary.';
COMMENT ON COLUMN public.support_cases.resolved_by IS
    'Stage-10 actor who resolved the case.';
COMMENT ON COLUMN public.support_cases.resolved_at IS
    'Stage-10 timestamp when the case was resolved.';
COMMENT ON COLUMN public.support_cases.resolution_outcome IS
    'Stage-10 short outcome label, e.g. fixed, wont-fix, duplicate.';

-- ── Extend event_type CHECK constraint ──────────────────────────────────────

DO $$
BEGIN
    -- Drop the old constraint if it exists (it does not include case_resolved)
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.support_audit_log'::regclass
          AND conname  = 'support_audit_log_event_type_check'
    ) THEN
        ALTER TABLE public.support_audit_log
            DROP CONSTRAINT support_audit_log_event_type_check;
    END IF;

    ALTER TABLE public.support_audit_log
        ADD CONSTRAINT support_audit_log_event_type_check
        CHECK (event_type IN (
            'diagnostic_export',
            'health_alert_linked',
            'manual_replay_attempted',
            'manual_replay_succeeded',
            'manual_replay_failed',
            'recovery_action',
            'case_resolved'
        ));
END$$;
