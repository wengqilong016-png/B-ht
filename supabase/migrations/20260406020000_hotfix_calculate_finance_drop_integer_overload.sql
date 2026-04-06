-- Hotfix: remove the INTEGER-typed overload of calculate_finance_v2 that was
-- left behind when 20260404232000 switched p_owner_retention to NUMERIC.
--
-- PostgreSQL treats different parameter types as separate overloads. When the
-- frontend passes p_owner_retention = null, PostgREST cannot choose between:
--   calculate_finance_v2(..., p_owner_retention => integer, ...)
--   calculate_finance_v2(..., p_owner_retention => numeric, ...)
-- causing: "Could not choose the best candidate function" error.
--
-- Fix: drop only the INTEGER variant. The NUMERIC variant (created by
-- 20260404232000_owner_share_retention_logic.sql) remains and is correct.

DROP FUNCTION IF EXISTS public.calculate_finance_v2(
    INTEGER,
    INTEGER,
    NUMERIC,
    INTEGER,
    INTEGER,
    BOOLEAN,
    INTEGER,
    INTEGER,
    NUMERIC
);
