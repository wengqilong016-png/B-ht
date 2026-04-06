-- Fix: restore correct revenue formula (diff * 200) and retention logic in
-- submit_collection_v2.
--
-- The hotfix migration 20260406010000 correctly fixed the auth query
-- (user_profiles → profiles) but accidentally introduced two financial bugs:
--
--   BUG 1: v_revenue := p_current_score - lastScore
--           Should be: v_diff := ...; v_revenue := v_diff * 200
--           (COIN_VALUE_TZS = 200 in types/constants.ts)
--
--   BUG 2: commission rate default 0.3 (should be 0.15 = DEFAULT_PROFIT_SHARE)
--
-- This migration re-deploys submit_collection_v2 with:
--   - Correct auth (profiles.auth_user_id) from 20260406010000
--   - Correct revenue = diff * 200  (from 20260404033000)
--   - Correct commission rate default = 0.15  (from types/constants.ts)
--   - Correct retention: is_owner_retaining=false → 0; else COALESCE(p_owner_retention, v_commission)
--   - Idempotent ON CONFLICT (id) DO NOTHING (from 20260406010000)
--
-- Also fixes calculate_finance_v2 to properly honour is_owner_retaining=false.
-- Also adds a UNIQUE constraint on daily_settlements(driverId, date) and
-- removes any pre-existing duplicate test rows.

