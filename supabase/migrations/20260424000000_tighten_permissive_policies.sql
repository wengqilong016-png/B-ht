BEGIN;

-- 1. Tighten queue_health_reports insert policy (replace permissive qhr_driver_insert)
DROP POLICY IF EXISTS qhr_driver_insert ON public.queue_health_reports;
DROP POLICY IF EXISTS queue_health_driver_insert ON public.queue_health_reports;
CREATE POLICY queue_health_driver_insert
  ON public.queue_health_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'driver' AND driver_id = public.get_my_driver_id());

-- 2. Tighten queue_health_reports update policy (replace permissive qhr_driver_update)
DROP POLICY IF EXISTS qhr_driver_update ON public.queue_health_reports;
DROP POLICY IF EXISTS queue_health_driver_update ON public.queue_health_reports;
CREATE POLICY queue_health_driver_update
  ON public.queue_health_reports
  FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'driver' AND driver_id = public.get_my_driver_id());

-- Note: The existing queue_health_admin_select policy (USING (is_admin())) remains for admin read access.
-- No changes needed to transactions policies as they are already appropriately scoped or rely on triggers for column-level restrictions.

COMMIT;
