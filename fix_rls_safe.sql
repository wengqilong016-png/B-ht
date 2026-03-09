
-- ─── Clean up old buggy policies ──────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ─── Helper function ────────────────────────────────────────────────
-- SECURITY DEFINER allows it to read profiles without being blocked by RLS
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ─── PROFILES TABLE ──────────────────────────────────────────────────
-- Users can read their own profile, or admins can read all
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT
USING (auth_user_id = auth.uid());

CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT
USING (public.auth_user_role() = 'admin');

-- ─── LOCATIONS TABLE ──────────────────────────────────────────────────
CREATE POLICY "locations_select_all" ON public.locations FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "locations_modify_admin" ON public.locations FOR ALL
USING (public.auth_user_role() = 'admin');

-- ─── DRIVERS TABLE ──────────────────────────────────────────────────
CREATE POLICY "drivers_select_all" ON public.drivers FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "drivers_modify_admin" ON public.drivers FOR ALL
USING (public.auth_user_role() = 'admin');

-- ─── TRANSACTIONS TABLE ──────────────────────────────────────────────────
CREATE POLICY "tx_select_admin" ON public.transactions FOR SELECT
USING (public.auth_user_role() = 'admin');

CREATE POLICY "tx_select_driver" ON public.transactions FOR SELECT
USING (
  "driverId" IN (SELECT driver_id FROM public.profiles WHERE auth_user_id = auth.uid())
);

CREATE POLICY "tx_insert_all" ON public.transactions FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "tx_modify_admin" ON public.transactions FOR UPDATE
USING (public.auth_user_role() = 'admin');

CREATE POLICY "tx_delete_admin" ON public.transactions FOR DELETE
USING (public.auth_user_role() = 'admin');

-- ─── DAILY_SETTLEMENTS TABLE ──────────────────────────────────────────────
CREATE POLICY "settlement_select_admin" ON public.daily_settlements FOR SELECT
USING (public.auth_user_role() = 'admin');

CREATE POLICY "settlement_select_driver" ON public.daily_settlements FOR SELECT
USING (
  "driverId" IN (SELECT driver_id FROM public.profiles WHERE auth_user_id = auth.uid())
);

CREATE POLICY "settlement_insert_all" ON public.daily_settlements FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "settlement_modify_admin" ON public.daily_settlements FOR UPDATE
USING (public.auth_user_role() = 'admin');

CREATE POLICY "settlement_delete_admin" ON public.daily_settlements FOR DELETE
USING (public.auth_user_role() = 'admin');
