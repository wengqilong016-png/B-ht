-- =============================================================================
-- Phase 2 — Ledger & Reconciliation
-- File: supabase/migrations/20240105000000_phase2_ledger_reconciliation.sql
--
-- This migration is the SINGLE SOURCE OF TRUTH for Phase 2 ledger, settlement,
-- and reconciliation tables and RPCs.
--
-- Depends on: 20240104000000_phase1_complete_schema.sql
--
-- Business rules enforced here:
--   • dividend_rate_snapshot must be captured at task creation time.
--   • settlement_status transitions: pending → settled (via record_task_settlement).
--   • Driver balance (coin_balance/cash_balance) must never go negative.
--   • Merchant retained_balance / debt_balance are column-level REVOKEd
--     (done in Phase 1); Boss reads via SECURITY DEFINER RPCs here.
--   • initial_coin_loan: 未指定 (not specified in current schema).
--     Minimal default: not enforced — callers must handle externally until
--     a future migration adds the field + RPC.  Risk: no DB-level guard.
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. task_settlements — one row per settled task
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.task_settlements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                UUID NOT NULL REFERENCES public.tasks(id),
  driver_id              TEXT NOT NULL REFERENCES public.drivers(id),
  merchant_id            TEXT REFERENCES public.merchants(id),
  gross_revenue          NUMERIC(12,2) NOT NULL,
  driver_commission      NUMERIC(12,2) NOT NULL,
  merchant_dividend      NUMERIC(12,2) NOT NULL,
  platform_net           NUMERIC(12,2) NOT NULL,
  settled_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_settlements IS 'Phase 2 — immutable settlement record for each completed task.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. merchant_ledger — append-only merchant balance changes
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.merchant_ledger (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id  TEXT NOT NULL REFERENCES public.merchants(id),
  entry_type   TEXT NOT NULL
                 CHECK (entry_type IN (
                   'dividend','debt_record','retained_payout','offset','manual_adjustment'
                 )),
  amount       NUMERIC(12,2) NOT NULL,
  ref_id       UUID,            -- task_id or settlement_id or reconciliation_id
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.merchant_ledger IS 'Phase 2 — append-only ledger for merchant balance mutations.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. driver_fund_ledger — append-only driver balance changes
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.driver_fund_ledger (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    TEXT NOT NULL REFERENCES public.drivers(id),
  entry_type   TEXT NOT NULL
                 CHECK (entry_type IN (
                   'commission','coin_exchange','payout','salary','manual_adjustment'
                 )),
  coin_delta   NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_delta   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ref_id       UUID,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.driver_fund_ledger IS 'Phase 2 — append-only ledger for driver coin/cash balance mutations.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. daily_driver_reconciliations — end-of-day reconciliation per driver
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.daily_driver_reconciliations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id        TEXT NOT NULL REFERENCES public.drivers(id),
  recon_date       DATE NOT NULL,
  opening_balance  NUMERIC(12,2) NOT NULL,
  closing_balance  NUMERIC(12,2) NOT NULL,
  ledger_delta     NUMERIC(12,2) NOT NULL,
  submitted_by     TEXT NOT NULL, -- driver_id
  confirmed_by     TEXT,          -- admin id (NULL until confirmed)
  status           TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted','confirmed','disputed')),
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at     TIMESTAMPTZ,
  UNIQUE (driver_id, recon_date)
);

COMMENT ON TABLE public.daily_driver_reconciliations IS
  'Phase 2 — one row per driver per day; opening formula: if no previous confirmed, opening = current_balance − today_ledger_delta.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. merchant_balance_snapshots — periodic merchant balance snapshots
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.merchant_balance_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       TEXT NOT NULL REFERENCES public.merchants(id),
  snapshot_date     DATE NOT NULL,
  retained_balance  NUMERIC(12,2) NOT NULL,
  debt_balance      NUMERIC(12,2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, snapshot_date)
);

COMMENT ON TABLE public.merchant_balance_snapshots IS
  'Phase 2 — daily snapshot of merchant balances (readable by Boss via RPC since columns are REVOKEd).';

-- ─── RLS on new tables ──────────────────────────────────────────────────────

