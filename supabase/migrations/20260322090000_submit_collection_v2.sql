-- Server-side collection submission with authoritative finance normalization.
-- This is the stage-2 write entrypoint. The client sends raw inputs; the
-- server recomputes finance and persists the authoritative transaction row.
--
-- Finance math intentionally mirrors calculate_finance_v2 so preview and
-- persist are always consistent.

CREATE OR REPLACE FUNCTION public.submit_collection_v2(
  p_tx_id          TEXT,
  p_location_id    UUID,
  p_driver_id      TEXT,
  p_current_score  INTEGER,
  p_expenses       INTEGER    DEFAULT 0,
  p_tip            INTEGER    DEFAULT 0,
  p_is_owner_retaining BOOLEAN DEFAULT TRUE,
  p_owner_retention    INTEGER DEFAULT NULL,
  p_coin_exchange      INTEGER DEFAULT 0,
  p_gps            JSONB      DEFAULT NULL,
  p_photo_url      TEXT       DEFAULT NULL,
  p_ai_score       INTEGER    DEFAULT NULL,
  p_anomaly_flag   BOOLEAN    DEFAULT FALSE,
  p_notes          TEXT       DEFAULT NULL,
  p_expense_type   TEXT       DEFAULT NULL,
  p_expense_category TEXT     DEFAULT NULL,
  p_reported_status  TEXT     DEFAULT 'active'
)
RETURNS JSON
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_location         RECORD;
  v_driver           RECORD;
  v_diff             INTEGER;
  v_revenue          BIGINT;
  v_commission       BIGINT;
  v_final_retention  BIGINT;
  v_net_payable      BIGINT;
  v_now              TIMESTAMPTZ := NOW();
BEGIN
  -- ── 1. Validate caller identity ─────────────────────────────────
  -- Only authenticated users may call this function.  The auth.uid() check
  -- prevents anonymous or service-role abuse from the frontend.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- ── 2. Load location metadata ───────────────────────────────────
  SELECT id, name, "lastScore", "commissionRate", "machineId"
    INTO v_location
    FROM public.locations
   WHERE id = p_location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id USING ERRCODE = 'P0002';
  END IF;

  -- ── 3. Load driver metadata ─────────────────────────────────────
  SELECT id, name
    INTO v_driver
    FROM public.drivers
   WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found: %', p_driver_id USING ERRCODE = 'P0002';
  END IF;

  -- ── 4. Server-authoritative finance calculation ─────────────────
  -- Mirrors calculate_finance_v2 exactly so preview = persist.
  v_diff     := GREATEST(0, p_current_score - v_location."lastScore");
  v_revenue  := v_diff * 200; -- 200 TZS per point (CONSTANTS.COIN_VALUE_TZS)
  v_commission := FLOOR(v_revenue * COALESCE(v_location."commissionRate", 0.15));

  IF p_is_owner_retaining THEN
    v_final_retention := COALESCE(p_owner_retention, v_commission);
  ELSE
    v_final_retention := 0;
  END IF;

  v_net_payable := GREATEST(
    0,
    v_revenue
      - v_final_retention
      - ABS(COALESCE(p_expenses, 0))
      - ABS(COALESCE(p_tip, 0))
  );

  -- ── 5. Persist normalized transaction ──────────────────────────
  INSERT INTO public.transactions (
    id,
    "timestamp",
    "uploadTimestamp",
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
    "paymentStatus",
    gps,
    "photoUrl",
    "aiScore",
    "isAnomaly",
    "isClearance",
    "isSynced",
    type,
    "dataUsageKB", -- placeholder average for collection submissions
    "reportedStatus",
    notes,
    "expenseType",
    "expenseCategory",
    "expenseStatus",
    "approvalStatus"
  ) VALUES (
    p_tx_id,
    v_now,
    v_now,
    p_location_id,
    v_location.name,
    p_driver_id,
    v_driver.name,
    v_location."lastScore",
    p_current_score,
    v_revenue,
    v_commission,
    v_final_retention,
    0,
    0,
    COALESCE(p_expenses, 0),
    COALESCE(p_coin_exchange, 0),
    0,
    v_net_payable,
    'paid',
    p_gps,
    p_photo_url,
    p_ai_score,
    COALESCE(p_anomaly_flag, FALSE),
    FALSE,
    TRUE,
    'collection',
    120,
    COALESCE(p_reported_status, 'active'),
    p_notes,
    CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type ELSE NULL END,
    CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
    CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending' ELSE NULL END,
    'approved'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── 6. Return normalized transaction payload ─────────────────────
  RETURN json_build_object(
    'id',               p_tx_id,
    'timestamp',        v_now,
    'locationId',       p_location_id,
    'locationName',     v_location.name,
    'driverId',         p_driver_id,
    'driverName',       v_driver.name,
    'previousScore',    v_location."lastScore",
    'currentScore',     p_current_score,
    'revenue',          v_revenue,
    'commission',       v_commission,
    'ownerRetention',   v_final_retention,
    'debtDeduction',    0,
    'startupDebtDeduction', 0,
    'expenses',         COALESCE(p_expenses, 0),
    'coinExchange',     COALESCE(p_coin_exchange, 0),
    'extraIncome',      0,
    'netPayable',       v_net_payable,
    'paymentStatus',    'paid',
    'gps',              p_gps,
    'photoUrl',         p_photo_url,
    'aiScore',          p_ai_score,
    'isAnomaly',        COALESCE(p_anomaly_flag, FALSE),
    'isSynced',         TRUE,
    'type',             'collection',
    'approvalStatus',   'approved',
    'reportedStatus',   COALESCE(p_reported_status, 'active'),
    'notes',            p_notes,
    'expenseType',      CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_type ELSE NULL END,
    'expenseCategory',  CASE WHEN COALESCE(p_expenses, 0) > 0 THEN p_expense_category ELSE NULL END,
    'expenseStatus',    CASE WHEN COALESCE(p_expenses, 0) > 0 THEN 'pending' ELSE NULL END
  );
END;
$$;

-- Revoke from PUBLIC (default open), then grant only to authenticated drivers.
REVOKE EXECUTE ON FUNCTION public.submit_collection_v2(
  TEXT, UUID, TEXT, INTEGER,
  INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER,
  JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_collection_v2(
  TEXT, UUID, TEXT, INTEGER,
  INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER,
  JSONB, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
