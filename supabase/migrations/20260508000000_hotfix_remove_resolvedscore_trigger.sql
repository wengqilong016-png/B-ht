-- ═══════════════════════════════════════════════════════════════════════════════
-- Hotfix: Remove resolvedScore references from audit trigger
-- Date: 2026-05-08
-- Author: Hermes Agent 秋风
-- Severity: CRITICAL
--
-- Bug: log_sensitive_transaction_updates() referenced NEW."resolvedScore" and
--      OLD."resolvedScore" but transactions table has no such column. Any UPDATE
--      on transactions that entered this branch would throw:
--        "column resolvedScore does not exist"
--      causing the entire UPDATE to fail.
--
-- Also fixed: SET search_path = '' → SET search_path = 'public, pg_temp'
--   (empty search_path can cause auth.uid() resolution issues in some PG versions)
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop and recreate the function without the resolvedScore references
CREATE OR REPLACE FUNCTION public.log_sensitive_transaction_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, pg_temp'
AS $$
DECLARE
  v_user_role text;
BEGIN
  -- Get current user's role
  v_user_role := public.get_my_role();
  
  -- Only audit driver updates
  IF v_user_role = 'driver' THEN
    -- Check if driver is trying to update sensitive columns
    IF (
      NEW."paymentStatus" IS DISTINCT FROM OLD."paymentStatus" OR
      NEW."approvalStatus" IS DISTINCT FROM OLD."approvalStatus"
    ) THEN
      -- Log suspicious update attempt
      INSERT INTO public.security_audit_log (
        event_time,
        event_type,
        user_id,
        user_role,
        table_name,
        record_id,
        details
      ) VALUES (
        now(),
        'suspicious_transaction_update',
        auth.uid(),
        v_user_role,
        'transactions',
        NEW.id,
        jsonb_build_object(
          'old_payment_status', OLD."paymentStatus",
          'new_payment_status', NEW."paymentStatus",
          'old_approval_status', OLD."approvalStatus",
          'new_approval_status', NEW."approvalStatus"
        )
      );
      
      -- Raise error to block the update
      RAISE EXCEPTION 'Driver cannot modify sensitive transaction columns';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification:
--   SELECT prosrc FROM pg_proc WHERE proname = 'log_sensitive_transaction_updates';
-- Should NOT contain "resolvedScore" and search_path should be 'public, pg_temp'
-- ═══════════════════════════════════════════════════════════════════════════════
