-- Finance audit log — tracks debt and commission changes for accountability
-- Follows the existing support_audit_log pattern (append-only, JSONB payload)

CREATE TABLE IF NOT EXISTS public.finance_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type  TEXT NOT NULL CHECK (event_type IN (
        'startup_debt_recovery',
        'driver_debt_change',
        'commission_rate_change',
        'startup_debt_edit',
        'floating_coins_change',
        'collection_submission'
    )),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('location', 'driver')),
    entity_id   TEXT NOT NULL,
    entity_name TEXT,
    actor_id    TEXT NOT NULL,
    old_value   NUMERIC,
    new_value   NUMERIC,
    payload     JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_finance_audit_log_entity
    ON public.finance_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_audit_log_created
    ON public.finance_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_audit_log_actor
    ON public.finance_audit_log (actor_id, created_at DESC);

-- RLS
ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin can read all audit entries
CREATE POLICY finance_audit_admin_select ON public.finance_audit_log
    FOR SELECT TO authenticated
    USING (public.get_my_role() = 'admin');

-- Any authenticated user can insert (audit writes come from frontend after successful mutation)
CREATE POLICY finance_audit_insert ON public.finance_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Append-only: no UPDATE or DELETE policies
