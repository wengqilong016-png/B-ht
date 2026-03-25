# Production Full Baseline Pack — 02 Support and Audit

This is the third file in the coherent production baseline pack.

## File

- `supabase/migrations/20260325140000_production_full_02_support_and_audit.sql`

## Scope

This file creates and secures the support / audit layer:
- `support_cases`
- `support_audit_log`
- support constraints and indexes
- transactional support-case resolution function
- support/admin RLS

## Assumes

This file assumes the identity layer is already applied:
- `profiles`
- `get_my_role()`
- `is_admin()`

The business-flow layer is optional for this file.

## Canonical admin contract

This layer intentionally does **not** use a second profile identity contract.

All admin checks are aligned to the identity-layer rule:
- `profiles.auth_user_id` is the canonical identity key
- `public.is_admin()` is the only admin gate used in this layer

## RLS model in this layer

### Admin
- full read/write on `support_cases`
- full read on `support_audit_log`
- can call `resolve_support_case_v1(...)`

### Authenticated users
- may append audit events to `support_audit_log`
- may not update or delete audit rows

## What this file does NOT do

- does not create diagnostics / health tables
- does not seed real production auth users
- does not introduce a second identity contract for support policies

## Next pack file

After this layer is stable, the next coherent production file should be:
- `03_diagnostics_and_health.sql`
