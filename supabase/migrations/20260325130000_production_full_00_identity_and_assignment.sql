-- Production full baseline pack
-- 00_identity_and_assignment.sql
--
-- Purpose
-- -------
-- First layer of the coherent production baseline pack.
-- This layer defines the identity and assignment contract that all later
-- business, support, and diagnostics layers depend on.
--
-- Scope
-- -----
--   * public.drivers
--   * public.profiles
--   * public.locations
--   * normalized helper functions
--   * strict admin / driver RLS for this layer
--
-- Intended usage
-- --------------
-- Run on a clean production project as the first baseline pack file.
-- This is not a legacy bootstrap and does not seed real auth users.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tables ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.drivers (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    username              TEXT NOT NULL UNIQUE,
    phone                 TEXT,
    status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive')),
    "baseSalary"          NUMERIC DEFAULT 300000,
    "commissionRate"      NUMERIC DEFAULT 0.05,
    "initialDebt"         NUMERIC DEFAULT 0,
    "remainingDebt"       NUMERIC DEFAULT 0,
    "dailyFloatingCoins"  NUMERIC DEFAULT 0,
    "vehicleInfo"         JSONB,
    "lastActive"          TIMESTAMPTZ,
    "currentGps"          JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    id                     UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name                   TEXT NOT NULL,
    area                   TEXT,
    "machineId"            TEXT UNIQUE,
    "commissionRate"       NUMERIC DEFAULT 0.15,
    "lastScore"            BIGINT DEFAULT 0,
    status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'inactive')),
    coords                 JSONB,
    "assignedDriverId"     TEXT REFERENCES public.drivers(id) ON DELETE SET NULL,
    "ownerName"            TEXT,
    "shopOwnerPhone"       TEXT,
    "ownerPhotoUrl"        TEXT,
    "machinePhotoUrl"      TEXT,
    "initialStartupDebt"   NUMERIC DEFAULT 0,
    "remainingStartupDebt" NUMERIC DEFAULT 0,
    "isNewOffice"          BOOLEAN DEFAULT FALSE,
    "lastRevenueDate"      TEXT,
    "resetLocked"          BOOLEAN DEFAULT FALSE,
    "dividendBalance"      NUMERIC DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes --------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_drivers_username_full_v1
    ON public.drivers (username);

CREATE INDEX IF NOT EXISTS idx_profiles_role_full_v1
    ON public.profiles (role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_driver_id_full_v1
    ON public.profiles (driver_id)
    WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_machineid_full_v1
    ON public.locations ("machineId");

CREATE INDEX IF NOT EXISTS idx_locations_assigned_driver_full_v1
    ON public.locations ("assignedDriverId");

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

CREATE OR REPLACE FUNCTION public.clear_my_must_change_password()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE public.profiles
    SET must_change_password = FALSE
    WHERE auth_user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_driver_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_my_must_change_password() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_driver_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_my_must_change_password() TO authenticated;

-- RLS ------------------------------------------------------------------------

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- profiles: admin sees all, user sees self
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'profiles'
          AND policyname = 'profiles_admin_or_self_select_full_v1'
    ) THEN
        CREATE POLICY profiles_admin_or_self_select_full_v1
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
          AND policyname = 'profiles_admin_insert_full_v1'
    ) THEN
        CREATE POLICY profiles_admin_insert_full_v1
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
          AND policyname = 'profiles_admin_update_full_v1'
    ) THEN
        CREATE POLICY profiles_admin_update_full_v1
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
          AND policyname = 'profiles_admin_delete_full_v1'
    ) THEN
        CREATE POLICY profiles_admin_delete_full_v1
            ON public.profiles
            FOR DELETE
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- drivers: admin manages all, driver reads own row
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'drivers'
          AND policyname = 'drivers_admin_or_self_select_full_v1'
    ) THEN
        CREATE POLICY drivers_admin_or_self_select_full_v1
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
          AND policyname = 'drivers_admin_insert_full_v1'
    ) THEN
        CREATE POLICY drivers_admin_insert_full_v1
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
          AND policyname = 'drivers_admin_update_full_v1'
    ) THEN
        CREATE POLICY drivers_admin_update_full_v1
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
          AND policyname = 'drivers_admin_delete_full_v1'
    ) THEN
        CREATE POLICY drivers_admin_delete_full_v1
            ON public.drivers
            FOR DELETE
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- locations: admin manages all, driver reads assigned rows
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'locations'
          AND policyname = 'locations_admin_or_assigned_select_full_v1'
    ) THEN
        CREATE POLICY locations_admin_or_assigned_select_full_v1
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
          AND policyname = 'locations_admin_insert_full_v1'
    ) THEN
        CREATE POLICY locations_admin_insert_full_v1
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
          AND policyname = 'locations_admin_update_full_v1'
    ) THEN
        CREATE POLICY locations_admin_update_full_v1
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
          AND policyname = 'locations_admin_delete_full_v1'
    ) THEN
        CREATE POLICY locations_admin_delete_full_v1
            ON public.locations
            FOR DELETE
            TO authenticated
            USING (public.is_admin());
    END IF;
END$$;

-- Notes ----------------------------------------------------------------------
-- 1. This file intentionally seeds no real auth users.
-- 2. Create the first admin manually in Supabase Auth and insert a matching
--    profile row with role = 'admin'.
-- 3. Later baseline pack files should assume this identity contract:
--      profiles.auth_user_id is the canonical identity key.
