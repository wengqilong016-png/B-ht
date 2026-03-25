# Production Full Baseline Pack — 03 Diagnostics and Health

This is the fourth file in the coherent production baseline pack.

## File

- `supabase/migrations/20260325150000_production_full_03_diagnostics_and_health.sql`

## Scope

This file creates and secures the diagnostics / health layer:
- `queue_health_reports`
- `health_alerts`
- diagnostics/health constraints and indexes
- `generate_health_alerts_v1()`
- diagnostics/health RLS

## Assumes

This file assumes the identity layer is already applied:
- `drivers`
- `profiles`
- `get_my_role()`
- `get_my_driver_id()`
- `is_admin()`

Business-flow and support/audit layers are optional for this file.

## RLS model in this layer

### Admin
- full read on `queue_health_reports`
- full read on `health_alerts`
- can invoke `generate_health_alerts_v1()`

### Driver / authenticated app session
- may insert/update own `queue_health_reports` snapshot rows
- may read own `queue_health_reports` rows
- may not read `health_alerts`

## Health generation model

`generate_health_alerts_v1()` derives unresolved alerts from `queue_health_reports` using these thresholds:
- `dead_letter_items` when `dead_letter_count >= 1`
- `stale_snapshot` when `reported_at < now() - interval '2 hours'`
- `high_retry_waiting` when `retry_waiting_count > 5`
- `high_pending` when `pending_count > 20`

Resolved alerts are marked with `resolved_at` when the triggering condition clears.

## What this file does NOT do

- does not seed real production auth users
- does not add cron scheduling
- does not change earlier identity/business/support layers

## Completion note

This file completes the current production full baseline pack layers:
- `00_identity_and_assignment.sql`
- `01_business_flow.sql`
- `02_support_and_audit.sql`
- `03_diagnostics_and_health.sql`
