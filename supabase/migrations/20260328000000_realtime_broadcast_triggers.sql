-- Realtime broadcast triggers migration
--
-- Replaces the postgres_changes-based realtime subscription approach with
-- scalable broadcast channels backed by database triggers.
--
-- Each table gets a trigger that calls realtime.broadcast_changes() with a
-- dedicated topic matching the client-side channel name (db:<table>).
--
-- RLS policy on realtime.messages grants authenticated users SELECT access to
-- the three broadcast topics so private channel auth succeeds.
--
-- Idempotent: uses CREATE OR REPLACE FUNCTION and DROP TRIGGER IF EXISTS.

-- ── 1. Trigger function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_table_changes()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  -- realtime.broadcast_changes(topic, event_type, event_name, table, schema, new_record, old_record)
  -- event_type and event_name are both set to TG_OP (INSERT/UPDATE/DELETE) as required by
  -- the broadcast_changes signature; the topic matches the client-side channel name.
  PERFORM realtime.broadcast_changes(
    'db:' || TG_TABLE_NAME,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Restrict execute to avoid privilege escalation via PUBLIC.
REVOKE EXECUTE ON FUNCTION public.notify_table_changes() FROM PUBLIC;

-- ── 2. Triggers ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS transactions_broadcast_trigger ON public.transactions;
CREATE TRIGGER transactions_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_table_changes();

DROP TRIGGER IF EXISTS drivers_broadcast_trigger ON public.drivers;
CREATE TRIGGER drivers_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.notify_table_changes();

DROP TRIGGER IF EXISTS daily_settlements_broadcast_trigger ON public.daily_settlements;
CREATE TRIGGER daily_settlements_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.daily_settlements
  FOR EACH ROW EXECUTE FUNCTION public.notify_table_changes();

-- ── 3. RLS policy on realtime.messages ──────────────────────────────────────
-- Allows authenticated users to receive broadcasts on the three private topics.

DROP POLICY IF EXISTS "authenticated_users_can_receive_broadcasts" ON realtime.messages;
CREATE POLICY "authenticated_users_can_receive_broadcasts" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    topic IN ('db:transactions', 'db:drivers', 'db:daily_settlements')
  );

-- ── 4. Index for RLS performance ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_realtime_messages_topic
  ON realtime.messages (topic);
