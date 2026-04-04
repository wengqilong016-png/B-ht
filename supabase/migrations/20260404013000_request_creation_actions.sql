-- Server-authoritative creation of reset and payout requests.
--
-- These requests previously relied on direct client upserts, with reset
-- requests also requiring a separate locations.resetLocked update. This file
-- makes creation atomic and replay-safe.

CREATE OR REPLACE FUNCTION public.create_reset_request_v1(
  p_tx_id TEXT,
  p_location_id UUID,
  p_driver_id TEXT,
  p_gps JSONB DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_profile RECORD;
  v_location RECORD;
  v_driver RECORD;
  v_existing_tx RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role, driver_id
    INTO v_caller_profile
    FROM public.profiles
   WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
  END IF;

  IF v_caller_profile.role = 'driver' AND v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
    RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver' USING ERRCODE = '42501';
  END IF;

  SELECT id, name, "machineId", "lastScore", "resetLocked"
    INTO v_location
    FROM public.locations
   WHERE id = p_location_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id, name
    INTO v_driver
    FROM public.drivers
   WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.transactions (
    id,
    "timestamp",
    "locationId",
    "locationName",
    "driverId",
    "driverName",
    "previousScore",
    "currentScore",
    revenue,
    commission,
    "ownerRetention",
    "debtDeduction",
    "startupDebtDeduction",
    expenses,
    "coinExchange",
    "extraIncome",
    "netPayable",
    gps,
    "photoUrl",
    "dataUsageKB",
    type,
    notes,
    "approvalStatus",
    "isSynced"
  ) VALUES (
    p_tx_id,
    NOW(),
    p_location_id,
    v_location.name,
    p_driver_id,
    v_driver.name,
    v_location."lastScore",
    v_location."lastScore",
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    p_gps,
    p_photo_url,
    80,
    'reset_request',
    p_notes,
    'pending',
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT
      t.id, t."timestamp", t."locationId", t."locationName", t."driverId", t."driverName",
      t."previousScore", t."currentScore", t.revenue, t.commission, t."ownerRetention",
      t."debtDeduction", t."startupDebtDeduction", t.expenses, t."coinExchange",
      t."extraIncome", t."netPayable", t.gps, t."photoUrl", t."dataUsageKB", t.type,
      t.notes, t."approvalStatus", t."isSynced"
      INTO v_existing_tx
      FROM public.transactions t
     WHERE t.id = p_tx_id;
    RETURN row_to_json(v_existing_tx);
  END IF;

  UPDATE public.locations
     SET "resetLocked" = TRUE
   WHERE id = p_location_id;

  RETURN json_build_object(
    'id', p_tx_id,
    'timestamp', NOW(),
    'locationId', p_location_id,
    'locationName', v_location.name,
    'driverId', p_driver_id,
    'driverName', v_driver.name,
    'previousScore', v_location."lastScore",
    'currentScore', v_location."lastScore",
    'revenue', 0,
    'commission', 0,
    'ownerRetention', 0,
    'debtDeduction', 0,
    'startupDebtDeduction', 0,
    'expenses', 0,
    'coinExchange', 0,
    'extraIncome', 0,
    'netPayable', 0,
    'gps', p_gps,
    'photoUrl', p_photo_url,
    'dataUsageKB', 80,
    'type', 'reset_request',
    'notes', p_notes,
    'approvalStatus', 'pending',
    'isSynced', TRUE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_reset_request_v1(TEXT, UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reset_request_v1(TEXT, UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_payout_request_v1(
  p_tx_id TEXT,
  p_location_id UUID,
  p_driver_id TEXT,
  p_gps JSONB DEFAULT NULL,
  p_payout_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_profile RECORD;
  v_location RECORD;
  v_driver RECORD;
  v_existing_tx RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role, driver_id
    INTO v_caller_profile
    FROM public.profiles
   WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
  END IF;

  IF v_caller_profile.role = 'driver' AND v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
    RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_payout_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Invalid payout amount' USING ERRCODE = '22023';
  END IF;

  SELECT id, name, "lastScore", "dividendBalance"
    INTO v_location
    FROM public.locations
   WHERE id = p_location_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_location."dividendBalance", 0) < p_payout_amount THEN
    RAISE EXCEPTION 'Insufficient dividend balance for payout request' USING ERRCODE = '22023';
  END IF;

  SELECT id, name
    INTO v_driver
    FROM public.drivers
   WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.transactions (
    id,
    "timestamp",
    "locationId",
    "locationName",
    "driverId",
    "driverName",
    "previousScore",
    "currentScore",
    revenue,
    commission,
    "ownerRetention",
    "debtDeduction",
    "startupDebtDeduction",
    expenses,
    "coinExchange",
    "extraIncome",
    "netPayable",
    gps,
    "dataUsageKB",
    type,
    notes,
    "approvalStatus",
    "payoutAmount",
    "isSynced"
  ) VALUES (
    p_tx_id,
    NOW(),
    p_location_id,
    v_location.name,
    p_driver_id,
    v_driver.name,
    v_location."lastScore",
    v_location."lastScore",
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    p_gps,
    40,
    'payout_request',
    p_notes,
    'pending',
    p_payout_amount,
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT
      t.id, t."timestamp", t."locationId", t."locationName", t."driverId", t."driverName",
      t."previousScore", t."currentScore", t.revenue, t.commission, t."ownerRetention",
      t."debtDeduction", t."startupDebtDeduction", t.expenses, t."coinExchange",
      t."extraIncome", t."netPayable", t.gps, t."dataUsageKB", t.type,
      t.notes, t."approvalStatus", t."payoutAmount", t."isSynced"
      INTO v_existing_tx
      FROM public.transactions t
     WHERE t.id = p_tx_id;
    RETURN row_to_json(v_existing_tx);
  END IF;

  RETURN json_build_object(
    'id', p_tx_id,
    'timestamp', NOW(),
    'locationId', p_location_id,
    'locationName', v_location.name,
    'driverId', p_driver_id,
    'driverName', v_driver.name,
    'previousScore', v_location."lastScore",
    'currentScore', v_location."lastScore",
    'revenue', 0,
    'commission', 0,
    'ownerRetention', 0,
    'debtDeduction', 0,
    'startupDebtDeduction', 0,
    'expenses', 0,
    'coinExchange', 0,
    'extraIncome', 0,
    'netPayable', 0,
    'gps', p_gps,
    'dataUsageKB', 40,
    'type', 'payout_request',
    'notes', p_notes,
    'approvalStatus', 'pending',
    'payoutAmount', p_payout_amount,
    'isSynced', TRUE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_payout_request_v1(TEXT, UUID, TEXT, JSONB, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payout_request_v1(TEXT, UUID, TEXT, JSONB, NUMERIC, TEXT) TO authenticated;
