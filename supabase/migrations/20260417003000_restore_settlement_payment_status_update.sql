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
REVOKE EXECUTE ON FUNCTION public.review_daily_settlement_v1(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_daily_settlement_v1(TEXT, TEXT, TEXT) TO authenticated;
