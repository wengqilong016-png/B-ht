-- Backfill historical collection paymentStatus values from already-reviewed daily settlements.
--
-- Scope:
--   - only transactions.type = 'collection'
--   - only settlements with status in ('confirmed', 'rejected')
--   - only rows whose current paymentStatus differs from the expected status
--
-- Expected mapping:
--   confirmed -> paid
--   rejected  -> rejected
--
-- This migration is idempotent: re-running it should update zero rows once data is aligned.

UPDATE public.transactions t
SET "paymentStatus" = CASE
  WHEN s.status = 'confirmed' THEN 'paid'
  WHEN s.status = 'rejected' THEN 'rejected'
  ELSE t."paymentStatus"
END
FROM public.daily_settlements s
WHERE s.status IN ('confirmed', 'rejected')
  AND t.type = 'collection'
  AND t."driverId" = s."driverId"
  AND (t."timestamp" AT TIME ZONE 'UTC')::date = s."date"
  AND t."paymentStatus" IS DISTINCT FROM CASE
    WHEN s.status = 'confirmed' THEN 'paid'
    WHEN s.status = 'rejected' THEN 'rejected'
  END
