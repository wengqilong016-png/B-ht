-- Server-side collection submission with authoritative finance normalization.
-- This is the stage-2 write entrypoint. The client sends raw inputs; the
-- server recomputes finance and persists the authoritative transaction row.
--
-- Finance math intentionally mirrors calculate_finance_v2 so preview and
-- persist are always consistent.
--
-- Security:
--   * auth.uid() must be non-null (authenticated callers only).
--   * Caller's profile is loaded from profiles. If role = 'driver', the
--     profile's driver_id must match p_driver_id (prevents impersonation).
--     Admins may submit on behalf of any driver.
--
-- Idempotency:
--   * INSERT ... ON CONFLICT (id) DO NOTHING.
--   * If a row already exists for p_tx_id the function returns the
--     actually-persisted row values, not newly computed ones.

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
  v_caller_profile   RECORD;
  v_location         RECORD;
  v_driver           RECORD;
  v_diff             INTEGER;
  v_revenue          BIGINT;
  v_commission       BIGINT;
  v_final_retention  BIGINT;
  v_net_payable      BIGINT;
  v_now              TIMESTAMPTZ := NOW();
  v_rows_inserted    INTEGER;
  v_existing_tx      RECORD;
BEGIN
  -- ── 1. Validate caller identity and authorisation ────────────────
  -- Require an authenticated session.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Load the caller's profile to determine role and linked driver_id.
  SELECT role, driver_id
    INTO v_caller_profile
    FROM public.profiles
   WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '42501';
  END IF;

  -- Drivers may only submit for themselves.
  -- Admins are explicitly allowed to submit on behalf of any driver.
  IF v_caller_profile.role = 'driver' THEN
    IF v_caller_profile.driver_id IS DISTINCT FROM p_driver_id THEN
      RAISE EXCEPTION 'Forbidden: driver may not submit on behalf of another driver'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  -- (role = 'admin' falls through with no additional restriction)

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

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  -- ROW_COUNT = 1: row was just inserted.
  -- ROW_COUNT = 0: ON CONFLICT DO NOTHING fired; a row with this id already exists.

  -- ── 6. Return the authoritative persisted row ────────────────────
  -- When a row was just inserted (v_rows_inserted = 1) we return the values
  -- we just wrote.  When the id already existed (DO NOTHING fired) we SELECT
  -- the existing row so the caller always receives the values that are
  -- actually stored in the database, not newly recomputed ones.
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

    -- row_to_json preserves the camelCase column names from the SELECT above,
    -- producing the same key shape as the fresh-insert return path below.
    RETURN row_to_json(v_existing_tx);
  END IF;

  -- Fresh insert — return the values we just wrote.
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
