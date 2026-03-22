-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 增量字段补全 + 约束更新
-- Incremental column additions and constraint updates for existing databases.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS guards).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Locations ────────────────────────────────────────────────────────────
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "machinePhotoUrl" TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "lastRevenueDate" TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "resetLocked" BOOLEAN DEFAULT false;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS "dividendBalance" NUMERIC DEFAULT 0;

-- ─── Drivers ──────────────────────────────────────────────────────────────
-- Remove legacy plaintext password column (replaced by Supabase Auth).
ALTER TABLE public.drivers DROP COLUMN IF EXISTS password;

-- ─── Profiles ─────────────────────────────────────────────────────────────
-- For databases that existed before display_name/driver_id/created_at were added.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "display_name" TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "driver_id" TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ─── Transactions ─────────────────────────────────────────────────────────
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "uploadTimestamp" TIMESTAMPTZ;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "aiScore" NUMERIC;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "isAnomaly" BOOLEAN DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "isClearance" BOOLEAN DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT DEFAULT 'pending';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS "payoutAmount" NUMERIC DEFAULT 0;

-- ─── Daily Settlements (check-in / check-out) ─────────────────────────────
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "checkInAt" TIMESTAMPTZ;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "checkOutAt" TIMESTAMPTZ;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "checkInGps" JSONB;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "checkOutGps" JSONB;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "hasCheckedIn" BOOLEAN DEFAULT false;
ALTER TABLE public.daily_settlements ADD COLUMN IF NOT EXISTS "hasCheckedOut" BOOLEAN DEFAULT false;

-- ─── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_driver_timestamp
  ON public.transactions ("driverId", "timestamp" ASC);
CREATE INDEX IF NOT EXISTS idx_transactions_driver_date
  ON public.transactions ("driverId", ("timestamp"::date));
CREATE INDEX IF NOT EXISTS idx_daily_settlements_driver_date
  ON public.daily_settlements ("driverId", "date");

-- ─── Transaction type constraint (idempotent re-create) ───────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_type_check'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_type_check;
  END IF;

  ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN (
    'collection',
    'expense',
    'debt',
    'startup_debt',
    'check_in',
    'check_out',
    'reset_request',
    'payout_request'
  ));
END $$;
