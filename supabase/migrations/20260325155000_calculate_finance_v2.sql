-- Server-side preview calculation for collection finance.
-- This mirrors the current driver flow calculation so the UI can display
-- a single RPC-backed preview when online, while still falling back locally
-- when the driver is offline or auth is disabled.

CREATE OR REPLACE FUNCTION public.calculate_finance_v2(
  p_current_score INTEGER,
  p_previous_score INTEGER,
  p_commission_rate NUMERIC,
  p_expenses INTEGER DEFAULT 0,
  p_tip INTEGER DEFAULT 0,
  p_is_owner_retaining BOOLEAN DEFAULT TRUE,
  p_owner_retention INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_diff INTEGER;
  v_revenue BIGINT;
  v_commission BIGINT;
  v_final_retention BIGINT;
  v_net_payable BIGINT;
BEGIN
  v_diff := GREATEST(0, p_current_score - p_previous_score);
  v_revenue := v_diff * 200;
  v_commission := FLOOR(v_revenue * COALESCE(p_commission_rate, 0.15));

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

  RETURN json_build_object(
    'diff', v_diff,
    'revenue', v_revenue,
    'commission', v_commission,
    'finalRetention', v_final_retention,
    'netPayable', v_net_payable
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_finance_v2(
  INTEGER,
  INTEGER,
  NUMERIC,
  INTEGER,
  INTEGER,
  BOOLEAN,
  INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_finance_v2(
  INTEGER,
  INTEGER,
  NUMERIC,
  INTEGER,
  INTEGER,
  BOOLEAN,
  INTEGER
) TO authenticated;
