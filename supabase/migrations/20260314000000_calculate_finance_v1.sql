-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add calculate_finance_v1 RPC for server-authoritative finance
-- ═══════════════════════════════════════════════════════════════════════════
-- This function mirrors the client-side calculations in DriverCollectionFlow.tsx
-- so the server can validate and return authoritative results.
-- Requires: authenticated role (anon users cannot call this function).

CREATE OR REPLACE FUNCTION public.calculate_finance_v1(
  p_current_score      INTEGER,
  p_previous_score     INTEGER,
  p_commission_rate    NUMERIC,
  p_expenses           INTEGER DEFAULT 0,
  p_coin_exchange      INTEGER DEFAULT 0,
  p_is_owner_retaining BOOLEAN DEFAULT true,
  p_owner_retention    INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_diff            INTEGER;
  v_revenue         BIGINT;
  v_commission      BIGINT;
  v_final_retention BIGINT;
  v_net_payable     BIGINT;
BEGIN
  -- Revenue = (currentScore - previousScore) * 200 TZS per coin
  v_diff    := GREATEST(0, p_current_score - p_previous_score);
  v_revenue := v_diff * 200;

  -- Commission = floor(revenue * commission_rate)
  -- Matches the client-side: Math.floor(revenue * rate) in DriverCollectionFlow.tsx
  v_commission := FLOOR(v_revenue * p_commission_rate);

  -- Owner retention: use explicit amount when provided, else auto-calculated commission
  IF p_is_owner_retaining THEN
    v_final_retention := COALESCE(p_owner_retention, v_commission);
  ELSE
    v_final_retention := 0;
  END IF;

  -- Net payable = max(0, revenue - retention - |expenses|)
  v_net_payable := GREATEST(0, v_revenue - v_final_retention - ABS(p_expenses));

  RETURN json_build_object(
    'diff',            v_diff,
    'revenue',         v_revenue,
    'commission',      v_commission,
    'finalRetention',  v_final_retention,
    'netPayable',      v_net_payable
  );
END;
$$;

-- Grant execute only to authenticated users (not anon)
REVOKE EXECUTE ON FUNCTION public.calculate_finance_v1 FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calculate_finance_v1 TO authenticated;
