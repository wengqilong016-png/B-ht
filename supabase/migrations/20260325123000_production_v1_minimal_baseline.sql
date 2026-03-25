-- Production V1 minimal baseline
--
-- Goal
-- ----
-- Provide a single SQL baseline for a simplified production deployment that only
-- keeps the core identity and assignment model:
--   * profiles
--   * drivers
--   * locations
--
-- This script is intentionally minimal and production-oriented:
--   * no destructive DROP TABLE flow
--   * no seeded real auth users
--   * no shared default password
--   * strict role-scoped RLS
--
-- Run this in a clean Supabase project, or review carefully before applying to
-- any existing environment.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core tables ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.drivers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    username    TEXT NOT NULL UNIQUE,
    phone       TEXT,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    auth_user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role                  TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
    display_name          TEXT,
    driver_id             TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.locations (
    id                   UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name                 TEXT NOT NULL,
    area                 TEXT,
    "machineId"          TEXT UNIQUE,
    coords               JSONB,
    status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'inactive')),
    "assignedDriverId"   TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes --------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_drivers_username_v1
    ON public.drivers (username);

CREATE INDEX IF NOT EXISTS idx_profiles_role_v1
    ON public.profiles (role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_driver_id_unique_v1
    ON public.profiles (driver_id)
    WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_assigned_driver_v1
    ON public.locations ("assignedDriverId");

CREATE INDEX IF NOT EXISTS idx_locations_machine_id_v1
    ON public.locations ("machineId");

-- Helper functions -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_my_driver_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT driver_id
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(public.get_my_role() = 'admin', FALSE)
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_driver_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_driver_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- RLS ------------------------------------------------------------------------

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- profiles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'profiles_admin_or_self_select_v1'
    ) THEN
        CREATE POLICY profiles_admin_or_self_select_v1
            ON public.profiles
            FOR SELECT
            TO authenticated
            USING (public.is_admin() OR auth_user_id = auth.uid());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'profiles_admin_insert_v1'
    ) THEN
        CREATE POLICY profiles_admin_insert_v1
            ON public.profiles
            FOR INSERT
            TO authenticated
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'profiles_admin_update_v1'
    ) THEN
        CREATE POLICY profiles_admin_update_v1
            ON public.profiles
            FOR UPDATE
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'profiles_admin_delete_v1'
    ) THEN
        CREATE POLICY profiles_admin_delete_v1
            ON public.profiles
            FOR DELETE
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- drivers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'drivers'
          AND policyname = 'drivers_admin_or_self_select_v1'
    ) THEN
        CREATE POLICY drivers_admin_or_self_select_v1
            ON public.drivers
            FOR SELECT
            TO authenticated
            USING (public.is_admin() OR id = public.get_my_driver_id());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'drivers'
          AND policyname = 'drivers_admin_insert_v1'
    ) THEN
        CREATE POLICY drivers_admin_insert_v1
            ON public.drivers
            FOR INSERT
            TO authenticated
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'drivers'
          AND policyname = 'drivers_admin_update_v1'
    ) THEN
        CREATE POLICY drivers_admin_update_v1
            ON public.drivers
            FOR UPDATE
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'drivers'
          AND policyname = 'drivers_admin_delete_v1'
    ) THEN
        CREATE POLICY drivers_admin_delete_v1
            ON public.drivers
            FOR DELETE
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- locations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'locations'
          AND policyname = 'locations_admin_or_assigned_select_v1'
    ) THEN
        CREATE POLICY locations_admin_or_assigned_select_v1
            ON public.locations
            FOR SELECT
            TO authenticated
            USING (public.is_admin() OR "assignedDriverId" = public.get_my_driver_id());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'locations'
          AND policyname = 'locations_admin_insert_v1'
    ) THEN
        CREATE POLICY locations_admin_insert_v1
            ON public.locations
            FOR INSERT
            TO authenticated
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'locations'
          AND policyname = 'locations_admin_update_v1'
    ) THEN
        CREATE POLICY locations_admin_update_v1
            ON public.locations
            FOR UPDATE
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'locations'
          AND policyname = 'locations_admin_delete_v1'
    ) THEN
        CREATE POLICY locations_admin_delete_v1
            ON public.locations
            FOR DELETE
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- Notes ----------------------------------------------------------------------
-- Production auth users are NOT seeded here.
-- Create the first admin in Supabase Auth manually, then insert a matching row
-- into public.profiles with role = 'admin'.
