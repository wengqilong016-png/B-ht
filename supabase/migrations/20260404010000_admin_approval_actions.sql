-- Admin-side approval actions for reset and payout requests.
--
-- These actions were previously implemented as client-side double writes:
--   1. update transactions.approvalStatus
--   2. separately update locations.lastScore/resetLocked/dividendBalance
--
-- That pattern is not atomic and can leave transaction and location state out
-- of sync.  The functions below collapse each approval into one server-side
-- action guarded by admin auth.

CREATE OR REPLACE FUNCTION public.approve_reset_request_v1(
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
  v_location RECORD;
  v_status TEXT := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  v_last_score BIGINT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: caller is not an admin' USING ERRCODE = '42501';
  END IF;

  SELECT id, "locationId", type, "approvalStatus"
    INTO v_tx
    FROM public.transactions
   WHERE id = p_tx_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reset request not found: %', p_tx_id USING ERRCODE = 'P0002';
  END IF;

  IF v_tx.type IS DISTINCT FROM 'reset_request' THEN
    RAISE EXCEPTION 'Transaction % is not a reset request', p_tx_id USING ERRCODE = '22023';
  END IF;

  IF v_tx."approvalStatus" IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Reset request % already processed', p_tx_id USING ERRCODE = '22023';
  END IF;

  SELECT id, "lastScore", "resetLocked"
    INTO v_location
    FROM public.locations
   WHERE id = v_tx."locationId"
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location not found for reset request: %', v_tx."locationId" USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.transactions
     SET "approvalStatus" = v_status
   WHERE id = p_tx_id;

  UPDATE public.locations
     SET "lastScore" = CASE WHEN p_approve THEN 0 ELSE "lastScore" END,
         "resetLocked" = FALSE
   WHERE id = v_tx."locationId"
   RETURNING "lastScore" INTO v_last_score;

  RETURN json_build_object(
    'txId', p_tx_id,
    'approvalStatus', v_status,
    'locationId', v_tx."locationId",
    'lastScore', v_last_score,
    'resetLocked', FALSE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_reset_request_v1(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_reset_request_v1(TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_payout_request_v1(
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
  v_location RECORD;
  v_status TEXT := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  v_next_balance NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: caller is not an admin' USING ERRCODE = '42501';
  END IF;

  SELECT id, "locationId", type, "approvalStatus", "payoutAmount"
    INTO v_tx
    FROM public.transactions
   WHERE id = p_tx_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found: %', p_tx_id USING ERRCODE = 'P0002';
  END IF;

  IF v_tx.type IS DISTINCT FROM 'payout_request' THEN
    RAISE EXCEPTION 'Transaction % is not a payout request', p_tx_id USING ERRCODE = '22023';
  END IF;

  IF v_tx."approvalStatus" IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Payout request % already processed', p_tx_id USING ERRCODE = '22023';
  END IF;

  SELECT id, "dividendBalance"
    INTO v_location
    FROM public.locations
   WHERE id = v_tx."locationId"
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location not found for payout request: %', v_tx."locationId" USING ERRCODE = 'P0002';
  END IF;

  IF p_approve AND COALESCE(v_location."dividendBalance", 0) < COALESCE(v_tx."payoutAmount", 0) THEN
    RAISE EXCEPTION 'Insufficient dividend balance for payout approval'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.transactions
     SET "approvalStatus" = v_status
   WHERE id = p_tx_id;

  IF p_approve THEN
    UPDATE public.locations
       SET "dividendBalance" = COALESCE("dividendBalance", 0) - COALESCE(v_tx."payoutAmount", 0)
     WHERE id = v_tx."locationId"
     RETURNING "dividendBalance" INTO v_next_balance;
  ELSE
    v_next_balance := COALESCE(v_location."dividendBalance", 0);
  END IF;

  RETURN json_build_object(
    'txId', p_tx_id,
    'approvalStatus', v_status,
    'locationId', v_tx."locationId",
    'dividendBalance', v_next_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_payout_request_v1(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payout_request_v1(TEXT, BOOLEAN) TO authenticated;
