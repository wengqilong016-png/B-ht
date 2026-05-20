-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add collection_submission event_type to finance_audit_log
-- Date: 2026-05-19
--
-- The submitCollectionV2 service now writes a fire-and-forget audit entry
-- after every successful server-authoritative collection submission.
-- This closes the M2 gap: high-value audit entries previously siloed in
-- localStorage are now persisted in Postgres.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Extend finance_audit_log event_type CHECK to include collection_submission
ALTER TABLE public.finance_audit_log DROP CONSTRAINT IF EXISTS finance_audit_log_event_type_check;
ALTER TABLE public.finance_audit_log ADD CONSTRAINT finance_audit_log_event_type_check
  CHECK (event_type IN (
    'startup_debt_recovery',
    'driver_debt_change',
    'commission_rate_change',
    'startup_debt_edit',
    'floating_coins_change',
    'force_clear_blockers',
    'location_delete',
    'driver_salary_change',
    'driver_commission_change',
    'driver_debt_edit',
    'driver_status_change',
    'collection_submission'
  ));

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification:
--   1. Submit a collection through the app → check finance_audit_log
--   2. SELECT * FROM finance_audit_log WHERE event_type = 'collection_submission'
--      ORDER BY created_at DESC LIMIT 5;
--   3. Confirm the payload contains revenue, commission, debtDeduction, etc.
-- ═══════════════════════════════════════════════════════════════════════════════
