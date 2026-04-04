CREATE TABLE IF NOT EXISTS public.monthly_payrolls (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "driverId"             TEXT NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    "driverName"           TEXT NOT NULL,
    month                  TEXT NOT NULL,
    "baseSalary"           NUMERIC NOT NULL DEFAULT 0,
    commission             NUMERIC NOT NULL DEFAULT 0,
    "privateLoanDeduction" NUMERIC NOT NULL DEFAULT 0,
    "shortageDeduction"    NUMERIC NOT NULL DEFAULT 0,
    "netPayable"           NUMERIC NOT NULL DEFAULT 0,
    "collectionCount"      INTEGER NOT NULL DEFAULT 0,
    "totalRevenue"         NUMERIC NOT NULL DEFAULT 0,
    status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'paid', 'cancelled')),
    "paymentMethod"        TEXT
                           CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('cash', 'bank_transfer', 'mobile_money', 'other')),
    "paymentProofUrl"      TEXT,
    note                   TEXT,
    "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "paidAt"               TIMESTAMPTZ,
    "paidBy"               TEXT,
    "paidByName"           TEXT,
    "isSynced"             BOOLEAN DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_payrolls_driver_month
    ON public.monthly_payrolls ("driverId", month);
CREATE INDEX IF NOT EXISTS idx_monthly_payrolls_month_status
    ON public.monthly_payrolls (month DESC, status);
CREATE INDEX IF NOT EXISTS idx_monthly_payrolls_paid_at
    ON public.monthly_payrolls ("paidAt" DESC);

ALTER TABLE public.monthly_payrolls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payrolls_select ON public.monthly_payrolls;
CREATE POLICY payrolls_select ON public.monthly_payrolls FOR SELECT TO authenticated
    USING (public.is_admin() OR "driverId" = public.get_my_driver_id());

