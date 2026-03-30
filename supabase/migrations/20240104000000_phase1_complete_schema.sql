-- =============================================================================
-- Phase 1 — Authoritative Complete Schema
-- File: supabase/migrations/20240104000000_phase1_complete_schema.sql
--
-- This migration is the SINGLE SOURCE OF TRUTH for Phase 1 table structure.
-- It drops legacy tables (profiles, machines, daily_tasks) that were defined
-- in 20240101000000_initial_schema.sql and creates the canonical Phase 1
-- tables used throughout the application.
--
-- WARNING: Running this migration against a database with live data in the
-- legacy tables will destroy that data.  Always back up first.
-- =============================================================================

BEGIN;

-- ─── Guard: only run on databases that still carry the legacy tables ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    RAISE NOTICE 'profiles table does not exist — skipping legacy DROP phase';
  END IF;
END
$$;

-- ─── Drop legacy tables (cascade drops dependents) ─────────────────────────
DROP TABLE IF EXISTS public.daily_tasks   CASCADE;
DROP TABLE IF EXISTS public.machines      CASCADE;
DROP TABLE IF EXISTS public.profiles      CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. drivers — canonical driver identity
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.drivers (
  id              TEXT PRIMARY KEY,
  auth_user_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  phone           TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','terminated')),
  coin_balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  base_salary     NUMERIC(12,2) NOT NULL DEFAULT 0,
  vehicle_info    JSONB DEFAULT '{}'::jsonb,
  current_gps     JSONB,
  last_active     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.drivers IS 'Phase 1 canonical driver table — replaces legacy profiles + drivers hybrid.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. merchants — machine / shop owners
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.merchants (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  phone            TEXT,
  dividend_rate    NUMERIC(5,4) NOT NULL DEFAULT 0,
  retained_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  debt_balance     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','closed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.merchants IS 'Phase 1 — shop owners; retained_balance & debt_balance are admin-only (column-level REVOKE in Phase 2).';

-- Column-level REVOKE so authenticated role cannot SELECT these directly.
-- Boss reads them via SECURITY DEFINER RPCs or ledger aggregations.
REVOKE SELECT (retained_balance, debt_balance)
  ON public.merchants FROM authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. kiosks — physical slot-machine locations (replaces legacy "machines"/"locations")
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.kiosks (
  id                  TEXT PRIMARY KEY,
  machine_id          TEXT NOT NULL,
  name                TEXT NOT NULL,
  area                TEXT,
  merchant_id         TEXT REFERENCES public.merchants(id) ON DELETE SET NULL,
  assigned_driver_id  TEXT REFERENCES public.drivers(id)   ON DELETE SET NULL,
  last_score          NUMERIC(12,2) NOT NULL DEFAULT 0,
  coords              JSONB,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','maintenance','decommissioned')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kiosks IS 'Phase 1 — replaces legacy "machines" / "locations". Each row is one physical slot-machine kiosk.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. tasks — collection tasks performed by drivers at kiosks
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id                TEXT NOT NULL REFERENCES public.kiosks(id),
  driver_id               TEXT NOT NULL REFERENCES public.drivers(id),
  merchant_id             TEXT REFERENCES public.merchants(id),
  type                    TEXT NOT NULL DEFAULT 'collection'
                            CHECK (type IN ('collection','expense','reset_request','payout_request')),
  current_score           NUMERIC(12,2),
  previous_score          NUMERIC(12,2),
  gross_revenue           NUMERIC(12,2),
  expenses                NUMERIC(12,2) DEFAULT 0,
  tip                     NUMERIC(12,2) DEFAULT 0,
  coin_exchange           NUMERIC(12,2) DEFAULT 0,
  gps                     JSONB,
  photo_url               TEXT,
  notes                   TEXT,
  -- Phase 2 columns added here for forward compat; populated by Phase 2 RPCs
  score_before            NUMERIC(12,2),
  dividend_rate_snapshot  NUMERIC(5,4),
  settlement_status       TEXT NOT NULL DEFAULT 'pending'
                            CHECK (settlement_status IN ('pending','settled')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tasks IS 'Phase 1 — collection tasks (replaces legacy "transactions"). Phase 2 adds settlement columns.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. kiosk_onboarding_records — tracks kiosk setup / initial debt
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.kiosk_onboarding_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id        TEXT NOT NULL REFERENCES public.kiosks(id),
  merchant_id     TEXT REFERENCES public.merchants(id),
  initial_debt    NUMERIC(12,2) NOT NULL DEFAULT 0,
  onboarded_by    TEXT, -- driver or admin id
  onboarded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kiosk_onboarding_records IS 'Phase 1 — records the initial setup / debt for a kiosk when it goes live.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. score_reset_requests — driver requests to reset kiosk score
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.score_reset_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id        TEXT NOT NULL REFERENCES public.kiosks(id),
  driver_id       TEXT NOT NULL REFERENCES public.drivers(id),
  requested_score NUMERIC(12,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.score_reset_requests IS 'Phase 1 — requests by drivers to reset a kiosk score counter.';

-- ─── Helper functions for RLS ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_driver_id()
RETURNS TEXT
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id FROM public.drivers d WHERE d.auth_user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_driver_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_driver_id() TO authenticated;

COMMENT ON FUNCTION public.get_my_driver_id() IS 'Returns the driver ID for the current authenticated user.';

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Admin users have no drivers row; presence of a drivers row ⇒ driver.
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.drivers WHERE auth_user_id = auth.uid()
  ) THEN 'driver' ELSE 'admin' END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

COMMENT ON FUNCTION public.get_my_role() IS 'Returns "driver" or "admin" for the current authenticated user.';

-- ─── Basic RLS on new tables ────────────────────────────────────────────────

ALTER TABLE public.drivers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_onboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_reset_requests   ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY admin_all_drivers                ON public.drivers                FOR ALL USING (get_my_role() = 'admin');
CREATE POLICY admin_all_merchants              ON public.merchants              FOR ALL USING (get_my_role() = 'admin');
CREATE POLICY admin_all_kiosks                 ON public.kiosks                 FOR ALL USING (get_my_role() = 'admin');
CREATE POLICY admin_all_tasks                  ON public.tasks                  FOR ALL USING (get_my_role() = 'admin');
CREATE POLICY admin_all_kiosk_onboarding       ON public.kiosk_onboarding_records FOR ALL USING (get_my_role() = 'admin');
CREATE POLICY admin_all_score_reset_requests   ON public.score_reset_requests   FOR ALL USING (get_my_role() = 'admin');

-- Driver: own rows only
CREATE POLICY driver_select_own_driver         ON public.drivers       FOR SELECT USING (id = get_my_driver_id());
CREATE POLICY driver_select_assigned_kiosks    ON public.kiosks        FOR SELECT USING (assigned_driver_id = get_my_driver_id());
CREATE POLICY driver_select_own_tasks          ON public.tasks         FOR SELECT USING (driver_id = get_my_driver_id());
CREATE POLICY driver_insert_own_tasks          ON public.tasks         FOR INSERT WITH CHECK (driver_id = get_my_driver_id());
CREATE POLICY driver_select_own_score_resets   ON public.score_reset_requests FOR SELECT USING (driver_id = get_my_driver_id());
CREATE POLICY driver_insert_own_score_resets   ON public.score_reset_requests FOR INSERT WITH CHECK (driver_id = get_my_driver_id());

-- Merchants: drivers can SELECT merchants linked to their assigned kiosks
CREATE POLICY driver_select_related_merchants  ON public.merchants FOR SELECT
  USING (id IN (SELECT k.merchant_id FROM public.kiosks k WHERE k.assigned_driver_id = get_my_driver_id()));

COMMIT;
