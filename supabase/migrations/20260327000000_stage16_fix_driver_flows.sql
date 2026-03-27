-- Stage 16: Fix driver-facing flows blocked by RLS
--
-- Root causes fixed by this migration
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New machine registration (new-office onboarding):
--      Drivers could not INSERT a location row because both the legacy policy
--      "locations_insert" and the production-baseline policy
--      "locations_admin_insert_full_v1" required admin role.
--      Fix: replace both with a single policy that also allows a driver to
--      insert a location when the "assignedDriverId" equals their own driver_id.
--
-- 2. Location UPDATE in production-baseline (locations_admin_update_full_v1):
--      The production-full-baseline migration created an admin-only UPDATE
--      policy.  The legacy policy "locations_update" already allowed
--      driver-self updates, so on databases with both migrations the OR gave
--      drivers the needed access.  On fresh databases (only baseline was run)
--      drivers were blocked.
--      Fix: replace locations_admin_update_full_v1 with a policy that mirrors
--      the legacy locations_update semantics.
--
-- 3. Driver row UPDATE in production-baseline (drivers_admin_update_full_v1):
--      Same problem as (2) for the drivers table — drivers could not update
--      their own GPS / lastActive on fresh-baseline databases.
--      Fix: replace drivers_admin_update_full_v1 with a policy that mirrors
--      the legacy drivers_update semantics.
--
-- Safety notes
-- ─────────────────────────────────────────────────────────────────────────────
-- * Uses DROP POLICY IF EXISTS before every CREATE POLICY so re-running this
--   migration is idempotent.
-- * Legacy policy names ("locations_insert", "locations_update",
--   "drivers_update") are also replaced to keep naming consistent and avoid
--   duplicate / conflicting policies.
-- * No data is modified; no tables are altered structurally.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. locations INSERT ───────────────────────────────────────────────────────
-- Allow admin to insert any location; allow driver to insert a location that
-- is pre-assigned to themselves (the new-machine onboarding flow sets
-- assignedDriverId = currentDriver.id before calling upsert).

DROP POLICY IF EXISTS locations_insert                    ON public.locations;
DROP POLICY IF EXISTS locations_admin_insert_full_v1      ON public.locations;
DROP POLICY IF EXISTS locations_driver_or_admin_insert_v1 ON public.locations;

CREATE POLICY locations_driver_or_admin_insert_v1
    ON public.locations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.get_my_role() = 'admin'
        OR (
            public.get_my_role() = 'driver'
            AND "assignedDriverId" = public.get_my_driver_id()
        )
    );

-- ── 2. locations UPDATE ───────────────────────────────────────────────────────
-- Admin can update any location; driver can update locations assigned to them.

DROP POLICY IF EXISTS locations_update                         ON public.locations;
DROP POLICY IF EXISTS locations_admin_update_full_v1           ON public.locations;
DROP POLICY IF EXISTS locations_admin_or_assigned_update_v1    ON public.locations;

CREATE POLICY locations_admin_or_assigned_update_v1
    ON public.locations
    FOR UPDATE
    TO authenticated
    USING (
        public.get_my_role() = 'admin'
        OR "assignedDriverId" = public.get_my_driver_id()
    )
    WITH CHECK (
        public.get_my_role() = 'admin'
        OR "assignedDriverId" = public.get_my_driver_id()
    );

-- ── 3. drivers UPDATE ────────────────────────────────────────────────────────
-- Admin can update any driver row; driver can update their own row
-- (GPS heartbeat, lastActive).  Sensitive financial columns remain protected
-- by the existing REVOKE UPDATE grant from 20240103000000_enable_rls.sql.

DROP POLICY IF EXISTS drivers_update                  ON public.drivers;
DROP POLICY IF EXISTS drivers_admin_update_full_v1    ON public.drivers;
DROP POLICY IF EXISTS drivers_admin_or_self_update_v1 ON public.drivers;

CREATE POLICY drivers_admin_or_self_update_v1
    ON public.drivers
    FOR UPDATE
    TO authenticated
    USING (
        public.get_my_role() = 'admin'
        OR (
            public.get_my_role() = 'driver'
            AND id = public.get_my_driver_id()
        )
    )
    WITH CHECK (
        public.get_my_role() = 'admin'
        OR (
            public.get_my_role() = 'driver'
            AND id = public.get_my_driver_id()
        )
    );
