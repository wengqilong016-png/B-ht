# Data Model Audit

Updated: 2026-04-04

## Core Tables

- `drivers`: active driver profile, debt, float, and status data.
- `profiles`: auth user to app-role binding; required for login and authorization.
- `locations`: machine/site master data used by both driver and admin flows.
- `transactions`: collection, expense, reset, and payout request ledger.
- `daily_settlements`: settlement submission and review workflow.
- `ai_logs`: AI-assisted scan audit trail.

## Operational Tables

- `queue_health_reports`: active diagnostics table written by offline queue health reporting.

## Reserved / Not Actively Used In App Flow

- `notifications`: app currently uses localStorage notifications, not this table.
- `location_change_requests`: typed in the frontend model, but no active create/review path found.
- `support_cases`: documented and migrated, but no active app read/write path found.
- `support_audit_log`: documented and migrated, but no active app read/write path found.
- `health_alerts`: documented for cron/ops workflows, but no active app read path found.

## Image Storage Status

- Driver evidence photos are now intended to live in Supabase Storage bucket `evidence`.
- Database fields such as `transactions.photoUrl` continue to store the final public URL.
- Legacy rows may still contain inline `data:image/...` values and should be treated as historical data.
