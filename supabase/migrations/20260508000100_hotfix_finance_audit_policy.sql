-- ═══════════════════════════════════════════════════════════════════════════════
-- Hotfix: Tighten finance_audit_log INSERT policy
-- Date: 2026-05-08
-- Severity: CRITICAL
--
-- Bug: finance_audit_insert allowed ANY authenticated user (including drivers)
--      to insert arbitrary audit records with any actor_id. A malicious driver
--      could poison the financial audit trail with fake entries.
--
-- Fix: Drivers can only insert records where actor_id = their own driver_id.
--      Admins can insert records for any actor_id (as before).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS finance_audit_insert ON public.finance_audit_log;

-- Drivers: can only insert records where actor_id matches their own driver_id
-- Admins: can insert records for any actor_id
CREATE POLICY finance_audit_insert ON public.finance_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_my_role() = 'admin'
        OR (
            public.get_my_role() = 'driver'
            AND actor_id = public.get_my_driver_id()
        )
    );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification:
--   -- As admin (should succeed):
--     INSERT INTO finance_audit_log(event_type,entity_type,entity_id,actor_id)
--     VALUES ('floating_coins_change','location','loc123','admin-actor');
--   -- As driver (should succeed with own actor_id):
--     INSERT INTO finance_audit_log(event_type,entity_type,entity_id,actor_id)
--     VALUES ('driver_debt_change','driver','d123','{my-driver-id}');
--   -- As driver (should FAIL - different actor_id):
--     INSERT INTO finance_audit_log(event_type,entity_type,entity_id,actor_id)
--     VALUES ('driver_debt_change','driver','d456','other-driver-id');
-- ═══════════════════════════════════════════════════════════════════════════════
