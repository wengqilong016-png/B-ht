-- Storage bucket for kiosk and collection photo evidence.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'kiosk-photos',
    'kiosk-photos',
    TRUE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Kiosk photo uploads by authenticated users" ON storage.objects;
CREATE POLICY "Kiosk photo uploads by authenticated users"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'kiosk-photos');

DROP POLICY IF EXISTS "Kiosk photo updates by authenticated users" ON storage.objects;
CREATE POLICY "Kiosk photo updates by authenticated users"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'kiosk-photos')
    WITH CHECK (bucket_id = 'kiosk-photos');
