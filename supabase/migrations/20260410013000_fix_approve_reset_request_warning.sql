-- Remove the unused local variable warning from approve_reset_request_v1()
-- while preserving the row lock and existence check on the target location.

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

  PERFORM 1
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
