-- Migration: enable RLS + proper policies on public.notifications
-- Problem: notifications table existed without RLS enabled, allowing anon SELECT.
-- The schema.sql reference had correct policies but they were never applied as a migration.

-- 1. Enable RLS (idempotent if already enabled)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 2. Drop any stale policies (idempotent)
DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;

-- 3. Admin sees all; driver sees only their own notifications (by driverId)
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'admin'
    OR "driverId" IS NULL
    OR "driverId" = get_my_driver_id()
  );

-- Only backend triggers (SECURITY DEFINER functions) insert notifications; deny direct inserts
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- Admin or the owning driver can mark isRead
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'admin'
    OR "driverId" = get_my_driver_id()
  );

-- Only admin can delete notifications
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');
