# ADR: Phase 0 — Authority Source Lock & Legacy Table Deprecation

**Date:** 2026-03-30
**Status:** Accepted
**Context:** Bahati Jackpots multi-phase schema migration

---

## Decision

Phase 1 and Phase 2 SQL migration files are the **single source of truth** for all
table structure, RPC signatures, and business rules going forward.

| Authority file | Scope |
|---|---|
| `supabase/migrations/20240104000000_phase1_complete_schema.sql` | Phase 1 tables, RLS, helper functions |
| `supabase/migrations/20240105000000_phase2_ledger_reconciliation.sql` | Phase 2 ledger/settlement tables, all RPCs |
| `supabase/migrations/20240101000000_initial_schema.sql` | **Legacy only** — kept for history, not for new code |

---

## Old → New Name Mapping

| Legacy name (from initial_schema) | New canonical name (Phase 1/2) | Notes |
|---|---|---|
| `profiles` | `drivers` (+ `auth.users`) | Auth identity merged into `drivers.auth_user_id` FK |
| `machines` / `locations` | `kiosks` | Physical slot-machine locations |
| `daily_tasks` | `tasks` | Collection tasks performed by drivers |
| `transactions` | `tasks` + `task_settlements` | Tasks capture the event; settlements capture the money split |
| `daily_settlements` | `daily_driver_reconciliations` | End-of-day driver reconciliation |
| *(no equivalent)* | `merchants` | New: shop/machine owners |
| *(no equivalent)* | `kiosk_onboarding_records` | New: kiosk setup tracking |
| *(no equivalent)* | `score_reset_requests` | New: driver score reset workflow |
| *(no equivalent)* | `merchant_ledger` | New: append-only merchant balance log |
| *(no equivalent)* | `driver_fund_ledger` | New: append-only driver balance log |
| *(no equivalent)* | `merchant_balance_snapshots` | New: periodic balance snapshots |

---

## Phase 2 RPC Catalogue (named parameters — mandatory)

All RPCs use `p_` prefixed named parameters. Positional parameters are **forbidden**.

| RPC | Parameters | Access |
|---|---|---|
| `record_task_settlement` | `p_task_id UUID` | authenticated |
| `submit_daily_reconciliation` | `p_driver_id TEXT, p_recon_date DATE, p_note TEXT` | authenticated |
| `confirm_daily_reconciliation` | `p_reconciliation_id UUID, p_confirmed_by TEXT` | admin only |
| `record_merchant_debt` | `p_merchant_id TEXT, p_amount NUMERIC, p_note TEXT` | admin only |
| `record_retained_payout` | `p_merchant_id TEXT, p_amount NUMERIC, p_note TEXT` | admin only |
| `offset_retained_to_debt` | `p_merchant_id TEXT, p_amount NUMERIC, p_note TEXT` | admin only |
| `approve_score_reset` | `p_request_id UUID, p_reviewed_by TEXT` | admin only |
| `reject_score_reset` | `p_request_id UUID, p_reviewed_by TEXT, p_reason TEXT` | admin only |
| `manual_adjustment_driver` | `p_driver_id TEXT, p_coin_delta NUMERIC, p_cash_delta NUMERIC, p_note TEXT` | admin only |
| `get_merchant_balances` | `p_merchant_id TEXT` | admin only |

---

## Key Business Rules (authoritative — do not change without a migration PR)

1. **First daily reconciliation opening formula:**
   If no previous `confirmed` row exists for the driver, then
   `opening = current_balance − today_ledger_delta` (prevents double count).

2. **Dividend rate snapshot:**
   `tasks.dividend_rate_snapshot` must be written at task creation time.
   `record_task_settlement` uses the snapshot, never the live `merchants.dividend_rate`.

3. **Settlement status flow:**
   `tasks.settlement_status`: `pending` → `settled` (via `record_task_settlement`).

4. **Exchange validation:**
   Based on the driver's current `coin_balance`, not `gross_revenue`.

5. **Negative balance protection:**
   All RPCs check `coin_balance` / `cash_balance` ≥ 0 after mutation.
   `manual_adjustment_driver` does **not** allow admin override (authoritative rule;
   requires a new migration PR to change).

6. **Merchant column-level REVOKE:**
   `merchants.retained_balance` and `merchants.debt_balance` are REVOKEd from
   `authenticated`. Boss reads via `get_merchant_balances` (SECURITY DEFINER).

7. **`initial_coin_loan`:** **未指定** (not specified in current authoritative SQL).
   - Minimal default: no DB-level field or enforcement.
   - Risk: no guard against double-issuing initial loans.
   - Recommended future action: add `initial_coin_loan` column to `drivers` table
     and a dedicated RPC with idempotency guard.

---

## Execution Rules

- Each subsequent phase completes **one** stage at a time.
- Any naming conflict (e.g. `machines` vs `kiosks`) **must** produce an
  "old→new mapping table" and migration plan before proceeding.
- All RPC calls in TypeScript **must** use named parameters (`{ p_task_id: ... }`),
  never positional arguments.
- All SECURITY DEFINER functions **must** include `SET search_path = public, pg_temp`.

---

## Verification (Phase 0 acceptance)

1. `grep -rn` across `.ts`/`.tsx` confirms no **new** code references
   `machines` / `profiles` / `daily_tasks` as Supabase table names.
2. Every `.rpc()` call uses named parameter objects (`{ p_xxx: value }`).
3. Unspecified items (e.g. `initial_coin_loan`) are explicitly marked **"未指定"**
   with a minimal viable default and risk note.
