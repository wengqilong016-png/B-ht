-- submit_collection_v2: signal idempotent replay via tx_conflict field
-- 
-- When ON CONFLICT (id) DO NOTHING fires (duplicate txId), the function
-- currently returns the existing row with NO signal that it's a conflict.
-- The frontend interprets this as a successful new submission, writes
-- submit_success telemetry, and creates a phantom success record.
--
-- Fix: append tx_conflict: true to the returned JSON object so the
-- frontend can detect and reject idempotent replays.

CREATE OR REPLACE FUNCTION public.submit_collection_v2(
    p_tx_id              TEXT,
    p_location_id        UUID,
    p_driver_id          TEXT,
    p_current_score      INTEGER,
    p_expenses           INTEGER DEFAULT 0,
    p_tip                INTEGER DEFAULT 0,
    p_startup_debt_deduction INTEGER DEFAULT 0,
    p_is_owner_retaining BOOLEAN DEFAULT TRUE,
    p_owner_retention    NUMERIC DEFAULT NULL,
    p_coin_exchange      INTEGER DEFAULT 0,
    p_gps                JSONB   DEFAULT NULL,
    p_photo_url          TEXT    DEFAULT NULL,
    p_ai_score           INTEGER DEFAULT NULL,
    p_anomaly_flag       BOOLEAN DEFAULT FALSE,
    p_notes              TEXT    DEFAULT NULL,
    p_expense_type       TEXT    DEFAULT NULL,
    p_expense_category   TEXT    DEFAULT NULL,
    p_reported_status    TEXT    DEFAULT 'active'
)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_profile  RECORD;
    v_location        RECORD;
    v_driver          RECORD;
    v_diff            INTEGER;
    v_revenue         NUMERIC;
    v_commission      NUMERIC;
    v_final_retention NUMERIC;
    v_available_after_core_deductions NUMERIC;
    v_startup_debt_deduction NUMERIC;
    v_net_payable     NUMERIC;
    v_now             TIMESTAMPTZ := NOW();
    v_rows_inserted   INTEGER;
    v_existing_tx     RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id INTO v_caller_profile
    FROM public.profiles WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' THEN
        IF v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
            RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id, name, "lastScore", "commissionRate", "machineId", "remainingStartupDebt" INTO v_location
    FROM public.locations WHERE id = p_location_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
    END IF;

    SELECT id, name INTO v_driver FROM public.drivers WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    v_diff     := GREATEST(0, p_current_score - v_location."lastScore");
    v_revenue  := v_diff * 200;
    v_commission := FLOOR(v_revenue * COALESCE(v_location."commissionRate", 0.15));
    v_final_retention := GREATEST(0, COALESCE(p_owner_retention, v_commission));

    v_available_after_core_deductions := GREATEST(
        0,
        v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0))
    );

    v_startup_debt_deduction := LEAST(
        GREATEST(0, COALESCE(p_startup_debt_deduction, 0)),
        GREATEST(0, COALESCE(v_location."remainingStartupDebt", 0))
    );

    v_net_payable := GREATEST(0, v_available_after_core_deductions + v_startup_debt_deduction);

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
        "expenseType", "expenseCategory", "expenseStatus", "approvalStatus"
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
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type     ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending'          ELSE NULL END,
        'approved'
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

    IF v_rows_inserted = 0 THEN
        SELECT
            t.id,
            t."timestamp",
            t."locationId",
            t."locationName",
            t."driverId",
            t."driverName",
            t."previousScore",
            t."currentScore",
            t.revenue,
            t.commission,
            t."ownerRetention",
            t."debtDeduction",
            t."startupDebtDeduction",
            t.expenses,
            t."coinExchange",
            t."extraIncome",
            t."netPayable",
            t."paymentStatus",
            t.gps,
            t."photoUrl",
            t."aiScore",
            t."isAnomaly",
            t."isSynced",
            t.type,
            t."approvalStatus",
            t."reportedStatus",
            t.notes,
            t."expenseType",
            t."expenseCategory",
            t."expenseStatus"
        INTO v_existing_tx
        FROM public.transactions t
        WHERE t.id = p_tx_id;
        -- Signal idempotent replay: the frontend will reject this as a
        -- duplicate submission rather than logging a phantom submit_success.
        RETURN row_to_json(v_existing_tx)::jsonb || jsonb_build_object('tx_conflict', true);
    END IF;

    RETURN json_build_object(
        'id',                   p_tx_id,
        'timestamp',            v_now,
        'locationId',           p_location_id,
        'locationName',         v_location.name,
        'driverId',             p_driver_id,
        'driverName',           v_driver.name,
        'previousScore',        v_location."lastScore",
        'currentScore',         p_current_score,
        'revenue',              v_revenue,
        'commission',           v_commission,
        'ownerRetention',       v_final_retention,
        'debtDeduction',        0,
        'startupDebtDeduction', v_startup_debt_deduction,
        'expenses',             COALESCE(p_expenses, 0),
        'coinExchange',         COALESCE(p_coin_exchange, 0),
        'extraIncome',          0,
        'netPayable',           v_net_payable,
        'paymentStatus',        'pending',
        'gps',                  p_gps,
        'photoUrl',             p_photo_url,
        'aiScore',              p_ai_score,
        'isAnomaly',            COALESCE(p_anomaly_flag, FALSE),
        'isSynced',             TRUE,
        'type',                 'collection',
        'approvalStatus',       'approved',
        'reportedStatus',       COALESCE(p_reported_status, 'active'),
        'notes',                p_notes,
        'expenseType',          CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type     ELSE NULL END,
        'expenseCategory',      CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
        'expenseStatus',        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending'          ELSE NULL END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_collection_v2(TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_collection_v2(TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO authenticated;
