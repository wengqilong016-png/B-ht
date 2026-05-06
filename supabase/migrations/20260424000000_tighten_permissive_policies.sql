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

-- 3. Add queue_health_reports admin INSERT/UPDATE + DELETE policy
--    Admin needs write access for management; nobody could DELETE before.
DROP POLICY IF EXISTS queue_health_admin_insert ON public.queue_health_reports;
CREATE POLICY queue_health_admin_insert
  ON public.queue_health_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS queue_health_admin_update ON public.queue_health_reports;
CREATE POLICY queue_health_admin_update
  ON public.queue_health_reports
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS queue_health_admin_delete ON public.queue_health_reports;
DROP POLICY IF EXISTS queue_health_reports_admin_or_driver_delete ON public.queue_health_reports;
CREATE POLICY queue_health_admin_delete
  ON public.queue_health_reports
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. driver_flow_events: no_update/no_delete policies were dropped in
--    20260416120000 without replacements — nobody can UPDATE or DELETE.
--    Add admin UPDATE + DELETE so admin can manage event records.
DROP POLICY IF EXISTS driver_flow_events_admin_update ON public.driver_flow_events;
CREATE POLICY driver_flow_events_admin_update
  ON public.driver_flow_events
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS driver_flow_events_admin_delete ON public.driver_flow_events;
CREATE POLICY driver_flow_events_admin_delete
  ON public.driver_flow_events
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 5. location_change_requests: has INSERT/SELECT/UPDATE but no DELETE.
--    Admin needs to clean up rejected/processed requests.
DROP POLICY IF EXISTS lcr_admin_delete ON public.location_change_requests;
DROP POLICY IF EXISTS lcr_admin_delete_full_v1 ON public.location_change_requests;
CREATE POLICY lcr_admin_delete_full_v1
  ON public.location_change_requests
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 6. support_cases: has INSERT/SELECT/UPDATE but no DELETE.
--    Admin needs to archive/resolve cases.
DROP POLICY IF EXISTS support_cases_admin_delete ON public.support_cases;
DROP POLICY IF EXISTS support_cases_admin_delete_full_v1 ON public.support_cases;
CREATE POLICY support_cases_admin_delete_full_v1
  ON public.support_cases
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 7. health_alerts: only has SELECT — completely unwritable.
--    Add admin INSERT/UPDATE/DELETE so the table can be used.
DROP POLICY IF EXISTS health_alerts_admin_insert ON public.health_alerts;
CREATE POLICY health_alerts_admin_insert
  ON public.health_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS health_alerts_admin_update ON public.health_alerts;
CREATE POLICY health_alerts_admin_update
  ON public.health_alerts
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS health_alerts_admin_delete ON public.health_alerts;
CREATE POLICY health_alerts_admin_delete
  ON public.health_alerts
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- No changes needed to transactions policies as they are already appropriately scoped or rely on triggers for column-level restrictions.

COMMIT;
