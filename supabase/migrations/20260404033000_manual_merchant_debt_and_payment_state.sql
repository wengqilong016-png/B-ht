DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'locations_status_check'
          AND conrelid = 'public.locations'::regclass
    ) THEN
        ALTER TABLE public.locations DROP CONSTRAINT locations_status_check;
    END IF;
END $$;

ALTER TABLE public.locations
    ADD CONSTRAINT locations_status_check
    CHECK (status IN ('active', 'inactive', 'maintenance', 'broken'));

DROP FUNCTION IF EXISTS public.calculate_finance_v2(
    INTEGER,
    INTEGER,
    NUMERIC,
    INTEGER,
    INTEGER,
    BOOLEAN,
    INTEGER
);

CREATE OR REPLACE FUNCTION public.calculate_finance_v2(
    p_current_score INTEGER,
    p_previous_score INTEGER,
    p_commission_rate NUMERIC,
    p_expenses INTEGER DEFAULT 0,
    p_tip INTEGER DEFAULT 0,
    p_is_owner_retaining BOOLEAN DEFAULT TRUE,
    p_owner_retention INTEGER DEFAULT NULL,
    p_startup_debt_deduction_request INTEGER DEFAULT 0,
    p_startup_debt_balance NUMERIC DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_diff INTEGER;
    v_revenue BIGINT;
    v_commission BIGINT;
    v_final_retention BIGINT;
    v_available_after_core_deductions BIGINT;
    v_startup_debt_deduction BIGINT;
    v_net_payable BIGINT;
BEGIN
    v_diff := GREATEST(0, p_current_score - p_previous_score);
    v_revenue := v_diff * 200;
    v_commission := FLOOR(v_revenue * COALESCE(p_commission_rate, 0.15));

    IF p_is_owner_retaining THEN
        v_final_retention := COALESCE(p_owner_retention, v_commission);
    ELSE
        v_final_retention := 0;
    END IF;

    v_available_after_core_deductions := GREATEST(
        0,
        v_revenue
            - v_final_retention
            - ABS(COALESCE(p_expenses, 0))
            - ABS(COALESCE(p_tip, 0))
    );

    v_startup_debt_deduction := LEAST(
        GREATEST(0, COALESCE(p_startup_debt_deduction_request, 0)),
        GREATEST(0, COALESCE(p_startup_debt_balance, 0)),
        v_available_after_core_deductions
    );

    v_net_payable := GREATEST(0, v_available_after_core_deductions - v_startup_debt_deduction);

    RETURN json_build_object(
        'diff', v_diff,
        'revenue', v_revenue,
        'commission', v_commission,
        'finalRetention', v_final_retention,
        'startupDebtDeduction', v_startup_debt_deduction,
        'netPayable', v_net_payable
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_finance_v2(
    INTEGER,
    INTEGER,
    NUMERIC,
    INTEGER,
    INTEGER,
    BOOLEAN,
    INTEGER,
    INTEGER,
    NUMERIC
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_finance_v2(
    INTEGER,
    INTEGER,
    NUMERIC,
    INTEGER,
    INTEGER,
    BOOLEAN,
    INTEGER,
    INTEGER,
    NUMERIC
) TO authenticated;

DROP FUNCTION IF EXISTS public.submit_collection_v2(
    TEXT,
    UUID,
    TEXT,
    INTEGER,
    INTEGER,
    INTEGER,
    BOOLEAN,
    INTEGER,
    INTEGER,
    JSONB,
    TEXT,
    INTEGER,
    BOOLEAN,
    TEXT,
    TEXT,
    TEXT,
    TEXT
);

CREATE OR REPLACE FUNCTION public.submit_collection_v2(
    p_tx_id              TEXT,
    p_location_id        UUID,
    p_driver_id          TEXT,
    p_current_score      INTEGER,
    p_expenses           INTEGER DEFAULT 0,
    p_tip                INTEGER DEFAULT 0,
    p_startup_debt_deduction INTEGER DEFAULT 0,
    p_is_owner_retaining BOOLEAN DEFAULT TRUE,
    p_owner_retention    INTEGER DEFAULT NULL,
    p_coin_exchange      INTEGER DEFAULT 0,
    p_gps                JSONB DEFAULT NULL,
    p_photo_url          TEXT DEFAULT NULL,
    p_ai_score           INTEGER DEFAULT NULL,
    p_anomaly_flag       BOOLEAN DEFAULT FALSE,
    p_notes              TEXT DEFAULT NULL,
    p_expense_type       TEXT DEFAULT NULL,
    p_expense_category   TEXT DEFAULT NULL,
    p_reported_status    TEXT DEFAULT 'active'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_location RECORD;
    v_driver   RECORD;
    v_now      TIMESTAMPTZ := NOW();
    v_diff     INTEGER;
    v_revenue  BIGINT;
    v_commission BIGINT;
    v_final_retention BIGINT;
    v_available_after_core_deductions BIGINT;
    v_startup_debt_deduction BIGINT;
    v_net_payable BIGINT;
    v_rows_inserted INTEGER;
    v_existing_tx RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found'
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' THEN
        IF v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
            RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id, name, "lastScore", "commissionRate", "machineId", "remainingStartupDebt"
      INTO v_location
      FROM public.locations
     WHERE id = p_location_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
    END IF;

    SELECT id, name INTO v_driver
      FROM public.drivers
     WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    v_diff := GREATEST(0, p_current_score - v_location."lastScore");
    v_revenue := v_diff * 200;
    v_commission := FLOOR(v_revenue * COALESCE(v_location."commissionRate", 0.15));

    IF p_is_owner_retaining THEN
        v_final_retention := COALESCE(p_owner_retention, v_commission);
    ELSE
        v_final_retention := 0;
    END IF;

    v_available_after_core_deductions := GREATEST(
        0,
        v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0))
    );

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
               )
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
        RETURN row_to_json(v_existing_tx);
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

REVOKE EXECUTE ON FUNCTION public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_collection_v2(
    TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER, JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_daily_settlement_v1(
    p_settlement_id TEXT,
    p_status TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_settlement RECORD;
    v_next_note TEXT;
    v_payment_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may review settlements' USING ERRCODE = '42501';
    END IF;

    IF p_status NOT IN ('confirmed', 'rejected') THEN
        RAISE EXCEPTION 'Invalid settlement review status: %', p_status USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_settlement
      FROM public.daily_settlements
     WHERE id = p_settlement_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found: %', p_settlement_id USING ERRCODE = 'P0002';
    END IF;

    IF v_settlement.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Settlement is not pending: %', p_settlement_id USING ERRCODE = '22023';
    END IF;

    v_next_note := COALESCE(p_note, v_settlement.note);
    v_payment_status := CASE WHEN p_status = 'confirmed' THEN 'paid' ELSE 'rejected' END;

    UPDATE public.daily_settlements
       SET status = p_status,
           note = v_next_note,
           "adminId" = auth.uid()::text,
           "adminName" = COALESCE(v_caller_profile.display_name, 'Admin'),
           "isSynced" = TRUE
     WHERE id = p_settlement_id;

    UPDATE public.transactions
       SET "paymentStatus" = v_payment_status
     WHERE "driverId" = v_settlement."driverId"
       AND type = 'collection'
       AND ("timestamp" AT TIME ZONE 'UTC')::date = v_settlement."date";

    IF p_status = 'confirmed' AND v_settlement."driverId" IS NOT NULL THEN
        UPDATE public.drivers
           SET "dailyFloatingCoins" = COALESCE(v_settlement."actualCoins", 0)
         WHERE id = v_settlement."driverId";
    END IF;

    SELECT
        s.id, s."date", s."driverId", s."driverName", s."totalRevenue", s."totalNetPayable",
        s."totalExpenses", s."driverFloat", s."expectedTotal", s."actualCash", s."actualCoins",
        s.shortage, s.note, s."transferProofUrl", s.status, s."timestamp", s."adminId",
        s."adminName", s."checkInAt", s."checkOutAt", s."checkInGps", s."checkOutGps",
        s."hasCheckedIn", s."hasCheckedOut", s."isSynced"
      INTO v_settlement
      FROM public.daily_settlements s
     WHERE s.id = p_settlement_id;

    RETURN row_to_json(v_settlement);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_daily_settlement_v1(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_daily_settlement_v1(TEXT, TEXT, TEXT) TO authenticated;
