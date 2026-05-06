-- P2 Dry-Run: Zero-revenue confirmed settlements
-- Purpose: Identify settlements where totalRevenue ≈ 0 but were confirmed,
--           which means all collection transactions for that driver+date
--           got paymentStatus='paid' while no real cash was collected.
--
-- Run this in Supabase SQL Editor before deploying the guard.
-- Output: zero rows = no problem. Non-zero = see count and the offending rows.

WITH zero_rev_confirmed AS (
    SELECT
        s.id,
        s."driverId",
        s."driverName",
        s."date",
        s."totalRevenue",
        s."totalNetPayable",
        s.status,
        s."timestamp",
        s."adminId",
        s."adminName"
    FROM public.daily_settlements s
    WHERE s.status = 'confirmed'
      AND COALESCE(s."totalRevenue", 0) <= 0
),
affected_transactions AS (
    SELECT DISTINCT t."driverId", (t."timestamp" AT TIME ZONE 'UTC')::date AS tx_date
    FROM public.transactions t
    WHERE t."paymentStatus" = 'paid'
      AND EXISTS (
          SELECT 1 FROM zero_rev_confirmed z
          WHERE z."driverId" = t."driverId"
            AND z."date" = (t."timestamp" AT TIME ZONE 'UTC')::date
      )
)
SELECT
    'Zero-revenue confirmed settlements' AS report,
    (SELECT COUNT(*) FROM zero_rev_confirmed) AS zero_rev_settlements,
    (SELECT COUNT(*) FROM affected_transactions) AS affected_tx_driver_days
UNION ALL
SELECT
    '-- Details --' AS report,
    NULL, NULL
UNION ALL
SELECT
    'id: ' || z.id || ' | ' || z."driverName" || ' | ' || z."date"::text || ' | revenue=' || z."totalRevenue"::text || ' | by=' || COALESCE(z."adminName", '?'),
    NULL, NULL
FROM zero_rev_confirmed z
ORDER BY 1;
