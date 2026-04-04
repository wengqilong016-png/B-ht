CREATE OR REPLACE FUNCTION public.approve_expense_request_v1(
    p_tx_id TEXT,
    p_approve BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_status TEXT := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: only admins may approve expense requests' USING ERRCODE = '42501';
    END IF;

    SELECT id, expenses, "expenseStatus", type
      INTO v_tx
      FROM public.transactions
     WHERE id = p_tx_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found: %', p_tx_id USING ERRCODE = 'P0002';
    END IF;

    IF COALESCE(v_tx.expenses, 0) <= 0 THEN
        RAISE EXCEPTION 'Transaction is not an expense request: %', p_tx_id USING ERRCODE = '22023';
    END IF;

    IF v_tx."expenseStatus" IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Expense request is not pending: %', p_tx_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.transactions
       SET "expenseStatus" = v_status,
           "isSynced" = TRUE
     WHERE id = p_tx_id;

    RETURN json_build_object(
        'txId', p_tx_id,
        'expenseStatus', v_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_expense_request_v1(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_expense_request_v1(TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_anomaly_transaction_v1(
    p_tx_id TEXT,
    p_approve BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tx RECORD;
    v_status TEXT := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
    v_is_anomaly BOOLEAN := CASE WHEN p_approve THEN FALSE ELSE TRUE END;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: only admins may review anomaly transactions' USING ERRCODE = '42501';
    END IF;

    SELECT id, "isAnomaly", "approvalStatus"
      INTO v_tx
      FROM public.transactions
     WHERE id = p_tx_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found: %', p_tx_id USING ERRCODE = 'P0002';
    END IF;

    IF v_tx."isAnomaly" IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Transaction is not flagged as anomaly: %', p_tx_id USING ERRCODE = '22023';
    END IF;

    IF v_tx."approvalStatus" IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Anomaly transaction already reviewed: %', p_tx_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.transactions
       SET "approvalStatus" = v_status,
           "isAnomaly" = v_is_anomaly,
           "isSynced" = TRUE
     WHERE id = p_tx_id;

    RETURN json_build_object(
        'txId', p_tx_id,
        'approvalStatus', v_status,
        'isAnomaly', v_is_anomaly
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_anomaly_transaction_v1(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_anomaly_transaction_v1(TEXT, BOOLEAN) TO authenticated;
