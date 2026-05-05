-- submit_collection_v2: fix "column created_at does not exist" + tx_conflict signal
--
-- Production is running an older version with SELECT * INTO that breaks
-- when table schemas drift. This migration replaces the function with a
-- schema-explicit version that lists every column it actually needs.
--
-- Also includes tx_conflict signal (previous migration may not have been applied).

DROP FUNCTION IF EXISTS public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
    BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER,
    BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT
) CASCADE;

DROP FUNCTION IF EXISTS public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
    BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER,
    BOOLEAN, TEXT, TEXT, TEXT, TEXT
) CASCADE;

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
    v_caller_role          TEXT;
    v_caller_driver_id     TEXT;
    v_loc_id               UUID;
    v_loc_name             TEXT;
    v_loc_last_score       INTEGER;
    v_loc_commission_rate  NUMERIC;
    v_loc_debt             NUMERIC;
    v_loc_dividend         NUMERIC;
    v_driver_id            TEXT;
    v_driver_name          TEXT;
    v_diff                 INTEGER;
    v_revenue              NUMERIC;
    v_commission           NUMERIC;
    v_final_retention      NUMERIC;
    v_available_after_core NUMERIC;
    v_startup_debt_deduct  NUMERIC;
    v_net_payable          NUMERIC;
    v_now                  TIMESTAMPTZ := NOW();
    v_rows_inserted        INTEGER;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id INTO v_caller_role, v_caller_driver_id
    FROM public.profiles WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'driver' AND v_caller_driver_id IS DISTINCT FROM p_driver_id THEN
        RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver'
            USING ERRCODE = '42501';
    END IF;

    -- Location lookup (explicit columns, no SELECT *)
    SELECT id, name, "lastScore", "commissionRate", "remainingStartupDebt", "dividendBalance"
    INTO v_loc_id, v_loc_name, v_loc_last_score, v_loc_commission_rate, v_loc_debt, v_loc_dividend
    FROM public.locations WHERE id = p_location_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
    END IF;

    -- Driver lookup
    SELECT id, name INTO v_driver_id, v_driver_name
    FROM public.drivers WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    -- Finance calculation
    v_diff             := GREATEST(0, p_current_score - COALESCE(v_loc_last_score, 0));
    v_revenue          := v_diff * get_coin_value_tzs();
    v_commission       := FLOOR(v_revenue * COALESCE(v_loc_commission_rate, 0.15));
    v_final_retention  := GREATEST(0, COALESCE(p_owner_retention, v_commission));
    v_available_after_core := GREATEST(0, v_revenue - v_final_retention 
        - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0)));
    v_startup_debt_deduct := LEAST(
        GREATEST(0, COALESCE(p_startup_debt_deduction, 0)),
        GREATEST(0, COALESCE(v_loc_debt, 0))
    );
    v_net_payable := GREATEST(0, v_available_after_core + v_startup_debt_deduct);

    -- Insert transaction
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
        "expenseType", "expenseCategory", "expenseStatus",
        "approvalStatus", "expenseDescription"
    ) VALUES (
        p_tx_id, v_now, v_now,
        p_location_id, v_loc_name, p_driver_id, v_driver_name,
        COALESCE(v_loc_last_score, 0), p_current_score,
        v_revenue, v_commission, v_final_retention,
        0, v_startup_debt_deduct,
        COALESCE(p_expenses, 0), COALESCE(p_coin_exchange, 0), 0, v_net_payable,
        'pending', p_gps, p_photo_url,
        p_ai_score, COALESCE(p_anomaly_flag, FALSE), FALSE, TRUE,
        'collection', 120, COALESCE(p_reported_status, 'active'), p_notes,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type     ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending'          ELSE NULL END,
        'approved',
        CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_description ELSE NULL END
    )
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    -- New row: update location state
    IF v_rows_inserted = 1 THEN
        UPDATE public.locations
        SET "lastScore" = CASE
                WHEN "lastScore" IS NULL OR p_current_score >= "lastScore"
                    THEN p_current_score
                ELSE "lastScore"
            END,
            "remainingStartupDebt" = GREATEST(0,
                COALESCE("remainingStartupDebt", 0) - v_startup_debt_deduct),
            "dividendBalance" = CASE
                WHEN p_is_owner_retaining
                    THEN COALESCE("dividendBalance", 0) + v_final_retention
                ELSE COALESCE("dividendBalance", 0)
            END
        WHERE id = p_location_id;
    END IF;

    -- Return full transaction row (always: new or existing)
    RETURN (
        SELECT row_to_json(t)::jsonb || jsonb_build_object(
            'tx_conflict', CASE WHEN v_rows_inserted = 0 THEN true ELSE false END
        )
        FROM public.transactions t
        WHERE t.id = p_tx_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
    BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER,
    BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
    BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER,
    BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
