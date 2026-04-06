-- Migration: add p_expense_description to submit_collection_v2
-- Adds an optional free-text expense description that is stored on the
-- transaction row and returned in the RPC response JSON.
-- The column already exists on public.transactions (TEXT, nullable).

-- Drop the old function signature so the new one with the extra param can be
-- created cleanly.  The owner_share_retention_logic migration did not include
-- a REVOKE/GRANT block, so we drop both the old and new-param signatures to
-- avoid leaving ghost overloads.
DROP FUNCTION IF EXISTS public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT
);

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
    v_revenue             NUMERIC;
    v_commission          NUMERIC;
    v_owner_share         NUMERIC;
    v_final_retention     NUMERIC;
    v_available_after_core_deductions NUMERIC;
    v_startup_debt_deduction NUMERIC;
    v_net_payable         NUMERIC;
    v_now                 TIMESTAMPTZ := NOW();
    v_rows_inserted       INTEGER;
BEGIN
    -- Authenticate caller
    SELECT * INTO v_caller_profile
    FROM public.user_profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF v_caller_profile.role NOT IN ('admin', 'driver') THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    IF v_caller_profile.role = 'driver' AND v_caller_profile."driverId" != p_driver_id THEN
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
    v_commission_rate := COALESCE(v_location."commissionRate", 0.3);
    v_revenue         := GREATEST(0, p_current_score - COALESCE(v_location."lastScore", 0));
    v_commission      := ROUND(v_revenue * v_commission_rate);
    v_owner_share     := v_revenue - v_commission;

    IF p_is_owner_retaining THEN
        IF p_owner_retention IS NOT NULL THEN
            v_final_retention := GREATEST(0, LEAST(p_owner_retention, v_owner_share));
        ELSE
            v_final_retention := v_owner_share;
        END IF;
    ELSE
        v_final_retention := 0;
    END IF;

    v_available_after_core_deductions :=
        v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0));

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

    -- Return the persisted (or previously-persisted) transaction row as JSON.
    -- ON CONFLICT DO NOTHING means a duplicate txId returns the existing row.
    RETURN (
        SELECT json_build_object(
            'id',                   t.id,
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
            'isSynced',             TRUE,
            'type',                 t.type,
            'approvalStatus',       t."approvalStatus",
            'reportedStatus',       t."reportedStatus",
            'notes',                t.notes,
            'expenseType',          t."expenseType",
            'expenseCategory',      t."expenseCategory",
            'expenseStatus',        t."expenseStatus",
            'expenseDescription',   t."expenseDescription"
        )
        FROM public.transactions t
        WHERE t.id = p_tx_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, NUMERIC, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
