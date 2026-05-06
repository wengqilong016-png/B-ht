-- =============================================================================
-- Fix CRITICAL #1: SECURITY DEFINER functions missing auth checks
--
-- Problem: record_task_settlement and submit_daily_reconciliation are
-- SECURITY DEFINER but had NO auth.uid() verification. Any authenticated
-- user could call them directly and bypass RLS to manipulate financial data.
--
-- Fix: Add permission gates at function entry:
--   - Driver: must be the task's assigned driver (auth.uid → profiles.driver_id)
--   - Admin:  allowed for all tasks
-- =============================================================================

-- ── RPC 1: record_task_settlement ──────────────────────────────────────────
-- Was: anyone authenticated could settle any task.
-- Now: only the assigned driver or admin.
DROP FUNCTION IF EXISTS public.record_task_settlement(UUID);
CREATE OR REPLACE FUNCTION public.record_task_settlement(
  p_task_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task          RECORD;
  v_settlement_id UUID;
  v_commission    NUMERIC(12,2);
  v_dividend      NUMERIC(12,2);
  v_platform_net  NUMERIC(12,2);
BEGIN
  -- Lock the task row
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task % not found', p_task_id;
  END IF;

  -- ═══ PERMISSION GATE: only assigned driver or admin ═══
  IF public.get_my_role() <> 'admin'
     AND v_task.driver_id <> public.get_my_driver_id() THEN
    RAISE EXCEPTION 'Permission denied: only the assigned driver or admin may settle task %', p_task_id;
  END IF;

  IF v_task.settlement_status <> 'pending' THEN
    RAISE EXCEPTION 'Task % is already %', p_task_id, v_task.settlement_status;
  END IF;

  -- Calculate splits using the snapshotted dividend rate
  v_commission   := COALESCE(v_task.gross_revenue, 0) * COALESCE(
    (SELECT d.commission_rate FROM public.drivers d WHERE d.id = v_task.driver_id), 0
  );
  v_dividend     := COALESCE(v_task.gross_revenue, 0) * COALESCE(v_task.dividend_rate_snapshot, 0);
  v_platform_net := COALESCE(v_task.gross_revenue, 0) - v_commission - v_dividend;

  -- Update task status
  UPDATE public.tasks
    SET settlement_status = 'settled', updated_at = now()
    WHERE id = p_task_id;

  -- Insert settlement record
  INSERT INTO public.task_settlements
    (task_id, driver_id, merchant_id, gross_revenue, driver_commission, merchant_dividend, platform_net)
  VALUES
    (p_task_id, v_task.driver_id, v_task.merchant_id, COALESCE(v_task.gross_revenue,0), v_commission, v_dividend, v_platform_net)
  RETURNING id INTO v_settlement_id;

  -- Credit driver commission (coin balance)
  UPDATE public.drivers
    SET coin_balance = coin_balance + v_commission, updated_at = now()
    WHERE id = v_task.driver_id;

  INSERT INTO public.driver_fund_ledger (driver_id, entry_type, coin_delta, ref_id, note)
  VALUES (v_task.driver_id, 'commission', v_commission, v_settlement_id, 'auto: task settlement');

  -- Record merchant dividend in ledger
  IF v_task.merchant_id IS NOT NULL THEN
    UPDATE public.merchants
      SET retained_balance = retained_balance + v_dividend, updated_at = now()
      WHERE id = v_task.merchant_id;

    INSERT INTO public.merchant_ledger (merchant_id, entry_type, amount, ref_id, note)
    VALUES (v_task.merchant_id, 'dividend', v_dividend, v_settlement_id, 'auto: task settlement');
  END IF;

  RETURN v_settlement_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_task_settlement(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_task_settlement(UUID) TO authenticated;

-- ── RPC 2: submit_daily_reconciliation ────────────────────────────────────
-- Was: anyone authenticated could submit reconciliation for any driver_id.
-- Now: only the given driver or admin.
DROP FUNCTION IF EXISTS public.submit_daily_reconciliation(TEXT, DATE, TEXT);
CREATE OR REPLACE FUNCTION public.submit_daily_reconciliation(
  p_driver_id TEXT,
  p_recon_date DATE,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_driver          RECORD;
  v_prev_closing    NUMERIC(12,2);
  v_today_delta     NUMERIC(12,2);
  v_opening         NUMERIC(12,2);
  v_closing         NUMERIC(12,2);
  v_recon_id        UUID;
BEGIN
  -- ═══ PERMISSION GATE: only the given driver or admin ═══
  IF public.get_my_role() <> 'admin'
     AND p_driver_id <> public.get_my_driver_id() THEN
    RAISE EXCEPTION 'Permission denied: only driver % or admin may submit a reconciliation', p_driver_id;
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Driver % not found', p_driver_id; END IF;

  -- Sum today's ledger deltas
  SELECT COALESCE(SUM(coin_delta + cash_delta), 0) INTO v_today_delta
    FROM public.driver_fund_ledger
    WHERE driver_id = p_driver_id
      AND created_at::date = p_recon_date;

  -- Previous confirmed closing balance
  SELECT closing_balance INTO v_prev_closing
    FROM public.daily_driver_reconciliations
    WHERE driver_id = p_driver_id
      AND status = 'confirmed'
    ORDER BY recon_date DESC
    LIMIT 1;

  IF v_prev_closing IS NOT NULL THEN
    v_opening := v_prev_closing;
  ELSE
    -- First reconciliation: opening = current_balance − today_delta
    v_opening := (v_driver.coin_balance + v_driver.cash_balance) - v_today_delta;
  END IF;

  v_closing := v_opening + v_today_delta;

  INSERT INTO public.daily_driver_reconciliations
    (driver_id, recon_date, opening_balance, closing_balance, ledger_delta, submitted_by, note)
  VALUES
    (p_driver_id, p_recon_date, v_opening, v_closing, v_today_delta, p_driver_id, p_note)
  RETURNING id INTO v_recon_id;

  RETURN v_recon_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_daily_reconciliation(TEXT, DATE, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_daily_reconciliation(TEXT, DATE, TEXT) TO authenticated;