DROP POLICY IF EXISTS payrolls_insert ON public.monthly_payrolls;
CREATE POLICY payrolls_insert ON public.monthly_payrolls FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS payrolls_update ON public.monthly_payrolls;
CREATE POLICY payrolls_update ON public.monthly_payrolls FOR UPDATE TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS payrolls_delete ON public.monthly_payrolls;
CREATE POLICY payrolls_delete ON public.monthly_payrolls FOR DELETE TO authenticated
    USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.create_monthly_payroll_v1(
    p_driver_id TEXT,
    p_month TEXT,
    p_base_salary NUMERIC,
    p_commission NUMERIC,
    p_private_loan_deduction NUMERIC DEFAULT 0,
    p_shortage_deduction NUMERIC DEFAULT 0,
    p_net_payable NUMERIC DEFAULT 0,
    p_collection_count INTEGER DEFAULT 0,
    p_total_revenue NUMERIC DEFAULT 0,
    p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_driver RECORD;
    v_existing_payroll RECORD;
    v_payroll_json JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND OR v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may create payrolls' USING ERRCODE = '42501';
    END IF;

    SELECT id, name
      INTO v_driver
      FROM public.drivers
     WHERE id = p_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
    END IF;

    SELECT *
      INTO v_existing_payroll
      FROM public.monthly_payrolls
     WHERE "driverId" = p_driver_id
       AND month = p_month
     FOR UPDATE;

    IF FOUND AND v_existing_payroll.status IS DISTINCT FROM 'cancelled' THEN
        RAISE EXCEPTION 'Payroll already exists for driver % in month %', p_driver_id, p_month USING ERRCODE = '23505';
    END IF;

    IF FOUND AND v_existing_payroll.status = 'cancelled' THEN
        UPDATE public.monthly_payrolls
           SET "driverName" = v_driver.name,
               "baseSalary" = COALESCE(p_base_salary, 0),
               commission = COALESCE(p_commission, 0),
               "privateLoanDeduction" = COALESCE(p_private_loan_deduction, 0),
               "shortageDeduction" = COALESCE(p_shortage_deduction, 0),
               "netPayable" = COALESCE(p_net_payable, 0),
               "collectionCount" = COALESCE(p_collection_count, 0),
               "totalRevenue" = COALESCE(p_total_revenue, 0),
               status = 'pending',
               note = p_note,
               "paymentMethod" = NULL,
               "paymentProofUrl" = NULL,
               "paidAt" = NULL,
               "paidBy" = NULL,
               "paidByName" = NULL,
               "isSynced" = TRUE
         WHERE id = v_existing_payroll.id;
    ELSE
        INSERT INTO public.monthly_payrolls (
            "driverId", "driverName", month, "baseSalary", commission,
            "privateLoanDeduction", "shortageDeduction", "netPayable",
            "collectionCount", "totalRevenue", status, note, "isSynced"
        ) VALUES (
            p_driver_id, v_driver.name, p_month, COALESCE(p_base_salary, 0), COALESCE(p_commission, 0),
            COALESCE(p_private_loan_deduction, 0), COALESCE(p_shortage_deduction, 0), COALESCE(p_net_payable, 0),
            COALESCE(p_collection_count, 0), COALESCE(p_total_revenue, 0), 'pending', p_note, TRUE
        );
    END IF;

    SELECT row_to_json(payroll_row)
      INTO v_payroll_json
      FROM (
        SELECT id, "driverId", "driverName", month, "baseSalary", commission,
               "privateLoanDeduction", "shortageDeduction", "netPayable",
               "collectionCount", "totalRevenue", status, "paymentMethod",
               "paymentProofUrl", note, "createdAt", "paidAt", "paidBy",
               "paidByName", "isSynced"
          FROM public.monthly_payrolls
         WHERE "driverId" = p_driver_id
           AND month = p_month
      ) payroll_row;

    RETURN v_payroll_json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_monthly_payroll_v1(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_monthly_payroll_v1(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_monthly_payroll_paid_v1(
    p_payroll_id UUID,
    p_payment_method TEXT,
    p_note TEXT DEFAULT NULL,
    p_payment_proof_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_payroll RECORD;
    v_payroll_json JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND OR v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may mark payrolls paid' USING ERRCODE = '42501';
    END IF;

    IF p_payment_method NOT IN ('cash', 'bank_transfer', 'mobile_money', 'other') THEN
        RAISE EXCEPTION 'Invalid payment method: %', p_payment_method USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_payroll
      FROM public.monthly_payrolls
     WHERE id = p_payroll_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll not found: %', p_payroll_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payroll.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Payroll is not pending: %', p_payroll_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.monthly_payrolls
       SET status = 'paid',
           "paymentMethod" = p_payment_method,
           note = COALESCE(p_note, note),
           "paymentProofUrl" = COALESCE(p_payment_proof_url, "paymentProofUrl"),
           "paidAt" = NOW(),
           "paidBy" = auth.uid()::text,
           "paidByName" = COALESCE(v_caller_profile.display_name, 'Admin'),
           "isSynced" = TRUE
     WHERE id = p_payroll_id;

    SELECT row_to_json(payroll_row)
      INTO v_payroll_json
      FROM (
        SELECT id, "driverId", "driverName", month, "baseSalary", commission,
               "privateLoanDeduction", "shortageDeduction", "netPayable",
               "collectionCount", "totalRevenue", status, "paymentMethod",
               "paymentProofUrl", note, "createdAt", "paidAt", "paidBy",
               "paidByName", "isSynced"
          FROM public.monthly_payrolls
         WHERE id = p_payroll_id
      ) payroll_row;

    RETURN v_payroll_json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_monthly_payroll_paid_v1(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_monthly_payroll_paid_v1(UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_monthly_payroll_v1(
    p_payroll_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_profile RECORD;
    v_payroll RECORD;
    v_payroll_json JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT role, display_name
      INTO v_caller_profile
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    IF NOT FOUND OR v_caller_profile.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Forbidden: only admins may cancel payrolls' USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_payroll
      FROM public.monthly_payrolls
     WHERE id = p_payroll_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll not found: %', p_payroll_id USING ERRCODE = 'P0002';
    END IF;

    IF v_payroll.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Only pending payrolls may be cancelled: %', p_payroll_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.monthly_payrolls
       SET status = 'cancelled',
           note = COALESCE(p_note, note),
           "isSynced" = TRUE
     WHERE id = p_payroll_id;

    SELECT row_to_json(payroll_row)
      INTO v_payroll_json
      FROM (
        SELECT id, "driverId", "driverName", month, "baseSalary", commission,
               "privateLoanDeduction", "shortageDeduction", "netPayable",
               "collectionCount", "totalRevenue", status, "paymentMethod",
               "paymentProofUrl", note, "createdAt", "paidAt", "paidBy",
               "paidByName", "isSynced"
          FROM public.monthly_payrolls
         WHERE id = p_payroll_id
      ) payroll_row;

    RETURN v_payroll_json;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_monthly_payroll_v1(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_monthly_payroll_v1(UUID, TEXT) TO authenticated;
