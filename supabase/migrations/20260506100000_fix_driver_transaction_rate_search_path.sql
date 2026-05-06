-- Formalize production fix for driver transaction rate limiting.
-- Keeps the SECURITY DEFINER function on an explicit safe search_path and
-- ensures the driver transaction rate trigger is present and enabled.

CREATE OR REPLACE FUNCTION public.check_driver_transaction_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recent_count int;
  v_window_minutes int := 1;  -- 1 minute window
  v_max_per_window int := 200;  -- Max 200 transactions per minute
BEGIN
  -- Only check for driver inserts
  IF public.get_my_role() = 'driver' THEN
    -- Count recent transactions from this driver
    SELECT COUNT(*) INTO v_recent_count
    FROM public.transactions
    WHERE "driverId" = NEW."driverId"
      AND "timestamp" > now() - make_interval(mins => v_window_minutes);

    IF v_recent_count >= v_max_per_window THEN
      RAISE EXCEPTION 'Transaction rate limit exceeded (max % per % minute)',
                       v_max_per_window, v_window_minutes;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_driver_transaction_rate ON public.transactions;

CREATE TRIGGER trg_check_driver_transaction_rate
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_driver_transaction_rate();

ALTER TABLE public.transactions ENABLE TRIGGER trg_check_driver_transaction_rate;