-- ─── 1. Fix submit_collection_v2 ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_collection_v2(
    p_tx_id                  TEXT,
    p_location_id            UUID,
    p_driver_id              TEXT,
    p_current_score          INTEGER,
    p_expenses               INTEGER  DEFAULT 0,
    p_tip                    INTEGER  DEFAULT 0,
    p_startup_debt_deduction INTEGER  DEFAULT 0,
    p_is_owner_retaining     BOOLEAN  DEFAULT TRUE,
    p_owner_retention        NUMERIC  DEFAULT NULL,
    p_coin_exchange          INTEGER  DEFAULT 0,
    p_gps                    JSONB    DEFAULT NULL,
    p_photo_url              TEXT     DEFAULT NULL,
    p_ai_score               INTEGER  DEFAULT NULL,
    p_anomaly_flag           BOOLEAN  DEFAULT FALSE,
    p_notes                  TEXT     DEFAULT NULL,
    p_expense_type           TEXT     DEFAULT NULL,
    p_expense_category       TEXT     DEFAULT NULL,
    p_reported_status        TEXT     DEFAULT 'active',
    p_expense_description    TEXT     DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_profile      RECORD;
    v_location            RECORD;
    v_driver              RECORD;
    v_commission_rate     NUMERIC;
    v_diff                INTEGER;
    v_revenue             NUMERIC;
    v_commission          NUMERIC;
    v_final_retention     NUMERIC;
    v_available_after_core_deductions NUMERIC;
    v_startup_debt_deduction NUMERIC;
    v_net_payable         NUMERIC;
    v_now                 TIMESTAMPTZ := NOW();
    v_rows_inserted       INTEGER;
BEGIN
    -- Authenticate caller: profiles.auth_user_id FK → auth.users.id
    SELECT * INTO v_caller_profile
    FROM public.profiles
    WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF v_caller_profile.role NOT IN ('admin', 'driver') THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    IF v_caller_profile.role = 'driver' AND v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
        RAISE EXCEPTION 'Permission denied: driver mismatch';
    END IF;

    -- Fetch location
    SELECT * INTO v_location FROM public.locations WHERE id = p_location_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id;
    END IF;

    -- Fetch driver
    SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id;
    END IF;

    -- Finance computation
    -- score diff multiplied by COIN_VALUE_TZS (200) to convert to TZS
    v_commission_rate := COALESCE(v_location."commissionRate", 0.15);
    v_diff            := GREATEST(0, p_current_score - COALESCE(v_location."lastScore", 0));
    v_revenue         := v_diff * 200;
    v_commission      := FLOOR(v_revenue * v_commission_rate);

    IF p_is_owner_retaining THEN
        v_final_retention := GREATEST(0, COALESCE(p_owner_retention, v_commission));
    ELSE
        v_final_retention := 0;
    END IF;

    v_available_after_core_deductions :=
        GREATEST(0, v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0)));

    v_startup_debt_deduction := LEAST(
        GREATEST(0, COALESCE(p_startup_debt_deduction, 0)),
        GREATEST(0, COALESCE(v_location."remainingStartupDebt", 0)),
        v_available_after_core_deductions
    );

    v_net_payable := GREATEST(0, v_available_after_core_deductions - v_startup_debt_deduction);

    INSERT INTO public.transactions (
        id, "timestamp", "uploadTimestamp",
        "locationId", "locationName", "driverId", "driverName",
        "previousScore", "currentScore",
        revenue, commission, "ownerRetention",
        "debtDeduction", "startupDebtDeduction",
        expenses, "coinExchange", "extraIncome", "netPayable",
        "paymentStatus", gps, "photoUrl",
        "aiScore", "isAnomaly", "isClearance", "isSynced",
        type, "dataUsageKB", "reportedStatus", notes,
        "expenseType", "expenseCategory", "expenseStatus", "approvalStatus",
        "expenseDescription"
    ) VALUES (
        p_tx_id, v_now, v_now,
        p_location_id, v_location.name, p_driver_id, v_driver.name,
        v_location."lastScore", p_current_score,
        v_revenue, v_commission, v_final_retention,
        0, v_startup_debt_deduction,
        COALESCE(p_expenses, 0), COALESCE(p_coin_exchange, 0), 0, v_net_payable,
        'pending', p_gps, p_photo_url,
        p_ai_score, COALESCE(p_anomaly_flag, FALSE), FALSE, TRUE,
        'collection', 120, COALESCE(p_reported_status, 'active'), p_notes,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type        ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category    ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending'             ELSE NULL END,
        'approved',
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_description ELSE NULL END
    )
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted = 1 THEN
        UPDATE public.locations
        SET "lastScore" = CASE
                WHEN "lastScore" IS NULL OR p_current_score >= "lastScore"
                    THEN p_current_score
                ELSE "lastScore"
            END,
            "remainingStartupDebt" = GREATEST(
                0,
                COALESCE("remainingStartupDebt", 0) - v_startup_debt_deduction
            ),
            "dividendBalance" = CASE
                WHEN p_is_owner_retaining
                    THEN COALESCE("dividendBalance", 0) + v_final_retention
                ELSE COALESCE("dividendBalance", 0)
            END
        WHERE id = p_location_id;
    END IF;

    RETURN (
        SELECT json_build_object(
            'id',                   t.id,
            'transactionId',        t.id,
            'timestamp',            t."timestamp",
            'locationId',           t."locationId",
            'locationName',         t."locationName",
            'driverId',             t."driverId",
            'driverName',           t."driverName",
            'previousScore',        t."previousScore",
            'currentScore',         t."currentScore",
            'revenue',              t.revenue,
            'commission',           t.commission,
            'ownerRetention',       t."ownerRetention",
            'debtDeduction',        t."debtDeduction",
            'startupDebtDeduction', t."startupDebtDeduction",
            'expenses',             t.expenses,
            'coinExchange',         t."coinExchange",
            'extraIncome',          t."extraIncome",
            'netPayable',           t."netPayable",
            'paymentStatus',        t."paymentStatus",
            'gps',                  t.gps,
            'photoUrl',             t."photoUrl",
            'aiScore',              t."aiScore",
            'isAnomaly',            t."isAnomaly",
            'isClearance',          t."isClearance",
            'isSynced',             t."isSynced",
            'type',                 t.type,
            'reportedStatus',       t."reportedStatus",
            'notes',                t.notes,
            'expenseType',          t."expenseType",
            'expenseCategory',      t."expenseCategory",
            'expenseDescription',   t."expenseDescription"
        )
        FROM public.transactions t WHERE t.id = p_tx_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_collection_v2(TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_collection_v2(TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 2. Fix calculate_finance_v2: honour is_owner_retaining=false ─────────────

CREATE OR REPLACE FUNCTION public.calculate_finance_v2(
    p_current_score      INTEGER,
    p_previous_score     INTEGER,
    p_commission_rate    NUMERIC,
    p_expenses           INTEGER DEFAULT 0,
    p_tip                INTEGER DEFAULT 0,
    p_is_owner_retaining BOOLEAN DEFAULT TRUE,
    p_owner_retention    NUMERIC DEFAULT NULL,
    p_startup_debt_deduction_request INTEGER DEFAULT 0,
    p_startup_debt_balance NUMERIC DEFAULT 0
)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_diff                           INTEGER;
    v_revenue                        NUMERIC;
    v_commission                     NUMERIC;
    v_final_retention                NUMERIC;
    v_available_after_core_deductions NUMERIC;
    v_startup_debt_deduction         NUMERIC;
    v_net_payable                    NUMERIC;
BEGIN
    v_diff     := GREATEST(0, p_current_score - p_previous_score);
    v_revenue  := v_diff * 200;
    v_commission := FLOOR(v_revenue * COALESCE(p_commission_rate, 0.15));

    IF p_is_owner_retaining THEN
        v_final_retention := GREATEST(0, COALESCE(p_owner_retention, v_commission));
    ELSE
        v_final_retention := 0;
    END IF;

    v_available_after_core_deductions := GREATEST(
        0,
        v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0))
    );

    v_startup_debt_deduction := LEAST(
        GREATEST(0, COALESCE(p_startup_debt_deduction_request, 0)),
        GREATEST(0, COALESCE(p_startup_debt_balance, 0)),
        v_available_after_core_deductions
    );

    v_net_payable := GREATEST(0, v_available_after_core_deductions - v_startup_debt_deduction);

    RETURN json_build_object(
        'diff',           v_diff,
        'revenue',        v_revenue,
        'commission',     v_commission,
        'finalRetention', v_final_retention,
        'startupDebtDeduction', v_startup_debt_deduction,
        'netPayable',     v_net_payable
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_finance_v2(INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calculate_finance_v2(INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, NUMERIC) TO authenticated;

-- ─── 3. daily_settlements: remove duplicate test rows, add unique constraint ──

-- Delete the older duplicate row for 2026-04-03 (keep the later one STL-1775247907263)
DELETE FROM public.daily_settlements
WHERE id = 'STL-1775234281743';

-- Add unique constraint to prevent future duplicates
-- (safe IF NOT EXISTS — won't fail if already applied)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_daily_settlements_driver_date'
    ) THEN
        ALTER TABLE public.daily_settlements
        ADD CONSTRAINT uq_daily_settlements_driver_date
        UNIQUE ("driverId", date);
    END IF;
END $$;
