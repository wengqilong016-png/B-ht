-- ============================================================
-- location_change_requests: driver → admin approval workflow
-- Run this script once in Supabase SQL Editor.
-- Requires the `locations` and `profiles` tables to exist first.
-- ============================================================

-- 1. Table: stores each driver's proposed change to a location
CREATE TABLE IF NOT EXISTS public.location_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    -- auth.users id of the requesting driver
    requested_by_auth_user_id uuid NOT NULL REFERENCES auth.users(id),
    -- public.drivers.id for convenience
    requested_by_driver_id text,
    -- workflow status: pending | approved | rejected
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reason text,
    -- partial location update: only fields the driver wants to change
    -- keys match the camelCase column names used in the locations table
    patch jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by_auth_user_id uuid REFERENCES auth.users(id),
    review_note text
);

CREATE INDEX IF NOT EXISTS idx_lcr_status_created_at
    ON public.location_change_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lcr_location_id_created_at
    ON public.location_change_requests (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lcr_requester
    ON public.location_change_requests (requested_by_auth_user_id);

ALTER TABLE public.location_change_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Helper: is_admin()
--    Uses SECURITY DEFINER + fixed search_path to avoid RLS
--    recursion when called from policies on other tables.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
STABLE
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
    _is_admin boolean;
BEGIN
    -- profiles.auth_user_id is the PK / FK to auth.users.id
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND role = 'admin'
    ) INTO _is_admin;
    RETURN coalesce(_is_admin, false);
END;
$$;

-- ============================================================
-- 3. RLS Policies
-- ============================================================

-- Drivers: insert their own requests
DROP POLICY IF EXISTS "Drivers can insert their own requests" ON public.location_change_requests;
CREATE POLICY "Drivers can insert their own requests"
    ON public.location_change_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (requested_by_auth_user_id = auth.uid());

-- Drivers: view only their own requests
DROP POLICY IF EXISTS "Drivers can select their own requests" ON public.location_change_requests;
CREATE POLICY "Drivers can select their own requests"
    ON public.location_change_requests
    FOR SELECT
    TO authenticated
    USING (
        requested_by_auth_user_id = auth.uid()
        OR public.is_admin()
    );

-- Admins: update (approve / reject) any request
DROP POLICY IF EXISTS "Admins can update all requests" ON public.location_change_requests;
CREATE POLICY "Admins can update all requests"
    ON public.location_change_requests
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================================
-- 4. RPC: apply_location_change_request
--    Called by admin to approve or reject a request.
--    On approval, patches only the fields present in the
--    request's `patch` JSONB using the actual camelCase column
--    names (double-quoted) from the locations table.
--    Missing patch keys are left as-is (COALESCE).
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_location_change_request(
    request_id uuid,
    approve     boolean,
    note        text DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql AS $$
DECLARE
    _req   record;
    _patch jsonb;
BEGIN
    -- Only admins may call this function
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Permission denied: caller is not an admin';
    END IF;

    -- Load the pending request
    SELECT * INTO _req
    FROM public.location_change_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request % not found or already processed', request_id;
    END IF;

    _patch := _req.patch;

    IF approve THEN
        -- Patch only the whitelisted, non-null fields.
        -- Each column uses the exact camelCase name from the DB (double-quoted).
        -- Numeric/boolean fields are safely cast; coords is stored as jsonb.
        UPDATE public.locations SET
            -- text fields
            name                  = COALESCE(_patch->>'name',                  name),
            area                  = COALESCE(_patch->>'area',                  area),
            "machineId"           = COALESCE(_patch->>'machineId',             "machineId"),
            "ownerName"           = COALESCE(_patch->>'ownerName',             "ownerName"),
            "shopOwnerPhone"      = COALESCE(_patch->>'shopOwnerPhone',        "shopOwnerPhone"),
            "ownerPhotoUrl"       = COALESCE(_patch->>'ownerPhotoUrl',         "ownerPhotoUrl"),
            "machinePhotoUrl"     = COALESCE(_patch->>'machinePhotoUrl',       "machinePhotoUrl"),
            "assignedDriverId"    = COALESCE(_patch->>'assignedDriverId',      "assignedDriverId"),
            status                = COALESCE(_patch->>'status',                status),
            "lastRevenueDate"     = COALESCE(_patch->>'lastRevenueDate',       "lastRevenueDate"),
            -- numeric fields
            -- Note: We use the jsonb `?` key-existence operator instead of COALESCE here.
            -- COALESCE cannot distinguish between a missing key and a key explicitly set to NULL;
            -- `?` lets us skip the field entirely when the driver did not include it in the patch.
            "commissionRate"      = CASE WHEN _patch ? 'commissionRate'
                                         THEN (_patch->>'commissionRate')::numeric
                                         ELSE "commissionRate" END,
            "initialStartupDebt"  = CASE WHEN _patch ? 'initialStartupDebt'
                                         THEN (_patch->>'initialStartupDebt')::numeric
                                         ELSE "initialStartupDebt" END,
            "remainingStartupDebt"= CASE WHEN _patch ? 'remainingStartupDebt'
                                         THEN (_patch->>'remainingStartupDebt')::numeric
                                         ELSE "remainingStartupDebt" END,
            -- boolean field
            "isNewOffice"         = CASE WHEN _patch ? 'isNewOffice'
                                         THEN (_patch->>'isNewOffice')::boolean
                                         ELSE "isNewOffice" END,
            -- jsonb field (coords: {lat, lng})
            coords                = CASE WHEN _patch ? 'coords'
                                         THEN (_patch->'coords')
                                         ELSE coords END,
            -- sync flag
            "isSynced"            = false
        WHERE id = _req.location_id;

        UPDATE public.location_change_requests SET
            status                   = 'approved',
            reviewed_at              = now(),
            reviewed_by_auth_user_id = auth.uid(),
            review_note              = note
        WHERE id = request_id;
    ELSE
        -- Rejection: just update workflow status
        UPDATE public.location_change_requests SET
            status                   = 'rejected',
            reviewed_at              = now(),
            reviewed_by_auth_user_id = auth.uid(),
            review_note              = note
        WHERE id = request_id;
    END IF;
END;
$$;