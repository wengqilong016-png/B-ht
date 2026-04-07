-- P0 Fix 1: Add SELECT policy on evidence storage bucket
-- Without this, uploaded photos return 403 Forbidden even for authenticated users.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Evidence reads by authenticated users'
  ) THEN
    CREATE POLICY "Evidence reads by authenticated users"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'evidence');
  END IF;
END $$;

-- P0 Fix 2: Add UPDATE policy for drivers on their own transactions
-- Drivers can INSERT transactions but the existing policy only allows admin UPDATE.
-- This blocks driver upsert (update path) causing RLS permission denied errors.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND policyname = 'transactions_driver_update_own_v1'
  ) THEN
    CREATE POLICY transactions_driver_update_own_v1
      ON public.transactions
      FOR UPDATE
      TO authenticated
      USING (
        public.get_my_role() = 'driver'
        AND "driverId" = public.get_my_driver_id()
      )
      WITH CHECK (
        public.get_my_role() = 'driver'
        AND "driverId" = public.get_my_driver_id()
      );
  END IF;
END $$;
