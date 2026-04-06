-- Realtime broadcast trigger for the locations table
--
-- Extends the broadcast-channel pattern established in
-- 20260328000001_realtime_broadcast_triggers.sql to cover the `locations`
-- table so that admin clients receive INSERT/UPDATE/DELETE events instantly
-- without a full page refresh.
--
-- Idempotent: uses DROP TRIGGER IF EXISTS and CREATE OR REPLACE POLICY.

-- ── 1. Trigger ───────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS locations_broadcast_trigger ON public.locations;
CREATE TRIGGER locations_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.notify_table_changes();

-- ── 2. RLS policy on realtime.messages ───────────────────────────────────────
-- Extend the existing policy to also allow the db:locations topic.

DROP POLICY IF EXISTS "authenticated_users_can_receive_broadcasts" ON realtime.messages;
CREATE POLICY "authenticated_users_can_receive_broadcasts" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    topic IN ('db:transactions', 'db:drivers', 'db:daily_settlements', 'db:locations')
  );
