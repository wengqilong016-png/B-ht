CREATE TABLE public.location_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id uuid NOT NULL REFERENCES public.locations(id),
    requested_by_auth_user_id uuid NOT NULL REFERENCES auth.users(id),
    requested_by_driver_id text,
    status text NOT NULL DEFAULT 'pending',
    reason text,
    patch jsonb NOT NULL,
    created_at timestamptz DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by_auth_user_id uuid REFERENCES auth.users(id),
    review_note text
);

CREATE INDEX idx_status_created_at ON public.location_change_requests (status, created_at DESC);
CREATE INDEX idx_location_id_created_at ON public.location_change_requests (location_id, created_at DESC);

ALTER TABLE public.location_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert their own requests" ON public.location_change_requests
    FOR INSERT
    TO auth.users
    USING (requested_by_auth_user_id = auth.uid());

CREATE POLICY "Drivers can select their own requests" ON public.location_change_requests
    FOR SELECT
    TO auth.users
    USING (requested_by_auth_user_id = auth.uid());

CREATE POLICY "Admins can select/update all requests" ON public.location_change_requests
    FOR SELECT, UPDATE
    TO auth.users
    USING ( EXISTS(SELECT 1 FROM profiles WHERE profiles.role = 'admin' AND profiles.user_id = auth.uid()) );

CREATE FUNCTION public.is_admin() RETURNS boolean STABLE SECURITY DEFINER AS $$
DECLARE
    isAdmin boolean;
BEGIN
    SELECT EXISTS(SELECT 1 FROM profiles WHERE role = 'admin' AND user_id = auth.uid()) INTO isAdmin;
    RETURN isAdmin;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION public.apply_location_change_request(request_id uuid, approve boolean, note text) RETURNS void SECURITY DEFINER AS $$
DECLARE
    locationId uuid;
BEGIN
    SELECT location_id INTO locationId FROM public.location_change_requests WHERE id = request_id;
    IF approve THEN
        UPDATE public.locations
        SET name = patch->>'name',
            area = patch->>'area',
            machine_id = patch->>'machine_id',
            coords = patch->>'coords',
            owner_name = patch->>'owner_name',
            owner_phone = patch->>'owner_phone',
            owner_photo_url = patch->>'owner_photo_url',
            machine_photo_url = patch->>'machine_photo_url',
            assigned_driver_id = patch->>'assigned_driver_id',
            status = patch->>'status',
            initial_startup_debt = patch->>'initial_startup_debt',
            remaining_startup_debt = patch->>'remaining_startup_debt',
            updated_at = now(),
            updated_by_auth_user_id = auth.uid()
        WHERE id = locationId;
        UPDATE public.location_change_requests
        SET status = 'approved', reviewed_at = now(), reviewed_by_auth_user_id = auth.uid(), review_note = note
        WHERE id = request_id;
    ELSE
        UPDATE public.location_change_requests
        SET status = 'rejected', review_note = note
        WHERE id = request_id;
    END IF;
END;
$$ LANGUAGE plpgsql;