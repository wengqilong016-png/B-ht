ALTER TABLE public.daily_settlements
  ADD COLUMN IF NOT EXISTS "settlementExpenseAmount" NUMERIC,
  ADD COLUMN IF NOT EXISTS "settlementExpenseCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "settlementExpenseNote" TEXT;

DROP FUNCTION IF EXISTS public.create_daily_settlement_v1(
  TEXT, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.create_daily_settlement_v1(
    p_id TEXT,
    p_date DATE,
    p_driver_id TEXT,
    p_total_revenue NUMERIC,
    p_total_net_payable NUMERIC,
    p_total_expenses NUMERIC,
    p_driver_float NUMERIC,
    p_expected_total NUMERIC,
    p_settlement_expense_amount NUMERIC DEFAULT NULL,
    p_settlement_expense_category TEXT DEFAULT NULL,
    p_settlement_expense_note TEXT DEFAULT NULL,
    p_actual_cash NUMERIC DEFAULT NULL,
    p_actual_coins NUMERIC DEFAULT NULL,
    p_shortage NUMERIC DEFAULT NULL,
    p_note TEXT DEFAULT NULL,
    p_transfer_proof_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_driver RECORD;
    v_existing_settlement RECORD;
    v_conflicting_settlement RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, driver_id, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
    END IF;

    IF v_caller_profile.role = 'driver' AND v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
        RAISE EXCEPTION 'Forbidden: driver may not submit settlement for another driver' USING ERRCODE = '42501';
    END IF;

    SELECT id, name
      INTO v_driver
      FROM public.drivers
     WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    SELECT
        s.id, s."date", s."driverId", s."driverName", s."totalRevenue", s."totalNetPayable",
        s."totalExpenses", s."driverFloat", s."expectedTotal", s."settlementExpenseAmount",
        s."settlementExpenseCategory", s."settlementExpenseNote", s."actualCash", s."actualCoins",
        s.shortage, s.note, s."transferProofUrl", s.status, s."timestamp", s."adminId",
        s."adminName", s."checkInAt", s."checkOutAt", s."checkInGps", s."checkOutGps",
        s."hasCheckedIn", s."hasCheckedOut", s."isSynced"
      INTO v_existing_settlement
      FROM public.daily_settlements s
     WHERE s.id = p_id;

    IF FOUND THEN
        RETURN row_to_json(v_existing_settlement);
    END IF;

    SELECT
        s.id, s.status
      INTO v_conflicting_settlement
      FROM public.daily_settlements s
     WHERE s."driverId" = p_driver_id
       AND s."date" = p_date
       AND s.status IN ('pending', 'confirmed')
     ORDER BY s."timestamp" DESC
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'Settlement already exists for driver % on % (existing id: %, status: %)',
            p_driver_id, p_date, v_conflicting_settlement.id, v_conflicting_settlement.status
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.daily_settlements (
        id, "date", "driverId", "driverName", "totalRevenue", "totalNetPayable",
        "totalExpenses", "driverFloat", "expectedTotal", "settlementExpenseAmount",
        "settlementExpenseCategory", "settlementExpenseNote", "actualCash", "actualCoins",
        shortage, note, "transferProofUrl", status, "timestamp", "isSynced"
    ) VALUES (
        p_id, p_date, p_driver_id, v_driver.name, p_total_revenue, p_total_net_payable,
        p_total_expenses, p_driver_float, p_expected_total, p_settlement_expense_amount,
        p_settlement_expense_category, p_settlement_expense_note, p_actual_cash, p_actual_coins,
        p_shortage, p_note, p_transfer_proof_url, 'pending', v_now, TRUE
    );

    RETURN json_build_object(
        'id', p_id,
        'date', p_date,
        'driverId', p_driver_id,
        'driverName', v_driver.name,
        'totalRevenue', p_total_revenue,
        'totalNetPayable', p_total_net_payable,
        'totalExpenses', p_total_expenses,
        'driverFloat', p_driver_float,
        'expectedTotal', p_expected_total,
        'settlementExpenseAmount', p_settlement_expense_amount,
        'settlementExpenseCategory', p_settlement_expense_category,
        'settlementExpenseNote', p_settlement_expense_note,
        'actualCash', p_actual_cash,
        'actualCoins', p_actual_coins,
        'shortage', p_shortage,
        'note', p_note,
        'transferProofUrl', p_transfer_proof_url,
        'status', 'pending',
        'timestamp', v_now,
        'isSynced', TRUE
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_daily_settlement_v1(
  TEXT, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_daily_settlement_v1(
  TEXT, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
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

    UPDATE public.daily_settlements
       SET status = p_status,
           note = v_next_note,
           "adminId" = auth.uid()::text,
           "adminName" = COALESCE(v_caller_profile.display_name, 'Admin'),
           "isSynced" = TRUE
     WHERE id = p_settlement_id;

    IF p_status = 'confirmed' AND v_settlement."driverId" IS NOT NULL THEN
        UPDATE public.drivers
           SET "dailyFloatingCoins" = COALESCE(v_settlement."actualCoins", 0)
         WHERE id = v_settlement."driverId";
    END IF;

    SELECT
        s.id, s."date", s."driverId", s."driverName", s."totalRevenue", s."totalNetPayable",
        s."totalExpenses", s."driverFloat", s."expectedTotal", s."settlementExpenseAmount",
        s."settlementExpenseCategory", s."settlementExpenseNote", s."actualCash", s."actualCoins",
        s.shortage, s.note, s."transferProofUrl", s.status, s."timestamp", s."adminId",
        s."adminName", s."checkInAt", s."checkOutAt", s."checkInGps", s."checkOutGps",
        s."hasCheckedIn", s."hasCheckedOut", s."isSynced"
      INTO v_settlement
      FROM public.daily_settlements s
     WHERE s.id = p_settlement_id;

    RETURN row_to_json(v_settlement);
END;
$$;
