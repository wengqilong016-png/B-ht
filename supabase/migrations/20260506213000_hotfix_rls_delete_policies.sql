-- =============================================================================
-- Hotfix: 补回 20260424000000 中未生效的 DELETE 策略
-- 5 张表缺 admin DELETE — 重新 CREATE（幂等 DROP IF EXISTS）
-- =============================================================================

-- 1. queue_health_reports
DROP POLICY IF EXISTS queue_health_admin_delete ON public.queue_health_reports;
CREATE POLICY queue_health_admin_delete
  ON public.queue_health_reports
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 2. driver_flow_events
DROP POLICY IF EXISTS driver_flow_events_admin_delete ON public.driver_flow_events;
CREATE POLICY driver_flow_events_admin_delete
  ON public.driver_flow_events
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 3. location_change_requests
DROP POLICY IF EXISTS lcr_admin_delete ON public.location_change_requests;
DROP POLICY IF EXISTS lcr_admin_delete_full_v1 ON public.location_change_requests;
CREATE POLICY lcr_admin_delete_full_v1
  ON public.location_change_requests
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. support_cases
DROP POLICY IF EXISTS support_cases_admin_delete ON public.support_cases;
DROP POLICY IF EXISTS support_cases_admin_delete_full_v1 ON public.support_cases;
CREATE POLICY support_cases_admin_delete_full_v1
  ON public.support_cases
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 5. health_alerts
DROP POLICY IF EXISTS health_alerts_admin_delete ON public.health_alerts;
CREATE POLICY health_alerts_admin_delete
  ON public.health_alerts
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
