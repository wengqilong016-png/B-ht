-- Remove redundant overlapping RLS policies on locations table.
-- locations has 4 SELECT policies and 3 DELETE policies doing the same thing.
-- Consolidated: keep locations_admin_or_assigned_select_full_v1 (most complete),
-- drop the 3 redundant older ones. Same for DELETE — keep _full_v1, drop duplicates.

-- SELECT: locations_select (auth.role = authenticated) is superseded by _full_v1 (is_admin OR assignedDriverId = get_my_driver_id)
DROP POLICY IF EXISTS locations_select ON public.locations;
DROP POLICY IF EXISTS locations_admin_or_assigned_select_v1 ON public.locations;

-- DELETE: locations_delete and locations_admin_delete_v1 are superseded by _full_v1
DROP POLICY IF EXISTS locations_delete ON public.locations;
DROP POLICY IF EXISTS locations_admin_delete_v1 ON public.locations;