ALTER TABLE public.task_settlements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_ledger             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_fund_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_driver_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_balance_snapshots  ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY admin_all_task_settlements           ON public.task_settlements            FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY admin_all_merchant_ledger            ON public.merchant_ledger             FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY admin_all_driver_fund_ledger         ON public.driver_fund_ledger          FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY admin_all_daily_driver_reconciliations ON public.daily_driver_reconciliations FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY admin_all_merchant_balance_snapshots ON public.merchant_balance_snapshots  FOR ALL USING (public.get_my_role() = 'admin');

-- Driver: own rows
CREATE POLICY driver_select_own_settlements        ON public.task_settlements     FOR SELECT USING (driver_id = public.get_my_driver_id());
CREATE POLICY driver_select_own_fund_ledger        ON public.driver_fund_ledger   FOR SELECT USING (driver_id = public.get_my_driver_id());
CREATE POLICY driver_select_own_reconciliations    ON public.daily_driver_reconciliations FOR SELECT USING (driver_id = public.get_my_driver_id());
CREATE POLICY driver_insert_own_reconciliations    ON public.daily_driver_reconciliations FOR INSERT WITH CHECK (driver_id = public.get_my_driver_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 1: record_task_settlement
-- Settles a pending task: writes task_settlements, updates task status,
-- credits driver commission, records merchant dividend.
-- ═════════════════════════════════════════════════════════════════════════════
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

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 2: submit_daily_reconciliation
-- Driver submits end-of-day reconciliation.
-- Opening formula: if no previous confirmed row exists for this driver,
-- opening = current_balance − today_ledger_delta (prevents double count).
-- ═════════════════════════════════════════════════════════════════════════════
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

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 3: confirm_daily_reconciliation  (Boss-only)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirm_daily_reconciliation(
  p_reconciliation_id UUID,
  p_confirmed_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may confirm reconciliations';
  END IF;

  UPDATE public.daily_driver_reconciliations
    SET status = 'confirmed', confirmed_by = p_confirmed_by, confirmed_at = now()
    WHERE id = p_reconciliation_id AND status = 'submitted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation % not found or not in submitted status', p_reconciliation_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_daily_reconciliation(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_daily_reconciliation(UUID, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 4: record_merchant_debt  (Boss-only)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_merchant_debt(
  p_merchant_id TEXT,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may record merchant debt';
  END IF;

  UPDATE public.merchants
    SET debt_balance = debt_balance + p_amount, updated_at = now()
    WHERE id = p_merchant_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Merchant % not found', p_merchant_id; END IF;

  INSERT INTO public.merchant_ledger (merchant_id, entry_type, amount, ref_id, note)
  VALUES (p_merchant_id, 'debt_record', p_amount, NULL, p_note)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_merchant_debt(TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_merchant_debt(TEXT, NUMERIC, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 5: record_retained_payout  (Boss-only)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_retained_payout(
  p_merchant_id TEXT,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id UUID;
  v_current  NUMERIC(12,2);
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may record retained payouts';
  END IF;

  SELECT retained_balance INTO v_current FROM public.merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Merchant % not found', p_merchant_id; END IF;
  IF v_current < p_amount THEN
    RAISE EXCEPTION 'Insufficient retained balance for merchant %: have %, requested %', p_merchant_id, v_current, p_amount;
  END IF;

  UPDATE public.merchants
    SET retained_balance = retained_balance - p_amount, updated_at = now()
    WHERE id = p_merchant_id;

  INSERT INTO public.merchant_ledger (merchant_id, entry_type, amount, ref_id, note)
  VALUES (p_merchant_id, 'retained_payout', -p_amount, NULL, p_note)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_retained_payout(TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_retained_payout(TEXT, NUMERIC, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 6: offset_retained_to_debt  (Boss-only)
-- Transfers retained balance to offset existing debt for a merchant.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.offset_retained_to_debt(
  p_merchant_id TEXT,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id UUID;
  v_merchant RECORD;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may offset retained to debt';
  END IF;

  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_merchant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Merchant % not found', p_merchant_id; END IF;
  IF v_merchant.retained_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient retained balance: have %, requested %', v_merchant.retained_balance, p_amount;
  END IF;
  IF v_merchant.debt_balance < p_amount THEN
    RAISE EXCEPTION 'Offset exceeds debt balance: debt %, requested %', v_merchant.debt_balance, p_amount;
  END IF;

  UPDATE public.merchants
    SET retained_balance = retained_balance - p_amount,
        debt_balance     = debt_balance     - p_amount,
        updated_at       = now()
    WHERE id = p_merchant_id;

  INSERT INTO public.merchant_ledger (merchant_id, entry_type, amount, ref_id, note)
  VALUES (p_merchant_id, 'offset', -p_amount, NULL, COALESCE(p_note, 'offset retained→debt'))
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.offset_retained_to_debt(TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.offset_retained_to_debt(TEXT, NUMERIC, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 7: approve_score_reset  (Boss-only)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.approve_score_reset(
  p_request_id UUID,
  p_reviewed_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req RECORD;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may approve score resets';
  END IF;

  SELECT * INTO v_req FROM public.score_reset_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request % is already %', p_request_id, v_req.status;
  END IF;

  UPDATE public.score_reset_requests
    SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_at = now()
    WHERE id = p_request_id;

  UPDATE public.kiosks
    SET last_score = v_req.requested_score, updated_at = now()
    WHERE id = v_req.kiosk_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_score_reset(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_score_reset(UUID, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 8: reject_score_reset  (Boss-only)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reject_score_reset(
  p_request_id UUID,
  p_reviewed_by TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may reject score resets';
  END IF;

  UPDATE public.score_reset_requests
    SET status = 'rejected', reviewed_by = p_reviewed_by, reviewed_at = now(), reason = p_reason
    WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % not found or not pending', p_request_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_score_reset(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reject_score_reset(UUID, TEXT, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC 9: manual_adjustment_driver  (Boss-only)
-- Applies a manual coin/cash adjustment.  Negative balances are NOT allowed
-- (current authoritative rule — change requires a separate migration PR).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.manual_adjustment_driver(
  p_driver_id TEXT,
  p_coin_delta NUMERIC DEFAULT 0,
  p_cash_delta NUMERIC DEFAULT 0,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_driver   RECORD;
  v_entry_id UUID;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may perform manual adjustments';
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Driver % not found', p_driver_id; END IF;

  -- Negative balance protection (no admin override — authoritative rule)
  IF (v_driver.coin_balance + p_coin_delta) < 0 THEN
    RAISE EXCEPTION 'Adjustment would make coin_balance negative for driver %: current %, delta %',
      p_driver_id, v_driver.coin_balance, p_coin_delta;
  END IF;
  IF (v_driver.cash_balance + p_cash_delta) < 0 THEN
    RAISE EXCEPTION 'Adjustment would make cash_balance negative for driver %: current %, delta %',
      p_driver_id, v_driver.cash_balance, p_cash_delta;
  END IF;

  UPDATE public.drivers
    SET coin_balance = coin_balance + p_coin_delta,
        cash_balance = cash_balance + p_cash_delta,
        updated_at   = now()
    WHERE id = p_driver_id;

  INSERT INTO public.driver_fund_ledger (driver_id, entry_type, coin_delta, cash_delta, ref_id, note)
  VALUES (p_driver_id, 'manual_adjustment', p_coin_delta, p_cash_delta, NULL, p_note)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manual_adjustment_driver(TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.manual_adjustment_driver(TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Boss-only read RPC: get_merchant_balances
-- Because retained_balance / debt_balance are column-level REVOKEd,
-- Boss must read via this SECURITY DEFINER function.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_merchant_balances(
  p_merchant_id TEXT
)
RETURNS TABLE (
  merchant_id      TEXT,
  retained_balance NUMERIC,
  debt_balance     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may read merchant balances';
  END IF;

  RETURN QUERY
    SELECT m.id, m.retained_balance, m.debt_balance
    FROM public.merchants m
    WHERE m.id = p_merchant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_merchant_balances(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_merchant_balances(TEXT) TO authenticated;

COMMIT;
