-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Driver change audit trigger + extended event_types
-- Date: 2026-05-09
-- 
-- Every sensitive field change on the drivers table is now logged to
-- finance_audit_log. This closes the traceability gap: previously,
-- admins could change salary/commission/debt/status without any record.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Extend finance_audit_log event_type CHECK to include driver-specific events ──
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
    'driver_status_change'
  ));

-- ── Create audit trigger function ──
CREATE OR REPLACE FUNCTION public.audit_driver_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id TEXT;
BEGIN
  -- Resolve actor from auth context (admin username or driver_id)
  SELECT COALESCE(driver_id, auth_user_id::text) INTO v_actor_id
  FROM public.profiles WHERE auth_user_id = auth.uid();
  
  IF v_actor_id IS NULL THEN
    v_actor_id := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'sub', 'system');
  END IF;

  -- baseSalary change
  IF NEW."baseSalary" IS DISTINCT FROM OLD."baseSalary" THEN
    INSERT INTO public.finance_audit_log (event_type, entity_type, entity_id, entity_name, actor_id, old_value, new_value, payload)
    VALUES ('driver_salary_change', 'driver', NEW.id, NEW.name, v_actor_id,
            OLD."baseSalary", NEW."baseSalary",
            jsonb_build_object('field', 'baseSalary', 'driver', NEW.name));
  END IF;

  -- commissionRate change
  IF NEW."commissionRate" IS DISTINCT FROM OLD."commissionRate" THEN
    INSERT INTO public.finance_audit_log (event_type, entity_type, entity_id, entity_name, actor_id, old_value, new_value, payload)
    VALUES ('driver_commission_change', 'driver', NEW.id, NEW.name, v_actor_id,
            OLD."commissionRate", NEW."commissionRate",
            jsonb_build_object('field', 'commissionRate', 'driver', NEW.name));
  END IF;

  -- remainingDebt change
  IF NEW."remainingDebt" IS DISTINCT FROM OLD."remainingDebt" THEN
    INSERT INTO public.finance_audit_log (event_type, entity_type, entity_id, entity_name, actor_id, old_value, new_value, payload)
    VALUES ('driver_debt_edit', 'driver', NEW.id, NEW.name, v_actor_id,
            OLD."remainingDebt", NEW."remainingDebt",
            jsonb_build_object('field', 'remainingDebt', 'driver', NEW.name));
  END IF;

  -- initialDebt change
  IF NEW."initialDebt" IS DISTINCT FROM OLD."initialDebt" THEN
    INSERT INTO public.finance_audit_log (event_type, entity_type, entity_id, entity_name, actor_id, old_value, new_value, payload)
    VALUES ('driver_debt_edit', 'driver', NEW.id, NEW.name, v_actor_id,
            OLD."initialDebt", NEW."initialDebt",
            jsonb_build_object('field', 'initialDebt', 'driver', NEW.name));
  END IF;

  -- dailyFloatingCoins change
  IF NEW."dailyFloatingCoins" IS DISTINCT FROM OLD."dailyFloatingCoins" THEN
    INSERT INTO public.finance_audit_log (event_type, entity_type, entity_id, entity_name, actor_id, old_value, new_value, payload)
    VALUES ('floating_coins_change', 'driver', NEW.id, NEW.name, v_actor_id,
            OLD."dailyFloatingCoins", NEW."dailyFloatingCoins",
            jsonb_build_object('field', 'dailyFloatingCoins', 'driver', NEW.name));
  END IF;

  -- status change
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.finance_audit_log (event_type, entity_type, entity_id, entity_name, actor_id, old_value, new_value, payload)
    VALUES ('driver_status_change', 'driver', NEW.id, NEW.name, v_actor_id,
            NULL, NULL,
            jsonb_build_object('field', 'status', 'oldStatus', OLD.status, 'newStatus', NEW.status, 'driver', NEW.name));
  END IF;

  RETURN NEW;
END;
$$;

-- ── Apply trigger ──
DROP TRIGGER IF EXISTS trg_audit_driver_changes ON public.drivers;
CREATE TRIGGER trg_audit_driver_changes
  AFTER UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_driver_changes();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification:
--   1. Update a driver's baseSalary via Supabase dashboard → check finance_audit_log
--   2. Run: SELECT * FROM finance_audit_log WHERE event_type LIKE 'driver_%' ORDER BY created_at DESC LIMIT 5;
--   3. The trigger is SECURITY DEFINER — bypasses column-level REVOKE on drivers.
--      This is intentional: the trigger writes the audit record, not the caller.
-- ═══════════════════════════════════════════════════════════════════════════════
