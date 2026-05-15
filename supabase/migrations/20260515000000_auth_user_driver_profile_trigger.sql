-- Create public driver/profile rows automatically when a driver Auth user is created.
-- The create-driver Edge Function writes the required metadata to auth.users.

CREATE OR REPLACE FUNCTION public.handle_new_driver_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_metadata     JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    v_role         TEXT := COALESCE(v_metadata->>'role', 'driver');
    v_driver_id    TEXT := NULLIF(BTRIM(COALESCE(v_metadata->>'driver_id', '')), '');
    v_display_name TEXT := NULLIF(BTRIM(COALESCE(v_metadata->>'display_name', '')), '');
    v_username     TEXT := NULLIF(BTRIM(COALESCE(v_metadata->>'username', '')), '');
BEGIN
    IF v_role <> 'driver' OR v_driver_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.drivers (id, name, username, status)
    VALUES (
        v_driver_id,
        COALESCE(v_display_name, v_driver_id),
        COALESCE(v_username, LOWER(v_driver_id)),
        'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET
        name = EXCLUDED.name,
        username = EXCLUDED.username;

    INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
    VALUES (
        NEW.id,
        'driver',
        COALESCE(v_display_name, v_driver_id),
        v_driver_id
    )
    ON CONFLICT (auth_user_id) DO UPDATE
    SET
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        driver_id = EXCLUDED.driver_id;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_driver_auth_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created_driver_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_driver_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_driver_auth_user();
